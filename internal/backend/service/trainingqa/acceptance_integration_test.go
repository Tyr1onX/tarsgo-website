package trainingqa

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
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
	for _, table := range []string{"training_questions", "training_question_posts", "training_question_attachments", "training_question_growth_events"} {
		if !db.Migrator().HasTable(table) {
			t.Fatalf("database migration v20 is missing table %s", table)
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
			for _, value := range []any{&model.CommunityPostReaction{}, &model.TrainingQuestionGrowthEvent{}, &model.TrainingQuestionAttachment{}, &model.TrainingQuestionPost{}} {
				if err := db.Where("question_id IN ?", questionIDs).Delete(value).Error; err != nil {
					t.Errorf("clean isolated Q&A history: %v", err)
				}
			}
			if err := db.Where("id IN ?", questionIDs).Delete(&model.TrainingQuestion{}).Error; err != nil {
				t.Errorf("clean isolated Q&A questions: %v", err)
			}
		}
		if len(actorUserIDs) > 0 {
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
	communityID := communityPost.Post.ID
	questionIDs = append(questionIDs, communityID)
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

	firstComment, err := service.AddCommunityComment(context.Background(), peer, communityID, CommunityCommentInput{Body: "项目记录的补充说明。"})
	if err != nil || len(firstComment.Comments) != 1 {
		t.Fatalf("cross-group member could not comment on community post: comments=%d err=%v", lenOrZeroCommunity(firstComment), err)
	}
	parentID := firstComment.Comments[0].ID
	reply, err := service.AddCommunityComment(context.Background(), crossMember, communityID, CommunityCommentInput{Body: "回复上面的说明。", ParentPostID: &parentID})
	if err != nil || len(reply.Comments) != 2 || reply.Comments[1].ParentPostID == nil || *reply.Comments[1].ParentPostID != parentID {
		t.Fatalf("nested community reply failed: comments=%d err=%v", lenOrZeroCommunity(reply), err)
	}
	if _, err := service.UpdateCommunityComment(context.Background(), peer, parentID, "更新后的说明"); err != nil {
		t.Fatalf("comment author could not edit their own comment: %v", err)
	}
	if _, err := service.DeleteCommunityComment(context.Background(), peer, parentID); err != nil {
		t.Fatalf("comment author could not delete their own comment: %v", err)
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
	if _, err := service.GetCommunityPost(context.Background(), crossMember, communityID); questionStatus(err) != http.StatusNotFound {
		t.Fatalf("hidden community post remained visible to a member: status=%d", questionStatus(err))
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
