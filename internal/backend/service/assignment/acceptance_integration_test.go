package assignment

import (
	"context"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
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
	for _, table := range []string{"users", "roles", "user_groups", "user_group_members", "assignments", "assignment_targets", "assignment_submissions", "assignment_submission_files", "assignment_reviews", "assignment_material_files", "skill_nodes", "skill_node_assignments", "skill_review_events"} {
		if !db.Migrator().HasTable(table) {
			t.Fatalf("isolated acceptance database is missing required table %s", table)
		}
	}

	nonce := time.Now().UTC().Format("20060102T150405.000000000")
	groupIDs := map[string]uint64{}
	createdGroupIDs := make([]uint64, 0, 3)
	for _, name := range []string{groupMechanical, groupAI, groupOperations} {
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
	createdAssignmentIDs := make([]uint64, 0, 3)
	createdSubmissionIDs := make([]uint64, 0, 1)
	createdSkillNodeIDs := make([]uint64, 0, 1)
	createdSkillReviewEventIDs := make([]uint64, 0, 1)
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
			for _, destination := range []any{&model.AssignmentTarget{}, &model.AssignmentMaterialFile{}, &model.SkillNodeAssignment{}} {
				if err := db.Where("assignment_id IN ?", createdAssignmentIDs).Delete(destination).Error; err != nil {
					t.Errorf("remove synthetic assignment relations: %v", err)
				}
			}
			if err := db.Where("evidence_type = ? AND evidence_id IN ?", model.SkillEvidenceAssignment, createdAssignmentIDs).Delete(&model.SkillReviewEvent{}).Error; err != nil {
				t.Errorf("remove synthetic assignment skill evidence: %v", err)
			}
			if err := db.Where("id IN ?", createdAssignmentIDs).Delete(&model.Assignment{}).Error; err != nil {
				t.Errorf("remove synthetic assignments: %v", err)
			}
		}
		if len(createdSkillReviewEventIDs) > 0 {
			if err := db.Where("id IN ?", createdSkillReviewEventIDs).Delete(&model.SkillReviewEvent{}).Error; err != nil {
				t.Errorf("remove synthetic skill review events: %v", err)
			}
		}
		if len(createdSkillNodeIDs) > 0 {
			if err := db.Where("skill_node_id IN ? OR prerequisite_node_id IN ?", createdSkillNodeIDs, createdSkillNodeIDs).Delete(&model.SkillNodePrerequisite{}).Error; err != nil {
				t.Errorf("remove synthetic skill prerequisites: %v", err)
			}
			if err := db.Where("skill_node_id IN ?", createdSkillNodeIDs).Delete(&model.SkillNodeProgress{}).Error; err != nil {
				t.Errorf("remove synthetic skill progress: %v", err)
			}
			if err := db.Where("id IN ?", createdSkillNodeIDs).Delete(&model.SkillNode{}).Error; err != nil {
				t.Errorf("remove synthetic skill nodes: %v", err)
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
	otherMember := createActor("mechanical-other-member", model.RoleNameUser, groupMechanical)
	crossMember := createActor("ai-member", model.RoleNameUser, groupAI)
	admin := createActor("mechanical-admin", model.RoleNameAdmin, groupMechanical)
	crossAdmin := createActor("ai-admin", model.RoleNameAdmin, groupAI)
	operationsMember := createActor("operations-member", model.RoleNameUser, groupOperations)
	operationsOtherMember := createActor("operations-other-member", model.RoleNameUser, groupOperations)
	operationsAdmin := createActor("operations-admin", model.RoleNameAdmin, groupOperations)
	superAdmin := createActor("super-admin", model.RoleNameSuperAdmin, "")
	superAdminGroupMember := createActor("mechanical-super-admin", model.RoleNameSuperAdmin, groupMechanical)

	root := t.TempDir()
	service, err := NewServiceWithFileRoot(db, root)
	if err != nil {
		t.Fatal("create assignment service with isolated private file storage")
	}
	now := time.Now().UTC().Truncate(time.Second)
	service.now = func() time.Time { return now }
	operationsMembers, err := service.ListGroupMembers(context.Background(), operationsAdmin, groupIDs[groupOperations])
	if err != nil {
		t.Fatalf("operations administrator could not list their own assignment recipients: %v", err)
	}
	operationsMemberIDs := map[uint64]bool{}
	for _, option := range operationsMembers {
		operationsMemberIDs[option.UserID] = true
	}
	if !operationsMemberIDs[operationsMember.ID] || !operationsMemberIDs[operationsOtherMember.ID] || operationsMemberIDs[member.ID] {
		t.Fatalf("operations recipient list crossed group boundaries: %#v", operationsMembers)
	}
	if _, err := service.ListGroupMembers(context.Background(), operationsAdmin, groupIDs[groupMechanical]); statusOf(err) != http.StatusForbidden {
		t.Fatalf("operations administrator could access a mechanical group: status=%d, want 403", statusOf(err))
	}
	operationsAssignment, err := service.Create(context.Background(), operationsAdmin, CreateInput{
		GroupID: groupIDs[groupOperations], Title: "[TEST_ASSIGNMENT] 运营组作业验收", Description: "运营组可使用同一套作业流程",
		DueAt: now.Add(24 * time.Hour), IsGroupWide: true,
	})
	if err != nil {
		t.Fatalf("operations administrator could not publish an assignment: %v", err)
	}
	createdAssignmentIDs = append(createdAssignmentIDs, operationsAssignment.ID)
	if _, err := service.GetMine(context.Background(), member, operationsAssignment.ID); statusOf(err) != http.StatusNotFound {
		t.Fatalf("mechanical member could access an operations assignment: status=%d, want 404", statusOf(err))
	}
	operationsSubmission, err := service.Submit(context.Background(), operationsMember, operationsAssignment.ID,
		[]*multipart.FileHeader{multipartHeader(t, "运营成果.pdf", []byte("%PDF-1.7\noperations result"))})
	if err != nil {
		t.Fatalf("operations member could not submit an assignment: %v", err)
	}
	createdSubmissionIDs = append(createdSubmissionIDs, operationsSubmission.Submissions[0].ID)
	operationsReview, err := service.Review(context.Background(), operationsAdmin, operationsSubmission.Submissions[0].ID,
		ReviewInput{Score: 90, Decision: model.AssignmentReviewPassed, Comment: "[TEST_ASSIGNMENT] 运营组批改通过"})
	if err != nil || operationsReview.Assignment.ID != operationsAssignment.ID {
		t.Fatalf("operations administrator could not review the submission: result=%#v err=%v", operationsReview, err)
	}
	var operationsReviewRecord model.AssignmentReview
	if err := db.Where("submission_id = ? AND reviewer_id = ?", operationsSubmission.Submissions[0].ID, operationsAdmin.ID).First(&operationsReviewRecord).Error; err != nil || operationsReviewRecord.Decision != model.AssignmentReviewPassed {
		t.Fatalf("operations review was not stored for the authorized reviewer: review=%#v err=%v", operationsReviewRecord, err)
	}
	if !db.Migrator().HasColumn(&model.Assignment{}, "PublishRequestID") || !db.Migrator().HasColumn(&model.Assignment{}, "PublishRequestHash") {
		t.Fatal("isolated acceptance database is missing assignment publication idempotency columns")
	}
	if !db.Migrator().HasColumn(&model.Assignment{}, "PublicationStatus") {
		t.Fatal("isolated acceptance database is missing assignment publication status")
	}
	memberOptions, err := service.ListGroupMembers(context.Background(), admin, groupIDs[groupMechanical])
	if err != nil {
		t.Fatalf("read assignment recipients: %v", err)
	}
	var expectedRecipientCount int64
	if err := db.Table("user_group_members").Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").Joins("JOIN users ON users.id = user_group_members.user_id").Joins("JOIN roles ON roles.id = users.role_id").Where("user_group_members.group_id = ? AND user_groups.status = ? AND users.status = ? AND roles.name = ?", groupIDs[groupMechanical], model.UserGroupStatusActive, model.UserStatusEnabled, model.RoleNameUser).Count(&expectedRecipientCount).Error; err != nil {
		t.Fatalf("count eligible ordinary recipients: %v", err)
	}
	recipientIDs := make(map[uint64]bool, len(memberOptions))
	for _, option := range memberOptions {
		recipientIDs[option.UserID] = true
	}
	if int64(len(memberOptions)) != expectedRecipientCount || !recipientIDs[member.ID] || !recipientIDs[otherMember.ID] || recipientIDs[admin.ID] || recipientIDs[superAdminGroupMember.ID] {
		t.Fatalf("assignment recipient picker did not match the group's enabled ordinary members: members=%#v wantCount=%d", memberOptions, expectedRecipientCount)
	}
	if _, err := service.ListGroupMembers(context.Background(), admin, groupIDs[groupAI]); statusOf(err) != http.StatusForbidden {
		t.Fatalf("ordinary admin cross-group recipient list status = %d, want 403", statusOf(err))
	}
	if _, err := service.Create(context.Background(), admin, CreateInput{
		GroupID: groupIDs[groupAI], Title: "[TEST_ASSIGNMENT] 跨组拒绝", Description: "普通管理员只能管理本组",
		DueAt: now.Add(48 * time.Hour), IsGroupWide: true,
	}); statusOf(err) != http.StatusForbidden {
		t.Fatalf("ordinary admin cross-group assignment creation status = %d, want 403", statusOf(err))
	}
	superAdminAssignment, err := service.Create(context.Background(), superAdmin, CreateInput{
		GroupID: groupIDs[groupAI], Title: "[TEST_ASSIGNMENT] 超级管理员全组管理", Description: "超级管理员不需要技术组归属",
		DueAt: now.Add(48 * time.Hour), IsGroupWide: true,
	})
	if err != nil {
		t.Fatalf("super admin without group membership could not publish to a technical group: %v", err)
	}
	createdAssignmentIDs = append(createdAssignmentIDs, superAdminAssignment.ID)
	var superAdminCanRead bool
	for _, item := range mustListAssignments(t, service, superAdmin, groupIDs[groupAI]) {
		if item.ID == superAdminAssignment.ID {
			superAdminCanRead = true
			break
		}
	}
	if !superAdminCanRead {
		t.Fatal("super admin could not view the assignment published to another technical group")
	}

	requestID := "00000000-0000-4000-8000-" + fmt.Sprintf("%012x", time.Now().UnixNano()&0xffffffffffff)
	publishInput := CreateInput{
		GroupID: groupIDs[groupMechanical], Title: "[TEST_ASSIGNMENT] 原子发布验收", Description: "作业和教学资料必须一起可见",
		DueAt: now.Add(48 * time.Hour), IsGroupWide: false, TargetUserIDs: []uint64{member.ID},
	}
	publishFiles := []*multipart.FileHeader{multipartHeader(t, "原子教学资料.pdf", []byte("%PDF-1.7\natomic"))}
	published, err := service.CreateWithMaterialFiles(context.Background(), admin, publishInput, requestID, publishFiles)
	if published != nil && published.Assignment.ID != 0 {
		createdAssignmentIDs = append(createdAssignmentIDs, published.Assignment.ID)
	}
	if err != nil || published == nil || len(published.MaterialFiles) != 1 {
		t.Fatalf("atomic assignment publication failed: result=%v err=%v", published, err)
	}
	if published.Assignment.IsGroupWide {
		t.Fatal("targeted atomic publication was returned as group-wide")
	}
	var persistedPublished model.Assignment
	if err := db.First(&persistedPublished, published.Assignment.ID).Error; err != nil || persistedPublished.IsGroupWide {
		t.Fatalf("targeted atomic publication was not persisted as targeted: record=%#v err=%v", persistedPublished, err)
	}
	if persistedPublished.PublicationStatus != model.AssignmentPublicationPublished {
		t.Fatalf("new assignment publication status = %q, want published", persistedPublished.PublicationStatus)
	}
	for _, managerID := range []uint64{admin.ID, superAdminGroupMember.ID} {
		if _, err := service.Create(context.Background(), admin, CreateInput{
			GroupID: groupIDs[groupMechanical], Title: "[TEST_ASSIGNMENT] 管理员不可作为接收人", Description: "权限验证",
			DueAt: now.Add(48 * time.Hour), IsGroupWide: false, TargetUserIDs: []uint64{managerID},
		}); statusOf(err) != http.StatusForbidden {
			t.Fatalf("targeted assignment accepted a manager recipient %d: status=%d", managerID, statusOf(err))
		}
	}
	adminList, err := service.ListAdmin(context.Background(), admin, groupIDs[groupMechanical])
	if err != nil {
		t.Fatalf("list the targeted assignment: %v", err)
	}
	var listedPublished *AssignmentView
	for index := range adminList {
		if adminList[index].ID == published.Assignment.ID {
			listedPublished = &adminList[index]
			break
		}
	}
	if listedPublished == nil || listedPublished.IsGroupWide || listedPublished.TargetCount != 1 {
		t.Fatalf("admin list changed targeted assignment scope: %#v", listedPublished)
	}
	adminDetail, err := service.GetAdmin(context.Background(), admin, published.Assignment.ID)
	if err != nil || adminDetail.Assignment.IsGroupWide || len(adminDetail.Members) != 1 || adminDetail.Members[0].UserID != member.ID {
		t.Fatalf("admin detail changed targeted assignment scope: detail=%#v err=%v", adminDetail, err)
	}
	memberPublished, err := service.GetMine(context.Background(), member, published.Assignment.ID)
	if err != nil || len(memberPublished.Assignment.MaterialFiles) != 1 {
		t.Fatalf("member did not see a fully published assignment and its material: detail=%v err=%v", memberPublished, err)
	}
	if _, err := service.GetMine(context.Background(), otherMember, published.Assignment.ID); statusOf(err) != http.StatusNotFound {
		t.Fatalf("another member in the same group accessed a targeted assignment: status=%d", statusOf(err))
	}
	if _, err := service.GetMine(context.Background(), crossMember, published.Assignment.ID); statusOf(err) != http.StatusNotFound {
		t.Fatalf("a cross-group member accessed a targeted assignment: status=%d", statusOf(err))
	}
	replayed, err := service.CreateWithMaterialFiles(context.Background(), admin, publishInput, requestID, publishFiles)
	if err != nil || replayed.Assignment.ID != published.Assignment.ID || len(replayed.MaterialFiles) != 1 {
		t.Fatalf("retry with the same request key created a duplicate: result=%v err=%v", replayed, err)
	}
	var idempotentAssignmentCount, idempotentMaterialCount int64
	if err := db.Model(&model.Assignment{}).Where("publish_request_id = ?", requestID).Count(&idempotentAssignmentCount).Error; err != nil {
		t.Fatal("count published retry records")
	}
	if err := db.Model(&model.AssignmentMaterialFile{}).Where("assignment_id = ?", published.Assignment.ID).Count(&idempotentMaterialCount).Error; err != nil {
		t.Fatal("count published retry material records")
	}
	if idempotentAssignmentCount != 1 || idempotentMaterialCount != 1 {
		t.Fatalf("idempotent retry duplicated persisted records: assignments=%d materials=%d", idempotentAssignmentCount, idempotentMaterialCount)
	}
	changedInput := publishInput
	changedInput.Title += " 改动"
	if _, err := service.CreateWithMaterialFiles(context.Background(), admin, changedInput, requestID, publishFiles); statusOf(err) != http.StatusConflict {
		t.Fatalf("reusing a request key with changed content status = %d, want 409", statusOf(err))
	}
	changedRecipientsInput := publishInput
	changedRecipientsInput.Title += " 更换接收人"
	changedRecipientsInput.TargetUserIDs = []uint64{otherMember.ID}
	if _, err := service.Update(context.Background(), admin, published.Assignment.ID, changedRecipientsInput); statusOf(err) != http.StatusConflict {
		t.Fatalf("editing a targeted assignment to another member status = %d, want 409", statusOf(err))
	}
	retainedRecipientsInput := publishInput
	retainedRecipientsInput.Title += " 保留接收人"
	retained, err := service.Update(context.Background(), admin, published.Assignment.ID, retainedRecipientsInput)
	if err != nil || retained.TargetCount != 1 || retained.IsGroupWide {
		t.Fatalf("editing assignment details changed or rejected the original targeted scope: result=%#v err=%v", retained, err)
	}
	retainedMemberDetail, err := service.GetMine(context.Background(), member, published.Assignment.ID)
	if err != nil || retainedMemberDetail.Assignment.Title != retained.Title {
		t.Fatalf("original targeted recipient lost access after edit: detail=%#v err=%v", retainedMemberDetail, err)
	}
	if _, err := service.GetMine(context.Background(), otherMember, published.Assignment.ID); statusOf(err) != http.StatusNotFound {
		t.Fatalf("editing assignment recipients expanded access to another member: status=%d", statusOf(err))
	}

	blockedRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(blockedRoot, "materials"), []byte("not a directory"), 0o600); err != nil {
		t.Fatal("prepare an isolated material storage failure")
	}
	blockedService, err := NewServiceWithFileRoot(db, blockedRoot)
	if err != nil {
		t.Fatal("create isolated service with blocked material storage")
	}
	blockedService.now = func() time.Time { return now }
	blockedRequestID := "00000000-0000-4000-8000-" + fmt.Sprintf("%012x", (time.Now().UnixNano()+1)&0xffffffffffff)
	blockedInput := publishInput
	blockedInput.Title = "[TEST_ASSIGNMENT] 存储失败不得发布"
	if _, err := blockedService.CreateWithMaterialFiles(context.Background(), admin, blockedInput, blockedRequestID, publishFiles); statusOf(err) != http.StatusInternalServerError {
		t.Fatalf("blocked storage publication status = %d, want 500", statusOf(err))
	}
	var blockedAssignmentCount, blockedTargetCount int64
	if err := db.Model(&model.Assignment{}).Where("publish_request_id = ?", blockedRequestID).Count(&blockedAssignmentCount).Error; err != nil {
		t.Fatal("check failed publication assignment rollback")
	}
	if err := db.Model(&model.AssignmentTarget{}).Where("assignment_id IN (?)", db.Model(&model.Assignment{}).Select("id").Where("publish_request_id = ?", blockedRequestID)).Count(&blockedTargetCount).Error; err != nil {
		t.Fatal("check failed publication target rollback")
	}
	var maxAssignmentID uint64
	if err := db.Model(&model.Assignment{}).Select("COALESCE(MAX(id), 0)").Scan(&maxAssignmentID).Error; err != nil {
		t.Fatal("read committed assignment IDs after rollback")
	}
	if blockedAssignmentCount != 0 || blockedTargetCount != 0 {
		t.Fatalf("failed material storage left a visible assignment: assignments=%d targets=%d", blockedAssignmentCount, blockedTargetCount)
	}
	if _, err := service.GetMine(context.Background(), member, maxAssignmentID+1); statusOf(err) != http.StatusNotFound {
		t.Fatalf("member could access a failed unpublished assignment: status=%d", statusOf(err))
	}
	if _, err := service.Submit(context.Background(), member, maxAssignmentID+1, []*multipart.FileHeader{multipartHeader(t, "提前提交.pdf", []byte("%PDF-1.7\nblocked"))}); statusOf(err) != http.StatusNotFound {
		t.Fatalf("member could submit to a failed unpublished assignment: status=%d", statusOf(err))
	}
	retriedAfterFailure, err := service.CreateWithMaterialFiles(context.Background(), admin, blockedInput, blockedRequestID, publishFiles)
	if retriedAfterFailure != nil {
		createdAssignmentIDs = append(createdAssignmentIDs, retriedAfterFailure.Assignment.ID)
	}
	if err != nil || retriedAfterFailure == nil || len(retriedAfterFailure.MaterialFiles) != 1 {
		t.Fatalf("retry after a confirmed storage failure did not publish cleanly: result=%v err=%v", retriedAfterFailure, err)
	}
	retriedMemberDetail, err := service.GetMine(context.Background(), member, retriedAfterFailure.Assignment.ID)
	if err != nil || len(retriedMemberDetail.Assignment.MaterialFiles) != 1 {
		t.Fatalf("member could not read the complete retry publication: detail=%v err=%v", retriedMemberDetail, err)
	}

	partialRoot := t.TempDir()
	partialService, err := NewServiceWithFileRoot(db, partialRoot)
	if err != nil {
		t.Fatal("create isolated partial-write service")
	}
	partialService.now = func() time.Time { return now }
	triggerName := "qa_assignment_material_fail_" + strings.NewReplacer("T", "x", ".", "x").Replace(nonce)
	if err := db.Exec(fmt.Sprintf("CREATE TRIGGER `%s` BEFORE INSERT ON assignment_material_files FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'synthetic material metadata failure'", triggerName)).Error; err != nil {
		t.Fatalf("create isolated material metadata failure: %v", err)
	}
	triggerActive := true
	dropTrigger := func() {
		if triggerActive {
			if err := db.Exec(fmt.Sprintf("DROP TRIGGER IF EXISTS `%s`", triggerName)).Error; err != nil {
				t.Errorf("drop isolated failure trigger: %v", err)
			}
			triggerActive = false
		}
	}
	t.Cleanup(dropTrigger)
	partialRequestID := "00000000-0000-4000-8000-" + fmt.Sprintf("%012x", (time.Now().UnixNano()+2)&0xffffffffffff)
	partialInput := publishInput
	partialInput.Title = "[TEST_ASSIGNMENT] 附件元数据失败不得发布"
	partialFiles := []*multipart.FileHeader{
		multipartHeader(t, "第一份资料.pdf", []byte("%PDF-1.7\nfirst")),
		multipartHeader(t, "第二份资料.pdf", []byte("%PDF-1.7\nsecond")),
	}
	if _, err := partialService.CreateWithMaterialFiles(context.Background(), admin, partialInput, partialRequestID, partialFiles); err == nil {
		t.Fatal("expected synthetic material metadata failure")
	}
	dropTrigger()
	var partialAssignmentCount, partialMaterialCount int64
	if err := db.Model(&model.Assignment{}).Where("publish_request_id = ?", partialRequestID).Count(&partialAssignmentCount).Error; err != nil {
		t.Fatal("check assignment rollback after material metadata failure")
	}
	if err := db.Model(&model.AssignmentMaterialFile{}).Where("assignment_id IN (?)", db.Model(&model.Assignment{}).Select("id").Where("publish_request_id = ?", partialRequestID)).Count(&partialMaterialCount).Error; err != nil {
		t.Fatal("check material metadata rollback")
	}
	var remainingStoredFiles int64
	if err := filepath.WalkDir(partialRoot, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if !entry.IsDir() {
			remainingStoredFiles++
		}
		return nil
	}); err != nil {
		t.Fatal("inspect files cleaned after failed publication")
	}
	if partialAssignmentCount != 0 || partialMaterialCount != 0 || remainingStoredFiles != 0 {
		t.Fatalf("metadata failure left partial publication data: assignments=%d materials=%d files=%d", partialAssignmentCount, partialMaterialCount, remainingStoredFiles)
	}

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
	if updated.IsGroupWide {
		t.Fatal("editing a targeted assignment changed it to group-wide")
	}
	var persistedAssignment model.Assignment
	if err := db.First(&persistedAssignment, assignment.ID).Error; err != nil {
		t.Fatalf("reload edited assignment deadline: %v", err)
	}
	if persistedDueAt := readStoredUTCWall(persistedAssignment.DueAt); !persistedDueAt.Equal(initialDueAt) {
		t.Fatalf("edited deadline did not round-trip through MySQL: got=%s want=%s", persistedDueAt, initialDueAt)
	}
	if persistedAssignment.IsGroupWide {
		t.Fatal("edited targeted assignment persisted as group-wide")
	}
	if _, err := service.Update(context.Background(), admin, assignment.ID, CreateInput{
		Title: assignment.Title + " 越权扩大范围", Description: assignment.Description, DueAt: initialDueAt,
		IsGroupWide: true,
	}); statusOf(err) != http.StatusConflict {
		t.Fatalf("editing a targeted assignment into group-wide was not rejected: status=%d", statusOf(err))
	}
	adminDetailAfterRejectedWidening, err := service.GetAdmin(context.Background(), admin, assignment.ID)
	if err != nil || adminDetailAfterRejectedWidening.Assignment.IsGroupWide || len(adminDetailAfterRejectedWidening.Members) != 1 || adminDetailAfterRejectedWidening.Members[0].UserID != member.ID {
		t.Fatalf("rejected edit changed targeted assignment recipients: detail=%#v err=%v", adminDetailAfterRejectedWidening, err)
	}
	if _, err := service.GetMine(context.Background(), otherMember, assignment.ID); statusOf(err) != http.StatusNotFound {
		t.Fatalf("another same-group member gained access after editing a targeted assignment: status=%d", statusOf(err))
	}

	material, err := service.UploadMaterialFiles(context.Background(), admin, assignment.ID, []*multipart.FileHeader{multipartHeader(t, "教学资料.pdf", []byte("%PDF-1.7\nlesson"))})
	if err != nil || len(material) != 1 {
		t.Fatalf("upload teaching material: count=%d err=%v", len(material), err)
	}
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
	adminReview := graded.Members[0].LatestSubmission.Reviews[0]
	if adminReview.Score == nil || *adminReview.Score != 90 {
		t.Fatalf("administrator score missing: %#v", adminReview)
	}
	memberReviewed, err := service.GetMine(context.Background(), member, assignment.ID)
	if err != nil || len(memberReviewed.Submissions) != 1 || len(memberReviewed.Submissions[0].Reviews) != 1 {
		t.Fatalf("member could not read review feedback: detail=%#v err=%v", memberReviewed, err)
	}
	memberReview := memberReviewed.Submissions[0].Reviews[0]
	if memberReview.Score != nil || memberReview.Decision != model.AssignmentReviewPassed || memberReview.Comment != "[TEST_ASSIGNMENT] 流程通过" {
		t.Fatalf("member feedback leaked score or lost comments: %#v", memberReview)
	}
	if memberReviewed.Assignment.LatestSubmission == nil || memberReviewed.Assignment.LatestSubmission.Reviews[0].Score != nil {
		t.Fatal("member's latest submission leaked the score")
	}

	fullGroupAssignment, err := service.Create(context.Background(), admin, CreateInput{
		GroupID: groupIDs[groupMechanical], Title: "[TEST_ASSIGNMENT] 全组范围回归", Description: "全组作业创建及编辑验证",
		DueAt: now.Add(72 * time.Hour), IsGroupWide: true,
	})
	if err != nil {
		t.Fatalf("full-group assignment creation failed: assignment=%#v err=%v", fullGroupAssignment, err)
	}
	createdAssignmentIDs = append(createdAssignmentIDs, fullGroupAssignment.ID)
	if !fullGroupAssignment.IsGroupWide {
		t.Fatal("full-group assignment creation returned a targeted assignment")
	}
	initialFullGroupTargetCount := fullGroupAssignment.TargetCount
	if initialFullGroupTargetCount != len(memberOptions) {
		t.Fatalf("full-group assignment recipients = %d, want all %d currently eligible ordinary members", initialFullGroupTargetCount, len(memberOptions))
	}
	if _, err := service.GetMine(context.Background(), member, fullGroupAssignment.ID); err != nil {
		t.Fatalf("first technical-group member could not access a full-group assignment: %v", err)
	}
	if _, err := service.GetMine(context.Background(), otherMember, fullGroupAssignment.ID); err != nil {
		t.Fatalf("second technical-group member could not access a full-group assignment: %v", err)
	}
	lateMember := createActor("mechanical-late-member", model.RoleNameUser, groupMechanical)
	fullGroupEdited, err := service.Update(context.Background(), admin, fullGroupAssignment.ID, CreateInput{
		Title: fullGroupAssignment.Title + " 已编辑", Description: fullGroupAssignment.Description,
		DueAt: now.Add(72 * time.Hour), IsGroupWide: true,
	})
	if err != nil || !fullGroupEdited.IsGroupWide || fullGroupEdited.TargetCount != initialFullGroupTargetCount {
		t.Fatalf("editing a full-group assignment changed its existing recipient snapshot: assignment=%#v err=%v", fullGroupEdited, err)
	}
	if _, err := service.GetMine(context.Background(), lateMember, fullGroupAssignment.ID); statusOf(err) != http.StatusNotFound {
		t.Fatalf("routine edit expanded a full-group assignment to a later member: status=%d", statusOf(err))
	}

	withdrawalAssignment, err := service.Create(context.Background(), admin, CreateInput{
		GroupID: groupIDs[groupMechanical], Title: "[TEST_ASSIGNMENT] 撤回保留历史", Description: "提交后撤回不得删除历史",
		DueAt: now.Add(96 * time.Hour), IsGroupWide: false, TargetUserIDs: []uint64{member.ID},
	})
	if err != nil {
		t.Fatalf("create withdrawal acceptance assignment: %v", err)
	}
	createdAssignmentIDs = append(createdAssignmentIDs, withdrawalAssignment.ID)
	deadlineAssignment, err := service.Create(context.Background(), admin, CreateInput{
		GroupID: groupIDs[groupMechanical], Title: "[TEST_ASSIGNMENT] 正常截止仍可查看", Description: "截止只停止提交，不隐藏作业",
		DueAt: now.Add(time.Hour), IsGroupWide: false, TargetUserIDs: []uint64{member.ID},
	})
	if err != nil {
		t.Fatalf("create normal-deadline acceptance assignment: %v", err)
	}
	createdAssignmentIDs = append(createdAssignmentIDs, deadlineAssignment.ID)
	service.now = func() time.Time { return now.Add(2 * time.Hour) }
	deadlineDetail, err := service.GetMine(context.Background(), member, deadlineAssignment.ID)
	if err != nil || deadlineDetail.Assignment.PublicationStatus != model.AssignmentPublicationPublished || deadlineDetail.Assignment.Status != "overdue" {
		t.Fatalf("normal deadline hid the published assignment: detail=%#v err=%v", deadlineDetail, err)
	}
	service.now = func() time.Time { return now }
	if _, err := service.SetPublicationStatus(context.Background(), crossAdmin, withdrawalAssignment.ID, model.AssignmentPublicationWithdrawn); statusOf(err) != http.StatusForbidden {
		t.Fatalf("admin outside the assignment group could withdraw it: status=%d, want 403", statusOf(err))
	}
	withdrawalMaterials, err := service.UploadMaterialFiles(context.Background(), admin, withdrawalAssignment.ID, []*multipart.FileHeader{multipartHeader(t, "作业说明.pdf", []byte("%PDF-1.7\ninstructions"))})
	if err != nil || len(withdrawalMaterials) != 1 {
		t.Fatalf("upload withdrawal assignment material: materials=%#v err=%v", withdrawalMaterials, err)
	}
	withdrawnSubmission, err := service.Submit(context.Background(), member, withdrawalAssignment.ID, []*multipart.FileHeader{multipartHeader(t, "退回重做.pdf", []byte("%PDF-1.7\nredo"))})
	if err != nil || len(withdrawnSubmission.Submissions) != 1 {
		t.Fatalf("create submission before withdrawal: result=%#v err=%v", withdrawnSubmission, err)
	}
	createdSubmissionIDs = append(createdSubmissionIDs, withdrawnSubmission.Submissions[0].ID)
	if _, err := service.Review(context.Background(), admin, withdrawnSubmission.Submissions[0].ID, ReviewInput{Score: 70, Decision: model.AssignmentReviewNeedsRedo, Comment: "[TEST_ASSIGNMENT] 请重做"}); err != nil {
		t.Fatalf("return the synthetic submission for redo: %v", err)
	}
	resubmitted, err := service.Submit(context.Background(), member, withdrawalAssignment.ID, []*multipart.FileHeader{multipartHeader(t, "重新提交.pdf", []byte("%PDF-1.7\nresubmission"))})
	if err != nil || len(resubmitted.Submissions) != 2 || resubmitted.Submissions[1].Attempt != 2 || len(resubmitted.Submissions[0].Reviews) != 1 || resubmitted.Submissions[0].Reviews[0].Decision != model.AssignmentReviewNeedsRedo {
		t.Fatalf("member could not resubmit a returned assignment while it was published: detail=%#v err=%v", resubmitted, err)
	}
	createdSubmissionIDs = append(createdSubmissionIDs, resubmitted.Submissions[1].ID)
	if _, err := service.Review(context.Background(), admin, resubmitted.Submissions[1].ID, ReviewInput{Score: 92, Decision: model.AssignmentReviewPassed, Comment: "[TEST_ASSIGNMENT] 重做后通过"}); err != nil {
		t.Fatalf("pass the synthetic resubmission: %v", err)
	}
	if _, err := service.SetPublicationStatus(context.Background(), admin, withdrawalAssignment.ID, model.AssignmentPublicationWithdrawn); err != nil {
		t.Fatalf("withdraw submitted assignment: %v", err)
	}
	if _, err := service.SetPublicationStatus(context.Background(), member, withdrawalAssignment.ID, model.AssignmentPublicationPublished); statusOf(err) != http.StatusForbidden {
		t.Fatalf("member could republish an assignment: status=%d, want 403", statusOf(err))
	}
	memberAssignments, err := service.ListMine(context.Background(), member)
	if err != nil {
		t.Fatalf("list member assignments after withdrawal: %v", err)
	}
	for _, item := range memberAssignments {
		if item.ID == withdrawalAssignment.ID {
			t.Fatalf("withdrawn assignment %d remained in member list", item.ID)
		}
	}
	if _, err := service.GetMine(context.Background(), member, withdrawalAssignment.ID); statusOf(err) != http.StatusNotFound {
		t.Fatalf("member assignment detail after withdrawal status = %d, want 404", statusOf(err))
	}
	if _, err := service.Submit(context.Background(), member, withdrawalAssignment.ID, nil); statusOf(err) != http.StatusNotFound {
		t.Fatalf("member submission after withdrawal status = %d, want 404", statusOf(err))
	}
	firstSubmissionFileID := resubmitted.Submissions[0].Files[0].ID
	if _, err := service.OpenFile(context.Background(), member, firstSubmissionFileID); statusOf(err) != http.StatusNotFound {
		t.Fatalf("member submission file after withdrawal status = %d, want 404", statusOf(err))
	}
	if _, err := service.OpenMaterialFile(context.Background(), member, withdrawalMaterials[0].ID); statusOf(err) != http.StatusNotFound {
		t.Fatalf("member teaching material after withdrawal status = %d, want 404", statusOf(err))
	}
	if err := service.Delete(context.Background(), admin, withdrawalAssignment.ID); statusOf(err) != http.StatusConflict {
		t.Fatalf("assignment with submission/review history was deleted: status=%d", statusOf(err))
	}
	if err := service.Delete(context.Background(), member, withdrawalAssignment.ID); statusOf(err) != http.StatusForbidden {
		t.Fatalf("ordinary member assignment deletion status = %d, want 403", statusOf(err))
	}
	adminHistory, err := service.GetAdmin(context.Background(), admin, withdrawalAssignment.ID)
	if err != nil || len(adminHistory.Members) != 1 || len(adminHistory.Members[0].Submissions) != 2 || adminHistory.Assignment.CanDelete {
		t.Fatalf("admin could not retain withdrawn submission history: history=%#v err=%v", adminHistory, err)
	}
	var targetCount, submissionCount, reviewCount, materialCount int64
	if err := db.Model(&model.AssignmentTarget{}).Where("assignment_id = ?", withdrawalAssignment.ID).Count(&targetCount).Error; err != nil {
		t.Fatalf("count retained assignment targets: %v", err)
	}
	if err := db.Model(&model.AssignmentSubmission{}).Where("assignment_id = ?", withdrawalAssignment.ID).Count(&submissionCount).Error; err != nil {
		t.Fatalf("count retained submissions: %v", err)
	}
	if err := db.Table("assignment_reviews").Joins("JOIN assignment_submissions ON assignment_submissions.id = assignment_reviews.submission_id").Where("assignment_submissions.assignment_id = ?", withdrawalAssignment.ID).Count(&reviewCount).Error; err != nil {
		t.Fatalf("count retained reviews: %v", err)
	}
	if err := db.Model(&model.AssignmentMaterialFile{}).Where("assignment_id = ?", withdrawalAssignment.ID).Count(&materialCount).Error; err != nil {
		t.Fatalf("count retained teaching materials: %v", err)
	}
	if targetCount != 1 || submissionCount != 2 || reviewCount != 2 || materialCount != 1 {
		t.Fatalf("withdrawal changed retained history: targets=%d submissions=%d reviews=%d materials=%d", targetCount, submissionCount, reviewCount, materialCount)
	}
	if _, err := service.OpenFile(context.Background(), admin, firstSubmissionFileID); err != nil {
		t.Fatalf("admin could not download withdrawn submission history: %v", err)
	}
	if _, err := service.OpenMaterialFile(context.Background(), admin, withdrawalMaterials[0].ID); err != nil {
		t.Fatalf("admin could not download withdrawn assignment material: %v", err)
	}
	service.now = func() time.Time { return now.Add(120 * time.Hour) }
	if _, err := service.SetPublicationStatus(context.Background(), admin, withdrawalAssignment.ID, model.AssignmentPublicationPublished); err != nil {
		t.Fatalf("republish an expired withdrawn assignment: %v", err)
	}
	republishedDetail, err := service.GetMine(context.Background(), member, withdrawalAssignment.ID)
	if err != nil || republishedDetail.Assignment.PublicationStatus != model.AssignmentPublicationPublished || len(republishedDetail.Submissions) != 2 || len(republishedDetail.Submissions[0].Reviews) != 1 || len(republishedDetail.Submissions[1].Reviews) != 1 || republishedDetail.Submissions[1].Reviews[0].Decision != model.AssignmentReviewPassed {
		t.Fatalf("republishing did not restore member access and history: detail=%#v err=%v", republishedDetail, err)
	}
	republishedAdminHistory, err := service.GetAdmin(context.Background(), admin, withdrawalAssignment.ID)
	if err != nil || len(republishedAdminHistory.Members) != 1 || republishedAdminHistory.Members[0].UserID != member.ID || len(republishedAdminHistory.Members[0].Submissions) != 2 {
		t.Fatalf("republishing changed the original recipients or administrator history: history=%#v err=%v", republishedAdminHistory, err)
	}
	if _, err := service.OpenFile(context.Background(), member, firstSubmissionFileID); err != nil {
		t.Fatalf("member could not access restored submission history after republish: %v", err)
	}
	if _, err := service.OpenMaterialFile(context.Background(), member, withdrawalMaterials[0].ID); err != nil {
		t.Fatalf("member could not access teaching materials after republish: %v", err)
	}
	service.now = func() time.Time { return now }

	deletableAssignment, err := service.Create(context.Background(), admin, CreateInput{
		GroupID: groupIDs[groupMechanical], Title: "[TEST_ASSIGNMENT] 可安全删除", Description: "没有业务记录",
		DueAt: now.Add(96 * time.Hour), IsGroupWide: false, TargetUserIDs: []uint64{member.ID},
	})
	if err != nil {
		t.Fatalf("create deletable assignment: %v", err)
	}
	createdAssignmentIDs = append(createdAssignmentIDs, deletableAssignment.ID)
	if _, err := service.SetPublicationStatus(context.Background(), admin, deletableAssignment.ID, model.AssignmentPublicationWithdrawn); err != nil {
		t.Fatalf("withdraw deletable assignment: %v", err)
	}
	deletableSummary, err := service.GetAdmin(context.Background(), admin, deletableAssignment.ID)
	if err != nil || !deletableSummary.Assignment.CanDelete {
		t.Fatalf("empty withdrawn assignment was not marked safe for deletion: summary=%#v err=%v", deletableSummary, err)
	}
	if err := service.Delete(context.Background(), admin, deletableAssignment.ID); err != nil {
		t.Fatalf("delete withdrawn assignment without business references: %v", err)
	}
	var deletedRows int64
	if err := db.Model(&model.Assignment{}).Where("id = ?", deletableAssignment.ID).Count(&deletedRows).Error; err != nil || deletedRows != 0 {
		t.Fatalf("safe assignment delete left a parent row: count=%d err=%v", deletedRows, err)
	}

	referencedAssignment, err := service.Create(context.Background(), admin, CreateInput{
		GroupID: groupIDs[groupMechanical], Title: "[TEST_ASSIGNMENT] 技能历史保护", Description: "技能和成长关联必须阻止作业删除",
		DueAt: now.Add(96 * time.Hour), IsGroupWide: false, TargetUserIDs: []uint64{member.ID},
	})
	if err != nil {
		t.Fatalf("create assignment for skill reference protection: %v", err)
	}
	createdAssignmentIDs = append(createdAssignmentIDs, referencedAssignment.ID)
	if _, err := service.SetPublicationStatus(context.Background(), admin, referencedAssignment.ID, model.AssignmentPublicationWithdrawn); err != nil {
		t.Fatalf("withdraw assignment for skill reference protection: %v", err)
	}
	skillNode := model.SkillNode{
		GroupID: groupIDs[groupMechanical], Name: "[TEST_ASSIGNMENT] assignment-linked skill",
		LearningGoal: "Synthetic linked goal", PassingCriteria: "Synthetic linked criteria", CreatedBy: admin.ID,
	}
	if err := db.Create(&skillNode).Error; err != nil {
		t.Fatalf("create synthetic skill node protecting assignment: %v", err)
	}
	createdSkillNodeIDs = append(createdSkillNodeIDs, skillNode.ID)
	if err := db.Create(&model.SkillNodeAssignment{SkillNodeID: skillNode.ID, AssignmentID: referencedAssignment.ID}).Error; err != nil {
		t.Fatalf("link assignment to synthetic skill node: %v", err)
	}
	linkedSummary, err := service.GetAdmin(context.Background(), admin, referencedAssignment.ID)
	if err != nil || linkedSummary.Assignment.CanDelete {
		t.Fatalf("assignment with a skill association was marked safe for deletion: summary=%#v err=%v", linkedSummary, err)
	}
	if err := service.Delete(context.Background(), admin, referencedAssignment.ID); statusOf(err) != http.StatusConflict {
		t.Fatalf("assignment linked to a skill node deletion status = %d, want 409", statusOf(err))
	}
	var skillEvidenceID = referencedAssignment.ID
	skillEvidence := model.SkillReviewEvent{
		GroupID: groupIDs[groupMechanical], SkillNodeID: skillNode.ID, SkillName: skillNode.Name,
		UserID: member.ID, ActorID: admin.ID, ActorName: "[TEST_ASSIGNMENT] admin", Action: model.SkillReviewMastered,
		EvidenceType: model.SkillEvidenceAssignment, EvidenceID: &skillEvidenceID, EvidenceNote: "Synthetic linked evidence",
	}
	if err := db.Create(&skillEvidence).Error; err != nil {
		t.Fatalf("create synthetic assignment skill evidence: %v", err)
	}
	createdSkillReviewEventIDs = append(createdSkillReviewEventIDs, skillEvidence.ID)
	if err := service.Delete(context.Background(), admin, referencedAssignment.ID); statusOf(err) != http.StatusConflict {
		t.Fatalf("assignment referenced by a skill review event deletion status = %d, want 409", statusOf(err))
	}
}

func mustListAssignments(t *testing.T, service *Service, actor Actor, groupID uint64) []AssignmentView {
	t.Helper()
	items, err := service.ListAdmin(context.Background(), actor, groupID)
	if err != nil {
		t.Fatalf("list group assignments: %v", err)
	}
	return items
}

func statusOf(err error) int {
	var serviceErr *ServiceError
	if errors.As(err, &serviceErr) {
		return serviceErr.Status
	}
	return 0
}
