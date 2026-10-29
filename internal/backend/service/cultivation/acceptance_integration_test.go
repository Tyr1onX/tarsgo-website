package cultivation

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

	"tarsgo-backend/model"
	"tarsgo-backend/service/capabilities"
	"tarsgo-backend/service/growth"
)

func TestAcceptanceDatabaseCultivationScopeAndMemberPrivacy(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TARSGO_QA_TEST_DSN"))
	if dsn == "" {
		t.Skip("TARSGO_QA_TEST_DSN is not set")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("refusing to run the cultivation integration test outside the isolated local acceptance database")
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
	if err := db.AutoMigrate(&model.MemberCultivationRecord{}); err != nil {
		t.Fatalf("prepare isolated cultivation table: %v", err)
	}

	var adminRole, userRole, superRole model.Role
	for name, role := range map[string]*model.Role{model.RoleNameAdmin: &adminRole, model.RoleNameUser: &userRole, model.RoleNameSuperAdmin: &superRole} {
		if err := db.Where("name = ?", name).First(role).Error; err != nil {
			t.Fatalf("load %s role: %v", name, err)
		}
	}
	nonce := time.Now().UTC().Format("20060102T150405.000000000")
	groupA := model.UserGroup{Name: "[TEST_CULTIVATION] A " + nonce, Status: model.UserGroupStatusActive}
	groupB := model.UserGroup{Name: "[TEST_CULTIVATION] B " + nonce, Status: model.UserGroupStatusActive}
	if err := db.Create(&groupA).Error; err != nil {
		t.Fatalf("create isolated group A: %v", err)
	}
	if err := db.Create(&groupB).Error; err != nil {
		t.Fatalf("create isolated group B: %v", err)
	}
	users := make([]model.User, 0, 5)
	createUser := func(label string, role model.Role) model.User {
		name := "[TEST_CULTIVATION] " + label + " " + nonce
		user := model.User{RoleID: role.ID, Name: name, Email: fmt.Sprintf("cultivation-%s-%s@tarsgo.test", nonce, strings.ToLower(label)), Status: model.UserStatusEnabled}
		if err := db.Create(&user).Error; err != nil {
			t.Fatalf("create isolated %s user: %v", label, err)
		}
		users = append(users, user)
		return user
	}
	adminA := createUser("admin-a", adminRole)
	adminB := createUser("admin-b", adminRole)
	memberA := createUser("member-a", userRole)
	memberB := createUser("member-b", userRole)
	superAdmin := createUser("super-admin", superRole)
	memberships := []model.UserGroupMember{
		{GroupID: groupA.ID, UserID: adminA.ID, Role: model.UserGroupMemberRoleLeader},
		{GroupID: groupA.ID, UserID: memberA.ID, Role: model.UserGroupMemberRoleMember},
		{GroupID: groupB.ID, UserID: adminB.ID, Role: model.UserGroupMemberRoleLeader},
		{GroupID: groupB.ID, UserID: memberA.ID, Role: model.UserGroupMemberRoleMember},
		{GroupID: groupB.ID, UserID: memberB.ID, Role: model.UserGroupMemberRoleMember},
	}
	for _, item := range memberships {
		if err := db.Create(&item).Error; err != nil {
			t.Fatalf("create isolated group membership: %v", err)
		}
	}

	var dimension model.CapabilityDimension
	if err := db.Create(&model.CapabilityDimension{GroupID: groupA.ID, Name: "实作能力", Active: true, CreatedBy: adminA.ID}).Error; err != nil {
		t.Fatalf("create capability dimension: %v", err)
	}
	if err := db.Where("group_id = ? AND name = ?", groupA.ID, "实作能力").Take(&dimension).Error; err != nil {
		t.Fatalf("load capability dimension: %v", err)
	}
	manual := model.CapabilityManualReview{GroupID: groupA.ID, DimensionID: dimension.ID, DimensionName: dimension.Name, UserID: memberA.ID, Score: 87, Comment: "PRIVATE_CAPABILITY_REVIEW_COMMENT", ActorID: adminA.ID, ActorName: adminA.Name, CreatedAt: time.Now().UTC()}
	if err := db.Create(&manual).Error; err != nil {
		t.Fatalf("create capability source: %v", err)
	}

	assignment := model.Assignment{GroupID: groupA.ID, CreatorID: adminA.ID, Title: "[TEST_CULTIVATION] 作业", Description: "隔离验证", DueAt: time.Now().UTC().Add(time.Hour), AttachmentRequirements: "", PublicationStatus: model.AssignmentPublicationPublished}
	if err := db.Create(&assignment).Error; err != nil {
		t.Fatalf("create assignment: %v", err)
	}
	if err := db.Create(&model.AssignmentTarget{AssignmentID: assignment.ID, UserID: memberA.ID}).Error; err != nil {
		t.Fatalf("create assignment target: %v", err)
	}
	submission := model.AssignmentSubmission{AssignmentID: assignment.ID, UserID: memberA.ID, Attempt: 1, SubmittedAt: time.Now().UTC().Add(-time.Minute)}
	if err := db.Create(&submission).Error; err != nil {
		t.Fatalf("create assignment submission: %v", err)
	}
	if err := db.Create(&model.AssignmentReview{SubmissionID: submission.ID, ReviewerID: adminA.ID, Score: 92, Decision: model.AssignmentReviewPassed, Comment: "PRIVATE_ASSIGNMENT_REVIEW_COMMENT"}).Error; err != nil {
		t.Fatalf("create assignment review: %v", err)
	}

	project := model.PracticeProject{GroupID: groupA.ID, CreatorID: adminA.ID, Title: "[TEST_CULTIVATION] 项目", Description: "隔离验证", Capacity: 3, DueAt: time.Now().UTC().Add(time.Hour), Status: model.PracticeProjectClosed}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create practice project: %v", err)
	}
	entry := model.PracticeEntry{ProjectID: project.ID, UserID: memberA.ID, Status: model.PracticeEntryExited, JoinedAt: time.Now().UTC().Add(-time.Hour)}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create practice entry: %v", err)
	}
	score := uint8(90)
	reviewedAt := time.Now().UTC()
	if err := db.Create(&model.PracticeSubmission{ProjectID: project.ID, UserID: memberA.ID, Attempt: 1, Progress: "PRIVATE_PROJECT_PROGRESS", Reflection: "PRIVATE_PROJECT_REFLECTION", Decision: model.PracticeReviewPassed, Comment: "PRIVATE_PROJECT_REVIEW_COMMENT", Score: &score, ReviewerID: &adminA.ID, ReviewedAt: &reviewedAt, CreatedAt: reviewedAt.Add(-time.Minute)}).Error; err != nil {
		t.Fatalf("create practice submission: %v", err)
	}

	t.Cleanup(func() {
		_ = db.Where("group_id IN ?", []uint64{groupA.ID, groupB.ID}).Delete(&model.MemberCultivationRecord{}).Error
		_ = db.Where("group_id = ?", groupA.ID).Delete(&model.CapabilityManualReview{}).Error
		_ = db.Where("dimension_id = ?", dimension.ID).Delete(&model.CapabilityDimensionSource{}).Error
		_ = db.Where("id = ?", dimension.ID).Delete(&model.CapabilityDimension{}).Error
		_ = db.Where("submission_id = ?", submission.ID).Delete(&model.AssignmentReview{}).Error
		_ = db.Where("id = ?", submission.ID).Delete(&model.AssignmentSubmission{}).Error
		_ = db.Where("assignment_id = ?", assignment.ID).Delete(&model.AssignmentTarget{}).Error
		_ = db.Where("id = ?", assignment.ID).Delete(&model.Assignment{}).Error
		_ = db.Where("project_id = ? AND user_id = ?", project.ID, memberA.ID).Delete(&model.PracticeSubmission{}).Error
		_ = db.Where("project_id = ?", project.ID).Delete(&model.PracticeEntry{}).Error
		_ = db.Where("id = ?", project.ID).Delete(&model.PracticeProject{}).Error
		_ = db.Where("group_id IN ?", []uint64{groupA.ID, groupB.ID}).Delete(&model.UserGroupMember{}).Error
		_ = db.Where("id IN ?", []uint64{groupA.ID, groupB.ID}).Delete(&model.UserGroup{}).Error
		userIDs := make([]uint64, 0, len(users))
		for _, user := range users {
			userIDs = append(userIDs, user.ID)
		}
		_ = db.Where("id IN ?", userIDs).Delete(&model.User{}).Error
	})

	capabilityService := capabilities.NewService(db)
	service := NewService(db, capabilityService, growth.NewService(db, nil, capabilityService))
	ctx := context.Background()
	actorA := Actor{ID: adminA.ID, RoleName: model.RoleNameAdmin}
	if err := service.UpdateFocus(ctx, actorA, groupA.ID, memberA.ID, FocusInput{Focused: true, InternalNote: "PRIVATE_CULTIVATION_NOTE"}); err != nil {
		t.Fatalf("save authorized internal cultivation record: %v", err)
	}
	view, err := service.Group(ctx, actorA, groupA.ID)
	if err != nil {
		t.Fatalf("read authorized group view: %v", err)
	}
	var summary *MemberSummary
	for i := range view.Members {
		if view.Members[i].UserID == memberA.ID {
			summary = &view.Members[i]
			break
		}
	}
	if summary == nil || summary.OverallScore == nil || *summary.OverallScore != 87 || summary.ScoredDimensions != 1 || summary.Assignments != (ActivitySummary{Total: 1, Completed: 1}) || summary.PracticeProjects != (ActivitySummary{Total: 1, Completed: 1}) || !summary.Focused || summary.InternalNote != "PRIVATE_CULTIVATION_NOTE" {
		t.Fatalf("group member summary is incorrect: %#v", summary)
	}
	if summary.GroupRole != "成员" {
		t.Fatalf("member group role = %q", summary.GroupRole)
	}
	if err := db.Model(&manual).Update("score", 93).Error; err != nil {
		t.Fatalf("update the original capability review: %v", err)
	}
	updatedView, err := service.Group(ctx, actorA, groupA.ID)
	if err != nil {
		t.Fatalf("refresh capability result from source review: %v", err)
	}
	for _, updated := range updatedView.Members {
		if updated.UserID == memberA.ID && (updated.OverallScore == nil || *updated.OverallScore != 93) {
			t.Fatalf("derived score did not follow its updated source: %#v", updated)
		}
	}
	var unrated *MemberSummary
	for i := range view.Members {
		if view.Members[i].UserID == adminA.ID {
			unrated = &view.Members[i]
			break
		}
	}
	if unrated == nil || unrated.OverallScore != nil || unrated.ScoredDimensions != 0 {
		t.Fatalf("unrated member was given a score: %#v", unrated)
	}
	if _, err := service.Group(ctx, actorA, groupB.ID); statusOf(err) != http.StatusForbidden {
		t.Fatalf("cross-group overview access error = %v", err)
	}
	if _, err := service.Member(ctx, actorA, groupA.ID, memberB.ID); statusOf(err) != http.StatusForbidden {
		t.Fatalf("cross-group member access error = %v", err)
	}
	if err := service.UpdateFocus(ctx, actorA, groupB.ID, memberB.ID, FocusInput{Focused: true, InternalNote: "CROSS_GROUP_MARKER"}); statusOf(err) != http.StatusForbidden {
		t.Fatalf("cross-group focus mutation error = %v", err)
	}
	if _, err := service.Group(ctx, Actor{ID: memberA.ID, RoleName: model.RoleNameUser}, groupA.ID); statusOf(err) != http.StatusForbidden {
		t.Fatalf("member admin-view access error = %v", err)
	}
	if _, err := service.Group(ctx, Actor{ID: superAdmin.ID, RoleName: model.RoleNameSuperAdmin}, groupA.ID); err != nil {
		t.Fatalf("super admin global access failed: %v", err)
	}

	adminDossier, err := service.Member(ctx, actorA, groupA.ID, memberA.ID)
	if err != nil {
		t.Fatalf("read authorized member dossier: %v", err)
	}
	adminJSON, _ := json.Marshal(adminDossier)
	if !strings.Contains(string(adminJSON), "PRIVATE_CAPABILITY_REVIEW_COMMENT") || !strings.Contains(string(adminJSON), "PRIVATE_CULTIVATION_NOTE") {
		t.Fatalf("admin dossier omitted authorized internal evaluation: %s", adminJSON)
	}
	for _, event := range adminDossier.Events {
		if event.GroupID != groupA.ID {
			t.Fatalf("admin dossier leaked another group timeline event: %#v", event)
		}
	}
	profile, err := growth.NewService(db, nil, capabilityService).GetMine(ctx, memberA.ID)
	if err != nil {
		t.Fatalf("read member-owned growth dossier: %v", err)
	}
	memberJSON, _ := json.Marshal(profile)
	for _, privateValue := range []string{"PRIVATE_CULTIVATION_NOTE", "PRIVATE_CAPABILITY_REVIEW_COMMENT", "PRIVATE_ASSIGNMENT_REVIEW_COMMENT", "PRIVATE_PROJECT_REVIEW_COMMENT", "PRIVATE_PROJECT_PROGRESS", "PRIVATE_PROJECT_REFLECTION", "\"score\"", "\"comment\""} {
		if strings.Contains(string(memberJSON), privateValue) {
			t.Fatalf("member profile exposed internal assessment data %q: %s", privateValue, memberJSON)
		}
	}
	if !hasEventKind(profile, "assignment_review_passed") || !hasEventKind(profile, "practice_project_review_passed") || !hasEventKind(profile, "capability_evaluation") {
		t.Fatalf("member growth timeline lacks assignment, project, or capability events: %#v", profile.Events)
	}
}

func statusOf(err error) int {
	var serviceError *ServiceError
	if errors.As(err, &serviceError) {
		return serviceError.Status
	}
	return 0
}

func hasEventKind(profile *growth.Profile, kind string) bool {
	for _, event := range profile.Events {
		if event.Kind == kind {
			return true
		}
	}
	return false
}
