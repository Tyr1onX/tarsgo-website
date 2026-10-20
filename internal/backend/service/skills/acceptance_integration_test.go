package skills

import (
	"context"
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
)

// This opt-in test writes synthetic skill and training rows only to the
// isolated local acceptance database, then removes every row created here.
func TestAcceptanceDatabaseSkillTreeWorkflow(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TARSGO_QA_TEST_DSN"))
	if dsn == "" {
		t.Skip("TARSGO_QA_TEST_DSN is not set")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("refusing to run the skill integration test outside the isolated local acceptance database")
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
	for _, table := range []string{
		"users", "roles", "user_groups", "user_group_members", "assignments", "assignment_submissions", "assignment_reviews",
		"skill_nodes", "skill_node_prerequisites", "skill_node_assignments", "skill_node_progress", "skill_review_events",
	} {
		if !db.Migrator().HasTable(table) {
			t.Fatalf("acceptance database is missing required table %s", table)
		}
	}

	nonce := time.Now().UTC().Format("20060102T150405.000000000")
	createdGroupIDs := make([]uint64, 0, len(groupNames))
	createdRoleIDs := make([]uint64, 0, 3)
	createdUserIDs := make([]uint64, 0, 9)
	createdMembershipIDs := make([]uint64, 0, 8)
	createdNodeIDs := make([]uint64, 0, 7)
	createdAssignmentIDs := make([]uint64, 0, 1)
	createdSubmissionIDs := make([]uint64, 0, 1)
	createdReviewIDs := make([]uint64, 0, 1)
	t.Cleanup(func() {
		deleteIDs := func(ids []uint64, destination any) {
			if len(ids) == 0 {
				return
			}
			if err := db.Where("id IN ?", ids).Delete(destination).Error; err != nil {
				t.Errorf("remove synthetic skill acceptance rows: %v", err)
			}
		}
		if len(createdUserIDs) > 0 {
			if err := db.Where("user_id IN ?", createdUserIDs).Delete(&model.SkillReviewEvent{}).Error; err != nil {
				t.Errorf("remove synthetic skill review history: %v", err)
			}
		}
		if len(createdNodeIDs) > 0 {
			for _, related := range []any{&model.SkillNodeProgress{}, &model.SkillNodeAssignment{}} {
				if err := db.Where("skill_node_id IN ?", createdNodeIDs).Delete(related).Error; err != nil {
					t.Errorf("remove synthetic skill progress and assignment links: %v", err)
				}
			}
			if err := db.Where("skill_node_id IN ? OR prerequisite_node_id IN ?", createdNodeIDs, createdNodeIDs).Delete(&model.SkillNodePrerequisite{}).Error; err != nil {
				t.Errorf("remove synthetic skill prerequisites: %v", err)
			}
		}
		deleteIDs(createdNodeIDs, &model.SkillNode{})
		deleteIDs(createdReviewIDs, &model.AssignmentReview{})
		deleteIDs(createdSubmissionIDs, &model.AssignmentSubmission{})
		deleteIDs(createdAssignmentIDs, &model.AssignmentTarget{})
		deleteIDs(createdAssignmentIDs, &model.Assignment{})
		deleteIDs(createdMembershipIDs, &model.UserGroupMember{})
		deleteIDs(createdUserIDs, &model.User{})
		deleteIDs(createdGroupIDs, &model.UserGroup{})
		deleteIDs(createdRoleIDs, &model.Role{})
	})

	groupIDs := make(map[string]uint64, len(groupNames))
	for _, name := range groupNames {
		var group model.UserGroup
		queryErr := db.Where("name = ?", name).Take(&group).Error
		if queryErr == gorm.ErrRecordNotFound {
			group = model.UserGroup{Name: name, Status: model.UserGroupStatusActive}
			if err := db.Create(&group).Error; err != nil {
				t.Fatalf("create synthetic group %q: %v", name, err)
			}
			createdGroupIDs = append(createdGroupIDs, group.ID)
		} else if queryErr != nil {
			t.Fatalf("read group %q: %v", name, queryErr)
		} else if group.Status != model.UserGroupStatusActive {
			t.Fatalf("required acceptance group %q is inactive", name)
		}
		groupIDs[name] = group.ID
	}
	roleIDs := make(map[string]uint64, 3)
	for _, name := range []string{model.RoleNameUser, model.RoleNameAdmin, model.RoleNameSuperAdmin} {
		var role model.Role
		queryErr := db.Where("name = ?", name).Take(&role).Error
		if queryErr == gorm.ErrRecordNotFound {
			role = model.Role{Name: name, DisplayName: name}
			if err := db.Create(&role).Error; err != nil {
				t.Fatalf("create synthetic role %q: %v", name, err)
			}
			createdRoleIDs = append(createdRoleIDs, role.ID)
		} else if queryErr != nil {
			t.Fatalf("read role %q: %v", name, queryErr)
		}
		roleIDs[name] = role.ID
	}

	createUser := func(label, roleName, groupName string, groupRole uint8) Actor {
		var managementGroupID *uint64
		if groupName != "" && roleName == model.RoleNameAdmin {
			value := groupIDs[groupName]
			managementGroupID = &value
		}
		realName := "[TEST_SKILL] " + label
		user := model.User{
			RoleID: roleIDs[roleName], Name: realName, RealName: &realName,
			Email:  fmt.Sprintf("skill-%s-%s@tarsgo.test", nonce, strings.ToLower(strings.ReplaceAll(label, " ", "-"))),
			Status: model.UserStatusEnabled, AdminScope: model.AdminScopeNone,
		}
		if roleName == model.RoleNameAdmin {
			user.AdminScope = model.AdminScopeGroup
			user.ManagementGroupID = managementGroupID
		} else if roleName == model.RoleNameSuperAdmin {
			user.AdminScope = model.AdminScopeGlobal
		}
		if err := db.Create(&user).Error; err != nil {
			t.Fatalf("create synthetic account %q: %v", label, err)
		}
		createdUserIDs = append(createdUserIDs, user.ID)
		if groupName != "" {
			membership := model.UserGroupMember{GroupID: groupIDs[groupName], UserID: user.ID, Role: groupRole}
			if err := db.Create(&membership).Error; err != nil {
				t.Fatalf("assign synthetic account %q: %v", label, err)
			}
			createdMembershipIDs = append(createdMembershipIDs, membership.ID)
		}
		return Actor{ID: user.ID, RoleName: roleName}
	}

	memberByGroup := make(map[string]Actor, len(groupNames))
	for index, name := range groupNames {
		memberByGroup[name] = createUser(fmt.Sprintf("member-%02d", index+1), model.RoleNameUser, name, model.UserGroupMemberRoleMember)
	}
	mechanicalAdmin := createUser("mechanical-admin", model.RoleNameAdmin, "机械组", model.UserGroupMemberRoleGroupAdmin)
	aiAdmin := createUser("ai-admin", model.RoleNameAdmin, "AI组", model.UserGroupMemberRoleGroupAdmin)
	operationsAdmin := createUser("operations-admin", model.RoleNameAdmin, "运营组", model.UserGroupMemberRoleGroupAdmin)
	superAdmin := createUser("super-admin", model.RoleNameSuperAdmin, "", model.UserGroupMemberRoleMember)

	service := NewService(db)
	service.Now = func() time.Time { return time.Date(2026, 10, 20, 9, 0, 0, 0, time.UTC) }
	adminGroups, err := service.ListAdminGroups(context.Background(), superAdmin)
	if err != nil || len(adminGroups) != 5 {
		t.Fatalf("super admin route count = %d, err=%v; want all five groups", len(adminGroups), err)
	}
	for _, item := range []struct {
		actor Actor
		name  string
	}{
		{mechanicalAdmin, "机械组"}, {aiAdmin, "AI组"}, {operationsAdmin, "运营组"},
	} {
		groups, err := service.ListAdminGroups(context.Background(), item.actor)
		if err != nil || len(groups) != 1 || groups[0].Name != item.name {
			t.Fatalf("%s admin route scope = %#v, err=%v", item.name, groups, err)
		}
	}

	rootByGroup := make(map[string]Node)
	for index, name := range groupNames {
		node, err := service.CreateNode(context.Background(), superAdmin, NodeInput{
			GroupID: groupIDs[name], Name: "[TEST_SKILL] route-" + name,
			LearningGoal: "Acceptance learning goal", PassingCriteria: "Acceptance practical check", SortOrder: uint(index),
		})
		if err != nil {
			t.Fatalf("super admin could not configure %s: %v", name, err)
		}
		rootByGroup[name] = *node
		createdNodeIDs = append(createdNodeIDs, node.ID)
		own, err := service.ListMy(context.Background(), memberByGroup[name].ID)
		if err != nil || len(own.Groups) != 1 || own.Groups[0].Name != name || len(own.Groups[0].Nodes) != 1 {
			t.Fatalf("%s member route = %#v, err=%v", name, own, err)
		}
	}
	for _, name := range groupNames {
		if _, err := service.Start(context.Background(), memberByGroup[name].ID, rootByGroup[otherGroupName(name)].ID); serviceStatus(err) != http.StatusForbidden {
			t.Fatalf("%s member cross-group start status = %d, want 403", name, serviceStatus(err))
		}
	}
	if _, err := service.ListAdminNodes(context.Background(), mechanicalAdmin, groupIDs["AI组"]); serviceStatus(err) != http.StatusForbidden {
		t.Fatalf("ordinary admin cross-group route read status = %d, want 403", serviceStatus(err))
	}
	for _, name := range groupNames {
		if _, err := service.ListAdminNodes(context.Background(), superAdmin, groupIDs[name]); err != nil {
			t.Fatalf("super admin could not read %s nodes: %v", name, err)
		}
	}

	root := rootByGroup["机械组"]
	child, err := service.CreateNode(context.Background(), mechanicalAdmin, NodeInput{
		GroupID: groupIDs["机械组"], Name: "[TEST_SKILL] linked-task challenge",
		LearningGoal: "Apply the basic skill", PassingCriteria: "Complete the associated practical task", SortOrder: 6,
	})
	if err != nil {
		t.Fatalf("mechanical admin could not create an own-group node: %v", err)
	}
	createdNodeIDs = append(createdNodeIDs, child.ID)
	if _, err := service.CreateNode(context.Background(), mechanicalAdmin, NodeInput{
		GroupID: groupIDs["AI组"], Name: "[TEST_SKILL] denied cross-group node",
		LearningGoal: "goal", PassingCriteria: "criteria",
	}); serviceStatus(err) != http.StatusForbidden {
		t.Fatalf("ordinary admin cross-group create status = %d, want 403", serviceStatus(err))
	}
	if err := service.SetPrerequisites(context.Background(), mechanicalAdmin, child.ID, []uint64{root.ID}); err != nil {
		t.Fatalf("configure same-group prerequisite: %v", err)
	}
	if err := service.SetPrerequisites(context.Background(), mechanicalAdmin, root.ID, []uint64{child.ID}); serviceStatus(err) != http.StatusBadRequest {
		t.Fatalf("cyclic prerequisite status = %d, want 400", serviceStatus(err))
	}
	if err := service.SetActive(context.Background(), mechanicalAdmin, root.ID, false); serviceStatus(err) != http.StatusConflict {
		t.Fatalf("disabling a prerequisite with active dependants status = %d, want 409", serviceStatus(err))
	}
	if _, err := service.Start(context.Background(), memberByGroup["机械组"].ID, child.ID); serviceStatus(err) != http.StatusConflict {
		t.Fatalf("starting a locked skill status = %d, want 409", serviceStatus(err))
	}

	assignment := model.Assignment{
		GroupID: groupIDs["机械组"], CreatorID: mechanicalAdmin.ID,
		Title: "[TEST_SKILL] linked practical", Description: "Synthetic acceptance task",
		DueAt: time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC), AttachmentRequirements: "", IsGroupWide: true,
	}
	if err := db.Create(&assignment).Error; err != nil {
		t.Fatalf("create synthetic assignment: %v", err)
	}
	createdAssignmentIDs = append(createdAssignmentIDs, assignment.ID)
	if err := service.SetAssignments(context.Background(), mechanicalAdmin, child.ID, []uint64{assignment.ID}); err != nil {
		t.Fatalf("associate same-group assignment: %v", err)
	}
	submission := model.AssignmentSubmission{AssignmentID: assignment.ID, UserID: memberByGroup["机械组"].ID, Attempt: 1, SubmittedAt: service.Now()}
	if err := db.Create(&submission).Error; err != nil {
		t.Fatalf("create synthetic submission: %v", err)
	}
	createdSubmissionIDs = append(createdSubmissionIDs, submission.ID)
	assignmentReview := model.AssignmentReview{SubmissionID: submission.ID, ReviewerID: mechanicalAdmin.ID, Score: 90, Decision: model.AssignmentReviewPassed, Comment: "Acceptance passed"}
	if err := db.Create(&assignmentReview).Error; err != nil {
		t.Fatalf("create synthetic assignment review: %v", err)
	}
	createdReviewIDs = append(createdReviewIDs, assignmentReview.ID)

	mechanicalMemberID := memberByGroup["机械组"].ID
	if _, err := service.Start(context.Background(), mechanicalMemberID, root.ID); err != nil {
		t.Fatalf("member could not start an available root skill: %v", err)
	}
	if _, err := service.Review(context.Background(), memberByGroup["机械组"], root.ID, mechanicalMemberID, ReviewInput{
		Action: model.SkillReviewMastered, EvidenceType: model.SkillEvidenceNote, EvidenceNote: "Synthetic practical check passed",
	}); serviceStatus(err) != http.StatusForbidden {
		t.Fatalf("member self-confirmation status = %d, want 403", serviceStatus(err))
	}
	if _, err := service.Review(context.Background(), aiAdmin, root.ID, mechanicalMemberID, ReviewInput{
		Action: model.SkillReviewMastered, EvidenceType: model.SkillEvidenceNote, EvidenceNote: "Cross-group review",
	}); serviceStatus(err) != http.StatusForbidden {
		t.Fatalf("cross-group review status = %d, want 403", serviceStatus(err))
	}
	if _, err := service.Review(context.Background(), mechanicalAdmin, root.ID, mechanicalMemberID, ReviewInput{
		Action: model.SkillReviewMastered, EvidenceType: model.SkillEvidenceNote, EvidenceNote: "Synthetic practical check passed",
	}); err != nil {
		t.Fatalf("same-group admin could not confirm an assessed skill: %v", err)
	}
	if _, err := service.Review(context.Background(), mechanicalAdmin, root.ID, mechanicalMemberID, ReviewInput{
		Action: model.SkillReviewMastered, EvidenceType: model.SkillEvidenceNote, EvidenceNote: "Duplicate confirmation",
	}); serviceStatus(err) != http.StatusConflict {
		t.Fatalf("duplicate mastery confirmation status = %d, want 409", serviceStatus(err))
	}
	if _, err := service.Start(context.Background(), mechanicalMemberID, child.ID); err != nil {
		t.Fatalf("member could not start child after prerequisite mastery: %v", err)
	}
	progress, err := service.ListMy(context.Background(), mechanicalMemberID)
	if err != nil || len(progress.Groups) != 1 || progress.Groups[0].Nodes[1].State != StatePracticed {
		t.Fatalf("passed linked assignment did not produce practice evidence: progress=%#v err=%v", progress, err)
	}
	if _, err := service.Review(context.Background(), mechanicalAdmin, child.ID, mechanicalMemberID, ReviewInput{
		Action: model.SkillReviewMastered, EvidenceType: model.SkillEvidenceAssignment,
		EvidenceID: &assignment.ID, EvidenceNote: "Synthetic practical check passed",
	}); err != nil {
		t.Fatalf("admin could not confirm linked assignment evidence: %v", err)
	}
	if _, err := service.Review(context.Background(), mechanicalAdmin, child.ID, mechanicalMemberID, ReviewInput{
		Action: model.SkillReviewRevoked, EvidenceType: model.SkillEvidenceNote, EvidenceNote: "Synthetic review correction",
	}); err != nil {
		t.Fatalf("admin could not append a revocation: %v", err)
	}
	history, err := service.MemberHistory(context.Background(), mechanicalAdmin, child.ID, mechanicalMemberID)
	if err != nil || len(history) != 2 || history[0].Action != model.SkillReviewMastered || history[0].ActorName != "[TEST_SKILL] mechanical-admin" || history[1].Action != model.SkillReviewRevoked {
		t.Fatalf("mastery and revocation audit history = %#v, err=%v", history, err)
	}
	if _, err := service.MemberHistory(context.Background(), aiAdmin, child.ID, mechanicalMemberID); serviceStatus(err) != http.StatusForbidden {
		t.Fatalf("cross-group evidence history status = %d, want 403", serviceStatus(err))
	}
	progress, err = service.ListMy(context.Background(), mechanicalMemberID)
	if err != nil || progress.Groups[0].Nodes[1].State != StatePracticed || len(progress.Groups[0].Nodes[1].ReviewHistory) != 2 {
		t.Fatalf("revocation did not preserve the practice state and history: progress=%#v err=%v", progress, err)
	}
}

func otherGroupName(name string) string {
	for _, candidate := range groupNames {
		if candidate != name {
			return candidate
		}
	}
	return name
}

func serviceStatus(err error) int {
	var serviceErr *ServiceError
	if errors.As(err, &serviceErr) {
		return serviceErr.Status
	}
	if err == nil {
		return http.StatusOK
	}
	return http.StatusInternalServerError
}
