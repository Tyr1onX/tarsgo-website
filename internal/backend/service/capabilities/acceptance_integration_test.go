package capabilities

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"tarsgo-backend/database"
	"tarsgo-backend/model"
)

func TestAcceptanceDatabaseCapabilityWorkflowAndIsolation(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TARSGO_QA_TEST_DSN"))
	if dsn == "" {
		t.Skip("TARSGO_QA_TEST_DSN is not set")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("refusing capability integration test outside the isolated local acceptance database")
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
	if err := database.RunMigrations(context.Background(), db, "acceptance"); err != nil {
		t.Fatalf("apply isolated acceptance migrations: %v", err)
	}
	for _, table := range []string{"users", "roles", "user_groups", "user_group_members", "assignments", "assignment_submissions", "assignment_reviews", "practice_projects", "practice_entries", "practice_submissions", "capability_dimensions", "capability_dimension_sources", "capability_manual_reviews"} {
		if !db.Migrator().HasTable(table) {
			t.Fatalf("acceptance database is missing required table %s", table)
		}
	}

	nonce := time.Now().UTC().Format("20060102T150405.000000000")
	createdGroupIDs, createdUserIDs, createdMembershipIDs := []uint64{}, []uint64{}, []uint64{}
	createdRoleIDs, createdAssignmentIDs, createdSubmissionIDs, createdProjectIDs := []uint64{}, []uint64{}, []uint64{}, []uint64{}
	createdPracticeSubmissionIDs, createdDimensionIDs, createdReviewIDs := []uint64{}, []uint64{}, []uint64{}
	t.Cleanup(func() {
		deleteIDs := func(ids []uint64, destination any) {
			if len(ids) > 0 {
				if err := db.Where("id IN ?", ids).Delete(destination).Error; err != nil {
					t.Errorf("remove synthetic capability acceptance rows: %v", err)
				}
			}
		}
		if len(createdDimensionIDs) > 0 {
			if err := db.Where("dimension_id IN ?", createdDimensionIDs).Delete(&model.CapabilityDimensionSource{}).Error; err != nil {
				t.Errorf("remove synthetic capability sources: %v", err)
			}
			if err := db.Where("dimension_id IN ?", createdDimensionIDs).Delete(&model.CapabilityManualReview{}).Error; err != nil {
				t.Errorf("remove synthetic manual capability reviews: %v", err)
			}
		}
		deleteIDs(createdDimensionIDs, &model.CapabilityDimension{})
		deleteIDs(createdPracticeSubmissionIDs, &model.PracticeSubmission{})
		if len(createdProjectIDs) > 0 {
			_ = db.Where("project_id IN ?", createdProjectIDs).Delete(&model.PracticeEntry{}).Error
		}
		deleteIDs(createdProjectIDs, &model.PracticeProject{})
		deleteIDs(createdReviewIDs, &model.AssignmentReview{})
		deleteIDs(createdSubmissionIDs, &model.AssignmentSubmission{})
		deleteIDs(createdAssignmentIDs, &model.Assignment{})
		deleteIDs(createdMembershipIDs, &model.UserGroupMember{})
		deleteIDs(createdUserIDs, &model.User{})
		deleteIDs(createdGroupIDs, &model.UserGroup{})
		deleteIDs(createdRoleIDs, &model.Role{})
	})

	roleIDs := map[string]uint64{}
	for _, name := range []string{model.RoleNameAdmin, model.RoleNameUser} {
		var role model.Role
		queryErr := db.Where("name = ?", name).Take(&role).Error
		if errors.Is(queryErr, gorm.ErrRecordNotFound) {
			role = model.Role{Name: name, DisplayName: name}
			if err := db.Create(&role).Error; err != nil {
				t.Fatalf("create test role %s: %v", name, err)
			}
			createdRoleIDs = append(createdRoleIDs, role.ID)
		} else if queryErr != nil {
			t.Fatalf("read test role %s: %v", name, queryErr)
		}
		roleIDs[name] = role.ID
	}
	createGroup := func(label string) uint64 {
		group := model.UserGroup{Name: "能力验收 " + label + " " + nonce, Status: model.UserGroupStatusActive}
		if err := db.Create(&group).Error; err != nil {
			t.Fatalf("create test group: %v", err)
		}
		createdGroupIDs = append(createdGroupIDs, group.ID)
		return group.ID
	}
	groupID, otherGroupID := createGroup("主组"), createGroup("跨组")
	createUser := func(label, role string) uint64 {
		user := model.User{RoleID: roleIDs[role], Name: label, Email: fmt.Sprintf("cap-%s-%s@tarsgo.test", label, nonce), Status: model.UserStatusEnabled}
		if err := db.Create(&user).Error; err != nil {
			t.Fatalf("create test user %s: %v", label, err)
		}
		createdUserIDs = append(createdUserIDs, user.ID)
		return user.ID
	}
	managerID := createUser("manager", model.RoleNameAdmin)
	memberID := createUser("member", model.RoleNameUser)
	otherManagerID := createUser("other-manager", model.RoleNameAdmin)
	otherMemberID := createUser("other-member", model.RoleNameUser)
	addMembership := func(gID, uID uint64) {
		membership := model.UserGroupMember{GroupID: gID, UserID: uID}
		if err := db.Create(&membership).Error; err != nil {
			t.Fatalf("create test membership: %v", err)
		}
		createdMembershipIDs = append(createdMembershipIDs, membership.ID)
	}
	addMembership(groupID, managerID)
	addMembership(groupID, memberID)
	addMembership(otherGroupID, otherManagerID)
	addMembership(otherGroupID, otherMemberID)
	manager := Actor{ID: managerID, RoleName: model.RoleNameAdmin}
	otherManager := Actor{ID: otherManagerID, RoleName: model.RoleNameAdmin}

	now := time.Now().UTC().Truncate(time.Second)
	service := NewService(db)
	service.Now = func() time.Time { return now.Add(3 * time.Hour) }
	assignment := model.Assignment{GroupID: groupID, CreatorID: managerID, Title: "能力作业 " + nonce, Description: "作业说明", DueAt: now.Add(24 * time.Hour), AttachmentRequirements: "", IsGroupWide: true, PublicationStatus: model.AssignmentPublicationPublished}
	if err := db.Create(&assignment).Error; err != nil {
		t.Fatalf("create assignment source: %v", err)
	}
	createdAssignmentIDs = append(createdAssignmentIDs, assignment.ID)
	ungradedAssignment := model.Assignment{GroupID: groupID, CreatorID: managerID, Title: "未评分作业 " + nonce, Description: "暂未评分", DueAt: now.Add(24 * time.Hour), AttachmentRequirements: "", IsGroupWide: true, PublicationStatus: model.AssignmentPublicationPublished}
	if err := db.Create(&ungradedAssignment).Error; err != nil {
		t.Fatalf("create ungraded assignment source: %v", err)
	}
	createdAssignmentIDs = append(createdAssignmentIDs, ungradedAssignment.ID)
	submission := model.AssignmentSubmission{AssignmentID: assignment.ID, UserID: memberID, Attempt: 1, SubmittedAt: now.Add(-2 * time.Hour), CreatedAt: now.Add(-2 * time.Hour)}
	if err := db.Create(&submission).Error; err != nil {
		t.Fatalf("create assignment submission: %v", err)
	}
	createdSubmissionIDs = append(createdSubmissionIDs, submission.ID)
	for _, review := range []model.AssignmentReview{
		{SubmissionID: submission.ID, ReviewerID: managerID, Score: 80, Decision: model.AssignmentReviewPassed, Comment: "internal assignment note", CreatedAt: now.Add(-90 * time.Minute)},
		{SubmissionID: submission.ID, ReviewerID: managerID, Score: 60, Decision: model.AssignmentReviewNeedsRedo, Comment: "latest assignment note", CreatedAt: now.Add(-60 * time.Minute)},
	} {
		if err := db.Create(&review).Error; err != nil {
			t.Fatalf("create assignment review: %v", err)
		}
		createdReviewIDs = append(createdReviewIDs, review.ID)
	}

	project := model.PracticeProject{GroupID: groupID, CreatorID: managerID, Title: "能力实践项目 " + nonce, Description: "项目说明", Capacity: 5, DueAt: now.Add(24 * time.Hour), Status: model.PracticeProjectClosed}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project source: %v", err)
	}
	createdProjectIDs = append(createdProjectIDs, project.ID)
	entry := model.PracticeEntry{ProjectID: project.ID, UserID: memberID, Status: model.PracticeEntryActive, JoinedAt: now.Add(-3 * time.Hour)}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create project membership: %v", err)
	}
	practiceScore := uint8(90)
	reviewedAt := now.Add(-30 * time.Minute)
	reviewerID := managerID
	practiceSubmission := model.PracticeSubmission{ProjectID: project.ID, UserID: memberID, Attempt: 1, Progress: "完成装配", Reflection: "复盘", Decision: model.PracticeReviewPassed, Comment: "internal project note", Score: &practiceScore, ReviewerID: &reviewerID, ReviewedAt: &reviewedAt, CreatedAt: now.Add(-45 * time.Minute)}
	if err := db.Create(&practiceSubmission).Error; err != nil {
		t.Fatalf("create project acceptance review: %v", err)
	}
	createdPracticeSubmissionIDs = append(createdPracticeSubmissionIDs, practiceSubmission.ID)
	foreignAssignment := model.Assignment{GroupID: otherGroupID, CreatorID: otherManagerID, Title: "跨组作业 " + nonce, Description: "不得关联", DueAt: now.Add(24 * time.Hour), AttachmentRequirements: "", IsGroupWide: true, PublicationStatus: model.AssignmentPublicationPublished}
	if err := db.Create(&foreignAssignment).Error; err != nil {
		t.Fatalf("create foreign assignment source: %v", err)
	}
	createdAssignmentIDs = append(createdAssignmentIDs, foreignAssignment.ID)

	dimension, err := service.CreateDimension(context.Background(), manager, DimensionInput{
		GroupID: groupID, Name: "动手能力", Description: "实践项目和作业中的实际操作", SortOrder: 1,
		Sources: []SourceRef{{Type: model.CapabilitySourceAssignment, ID: assignment.ID}, {Type: model.CapabilitySourcePractice, ID: project.ID}, {Type: model.CapabilitySourceAssignment, ID: ungradedAssignment.ID}},
	})
	if err != nil {
		t.Fatalf("create capability dimension and source links: %v", err)
	}
	createdDimensionIDs = append(createdDimensionIDs, dimension.ID)
	emptyDimension, err := service.CreateDimension(context.Background(), manager, DimensionInput{GroupID: groupID, Name: "团队协作"})
	if err != nil {
		t.Fatalf("create dimension without ratings: %v", err)
	}
	createdDimensionIDs = append(createdDimensionIDs, emptyDimension.ID)
	if _, err := service.CreateDimension(context.Background(), manager, DimensionInput{GroupID: groupID, Name: "越组关联", Sources: []SourceRef{{Type: model.CapabilitySourceAssignment, ID: foreignAssignment.ID}}}); serviceStatus(err) != http.StatusBadRequest {
		t.Fatalf("foreign assignment association status = %d, want 400 (err=%v)", serviceStatus(err), err)
	}

	adminView, err := service.AdminMember(context.Background(), manager, groupID, memberID)
	if err != nil {
		t.Fatalf("read member admin view: %v", err)
	}
	assertDimensionScore(t, adminView.Dimensions, dimension.ID, 75)
	assertDimensionScore(t, adminView.Dimensions, emptyDimension.ID, -1)
	if got := dimensionByID(adminView.Dimensions, dimension.ID).Sources; len(got) != 2 {
		t.Fatalf("admin sources = %d, want two evaluated sources (ungraded assignment must be omitted)", len(got))
	}

	memberView, err := service.ListMine(context.Background(), memberID)
	if err != nil {
		t.Fatalf("read member capability view: %v", err)
	}
	if len(memberView.Groups) != 1 || memberView.Groups[0].GroupID != groupID {
		t.Fatalf("member groups = %#v, want only own group", memberView.Groups)
	}
	if got := dimensionByID(memberView.Groups[0].Dimensions, dimension.ID); len(got.Sources) != 0 || len(got.History) != 2 {
		t.Fatalf("member history leaked raw sources or omitted growth events: %#v", got)
	}
	encodedMember, err := json.Marshal(memberView)
	if err != nil {
		t.Fatalf("encode member capability view: %v", err)
	}
	for _, secret := range []string{"internal assignment note", "latest assignment note", "internal project note", "\"sources\""} {
		if strings.Contains(string(encodedMember), secret) {
			t.Fatalf("member response leaked internal evaluation detail %q: %s", secret, encodedMember)
		}
	}
	if err := db.Model(&assignment).Update("publication_status", model.AssignmentPublicationWithdrawn).Error; err != nil {
		t.Fatalf("withdraw capability source assignment: %v", err)
	}
	withdrawnMemberView, err := service.ListMine(context.Background(), memberID)
	if err != nil {
		t.Fatalf("read member capability view after withdrawal: %v", err)
	}
	withdrawnDimension := dimensionByID(withdrawnMemberView.Groups[0].Dimensions, dimension.ID)
	if len(withdrawnDimension.History) != 1 || withdrawnDimension.History[0].SourceTitle == assignment.Title || withdrawnDimension.Score == nil || *withdrawnDimension.Score != 90 {
		t.Fatalf("withdrawn assignment remained in member capability history: %#v", withdrawnDimension)
	}
	adminAfterWithdrawal, err := service.AdminMember(context.Background(), manager, groupID, memberID)
	if err != nil {
		t.Fatalf("read administrator history after assignment withdrawal: %v", err)
	}
	assertDimensionScore(t, adminAfterWithdrawal.Dimensions, dimension.ID, 75)
	if len(dimensionByID(adminAfterWithdrawal.Dimensions, dimension.ID).Sources) != 2 {
		t.Fatalf("assignment withdrawal removed administrator source history: %#v", dimensionByID(adminAfterWithdrawal.Dimensions, dimension.ID).Sources)
	}
	if err := db.Model(&assignment).Update("publication_status", model.AssignmentPublicationPublished).Error; err != nil {
		t.Fatalf("republish capability source assignment: %v", err)
	}
	republishedMemberView, err := service.ListMine(context.Background(), memberID)
	if err != nil || len(dimensionByID(republishedMemberView.Groups[0].Dimensions, dimension.ID).History) != 2 {
		t.Fatalf("republishing did not restore member capability history: view=%#v err=%v", republishedMemberView, err)
	}

	if _, err := service.AdminGroup(context.Background(), otherManager, groupID); serviceStatus(err) != http.StatusForbidden {
		t.Fatalf("cross-group administrator access status = %d, want 403 (err=%v)", serviceStatus(err), err)
	}
	if _, err := service.AdminMember(context.Background(), manager, groupID, otherMemberID); serviceStatus(err) != http.StatusForbidden {
		t.Fatalf("cross-group member detail status = %d, want 403 (err=%v)", serviceStatus(err), err)
	}
	if _, err := service.AdminGroup(context.Background(), Actor{ID: memberID, RoleName: model.RoleNameUser}, groupID); serviceStatus(err) != http.StatusForbidden {
		t.Fatalf("member admin API access status = %d, want 403 (err=%v)", serviceStatus(err), err)
	}

	latestAssignmentReview := model.AssignmentReview{SubmissionID: submission.ID, ReviewerID: managerID, Score: 100, Decision: model.AssignmentReviewPassed, Comment: "regraded", CreatedAt: now}
	if err := db.Create(&latestAssignmentReview).Error; err != nil {
		t.Fatalf("append assignment regrade: %v", err)
	}
	createdReviewIDs = append(createdReviewIDs, latestAssignmentReview.ID)
	adminView, err = service.AdminMember(context.Background(), manager, groupID, memberID)
	if err != nil {
		t.Fatalf("read after assignment regrade: %v", err)
	}
	assertDimensionScore(t, adminView.Dimensions, dimension.ID, 95)

	updatedPracticeScore := uint8(70)
	updatedReviewedAt := now.Add(time.Minute)
	if err := db.Model(&model.PracticeSubmission{}).Where("id = ?", practiceSubmission.ID).Updates(map[string]any{"score": updatedPracticeScore, "reviewed_at": updatedReviewedAt}).Error; err != nil {
		t.Fatalf("update project review: %v", err)
	}
	adminView, err = service.AdminMember(context.Background(), manager, groupID, memberID)
	if err != nil {
		t.Fatalf("read after project re-review: %v", err)
	}
	assertDimensionScore(t, adminView.Dimensions, dimension.ID, 85)

	if _, err := service.AddManualReview(context.Background(), manager, groupID, memberID, ManualReviewInput{DimensionID: dimension.ID, Score: 20, Comment: "现场完成了线束整理"}); err != nil {
		t.Fatalf("append manual review: %v", err)
	}
	adminView, err = service.AdminMember(context.Background(), manager, groupID, memberID)
	if err != nil {
		t.Fatalf("read after manual review: %v", err)
	}
	assertDimensionScore(t, adminView.Dimensions, dimension.ID, 63.3)
	if len(dimensionByID(adminView.Dimensions, dimension.ID).Sources) != 3 {
		t.Fatalf("manual evaluation replaced source grades; admin source count = %d, want 3", len(dimensionByID(adminView.Dimensions, dimension.ID).Sources))
	}
	if _, err := service.AddManualReview(context.Background(), manager, groupID, memberID, ManualReviewInput{DimensionID: emptyDimension.ID, Score: 0, Comment: "无额外说明"}); err != nil {
		t.Fatalf("append zero-score manual review: %v", err)
	}
	adminView, err = service.AdminMember(context.Background(), manager, groupID, memberID)
	if err != nil {
		t.Fatalf("read zero-score manual review: %v", err)
	}
	assertDimensionScore(t, adminView.Dimensions, emptyDimension.ID, 0)

	updated, err := service.UpdateDimension(context.Background(), manager, dimension.ID, DimensionInput{
		Name: "动手能力", Description: "调整后只统计作业和人工评价", SortOrder: 2,
		Sources: []SourceRef{{Type: model.CapabilitySourceAssignment, ID: assignment.ID}},
	})
	if err != nil {
		t.Fatalf("update dimension mappings: %v", err)
	}
	if updated.GroupID != groupID || len(updated.Sources) != 1 {
		t.Fatalf("updated dimension scope or mappings changed unexpectedly: %#v", updated)
	}
	adminView, err = service.AdminMember(context.Background(), manager, groupID, memberID)
	if err != nil {
		t.Fatalf("read after mapping change: %v", err)
	}
	assertDimensionScore(t, adminView.Dimensions, dimension.ID, 60)

	if _, err := service.AddManualReview(context.Background(), manager, groupID, otherMemberID, ManualReviewInput{DimensionID: dimension.ID, Score: 99, Comment: "跨组尝试"}); serviceStatus(err) != http.StatusForbidden {
		t.Fatalf("cross-group manual review status = %d, want 403 (err=%v)", serviceStatus(err), err)
	}
	if err := service.DeleteDimension(context.Background(), manager, dimension.ID); err != nil {
		t.Fatalf("archive capability dimension: %v", err)
	}
	archived, err := service.AdminMember(context.Background(), manager, groupID, memberID)
	if err != nil {
		t.Fatalf("read archived dimension history: %v", err)
	}
	if archivedDimension := dimensionByID(archived.Dimensions, dimension.ID); archivedDimension.Active || archivedDimension.Score == nil {
		t.Fatalf("archived dimension history was not retained: %#v", archivedDimension)
	}
}

func serviceStatus(err error) int {
	var serviceErr *ServiceError
	if errors.As(err, &serviceErr) {
		return serviceErr.Status
	}
	if err == nil {
		return 0
	}
	return http.StatusInternalServerError
}

func dimensionByID(dimensions []DimensionResult, id uint64) DimensionResult {
	for _, item := range dimensions {
		if item.ID == id {
			return item
		}
	}
	return DimensionResult{}
}

func assertDimensionScore(t *testing.T, dimensions []DimensionResult, id uint64, want float64) {
	t.Helper()
	got := dimensionByID(dimensions, id)
	if want < 0 {
		if got.ID != id || got.Score != nil || got.EvaluationCount != 0 {
			t.Fatalf("dimension %d without ratings = %#v, want no score and zero evaluations", id, got)
		}
		return
	}
	if got.ID != id || got.Score == nil || *got.Score != want {
		t.Fatalf("dimension %d score = %#v, want %.1f", id, got.Score, want)
	}
}
