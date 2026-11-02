package trainingqa

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"tarsgo-backend/model"
)

// This end-to-end test is opt-in and refuses any database except the isolated
// local acceptance database. It uses [TEST_QA] accounts and removes only rows
// created by this run.
func TestAcceptanceDatabaseQuestionWorkflow(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TARSGO_QA_TEST_DSN"))
	if dsn == "" {
		t.Skip("TARSGO_QA_TEST_DSN is not set")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("refusing to run the Q&A integration test outside the isolated local acceptance database")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal("open isolated acceptance database")
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal("open isolated acceptance SQL connection")
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	for _, table := range []string{"training_questions", "training_question_posts", "training_question_attachments", "training_question_growth_events", "community_experience_events", "community_check_ins", "community_comment_reactions", "community_post_views", "community_member_profiles", "co_builder_contributions"} {
		if !db.Migrator().HasTable(table) {
			t.Fatalf("community growth migrations are missing table %s", table)
		}
	}

	nonce := time.Now().UTC().Format("20060102T150405.000000000")
	createdGroupIDs := make([]uint64, 0, 5)
	questionIDs := make([]uint64, 0, 4)
	actorUserIDs := make([]uint64, 0, 6)
	groupIDs := map[string]uint64{}
	for _, name := range append(append([]string{}, technicalGroups...), "运营组") {
		var group model.UserGroup
		queryErr := db.Where("name = ?", name).First(&group).Error
		if queryErr == gorm.ErrRecordNotFound {
			group = model.UserGroup{Name: name, Status: model.UserGroupStatusActive}
			if err := db.Create(&group).Error; err != nil {
				t.Fatalf("create isolated test group: %v", err)
			}
			createdGroupIDs = append(createdGroupIDs, group.ID)
		} else if queryErr != nil {
			t.Fatalf("load isolated test group: %v", queryErr)
		} else if group.Status != model.UserGroupStatusActive {
			t.Fatalf("required local acceptance group %q is inactive", name)
		}
		groupIDs[name] = group.ID
	}

	roleIDs := map[string]uint64{}
	for _, roleName := range []string{model.RoleNameUser, model.RoleNameAdmin, model.RoleNameSuperAdmin} {
		var role model.Role
		if err := db.Where("name = ?", roleName).First(&role).Error; err != nil {
			t.Fatalf("load system role %s: %v", roleName, err)
		}
		roleIDs[roleName] = role.ID
	}
	createActor := func(label, roleName string, groupName string) Actor {
		var groupID *uint64
		if groupName != "" {
			value := groupIDs[groupName]
			groupID = &value
		}
		user := model.User{
			RoleID: roleIDs[roleName], Name: "[TEST_QA] " + label, RealName: strPtr("[TEST_QA] " + label),
			Email:  fmt.Sprintf("qa-%s-%s@tarsgo.test", nonce, strings.ToLower(strings.ReplaceAll(label, " ", "-"))),
			Status: model.UserStatusEnabled,
		}
		if err := db.Create(&user).Error; err != nil {
			t.Fatalf("create isolated test account: %v", err)
		}
		actorUserIDs = append(actorUserIDs, user.ID)
		if groupID != nil {
			if err := db.Create(&model.UserGroupMember{GroupID: *groupID, UserID: user.ID, Role: model.UserGroupMemberRoleMember}).Error; err != nil {
				t.Fatalf("assign isolated test account: %v", err)
			}
		}
		return Actor{ID: user.ID, RoleName: roleName}
	}
	member := createActor("mechanical-member", model.RoleNameUser, "机械组")
	peer := createActor("mechanical-peer", model.RoleNameUser, "机械组")
	crossMember := createActor("ai-member", model.RoleNameUser, "AI组")
	operationsMember := createActor("operations-member", model.RoleNameUser, "运营组")
	mechanicalAdmin := createActor("mechanical-admin", model.RoleNameAdmin, "机械组")
	aiAdmin := createActor("ai-admin", model.RoleNameAdmin, "AI组")
	superAdmin := createActor("super-admin", model.RoleNameSuperAdmin, "")
	t.Cleanup(func() {
		if len(questionIDs) > 0 {
			if err := db.Where("comment_id IN (?)", db.Model(&model.TrainingQuestionPost{}).Select("id").Where("question_id IN ?", questionIDs)).Delete(&model.CommunityCommentReaction{}).Error; err != nil {
				t.Errorf("clean isolated comment reactions: %v", err)
			}
			for _, value := range []any{&model.CommunityPostViewRecord{}, &model.CommunityPostReaction{}, &model.TrainingQuestionGrowthEvent{}, &model.TrainingQuestionAttachment{}, &model.TrainingQuestionPost{}} {
				if err := db.Where("question_id IN ?", questionIDs).Delete(value).Error; err != nil {
					t.Errorf("clean isolated Q&A history: %v", err)
				}
			}
			if err := db.Where("related_id IN ?", questionIDs).Delete(&model.CommunityExperienceEvent{}).Error; err != nil {
				t.Errorf("clean isolated community experience: %v", err)
			}
			if err := db.Where("id IN ?", questionIDs).Delete(&model.TrainingQuestion{}).Error; err != nil {
				t.Errorf("clean isolated Q&A questions: %v", err)
			}
		}
		if len(actorUserIDs) > 0 {
			if err := db.Where("user_id IN ?", actorUserIDs).Delete(&model.TeamIdentityChange{}).Error; err != nil {
				t.Errorf("clean isolated team identity history: %v", err)
			}
			if err := db.Where("user_id IN ?", actorUserIDs).Delete(&model.CommunityMemberProfile{}).Error; err != nil {
				t.Errorf("clean isolated community member profiles: %v", err)
			}
			if err := db.Where("user_id IN ?", actorUserIDs).Delete(&model.CoBuilderContribution{}).Error; err != nil {
				t.Errorf("clean isolated badge contributions: %v", err)
			}
			if err := db.Where("user_id IN ?", actorUserIDs).Delete(&model.CommunityCheckIn{}).Error; err != nil {
				t.Errorf("clean isolated check-ins: %v", err)
			}
			if err := db.Where("user_id IN ?", actorUserIDs).Delete(&model.CommunityExperienceEvent{}).Error; err != nil {
				t.Errorf("clean isolated member experience: %v", err)
			}
			if err := db.Where("user_id IN ?", actorUserIDs).Delete(&model.UserGroupMember{}).Error; err != nil {
				t.Errorf("clean isolated memberships: %v", err)
			}
			if err := db.Where("id IN ?", actorUserIDs).Delete(&model.User{}).Error; err != nil {
				t.Errorf("clean isolated accounts: %v", err)
			}
		}
		if len(createdGroupIDs) > 0 {
			if err := db.Where("id IN ?", createdGroupIDs).Delete(&model.UserGroup{}).Error; err != nil {
				t.Errorf("clean isolated groups: %v", err)
			}
		}
	})

	root := t.TempDir()
	service, err := NewServiceWithFileRoot(db, root)
	if err != nil {
		t.Fatal("create isolated Q&A service")
	}
	statusClock := time.Date(2026, 10, 20, 8, 0, 0, 0, time.UTC)
	service.now = func() time.Time {
		statusClock = statusClock.Add(time.Minute)
		return statusClock
	}
	public, err := service.Create(context.Background(), member, groupIDs["机械组"], "[TEST_QA] 串口报错", "复现过程如下", model.TrainingQuestionPublic, []*multipart.FileHeader{testQuestionUpload(t, "trace.png")})
	if err != nil {
		t.Fatalf("create public question: %v", err)
	}
	questionIDs = append(questionIDs, public.Question.ID)
	private, err := service.Create(context.Background(), member, groupIDs["机械组"], "[TEST_QA] secret-alpha", "仅自己与管理员可见", model.TrainingQuestionPrivate, []*multipart.FileHeader{testQuestionUpload(t, "private.png")})
	if err != nil {
		t.Fatalf("create private question: %v", err)
	}
	questionIDs = append(questionIDs, private.Question.ID)

	memberItems, err := service.ListMember(context.Background(), peer, ListFilter{GroupID: groupIDs["机械组"], Keyword: "secret-alpha"})
	if err != nil || len(memberItems) != 0 {
		t.Fatalf("member search exposed another member's private question: items=%d err=%v", len(memberItems), err)
	}
	if _, err := service.GetMember(context.Background(), crossMember, public.Question.ID); questionStatus(err) != http.StatusNotFound {
		t.Fatalf("cross-group question read status = %d, want 404", questionStatus(err))
	}
	if _, err := service.GetMember(context.Background(), peer, private.Question.ID); questionStatus(err) != http.StatusNotFound {
		t.Fatalf("private question read status = %d, want 404", questionStatus(err))
	}
	if _, err := service.OpenFile(context.Background(), peer, private.Question.Attachments[0].ID); questionStatus(err) != http.StatusNotFound {
		t.Fatalf("private attachment read status = %d, want 404", questionStatus(err))
	}
	image, err := service.OpenFile(context.Background(), peer, public.Question.Attachments[0].ID)
	if err != nil || image.ContentType != "image/png" || len(image.Content) == 0 {
		t.Fatalf("same-group public image could not be opened: image=%v err=%v", image != nil, err)
	}

	answered, err := service.Reply(context.Background(), peer, public.Question.ID, PostInput{Kind: model.TrainingQuestionAnswer, Body: "确认供电后重现问题。"})
	if err != nil || len(answered.Posts) != 1 || answered.Posts[0].Kind != model.TrainingQuestionAnswer {
		t.Fatalf("same-group answer failed: posts=%d err=%v", lenOrZero(answered), err)
	}
	followed, err := service.Reply(context.Background(), member, public.Question.ID, PostInput{Kind: model.TrainingQuestionFollowUp, Body: "已补充供电测量值。"})
	if err != nil || len(followed.Posts) != 2 || followed.Posts[1].Kind != model.TrainingQuestionFollowUp {
		t.Fatalf("asker follow-up failed: posts=%d err=%v", lenOrZero(followed), err)
	}
	if _, err := service.Reply(context.Background(), crossMember, public.Question.ID, PostInput{Kind: model.TrainingQuestionAnswer, Body: "越组回复"}); questionStatus(err) != http.StatusNotFound {
		t.Fatalf("cross-group reply status = %d, want 404", questionStatus(err))
	}
	if _, err := service.Reply(context.Background(), peer, private.Question.ID, PostInput{Kind: model.TrainingQuestionAnswer, Body: "越权回答"}); questionStatus(err) != http.StatusNotFound {
		t.Fatalf("private question answer status = %d, want 404", questionStatus(err))
	}
	if _, err := service.Reply(context.Background(), mechanicalAdmin, private.Question.ID, PostInput{Kind: model.TrainingQuestionAnswer, Body: "管理员答复私密问题。"}); err != nil {
		t.Fatalf("same-group admin could not answer private question: %v", err)
	}

	if _, err := service.ListMember(context.Background(), operationsMember, ListFilter{GroupID: groupIDs["运营组"]}); questionStatus(err) != http.StatusForbidden {
		t.Fatalf("operations member list status = %d, want 403", questionStatus(err))
	}
	if _, err := service.ListAdmin(context.Background(), mechanicalAdmin, ListFilter{GroupID: groupIDs["AI组"]}); questionStatus(err) != http.StatusForbidden {
		t.Fatalf("cross-group manager list status = %d, want 403", questionStatus(err))
	}
	for _, name := range technicalGroups {
		if err := service.requireManagerGroup(context.Background(), superAdmin, groupIDs[name]); err != nil {
			t.Fatalf("super-admin could not manage %s: %v", name, err)
		}
	}
	for index, name := range technicalGroups {
		if name == "机械组" {
			continue
		}
		groupMember := createActor(fmt.Sprintf("member-%d", index), model.RoleNameUser, name)
		groupPeer := createActor(fmt.Sprintf("peer-%d", index), model.RoleNameUser, name)
		question, err := service.Create(context.Background(), groupMember, groupIDs[name], "[TEST_QA] "+name+" 技术问题", "用于验证本组提问与回答。", model.TrainingQuestionPublic, nil)
		if err != nil {
			t.Fatalf("%s member could not ask a question: %v", name, err)
		}
		questionIDs = append(questionIDs, question.Question.ID)
		visible, err := service.ListMember(context.Background(), groupPeer, ListFilter{GroupID: groupIDs[name], Keyword: name + " 技术问题"})
		if err != nil || len(visible) != 1 || visible[0].ID != question.Question.ID {
			t.Fatalf("%s member could not find the group question: items=%d err=%v", name, len(visible), err)
		}
		if _, err := service.Reply(context.Background(), groupPeer, question.Question.ID, PostInput{Kind: model.TrainingQuestionAnswer, Body: "本组回答已保存。"}); err != nil {
			t.Fatalf("%s member could not answer a public question: %v", name, err)
		}
	}
	if err := service.requireManagerGroup(context.Background(), aiAdmin, groupIDs["AI组"]); err != nil {
		t.Fatalf("AI admin could not manage own group: %v", err)
	}
	if err := service.requireManagerGroup(context.Background(), aiAdmin, groupIDs["机械组"]); questionStatus(err) != http.StatusForbidden {
		t.Fatalf("AI admin cross-group management status = %d, want 403", questionStatus(err))
	}

	if _, err := service.SetSolved(context.Background(), peer, public.Question.ID, true); questionStatus(err) != http.StatusForbidden {
		t.Fatalf("non-owner solve status = %d, want 403", questionStatus(err))
	}
	if _, err := service.SetFAQ(context.Background(), Actor{ID: peer.ID, RoleName: model.RoleNameUser}, public.Question.ID, true); questionStatus(err) != http.StatusForbidden {
		t.Fatalf("member FAQ status = %d, want 403", questionStatus(err))
	}
	if _, err := service.SetSolved(context.Background(), member, public.Question.ID, true); err != nil {
		t.Fatalf("question owner could not mark solved: %v", err)
	}
	if _, err := service.SetSolved(context.Background(), member, public.Question.ID, true); err != nil {
		t.Fatalf("repeated solved state was not idempotent: %v", err)
	}
	faq, err := service.SetFAQ(context.Background(), mechanicalAdmin, public.Question.ID, true)
	if err != nil || !faq.Question.IsFAQ {
		t.Fatalf("admin could not mark answered question as FAQ: faq=%v err=%v", faq != nil && faq.Question.IsFAQ, err)
	}
	if _, err := service.SetFAQ(context.Background(), mechanicalAdmin, public.Question.ID, true); err != nil {
		t.Fatalf("repeated FAQ state was not idempotent: %v", err)
	}
	faqItems, err := service.ListMember(context.Background(), peer, ListFilter{GroupID: groupIDs["机械组"], FAQOnly: true, Keyword: "串口"})
	if err != nil || len(faqItems) != 1 || faqItems[0].ID != public.Question.ID {
		t.Fatalf("FAQ search failed: items=%d err=%v", len(faqItems), err)
	}
	if _, err := service.SetFAQ(context.Background(), mechanicalAdmin, public.Question.ID, false); err != nil {
		t.Fatalf("admin could not remove FAQ marker: %v", err)
	}
	if _, err := service.SetFAQ(context.Background(), mechanicalAdmin, public.Question.ID, true); err != nil {
		t.Fatalf("admin could not add the resolved question to FAQ again: %v", err)
	}
	if _, err := service.SetSolved(context.Background(), member, public.Question.ID, false); err != nil {
		t.Fatalf("question owner could not reopen the question: %v", err)
	}
	var solvedMilestones, faqMilestones int64
	if err := db.Model(&model.TrainingQuestionGrowthEvent{}).Where("question_id = ? AND kind = ?", public.Question.ID, model.TrainingQuestionGrowthSolved).Count(&solvedMilestones).Error; err != nil {
		t.Fatalf("count preserved solved milestones: %v", err)
	}
	if err := db.Model(&model.TrainingQuestionGrowthEvent{}).Where("question_id = ? AND kind = ?", public.Question.ID, model.TrainingQuestionGrowthFAQ).Count(&faqMilestones).Error; err != nil {
		t.Fatalf("count preserved FAQ milestones: %v", err)
	}
	if solvedMilestones != 1 || faqMilestones != 2 {
		t.Fatalf("status milestones after reopen/removal = solved:%d FAQ:%d, want one solved and two distinct FAQ inclusions", solvedMilestones, faqMilestones)
	}

	communityPost, err := service.CreateCommunityPost(context.Background(), operationsMember, CommunityPostInput{
		Category: model.CommunityCategoryProject, Title: "[TEST_QA] 全组协作记录", Body: "运营成员也可以发布项目进展。",
		Files: []*multipart.FileHeader{testQuestionUpload(t, "community.png")},
	})
	if err != nil {
		t.Fatalf("operations member could not publish community post: %v", err)
	}
	if communityPost.Post.AuthorLevel != 1 {
		t.Fatalf("new member should start at level 1, got level %d", communityPost.Post.AuthorLevel)
	}
	if communityPost.Post.ViewCount != 1 || len(communityPost.Post.Participants) != 1 || communityPost.Post.Participants[0].ID != operationsMember.ID {
		t.Fatalf("new topic should count its author's page view and participant: post=%#v", communityPost.Post)
	}
	growthPage, err := service.ListCommunity(context.Background(), operationsMember, CommunityListFilter{Sort: "latest", Page: 1, PageSize: 10, IncludeGrowth: true})
	if err != nil || growthPage.GrowthProfile == nil || growthPage.GrowthProfile.Level != communityPost.Post.AuthorLevel {
		t.Fatalf("homepage growth profile and author level disagree: page=%#v err=%v", growthPage, err)
	}
	communityID := communityPost.Post.ID
	questionIDs = append(questionIDs, communityID)
	if err := db.Model(&model.User{}).Where("id = ?", operationsMember.ID).Update("team_identity_status", model.TeamIdentityFormalMember).Error; err != nil {
		t.Fatalf("set isolated formal-member identity for community display: %v", err)
	}
	firstView, err := service.GetCommunityPost(context.Background(), crossMember, communityID)
	if err != nil || firstView.Post.ViewCount != 2 {
		t.Fatalf("first distinct member view = %v, want 2 total views: err=%v", firstView, err)
	}
	if firstView.Post.AuthorTeamIdentityStatus != model.TeamIdentityFormalMember {
		t.Fatalf("post author identity was not returned from the authoritative user record: %q", firstView.Post.AuthorTeamIdentityStatus)
	}
	refreshedView, err := service.GetCommunityPost(context.Background(), crossMember, communityID)
	if err != nil || refreshedView.Post.ViewCount != 2 {
		t.Fatalf("repeated refresh changed the deduplicated view count: post=%v err=%v", refreshedView, err)
	}
	if communityPost.Post.IsLegacy || communityPost.Post.GroupID != 0 {
		t.Fatalf("new community post unexpectedly has a group scope: %#v", communityPost.Post)
	}
	if len(communityPost.Post.Attachments) != 1 || !strings.HasPrefix(communityPost.Post.Attachments[0].URL, "/api/community/files/") {
		t.Fatalf("community image did not use the protected community file route: %#v", communityPost.Post.Attachments)
	}
	communityImage, err := service.OpenFile(context.Background(), crossMember, communityPost.Post.Attachments[0].ID)
	if err != nil || communityImage.ContentType != "image/png" || len(communityImage.Content) == 0 {
		t.Fatalf("cross-group member could not read public community image: file=%v err=%v", communityImage != nil, err)
	}
	secondCommunityPost, err := service.CreateCommunityPost(context.Background(), crossMember, CommunityPostInput{
		Category: model.CommunityCategoryExperience, Title: "[TEST_QA] 社区经验分享", Body: "另一位成员的实践体会。",
	})
	if err != nil {
		t.Fatalf("cross-group member could not create a second community post: %v", err)
	}
	questionIDs = append(questionIDs, secondCommunityPost.Post.ID)
	relatedCommunityPost, err := service.CreateCommunityPost(context.Background(), crossMember, CommunityPostInput{
		Category: model.CommunityCategoryProject, Title: "[TEST_QA] 相关项目记录", Body: "与当前项目记录同类的讨论。",
	})
	if err != nil {
		t.Fatalf("cross-group member could not create a related community post: %v", err)
	}
	questionIDs = append(questionIDs, relatedCommunityPost.Post.ID)
	recommendations, err := service.RelatedCommunityPosts(context.Background(), crossMember, communityID)
	if err != nil {
		t.Fatalf("read visible related community topics: %v", err)
	}
	if len(recommendations.Related) == 0 || recommendations.Related[0].ID != relatedCommunityPost.Post.ID {
		t.Fatalf("same-category topic was not prioritized as related: %#v", recommendations)
	}
	foundRecentlyActiveTopic := false
	for _, topic := range recommendations.Recommended {
		if topic.ID == secondCommunityPost.Post.ID {
			foundRecentlyActiveTopic = true
			break
		}
	}
	if !foundRecentlyActiveTopic {
		t.Fatalf("recently active topic was not included as a recommendation: %#v", recommendations)
	}
	for _, topic := range append(recommendations.Related, recommendations.Recommended...) {
		if topic.ID == communityID || topic.ID == private.Question.ID {
			t.Fatalf("recommendations exposed the current or an inaccessible topic: %#v", topic)
		}
	}
	if _, err := service.RelatedCommunityPosts(context.Background(), crossMember, private.Question.ID); questionStatus(err) != http.StatusNotFound {
		t.Fatalf("cross-group recommendation source status=%d, want 404", questionStatus(err))
	}
	if _, err := service.GetCommunityPost(context.Background(), crossMember, public.Question.ID); questionStatus(err) != http.StatusNotFound {
		t.Fatalf("community view expanded historical technical-group visibility: status=%d, want 404", questionStatus(err))
	}
	if _, err := service.GetCommunityPost(context.Background(), crossMember, private.Question.ID); questionStatus(err) != http.StatusNotFound {
		t.Fatalf("community view expanded historical private visibility: status=%d, want 404", questionStatus(err))
	}

	if _, err := service.SetSolved(context.Background(), member, public.Question.ID, true); err != nil {
		t.Fatalf("could not set historical discussion to solved for reply check: %v", err)
	}
	legacyComment, err := service.AddCommunityComment(context.Background(), peer, public.Question.ID, CommunityCommentInput{Body: "解决后仍可继续讨论。"})
	if err != nil || len(legacyComment.Comments) < 3 {
		t.Fatalf("solved historical thread rejected a normal comment: comments=%d err=%v", lenOrZeroCommunity(legacyComment), err)
	}
	if _, err := service.AddCommunityComment(context.Background(), crossMember, public.Question.ID, CommunityCommentInput{Body: "越组访问"}); questionStatus(err) != http.StatusNotFound {
		t.Fatalf("cross-group reply to historical thread status=%d, want 404", questionStatus(err))
	}

	liked, err := service.SetCommunityReaction(context.Background(), crossMember, communityID, "like", true)
	if err != nil || liked.LikeCount != 1 {
		t.Fatalf("community like failed: state=%#v err=%v", liked, err)
	}
	liked, err = service.SetCommunityReaction(context.Background(), crossMember, communityID, "like", true)
	if err != nil || liked.LikeCount != 1 {
		t.Fatalf("repeated community like counted twice: state=%#v err=%v", liked, err)
	}
	if _, err := service.SetCommunityReaction(context.Background(), crossMember, communityID, "bookmark", true); err != nil {
		t.Fatalf("community bookmark failed: %v", err)
	}
	saved, err := service.ListCommunity(context.Background(), crossMember, CommunityListFilter{Sort: "latest", Page: 1, PageSize: 10, Saved: true})
	if err != nil || len(saved.Items) != 1 || saved.Items[0].ID != communityID {
		t.Fatalf("saved post list mismatch: items=%d err=%v", lenOrZeroCommunityList(saved), err)
	}
	if _, err := service.SetCommunityReaction(context.Background(), crossMember, communityID, "like", false); err != nil {
		t.Fatalf("community unlike failed: %v", err)
	}
	if _, err := service.SetCommunityReaction(context.Background(), crossMember, communityID, "like", true); err != nil {
		t.Fatalf("community re-like failed: %v", err)
	}
	operationsGrowth, err := service.GetCommunityGrowth(context.Background(), operationsMember)
	if err != nil || operationsGrowth.TotalXP != 10 {
		t.Fatalf("unlike then re-like granted duplicate XP: profile=%#v err=%v", operationsGrowth, err)
	}

	firstComment, err := service.AddCommunityComment(context.Background(), peer, communityID, CommunityCommentInput{Body: "项目记录的补充说明。"})
	if err != nil || len(firstComment.Comments) != 1 {
		t.Fatalf("cross-group member could not comment on community post: comments=%d err=%v", lenOrZeroCommunity(firstComment), err)
	}
	if firstComment.Comments[0].AuthorTeamIdentityStatus != model.TeamIdentityCommunityMember {
		t.Fatalf("unverified commenter identity = %q, want community_member", firstComment.Comments[0].AuthorTeamIdentityStatus)
	}
	parentID := firstComment.Comments[0].ID
	if err := db.Model(&model.User{}).Where("id = ?", crossMember.ID).Update("team_identity_status", model.TeamIdentityReserveMember).Error; err != nil {
		t.Fatalf("set isolated reserve-member identity for community display: %v", err)
	}
	reply, err := service.AddCommunityComment(context.Background(), crossMember, communityID, CommunityCommentInput{Body: "回复上面的说明。", ParentPostID: &parentID})
	if err != nil || len(reply.Comments) != 2 || reply.Comments[1].ParentPostID == nil || *reply.Comments[1].ParentPostID != parentID {
		t.Fatalf("nested community reply failed: comments=%d err=%v", lenOrZeroCommunity(reply), err)
	}
	if len(reply.Post.Participants) != 3 || reply.Post.Participants[0].ID != crossMember.ID || reply.Post.Participants[1].ID != peer.ID {
		t.Fatalf("topic participants should be unique and ordered by latest activity: %#v", reply.Post.Participants)
	}
	if reply.Comments[1].AuthorTeamIdentityStatus != model.TeamIdentityReserveMember {
		t.Fatalf("reserve-member reply identity = %q, want reserve_member", reply.Comments[1].AuthorTeamIdentityStatus)
	}
	if reply.Comments[0].AuthorLevel != operationsGrowth.Level || reply.Post.AuthorLevel != operationsGrowth.Level {
		t.Fatalf("author levels differ between post, reply and profile: post=%d reply=%d profile=%d", reply.Post.AuthorLevel, reply.Comments[0].AuthorLevel, operationsGrowth.Level)
	}

	if err := db.Create(&model.CoBuilderContribution{
		UserID: member.ID, Description: "[TEST_QA] 社区主页徽章验证", GrantedByID: superAdmin.ID, CreatedAt: statusClock,
	}).Error; err != nil {
		t.Fatalf("create isolated member badge contribution: %v", err)
	}
	bio := "[TEST_QA] 仅展示在社区个人主页的公开介绍。"
	featuredBadge := "co_builder"
	if _, err := service.UpdateMyCommunityMemberProfile(context.Background(), member, CommunityMemberProfileInput{
		Bio: &bio, FeaturedBadgeKey: &featuredBadge,
	}); err != nil {
		t.Fatalf("member could not update public profile fields: %v", err)
	}
	memberPosts, err := service.GetCommunityMemberProfile(context.Background(), peer, member.ID, CommunityMemberTabPosts, 1)
	if err != nil {
		t.Fatalf("same-group member could not read the community profile: %v", err)
	}
	if memberPosts.Member.Bio != bio || memberPosts.Member.FeaturedBadge == nil || memberPosts.Member.FeaturedBadge.LevelCode != "bronze" || memberPosts.Member.TeamIdentityStatus != model.TeamIdentityCommunityMember {
		t.Fatalf("community profile public identity or earned badge mismatch: member=%#v", memberPosts.Member)
	}
	encodedMember, err := json.Marshal(memberPosts.Member)
	if err != nil {
		t.Fatalf("marshal public member profile: %v", err)
	}
	for _, privateField := range []string{"email", "phone", "studentId", "timetable"} {
		if strings.Contains(string(encodedMember), `"`+privateField+`"`) {
			t.Fatalf("public member profile leaked private field %q: %s", privateField, encodedMember)
		}
	}
	if memberPosts.Stats.PostCount != 1 || memberPosts.Stats.ReplyCount != 1 || len(memberPosts.Posts) != 1 || memberPosts.Posts[0].ID != public.Question.ID {
		t.Fatalf("member profile did not respect visible discussion scope: stats=%#v posts=%#v", memberPosts.Stats, memberPosts.Posts)
	}
	badgeTab, err := service.GetCommunityMemberProfile(context.Background(), peer, member.ID, CommunityMemberTabBadges, 1)
	if err != nil || len(badgeTab.Badges) != 1 || len(badgeTab.Badges[0].TierHistory) != 1 || badgeTab.Badges[0].TierHistory[0].LevelCode != "bronze" {
		t.Fatalf("community profile did not show the earned badge history: badges=%#v err=%v", badgeTab.Badges, err)
	}
	privateReplies, err := service.GetCommunityMemberProfile(context.Background(), peer, mechanicalAdmin.ID, CommunityMemberTabReplies, 1)
	if err != nil {
		t.Fatalf("read replies profile for access check: %v", err)
	}
	for _, item := range privateReplies.Replies {
		if strings.Contains(item.PostTitle, "secret-alpha") || strings.Contains(item.Body, "管理员答复私密问题") {
			t.Fatalf("member profile exposed a private discussion reply: %#v", item)
		}
	}

	commentLiked, err := service.SetCommunityCommentReaction(context.Background(), crossMember, parentID, true)
	if err != nil || commentLiked.LikeCount != 1 {
		t.Fatalf("comment like failed: state=%#v err=%v", commentLiked, err)
	}
	commentLiked, err = service.SetCommunityCommentReaction(context.Background(), crossMember, parentID, true)
	if err != nil || commentLiked.LikeCount != 1 {
		t.Fatalf("repeated comment like was not idempotent: state=%#v err=%v", commentLiked, err)
	}
	peerGrowth, err := service.GetCommunityGrowth(context.Background(), peer)
	if err != nil || peerGrowth.TotalXP != 3 {
		t.Fatalf("receiving a comment like should award one XP: profile=%#v err=%v", peerGrowth, err)
	}
	if _, err := service.SetCommunityCommentReaction(context.Background(), crossMember, parentID, false); err != nil {
		t.Fatalf("comment unlike failed: %v", err)
	}
	if _, err := service.SetCommunityCommentReaction(context.Background(), crossMember, parentID, true); err != nil {
		t.Fatalf("comment re-like failed: %v", err)
	}
	peerGrowth, err = service.GetCommunityGrowth(context.Background(), peer)
	if err != nil || peerGrowth.TotalXP != 2 {
		t.Fatalf("comment unlike then re-like granted XP again: profile=%#v err=%v", peerGrowth, err)
	}
	acceptedCommentID := reply.Comments[1].ID
	accepted, err := service.SetCommunitySolution(context.Background(), operationsMember, communityID, CommunitySolutionUpdate{CommentID: &acceptedCommentID})
	if err != nil || accepted.Post.AcceptedSolutionID == nil || *accepted.Post.AcceptedSolutionID != acceptedCommentID || !accepted.Comments[1].IsAcceptedSolution {
		t.Fatalf("post author could not accept a reply as the solution: detail=%#v err=%v", accepted, err)
	}
	if _, err := service.SetCommunitySolution(context.Background(), operationsMember, communityID, CommunitySolutionUpdate{CommentID: &acceptedCommentID}); err != nil {
		t.Fatalf("repeated solution acceptance failed: %v", err)
	}
	crossGrowth, err := service.GetCommunityGrowth(context.Background(), crossMember)
	if err != nil || crossGrowth.TotalXP != 32 {
		t.Fatalf("accepted reply should award ten XP once: profile=%#v err=%v", crossGrowth, err)
	}
	if _, err := service.SetCommunitySolution(context.Background(), member, communityID, CommunitySolutionUpdate{CommentID: &parentID}); questionStatus(err) != http.StatusForbidden {
		t.Fatalf("non-owner non-admin could manage a best answer: status=%d", questionStatus(err))
	}
	adminAccepted, err := service.SetCommunitySolution(context.Background(), superAdmin, communityID, CommunitySolutionUpdate{CommentID: &parentID})
	if err != nil || adminAccepted.Post.AcceptedSolutionID == nil || *adminAccepted.Post.AcceptedSolutionID != parentID || !adminAccepted.Comments[0].IsAcceptedSolution {
		t.Fatalf("super admin could not replace the best answer: detail=%#v err=%v", adminAccepted, err)
	}
	crossGrowth, err = service.GetCommunityGrowth(context.Background(), crossMember)
	if err != nil || crossGrowth.TotalXP != 22 {
		t.Fatalf("replacing the best answer did not revoke the previous reward: profile=%#v err=%v", crossGrowth, err)
	}
	peerGrowth, err = service.GetCommunityGrowth(context.Background(), peer)
	if err != nil || peerGrowth.TotalXP != 12 {
		t.Fatalf("replacement best answer did not award its author once: profile=%#v err=%v", peerGrowth, err)
	}
	adminUnset, err := service.SetCommunitySolution(context.Background(), superAdmin, communityID, CommunitySolutionUpdate{})
	if err != nil || adminUnset.Post.AcceptedSolutionID != nil || adminUnset.Post.IsSolved {
		t.Fatalf("super admin could not unset the best answer: detail=%#v err=%v", adminUnset, err)
	}
	peerGrowth, err = service.GetCommunityGrowth(context.Background(), peer)
	if err != nil || peerGrowth.TotalXP != 2 {
		t.Fatalf("unsetting the best answer did not revoke its reward: profile=%#v err=%v", peerGrowth, err)
	}
	if _, err := service.UpdateCommunityComment(context.Background(), peer, parentID, "更新后的说明"); err != nil {
		t.Fatalf("comment author could not edit their own comment: %v", err)
	}
	if _, err := service.DeleteCommunityComment(context.Background(), peer, parentID); err != nil {
		t.Fatalf("comment author could not delete their own comment: %v", err)
	}
	peerGrowth, err = service.GetCommunityGrowth(context.Background(), peer)
	if err != nil || peerGrowth.TotalXP != 0 {
		t.Fatalf("deleting the liked comment did not revoke its reward: profile=%#v err=%v", peerGrowth, err)
	}

	updated, err := service.UpdateCommunityPost(context.Background(), operationsMember, communityID, CommunityPostUpdate{
		Category: model.CommunityCategoryExperience, Title: "[TEST_QA] 更新后的社区记录", Body: "已修订的正文。",
	})
	if err != nil || updated.Post.Title != "[TEST_QA] 更新后的社区记录" || updated.Post.EditedAt == nil {
		t.Fatalf("post author could not edit their post: post=%#v err=%v", updated, err)
	}
	if _, err := service.UpdateCommunityPost(context.Background(), crossMember, communityID, CommunityPostUpdate{
		Category: model.CommunityCategoryExperience, Title: "越权标题", Body: "越权正文",
	}); questionStatus(err) != http.StatusForbidden {
		t.Fatalf("non-author edit status=%d, want 403", questionStatus(err))
	}

	pinned, hidden := true, true
	moderated, err := service.ModerateCommunityPost(context.Background(), mechanicalAdmin, communityID, CommunityModerationUpdate{Pinned: &pinned, Hidden: &hidden})
	if err != nil || !moderated.Post.IsPinned || !moderated.Post.IsHidden {
		t.Fatalf("admin moderation failed: post=%#v err=%v", moderated, err)
	}
	adminPinnedPage, err := service.ListCommunity(context.Background(), mechanicalAdmin, CommunityListFilter{Sort: "hot", Category: model.CommunityCategoryExperience, Page: 1, PageSize: 10})
	if err != nil || len(adminPinnedPage.Items) < 2 || adminPinnedPage.Items[0].ID != communityID || !adminPinnedPage.Items[0].IsPinned {
		t.Fatalf("pinned post did not lead the filtered hot list: page=%#v err=%v", adminPinnedPage, err)
	}
	if _, err := service.GetCommunityPost(context.Background(), crossMember, communityID); questionStatus(err) != http.StatusNotFound {
		t.Fatalf("hidden community post remained visible to a member: status=%d", questionStatus(err))
	}
	operationsGrowth, err = service.GetCommunityGrowth(context.Background(), operationsMember)
	if err != nil || operationsGrowth.TotalXP != 0 {
		t.Fatalf("hiding a post did not revoke reply XP: profile=%#v err=%v", operationsGrowth, err)
	}
	crossGrowth, err = service.GetCommunityGrowth(context.Background(), crossMember)
	if err != nil || crossGrowth.TotalXP != 20 {
		t.Fatalf("hiding a post did not revoke accepted-solution XP: profile=%#v err=%v", crossGrowth, err)
	}
	visibleToAdmin, err := service.ListCommunity(context.Background(), mechanicalAdmin, CommunityListFilter{Sort: "latest", Page: 1, PageSize: 1})
	if err != nil || len(visibleToAdmin.Items) != 1 || visibleToAdmin.Items[0].ID != communityID || !visibleToAdmin.Items[0].IsHidden {
		t.Fatalf("admin could not review hidden community post: items=%d err=%v", lenOrZeroCommunityList(visibleToAdmin), err)
	}
	if _, err := service.ModerateCommunityPost(context.Background(), crossMember, communityID, CommunityModerationUpdate{Hidden: &pinned}); questionStatus(err) != http.StatusForbidden {
		t.Fatalf("member moderation status=%d, want 403", questionStatus(err))
	}
	unhidden := false
	if _, err := service.ModerateCommunityPost(context.Background(), mechanicalAdmin, communityID, CommunityModerationUpdate{Hidden: &unhidden}); err != nil {
		t.Fatalf("admin could not unhide community post: %v", err)
	}
	for _, sort := range []string{"latest", "hot"} {
		pinnedPage, listErr := service.ListCommunity(context.Background(), crossMember, CommunityListFilter{Sort: sort, Category: model.CommunityCategoryExperience, Page: 1, PageSize: 10})
		if listErr != nil || len(pinnedPage.Items) < 2 || pinnedPage.Items[0].ID != communityID || !pinnedPage.Items[0].IsPinned {
			t.Fatalf("pinned post did not lead the filtered %s list: page=%#v err=%v", sort, pinnedPage, listErr)
		}
	}
	if page, err := service.ListCommunity(context.Background(), crossMember, CommunityListFilter{Sort: "latest", Category: model.CommunityCategoryExperience, Page: 1, PageSize: 1}); err != nil || len(page.Items) != 1 || page.Items[0].ID != communityID || !page.HasMore {
		t.Fatalf("category filter and pagination mismatch: page=%#v err=%v", page, err)
	}
	if err := service.DeleteCommunityPost(context.Background(), operationsMember, communityID); err != nil {
		t.Fatalf("post author could not delete their post: %v", err)
	}
	var retained model.TrainingQuestion
	if err := db.First(&retained, communityID).Error; err != nil || retained.DeletedAt == nil {
		t.Fatalf("deleted post history was not retained: post=%#v err=%v", retained, err)
	}
	deleteTestPost, err := service.CreateCommunityPost(context.Background(), operationsMember, CommunityPostInput{
		Category: model.CommunityCategoryProject, Title: "[TEST_QA] deletion reward probe", Body: "A reply reward should be removed when this post is deleted.",
	})
	if err != nil {
		t.Fatalf("create deletion reward probe: %v", err)
	}
	questionIDs = append(questionIDs, deleteTestPost.Post.ID)
	if _, err := service.AddCommunityComment(context.Background(), peer, deleteTestPost.Post.ID, CommunityCommentInput{Body: "Temporary reply for deletion verification."}); err != nil {
		t.Fatalf("create deletion reward probe reply: %v", err)
	}
	operationsGrowth, err = service.GetCommunityGrowth(context.Background(), operationsMember)
	if err != nil || operationsGrowth.TotalXP != 11 {
		t.Fatalf("post and reply rewards were not granted before deletion: profile=%#v err=%v", operationsGrowth, err)
	}
	if err := service.DeleteCommunityPost(context.Background(), operationsMember, deleteTestPost.Post.ID); err != nil {
		t.Fatalf("delete the reward probe post: %v", err)
	}
	operationsGrowth, err = service.GetCommunityGrowth(context.Background(), operationsMember)
	if err != nil || operationsGrowth.TotalXP != 0 {
		t.Fatalf("deleting the source post did not revoke its reply reward: profile=%#v err=%v", operationsGrowth, err)
	}

	growthActor := createActor("community-contribution-rewards", model.RoleNameUser, "")
	growthTime := time.Date(2026, time.October, 31, 15, 59, 0, 0, time.UTC) // 23:59 in Beijing.
	service.now = func() time.Time { return growthTime }
	createGrowthPost := func(title string, author Actor) *CommunityPostDetail {
		t.Helper()
		created, createErr := service.CreateCommunityPost(context.Background(), author, CommunityPostInput{
			Category: model.CommunityCategoryExperience, Title: "[TEST_QA] " + title, Body: "用于验证社区成长奖励。",
		})
		if createErr != nil {
			t.Fatalf("create contribution reward post: %v", createErr)
		}
		questionIDs = append(questionIDs, created.Post.ID)
		return created
	}
	firstGrowthPost := createGrowthPost("first contribution", growthActor)
	createGrowthPost("second contribution", growthActor)
	createGrowthPost("daily post cap", growthActor)
	growthProfile, err := service.GetCommunityGrowth(context.Background(), growthActor)
	if err != nil || growthProfile.TotalXP != 20 || growthProfile.DailyPostsUsed != 2 || growthProfile.DailyRepliesUsed != 0 || growthProfile.DailyContributionXP != 20 {
		t.Fatalf("daily post reward limit incorrect: profile=%#v err=%v", growthProfile, err)
	}
	if _, err := service.UpdateCommunityPost(context.Background(), growthActor, firstGrowthPost.Post.ID, CommunityPostUpdate{
		Category: model.CommunityCategoryExperience, Title: "[TEST_QA] edited contribution", Body: "编辑不能重复获得经验。",
	}); err != nil {
		t.Fatalf("edit an already rewarded post: %v", err)
	}
	for index := 0; index < communityCommentDailyLimit; index++ {
		if _, err := service.AddCommunityComment(context.Background(), growthActor, firstGrowthPost.Post.ID, CommunityCommentInput{Body: fmt.Sprintf("[TEST_QA] contribution reply %d", index+1)}); err != nil {
			t.Fatalf("create contribution reply %d: %v", index+1, err)
		}
	}
	if _, err := service.AddCommunityComment(context.Background(), growthActor, firstGrowthPost.Post.ID, CommunityCommentInput{Body: "[TEST_QA] reply beyond daily cap"}); err != nil {
		t.Fatalf("create reply beyond daily reward cap: %v", err)
	}
	growthProfile, err = service.GetCommunityGrowth(context.Background(), growthActor)
	if err != nil || growthProfile.TotalXP != 30 || growthProfile.DailyPostsUsed != 2 || growthProfile.DailyRepliesUsed != 5 || growthProfile.DailyContributionXP != 30 {
		t.Fatalf("daily post and reply reward cap incorrect: profile=%#v err=%v", growthProfile, err)
	}
	var firstReply model.TrainingQuestionPost
	if err := db.Where("question_id = ? AND author_id = ? AND deleted_at IS NULL", firstGrowthPost.Post.ID, growthActor.ID).Order("id ASC").Take(&firstReply).Error; err != nil {
		t.Fatalf("load a rewarded reply for revocation verification: %v", err)
	}
	if _, err := service.DeleteCommunityComment(context.Background(), growthActor, firstReply.ID); err != nil {
		t.Fatalf("delete a rewarded reply: %v", err)
	}
	if _, err := service.AddCommunityComment(context.Background(), growthActor, firstGrowthPost.Post.ID, CommunityCommentInput{Body: "[TEST_QA] no reward after deleting a reply"}); err != nil {
		t.Fatalf("create replacement reply after daily quota: %v", err)
	}
	growthProfile, err = service.GetCommunityGrowth(context.Background(), growthActor)
	if err != nil || growthProfile.TotalXP != 28 || growthProfile.DailyRepliesUsed != 5 || growthProfile.DailyContributionXP != 28 {
		t.Fatalf("deleting a reply restored its daily reward slot: profile=%#v err=%v", growthProfile, err)
	}
	if err := service.DeleteCommunityPost(context.Background(), growthActor, firstGrowthPost.Post.ID); err != nil {
		t.Fatalf("delete a post with contribution rewards: %v", err)
	}
	growthProfile, err = service.GetCommunityGrowth(context.Background(), growthActor)
	if err != nil || growthProfile.TotalXP != 10 || growthProfile.DailyPostsUsed != 2 || growthProfile.DailyRepliesUsed != 5 || growthProfile.DailyContributionXP != 10 {
		t.Fatalf("deleting a post did not revoke its post and reply rewards: profile=%#v err=%v", growthProfile, err)
	}

	// The reward date changes at midnight in Asia/Shanghai, not UTC.
	growthTime = time.Date(2026, time.October, 31, 16, 0, 0, 0, time.UTC)
	newBeijingDayPost := createGrowthPost("Beijing-day reset", growthActor)
	if _, err := service.AddCommunityComment(context.Background(), growthActor, newBeijingDayPost.Post.ID, CommunityCommentInput{Body: "[TEST_QA] first reply after Beijing midnight"}); err != nil {
		t.Fatalf("create first reply after Beijing midnight: %v", err)
	}
	growthProfile, err = service.GetCommunityGrowth(context.Background(), growthActor)
	if err != nil || growthProfile.TotalXP != 22 || growthProfile.DailyPostsUsed != 1 || growthProfile.DailyRepliesUsed != 1 || growthProfile.DailyContributionXP != 12 {
		t.Fatalf("Beijing-day reward counters did not reset: profile=%#v err=%v", growthProfile, err)
	}

	growthTime = time.Date(2026, time.November, 1, 16, 0, 0, 0, time.UTC)
	concurrentReplyTargets := make([]*CommunityPostDetail, 0, 8)
	for index := 0; index < 8; index++ {
		concurrentReplyTargets = append(concurrentReplyTargets, createGrowthPost(fmt.Sprintf("concurrent reply target %d", index+1), peer))
	}
	type contributionAttempt struct{ err error }
	const concurrentReplies = 8
	contributionAttempts := make(chan contributionAttempt, concurrentReplies)
	for index := 0; index < concurrentReplies; index++ {
		go func(index int) {
			_, err := service.AddCommunityComment(context.Background(), growthActor, concurrentReplyTargets[index].Post.ID, CommunityCommentInput{Body: fmt.Sprintf("[TEST_QA] concurrent reply %d", index)})
			contributionAttempts <- contributionAttempt{err: err}
		}(index)
	}
	for index := 0; index < concurrentReplies; index++ {
		if attempt := <-contributionAttempts; attempt.err != nil {
			t.Fatalf("concurrent contribution reply failed: %v", attempt.err)
		}
	}
	growthProfile, err = service.GetCommunityGrowth(context.Background(), growthActor)
	if err != nil || growthProfile.TotalXP != 32 || growthProfile.DailyPostsUsed != 0 || growthProfile.DailyRepliesUsed != 5 || growthProfile.DailyContributionXP != 10 {
		t.Fatalf("concurrent contribution replies exceeded or missed the daily cap: profile=%#v err=%v", growthProfile, err)
	}

	concurrentPostActor := createActor("concurrent-community-posts", model.RoleNameUser, "")
	const concurrentPosts = 6
	postAttempts := make(chan contributionAttempt, concurrentPosts)
	var questionIDsMutex sync.Mutex
	for index := 0; index < concurrentPosts; index++ {
		go func(index int) {
			post, err := service.CreateCommunityPost(context.Background(), concurrentPostActor, CommunityPostInput{
				Category: model.CommunityCategoryExperience, Title: fmt.Sprintf("[TEST_QA] concurrent post %d", index), Body: "并发发帖只能占用两个奖励名额。",
			})
			if post != nil {
				questionIDsMutex.Lock()
				questionIDs = append(questionIDs, post.Post.ID)
				questionIDsMutex.Unlock()
			}
			postAttempts <- contributionAttempt{err: err}
		}(index)
	}
	for index := 0; index < concurrentPosts; index++ {
		if attempt := <-postAttempts; attempt.err != nil {
			t.Fatalf("concurrent community post failed: %v", attempt.err)
		}
	}
	postGrowth, err := service.GetCommunityGrowth(context.Background(), concurrentPostActor)
	if err != nil || postGrowth.TotalXP != 20 || postGrowth.DailyPostsUsed != 2 || postGrowth.DailyContributionXP != 20 {
		t.Fatalf("concurrent community posts exceeded or missed the daily cap: profile=%#v err=%v", postGrowth, err)
	}

	checkInActor := createActor("community-check-in", model.RoleNameUser, "")
	checkInTime := time.Date(2026, time.October, 31, 15, 59, 0, 0, time.UTC) // 23:59 in Beijing.
	service.now = func() time.Time { return checkInTime }
	firstCheckIn, err := service.CheckInCommunity(context.Background(), checkInActor)
	if err != nil || firstCheckIn.EarnedXP != 10 || firstCheckIn.StreakDay != 1 || firstCheckIn.Profile.TotalXP != 10 {
		t.Fatalf("first Beijing-day check-in incorrect: result=%#v err=%v", firstCheckIn, err)
	}
	repeatedCheckIn, err := service.CheckInCommunity(context.Background(), checkInActor)
	if err != nil || !repeatedCheckIn.Already || repeatedCheckIn.EarnedXP != 0 || repeatedCheckIn.Profile.TotalXP != 10 {
		t.Fatalf("duplicate same-day check-in granted XP: result=%#v err=%v", repeatedCheckIn, err)
	}
	for day := 2; day <= 7; day++ {
		checkInTime = checkInTime.Add(24 * time.Hour)
		result, err := service.CheckInCommunity(context.Background(), checkInActor)
		if err != nil || result.StreakDay != day || result.EarnedXP != communityCheckInXP(day) {
			t.Fatalf("consecutive check-in day %d incorrect: result=%#v err=%v", day, result, err)
		}
	}
	checkInProfile, err := service.GetCommunityGrowth(context.Background(), checkInActor)
	if err != nil || checkInProfile.TotalXP != 83 || checkInProfile.Level != 1 || checkInProfile.StreakDays != 7 || !checkInProfile.CheckedInToday || len(checkInProfile.UpcomingCheckIns) != 7 {
		t.Fatalf("seven-day check-in profile incorrect: profile=%#v err=%v", checkInProfile, err)
	}
	checkInTime = checkInTime.Add(48 * time.Hour)
	missedCheckIn, err := service.CheckInCommunity(context.Background(), checkInActor)
	if err != nil || missedCheckIn.StreakDay != 1 || missedCheckIn.EarnedXP != 10 || missedCheckIn.Profile.StreakDays != 1 {
		t.Fatalf("a missed day did not restart the streak: result=%#v err=%v", missedCheckIn, err)
	}
	checkInTime = checkInTime.Add(24 * time.Hour)
	type checkInAttempt struct {
		result *CommunityCheckInResult
		err    error
	}
	const concurrentCheckIns = 8
	attempts := make(chan checkInAttempt, concurrentCheckIns)
	for index := 0; index < concurrentCheckIns; index++ {
		go func() {
			result, err := service.CheckInCommunity(context.Background(), checkInActor)
			attempts <- checkInAttempt{result: result, err: err}
		}()
	}
	newAwards := 0
	for index := 0; index < concurrentCheckIns; index++ {
		attempt := <-attempts
		if attempt.err != nil {
			t.Fatalf("concurrent check-in request failed: %v", attempt.err)
		}
		if attempt.result.EarnedXP > 0 {
			newAwards++
		}
	}
	if newAwards != 1 {
		t.Fatalf("concurrent check-ins awarded XP %d times, want once", newAwards)
	}
	checkInProfile, err = service.GetCommunityGrowth(context.Background(), checkInActor)
	if err != nil || checkInProfile.TotalXP != 103 || checkInProfile.StreakDays != 2 {
		t.Fatalf("concurrent check-in did not create one day-2 reward: profile=%#v err=%v", checkInProfile, err)
	}
}

func lenOrZeroCommunity(value *CommunityPostDetail) int {
	if value == nil {
		return 0
	}
	return len(value.Comments)
}

func lenOrZeroCommunityList(value *CommunityListResult) int {
	if value == nil {
		return 0
	}
	return len(value.Items)
}

func testQuestionUpload(t *testing.T, fileName string) *multipart.FileHeader {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	file, err := writer.CreateFormFile("files", fileName)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = file.Write([]byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0})
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest("POST", "/", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	if err := request.ParseMultipartForm(1 << 20); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = request.MultipartForm.RemoveAll() })
	return request.MultipartForm.File["files"][0]
}

func questionStatus(err error) int {
	var serviceErr *ServiceError
	if errors.As(err, &serviceErr) {
		return serviceErr.Status
	}
	if err == nil {
		return http.StatusOK
	}
	return http.StatusInternalServerError
}

func lenOrZero(value *QuestionDetail) int {
	if value == nil {
		return 0
	}
	return len(value.Posts)
}

func strPtr(value string) *string { return &value }
