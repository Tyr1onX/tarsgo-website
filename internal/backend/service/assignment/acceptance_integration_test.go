package assignment

import (
	"context"
	"errors"
	"fmt"
	"mime/multipart"
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

// This opt-in workflow test writes tagged synthetic records only to the local
// isolated acceptance database and removes all rows created by this run.
func TestAcceptanceDatabaseTeachingMaterialsWorkflow(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TARSGO_QA_TEST_DSN"))
	if dsn == "" {
		t.Skip("TARSGO_QA_TEST_DSN is not set")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("refusing to run the assignment integration test outside the isolated local acceptance database")
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
		t.Fatalf("apply current migrations to the isolated acceptance database: %v", err)
	}
	for _, table := range []string{"users", "roles", "user_groups", "user_group_members", "assignments", "assignment_targets", "assignment_submissions", "assignment_submission_files", "assignment_reviews", "assignment_material_files"} {
		if !db.Migrator().HasTable(table) {
			t.Fatalf("isolated acceptance database is missing required table %s", table)
		}
	}

	nonce := time.Now().UTC().Format("20060102T150405.000000000")
	groupIDs := map[string]uint64{}
	createdGroupIDs := make([]uint64, 0, 2)
	for _, name := range []string{groupMechanical, groupAI} {
		var group model.UserGroup
		queryErr := db.Where("name = ?", name).First(&group).Error
		if queryErr == gorm.ErrRecordNotFound {
			group = model.UserGroup{Name: name, Status: model.UserGroupStatusActive}
			if err := db.Create(&group).Error; err != nil {
				t.Fatalf("create isolated technical group: %v", err)
			}
			createdGroupIDs = append(createdGroupIDs, group.ID)
		} else if queryErr != nil {
			t.Fatalf("load isolated technical group: %v", queryErr)
		} else if group.Status != model.UserGroupStatusActive {
			t.Fatalf("required technical group %q is inactive", name)
		}
		groupIDs[name] = group.ID
	}

	roleIDs := map[string]uint64{}
	for _, name := range []string{model.RoleNameUser, model.RoleNameAdmin, model.RoleNameSuperAdmin} {
		var role model.Role
		if err := db.Where("name = ?", name).First(&role).Error; err != nil {
			t.Fatalf("load system role %q: %v", name, err)
		}
		roleIDs[name] = role.ID
	}
	createdUserIDs := make([]uint64, 0, 4)
	createdAssignmentIDs := make([]uint64, 0, 1)
	createdSubmissionIDs := make([]uint64, 0, 1)
	createdMaterialIDs := make([]uint64, 0, 2)
	t.Cleanup(func() {
		if len(createdSubmissionIDs) > 0 {
			for _, destination := range []any{&model.AssignmentReview{}, &model.AssignmentSubmissionFile{}} {
				if err := db.Where("submission_id IN ?", createdSubmissionIDs).Delete(destination).Error; err != nil {
					t.Errorf("remove synthetic assignment history: %v", err)
				}
			}
			if err := db.Where("id IN ?", createdSubmissionIDs).Delete(&model.AssignmentSubmission{}).Error; err != nil {
				t.Errorf("remove synthetic submissions: %v", err)
			}
		}
		if len(createdAssignmentIDs) > 0 {
			for _, destination := range []any{&model.AssignmentTarget{}, &model.AssignmentMaterialFile{}} {
				if err := db.Where("assignment_id IN ?", createdAssignmentIDs).Delete(destination).Error; err != nil {
					t.Errorf("remove synthetic assignment relations: %v", err)
				}
			}
			if err := db.Where("id IN ?", createdAssignmentIDs).Delete(&model.Assignment{}).Error; err != nil {
				t.Errorf("remove synthetic assignments: %v", err)
			}
		}
		if len(createdUserIDs) > 0 {
			if err := db.Where("user_id IN ?", createdUserIDs).Delete(&model.UserGroupMember{}).Error; err != nil {
				t.Errorf("remove synthetic memberships: %v", err)
			}
			if err := db.Where("id IN ?", createdUserIDs).Delete(&model.User{}).Error; err != nil {
				t.Errorf("remove synthetic accounts: %v", err)
			}
		}
		if len(createdGroupIDs) > 0 {
			if err := db.Where("id IN ?", createdGroupIDs).Delete(&model.UserGroup{}).Error; err != nil {
				t.Errorf("remove synthetic groups: %v", err)
			}
		}
	})

	createActor := func(label, roleName, groupName string) Actor {
		user := model.User{
			RoleID: roleIDs[roleName], Name: "[TEST_ASSIGNMENT] " + label,
			Email: fmt.Sprintf("assignment-%s-%s@tarsgo.test", nonce, label), Status: model.UserStatusEnabled,
			AdminScope: model.AdminScopeNone,
		}
		if roleName == model.RoleNameAdmin {
			groupID := groupIDs[groupName]
			user.AdminScope = model.AdminScopeGroup
			user.ManagementGroupID = &groupID
		}
		if err := db.Create(&user).Error; err != nil {
			t.Fatalf("create isolated test account: %v", err)
		}
		createdUserIDs = append(createdUserIDs, user.ID)
		if groupName != "" {
			if err := db.Create(&model.UserGroupMember{GroupID: groupIDs[groupName], UserID: user.ID, Role: model.UserGroupMemberRoleMember}).Error; err != nil {
				t.Fatalf("assign isolated test account: %v", err)
			}
		}
		return Actor{ID: user.ID, RoleName: roleName}
	}
	member := createActor("mechanical-member", model.RoleNameUser, groupMechanical)
	crossMember := createActor("ai-member", model.RoleNameUser, groupAI)
	admin := createActor("mechanical-admin", model.RoleNameAdmin, groupMechanical)
	superAdmin := createActor("super-admin", model.RoleNameSuperAdmin, "")

	root := t.TempDir()
	service, err := NewServiceWithFileRoot(db, root)
	if err != nil {
		t.Fatal("create assignment service with isolated private file storage")
	}
	now := time.Now().UTC().Truncate(time.Second)
	service.now = func() time.Time { return now }
	assignment, err := service.Create(context.Background(), admin, CreateInput{
		GroupID: groupIDs[groupMechanical], Title: "[TEST_ASSIGNMENT] 教学资料验收", Description: "隔离数据库流程验证",
		DueAt: now.Add(24 * time.Hour), IsGroupWide: false, TargetUserIDs: []uint64{member.ID},
	})
	if err != nil {
		t.Fatalf("create isolated assignment: %v", err)
	}
	createdAssignmentIDs = append(createdAssignmentIDs, assignment.ID)
	initialDueAt := assignment.DueAt
	updated, err := service.Update(context.Background(), admin, assignment.ID, CreateInput{
		Title: assignment.Title + " 已编辑", Description: assignment.Description, DueAt: initialDueAt,
		IsGroupWide: false, TargetUserIDs: []uint64{member.ID},
	})
	if err != nil || !updated.DueAt.Equal(initialDueAt) {
		t.Fatalf("editing an assignment changed its retained deadline: due=%v err=%v", updated, err)
	}
	var persistedAssignment model.Assignment
	if err := db.First(&persistedAssignment, assignment.ID).Error; err != nil {
		t.Fatalf("reload edited assignment deadline: %v", err)
	}
	if persistedDueAt := readStoredUTCWall(persistedAssignment.DueAt); !persistedDueAt.Equal(initialDueAt) {
		t.Fatalf("edited deadline did not round-trip through MySQL: got=%s want=%s", persistedDueAt, initialDueAt)
	}

	material, err := service.UploadMaterialFiles(context.Background(), admin, assignment.ID, []*multipart.FileHeader{multipartHeader(t, "教学资料.pdf", []byte("%PDF-1.7\nlesson"))})
	if err != nil || len(material) != 1 {
		t.Fatalf("upload teaching material: count=%d err=%v", len(material), err)
	}
	createdMaterialIDs = append(createdMaterialIDs, material[0].ID)
	memberDetail, err := service.GetMine(context.Background(), member, assignment.ID)
	if err != nil || len(memberDetail.Assignment.MaterialFiles) != 1 {
		t.Fatalf("member could not see teaching material: detail=%v err=%v", memberDetail, err)
	}
	if _, err := service.OpenMaterialFile(context.Background(), crossMember, material[0].ID); statusOf(err) != http.StatusForbidden {
		t.Fatalf("cross-group material download status = %d, want 403", statusOf(err))
	}
	download, err := service.OpenMaterialFile(context.Background(), member, material[0].ID)
	if err != nil || string(download.Content) != "%PDF-1.7\nlesson" {
		t.Fatalf("assigned member could not download material: download=%v err=%v", download, err)
	}
	if _, err := service.OpenMaterialFile(context.Background(), superAdmin, material[0].ID); err != nil {
		t.Fatalf("super-admin could not download material: %v", err)
	}
	remaining, err := service.RemoveMaterialFile(context.Background(), admin, assignment.ID, material[0].ID)
	if err != nil || len(remaining) != 0 {
		t.Fatalf("remove teaching material before submissions: remaining=%d err=%v", len(remaining), err)
	}
	if _, err := service.OpenMaterialFile(context.Background(), member, material[0].ID); statusOf(err) != http.StatusNotFound {
		t.Fatalf("removed material remained downloadable: status=%d", statusOf(err))
	}
	material, err = service.UploadMaterialFiles(context.Background(), admin, assignment.ID, []*multipart.FileHeader{multipartHeader(t, "教学资料.pdf", []byte("%PDF-1.7\nlesson"))})
	if err != nil || len(material) != 1 {
		t.Fatalf("re-upload teaching material before submissions: count=%d err=%v", len(material), err)
	}
	createdMaterialIDs = append(createdMaterialIDs, material[0].ID)

	submitted, err := service.Submit(context.Background(), member, assignment.ID, []*multipart.FileHeader{multipartHeader(t, "成果.pdf", []byte("%PDF-1.7\nresult"))})
	if err != nil || len(submitted.Submissions) != 1 {
		t.Fatalf("member could not submit assignment: detail=%v err=%v", submitted, err)
	}
	createdSubmissionIDs = append(createdSubmissionIDs, submitted.Submissions[0].ID)
	if _, err := service.UploadMaterialFiles(context.Background(), admin, assignment.ID, []*multipart.FileHeader{multipartHeader(t, "新资料.pdf", []byte("%PDF-1.7\nnew"))}); statusOf(err) != http.StatusConflict {
		t.Fatalf("material replacement after submission status = %d, want 409", statusOf(err))
	}
	if _, err := service.RemoveMaterialFile(context.Background(), admin, assignment.ID, material[0].ID); statusOf(err) != http.StatusConflict {
		t.Fatalf("material removal after submission status = %d, want 409", statusOf(err))
	}
	graded, err := service.Review(context.Background(), admin, submitted.Submissions[0].ID, ReviewInput{Score: 90, Decision: model.AssignmentReviewPassed, Comment: "[TEST_ASSIGNMENT] 流程通过"})
	if err != nil || len(graded.Members) != 1 || graded.Members[0].LatestSubmission == nil || graded.Members[0].LatestSubmission.Decision != model.AssignmentReviewPassed {
		t.Fatalf("assignment review regression: result=%v err=%v", graded, err)
	}
}

func statusOf(err error) int {
	var serviceErr *ServiceError
	if errors.As(err, &serviceErr) {
		return serviceErr.Status
	}
	return 0
}
