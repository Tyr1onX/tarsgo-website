package expedition

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

// This workflow test only writes clearly synthetic records to the isolated
// acceptance database and removes those rows during cleanup.
func TestAcceptanceDatabaseCrossGroupProjectWorkflow(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TARSGO_QA_TEST_DSN"))
	if dsn == "" {
		t.Skip("TARSGO_QA_TEST_DSN is not set")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("refusing to run the expedition integration test outside the isolated local acceptance database")
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
	if err := db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
		&model.ExpeditionProject{}, &model.ExpeditionProjectMilestone{}, &model.ExpeditionProjectParticipant{}, &model.ExpeditionProjectEvent{},
	); err != nil {
		t.Fatalf("migrate isolated expedition tables: %v", err)
	}

	nonce := time.Now().UTC().Format("20060102T150405.000000000")
	createdProjectIDs, createdRoleIDs, createdGroupIDs, createdUserIDs, createdMembershipIDs := []uint64{}, []uint64{}, []uint64{}, []uint64{}, []uint64{}
	t.Cleanup(func() {
		if len(createdProjectIDs) > 0 {
			for _, target := range []any{&model.ExpeditionProjectEvent{}, &model.ExpeditionProjectParticipant{}, &model.ExpeditionProjectMilestone{}} {
				if err := db.Where("project_id IN ?", createdProjectIDs).Delete(target).Error; err != nil {
					t.Errorf("remove synthetic expedition rows: %v", err)
				}
			}
			if err := db.Where("id IN ?", createdProjectIDs).Delete(&model.ExpeditionProject{}).Error; err != nil {
				t.Errorf("remove synthetic expedition projects: %v", err)
			}
		}
		if len(createdMembershipIDs) > 0 {
			_ = db.Where("id IN ?", createdMembershipIDs).Delete(&model.UserGroupMember{}).Error
		}
		if len(createdUserIDs) > 0 {
			_ = db.Where("id IN ?", createdUserIDs).Delete(&model.User{}).Error
		}
		if len(createdRoleIDs) > 0 {
			_ = db.Where("id IN ?", createdRoleIDs).Delete(&model.Role{}).Error
		}
		if len(createdGroupIDs) > 0 {
			_ = db.Where("id IN ?", createdGroupIDs).Delete(&model.UserGroup{}).Error
		}
	})

	groupIDs := make(map[string]uint64)
	for _, groupName := range groupNames {
		var group model.UserGroup
		queryErr := db.Where("name = ?", groupName).Take(&group).Error
		if queryErr == gorm.ErrRecordNotFound {
			group = model.UserGroup{Name: groupName, Status: model.UserGroupStatusActive}
			if err := db.Create(&group).Error; err != nil {
				t.Fatalf("create acceptance group %s: %v", groupName, err)
			}
			createdGroupIDs = append(createdGroupIDs, group.ID)
		} else if queryErr != nil {
			t.Fatalf("read acceptance group %s: %v", groupName, queryErr)
		}
		if group.Status != model.UserGroupStatusActive {
			t.Fatalf("acceptance group %s must be active", groupName)
		}
		groupIDs[groupName] = group.ID
	}
	roleIDs := make(map[string]uint64)
	for _, roleName := range []string{model.RoleNameUser, model.RoleNameAdmin, model.RoleNameSuperAdmin} {
		var role model.Role
		queryErr := db.Where("name = ?", roleName).Take(&role).Error
		if queryErr == gorm.ErrRecordNotFound {
			role = model.Role{Name: roleName, DisplayName: roleName}
			if err := db.Create(&role).Error; err != nil {
				t.Fatalf("create acceptance role %s: %v", roleName, err)
			}
			createdRoleIDs = append(createdRoleIDs, role.ID)
		} else if queryErr != nil {
			t.Fatalf("read acceptance role %s: %v", roleName, queryErr)
		}
		roleIDs[roleName] = role.ID
	}
	createActor := func(label, roleName string, groupNames ...string) Actor {
		name := "[P4 TEST] " + label
		user := model.User{RoleID: roleIDs[roleName], Name: name, RealName: &name, Email: fmt.Sprintf("p4-%s-%s@tarsgo.test", nonce, strings.ToLower(strings.ReplaceAll(label, " ", "-"))), Status: model.UserStatusEnabled}
		if err := db.Create(&user).Error; err != nil {
			t.Fatalf("create acceptance user %s: %v", label, err)
		}
		createdUserIDs = append(createdUserIDs, user.ID)
		for _, groupName := range groupNames {
			membership := model.UserGroupMember{UserID: user.ID, GroupID: groupIDs[groupName], Role: model.UserGroupMemberRoleMember}
			if err := db.Create(&membership).Error; err != nil {
				t.Fatalf("assign acceptance user %s to %s: %v", label, groupName, err)
			}
			createdMembershipIDs = append(createdMembershipIDs, membership.ID)
		}
		return Actor{ID: user.ID, RoleName: roleName}
	}

	super := createActor("super-admin", model.RoleNameSuperAdmin)
	mechanicalAdmin := createActor("mechanical-admin", model.RoleNameAdmin, "机械组")
	visionAdmin := createActor("vision-admin", model.RoleNameAdmin, "视觉组")
	mechanicalMember := createActor("mechanical-participant", model.RoleNameUser, "机械组")
	mechanicalObserver := createActor("mechanical-observer", model.RoleNameUser, "机械组")
	controlsMember := createActor("controls-participant", model.RoleNameUser, "电控组")
	operationsMember := createActor("operations-member", model.RoleNameUser, "运营组")

	service := NewService(db)
	service.Now = func() time.Time { return time.Date(2026, 10, 20, 9, 0, 0, 0, time.UTC) }
	mechID, controlsID := groupIDs["机械组"], groupIDs["电控组"]
	createProject := func(title, visibility string) *ProjectView {
		result, err := service.CreateProject(context.Background(), super, ProjectInput{
			Title: title, Objective: "完成两组阶段成果并通过联合验收", Visibility: visibility,
			Milestones: []MilestoneInput{
				{GroupID: &mechID, Name: "机械底盘", Criteria: "完成底盘装配并留存验收记录"},
				{GroupID: &controlsID, Name: "电控系统", Criteria: "完成控制联调并留存测试结果"},
				{GroupID: nil, Name: "联合验收", Criteria: "两组阶段均验收后完成整机联调"},
			},
			Participants: []ParticipantInput{{GroupID: mechID, UserID: mechanicalMember.ID}, {GroupID: controlsID, UserID: controlsMember.ID}},
		})
		if err != nil {
			t.Fatalf("create synthetic project %s: %v", title, err)
		}
		createdProjectIDs = append(createdProjectIDs, result.ID)
		return result
	}
	privateProject := createProject("[P4 TEST] private collaboration", model.ExpeditionVisibilityParticipants)
	teamProject := createProject("[P4 TEST] team collaboration", model.ExpeditionVisibilityTeam)
	if len(privateProject.Participants) != 2 || len(privateProject.Events) != 4 {
		t.Fatalf("project participants/history = %d/%d, want 2/4", len(privateProject.Participants), len(privateProject.Events))
	}

	listedForOperations, err := service.ListMine(context.Background(), operationsMember)
	if err != nil {
		t.Fatalf("list team-visible projects for operations group: %v", err)
	}
	if hasProject(listedForOperations, privateProject.ID) || !hasProject(listedForOperations, teamProject.ID) {
		t.Fatal("private project visibility must require explicit participation while team projects stay visible to the team")
	}
	listedForObserver, err := service.ListMine(context.Background(), mechanicalObserver)
	if err != nil {
		t.Fatalf("list project for non-participant: %v", err)
	}
	if hasProject(listedForObserver, privateProject.ID) {
		t.Fatal("same-group non-participant must not see a participants-only project")
	}
	_, err = service.SubmitEvidence(context.Background(), mechanicalObserver, privateProject.Milestones[0].ID, "unauthorized synthetic evidence")
	assertExpeditionStatus(t, err, http.StatusForbidden)

	adminProjects, err := service.ListAdmin(context.Background(), mechanicalAdmin)
	if err != nil {
		t.Fatalf("list mechanical-admin projects: %v", err)
	}
	adminProject := projectByID(adminProjects, privateProject.ID)
	if adminProject == nil || len(adminProject.Milestones) != 1 || adminProject.Milestones[0].GroupName != "机械组" || len(adminProject.Participants) != 1 {
		t.Fatalf("mechanical admin view leaked or omitted group scope: %#v", adminProject)
	}
	if _, err := service.CreateProject(context.Background(), mechanicalAdmin, ProjectInput{}); statusOf(err) != http.StatusForbidden {
		t.Fatalf("ordinary administrator project creation status = %d, want 403", statusOf(err))
	}
	mechanicalMilestone, controlsMilestone, finalMilestone := privateProject.Milestones[0], privateProject.Milestones[1], privateProject.Milestones[2]
	_, err = service.SubmitEvidence(context.Background(), mechanicalMember, mechanicalMilestone.ID, "底盘已按检查清单完成装配")
	if err != nil {
		t.Fatalf("mechanical participant evidence: %v", err)
	}
	_, err = service.ReviewMilestone(context.Background(), mechanicalAdmin, mechanicalMilestone.ID, ReviewInput{Action: "accept", Content: "按底盘验收清单完成确认"})
	if err != nil {
		t.Fatalf("mechanical group acceptance: %v", err)
	}
	_, err = service.SubmitEvidence(context.Background(), controlsMember, controlsMilestone.ID, "控制器联调日志及实测结果已附")
	if err != nil {
		t.Fatalf("controls participant evidence: %v", err)
	}
	_, err = service.ReviewMilestone(context.Background(), mechanicalAdmin, controlsMilestone.ID, ReviewInput{Action: "accept", Content: "越组验收尝试"})
	assertExpeditionStatus(t, err, http.StatusForbidden)
	if _, err := service.SubmitEvidence(context.Background(), super, finalMilestone.ID, "未完成组别验收的联合材料"); statusOf(err) != http.StatusConflict {
		t.Fatalf("early joint evidence status = %d, want 409", statusOf(err))
	}
	var mechanicalMembership model.UserGroupMember
	if err := db.Where("user_id = ? AND group_id = ?", mechanicalMember.ID, mechID).Take(&mechanicalMembership).Error; err != nil {
		t.Fatalf("load mechanical participant membership: %v", err)
	}
	if err := db.Delete(&mechanicalMembership).Error; err != nil {
		t.Fatalf("remove mechanical participant membership: %v", err)
	}
	_, err = service.SubmitEvidence(context.Background(), mechanicalMember, mechanicalMilestone.ID, "removed members must not submit")
	assertExpeditionStatus(t, err, http.StatusForbidden)
	mechanicalMembership.ID = 0
	if err := db.Create(&mechanicalMembership).Error; err != nil {
		t.Fatalf("restore mechanical participant membership: %v", err)
	}
	createdMembershipIDs = append(createdMembershipIDs, mechanicalMembership.ID)
	_, err = service.ReviewMilestone(context.Background(), visionAdmin, controlsMilestone.ID, ReviewInput{Action: "accept", Content: "错误组别管理员"})
	assertExpeditionStatus(t, err, http.StatusForbidden)
	_, err = service.ReviewMilestone(context.Background(), createActor("controls-admin", model.RoleNameAdmin, "电控组"), controlsMilestone.ID, ReviewInput{Action: "accept", Content: "完成控制系统验收"})
	if err != nil {
		t.Fatalf("controls group acceptance: %v", err)
	}
	_, err = service.SubmitEvidence(context.Background(), super, finalMilestone.ID, "联合实测记录通过双方代表复核")
	if err != nil {
		t.Fatalf("joint evidence after group acceptance: %v", err)
	}
	completed, err := service.ReviewMilestone(context.Background(), super, finalMilestone.ID, ReviewInput{Action: "accept", Content: "整机联合验收记录已核对"})
	if err != nil {
		t.Fatalf("super-admin joint acceptance: %v", err)
	}
	if !completed.HasAcceptedJoint || len(completed.AcceptedGroupNames) != 2 {
		t.Fatalf("accepted base evolution = groups %v, joint %v", completed.AcceptedGroupNames, completed.HasAcceptedJoint)
	}
	if _, err := service.ReviewMilestone(context.Background(), mechanicalAdmin, mechanicalMilestone.ID, ReviewInput{Action: "revoke", Content: "尝试跳过联合撤销"}); statusOf(err) != http.StatusConflict {
		t.Fatalf("group revoke before joint revoke status = %d, want 409", statusOf(err))
	}
	_, err = service.ReviewMilestone(context.Background(), super, finalMilestone.ID, ReviewInput{Action: "revoke", Content: "联合测试记录需复核"})
	if err != nil {
		t.Fatalf("joint revoke: %v", err)
	}
	_, err = service.ReviewMilestone(context.Background(), mechanicalAdmin, mechanicalMilestone.ID, ReviewInput{Action: "revoke", Content: "底盘验收发现检查遗漏"})
	if err != nil {
		t.Fatalf("group acceptance revoke: %v", err)
	}
	current, err := service.ListMine(context.Background(), mechanicalMember)
	if err != nil {
		t.Fatalf("refresh project after revocation: %v", err)
	}
	state := projectByID(current, privateProject.ID)
	if state == nil || len(state.AcceptedGroupNames) != 1 || state.AcceptedGroupNames[0] != "电控组" || state.HasAcceptedJoint {
		t.Fatalf("revoked project state did not update: %#v", state)
	}
	var eventCount int64
	if err := db.Model(&model.ExpeditionProjectEvent{}).Where("project_id = ?", privateProject.ID).Count(&eventCount).Error; err != nil {
		t.Fatal(err)
	}
	if eventCount != 12 {
		t.Fatalf("append-only event count = %d, want 12", eventCount)
	}
}

func hasProject(projects []ProjectView, id uint64) bool { return projectByID(projects, id) != nil }
func projectByID(projects []ProjectView, id uint64) *ProjectView {
	for index := range projects {
		if projects[index].ID == id {
			return &projects[index]
		}
	}
	return nil
}
func assertExpeditionStatus(t *testing.T, err error, want int) {
	t.Helper()
	if statusOf(err) != want {
		t.Fatalf("service status = %d (err=%v), want %d", statusOf(err), err, want)
	}
}
func statusOf(err error) int {
	var serviceErr *ServiceError
	if err == nil {
		return 0
	}
	if errors.As(err, &serviceErr) {
		return serviceErr.Status
	}
	return http.StatusInternalServerError
}
