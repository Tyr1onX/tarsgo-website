package weeklyreport

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"tarsgo-backend/database"
	"tarsgo-backend/model"
	"tarsgo-backend/service/adminuser"
)

func TestWeeklyReportAllMemberAndGroupScopeAcceptance(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TARSGO_QA_TEST_DSN"))
	if dsn == "" {
		t.Skip("TARSGO_QA_TEST_DSN is not set")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("refusing weekly report acceptance test outside the isolated local acceptance database")
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
	// The DSN guard already constrains this test to the isolated local database.
	// Use the test environment to avoid re-running the persistent acceptance seed.
	if err := database.RunMigrations(context.Background(), db, "test"); err != nil {
		t.Fatalf("apply migrations to isolated acceptance database: %v", err)
	}
	if !db.Migrator().HasColumn(&model.WeeklyReport{}, "Gains") {
		t.Fatal("isolated database is missing weekly report gains column")
	}

	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	groupA := model.UserGroup{Name: "[TEST_WEEKLY] mechanical-" + suffix, Status: model.UserGroupStatusActive}
	groupB := model.UserGroup{Name: "[TEST_WEEKLY] operations-" + suffix, Status: model.UserGroupStatusActive}
	if err := db.Create(&groupA).Error; err != nil {
		t.Fatalf("create isolated group A: %v", err)
	}
	if err := db.Create(&groupB).Error; err != nil {
		t.Fatalf("create isolated group B: %v", err)
	}
	roleIDs := map[string]uint64{}
	for _, name := range []string{model.RoleNameUser, model.RoleNameAdmin, model.RoleNameSuperAdmin} {
		var role model.Role
		if err := db.Where("name = ?", name).First(&role).Error; err != nil {
			t.Fatalf("load canonical system role %s: %v", name, err)
		}
		roleIDs[name] = role.ID
	}
	createUser := func(label, roleName string) model.User {
		t.Helper()
		name := "[TEST_WEEKLY] " + label
		user := model.User{RoleID: roleIDs[roleName], Name: name, Email: strings.ToLower(strings.ReplaceAll(name, " ", "")) + "-" + suffix + "@example.test", Status: model.UserStatusEnabled}
		if err := db.Create(&user).Error; err != nil {
			t.Fatalf("create isolated %s account: %v", label, err)
		}
		return user
	}
	adminA := createUser("admin-a", model.RoleNameAdmin)
	memberA := createUser("leader-member-a", model.RoleNameUser)
	adminB := createUser("admin-b", model.RoleNameAdmin)
	memberB := createUser("member-b", model.RoleNameUser)
	superAdmin := createUser("super-admin", model.RoleNameSuperAdmin)
	unassigned := createUser("unassigned", model.RoleNameUser)
	ids := []uint64{adminA.ID, memberA.ID, adminB.ID, memberB.ID, superAdmin.ID, unassigned.ID}
	groupIDs := []uint64{groupA.ID, groupB.ID}
	cleanup := func() {
		_ = db.Where("user_id IN ?", ids).Delete(&model.WeeklyReport{}).Error
		_ = db.Where("user_id IN ? OR group_id IN ?", ids, groupIDs).Delete(&model.UserGroupMember{}).Error
		_ = db.Where("actor_id IN ?", ids).Delete(&model.AuditLog{}).Error
		_ = db.Where("id IN ?", ids).Delete(&model.User{}).Error
		_ = db.Where("id IN ?", groupIDs).Delete(&model.UserGroup{}).Error
	}
	t.Cleanup(cleanup)
	memberships := []model.UserGroupMember{
		{GroupID: groupA.ID, UserID: adminA.ID, Role: model.UserGroupMemberRoleMember},
		{GroupID: groupA.ID, UserID: memberA.ID, Role: model.UserGroupMemberRoleLeader},
		{GroupID: groupB.ID, UserID: adminB.ID, Role: model.UserGroupMemberRoleMember},
		{GroupID: groupB.ID, UserID: memberB.ID, Role: model.UserGroupMemberRoleMember},
	}
	if err := db.Create(&memberships).Error; err != nil {
		t.Fatalf("create isolated active memberships: %v", err)
	}

	service := NewService(NewGormRepository(db))
	input := ReportInput{Completed: "学习并完成底盘设计", Gains: "掌握了装配基准", Blockers: "需要复核公差", NextPlan: "完善图纸"}
	adminAReport, err := service.SaveCurrentReport(context.Background(), adminA.ID, input)
	if err != nil || adminAReport.GroupID == nil || *adminAReport.GroupID != groupA.ID {
		t.Fatalf("ordinary administrator could not submit a personal report: %#v, error=%v", adminAReport, err)
	}
	memberReport, err := service.SaveCurrentReport(context.Background(), memberA.ID, input)
	if err != nil || memberReport.GroupID == nil || *memberReport.GroupID != groupA.ID {
		t.Fatalf("technical member report was not created in their group: %#v, error=%v", memberReport, err)
	}
	if _, err := service.SaveCurrentReport(context.Background(), memberB.ID, input); err != nil {
		t.Fatalf("member in the second group could not submit: %v", err)
	}
	if _, err := service.SaveCurrentReport(context.Background(), adminB.ID, input); err != nil {
		t.Fatalf("administrator in the second group could not submit: %v", err)
	}
	superAdminReport, err := service.SaveCurrentReport(context.Background(), superAdmin.ID, input)
	if err != nil || superAdminReport.GroupID != nil {
		t.Fatalf("super admin without a group could not submit a private personal report: %#v, error=%v", superAdminReport, err)
	}
	unassignedReport, err := service.SaveCurrentReport(context.Background(), unassigned.ID, input)
	if err != nil || unassignedReport.GroupID != nil {
		t.Fatalf("unassigned valid member report was not retained as personal: %#v, error=%v", unassignedReport, err)
	}
	ownerDashboard, err := service.GetDashboard(context.Background(), unassigned.ID, model.RoleNameUser)
	if err != nil || len(ownerDashboard.Reports) != 1 || ownerDashboard.CanViewTeam {
		t.Fatalf("unassigned member could not view their private report: %#v, error=%v", ownerDashboard, err)
	}
	if _, err := service.UpdateReport(context.Background(), memberB.ID, memberReport.ID, input); err == nil {
		t.Fatal("member must not update another user's private report")
	}

	teamA, err := service.GetTeamWeek(context.Background(), adminA.ID, model.RoleNameAdmin, groupA.ID, "")
	if err != nil || teamA.GroupID != groupA.ID || teamA.TotalCount != 2 || teamA.SubmittedCount != 2 {
		t.Fatalf("group A report view mismatch: %#v, error=%v", teamA, err)
	}
	if _, err := service.GetTeamWeek(context.Background(), adminA.ID, model.RoleNameAdmin, groupB.ID, ""); err == nil {
		t.Fatal("ordinary admin accessed another group's report list")
	}
	if _, err := service.GetTeamWeek(context.Background(), memberA.ID, model.RoleNameUser, groupA.ID, ""); err == nil {
		t.Fatal("organizational leader title granted team-report access")
	}
	teamB, err := service.GetTeamWeek(context.Background(), superAdmin.ID, model.RoleNameSuperAdmin, groupB.ID, "")
	if err != nil || teamB.GroupID != groupB.ID || teamB.TotalCount != 2 || teamB.SubmittedCount != 2 {
		t.Fatalf("super admin could not select another group's report list: %#v, error=%v", teamB, err)
	}

	accountService := adminuser.NewService(adminuser.NewRepository(db))
	newGroupID := groupB.ID
	if _, err := accountService.UpdateUserGroup(context.Background(), adminuser.Actor{ID: adminA.ID, RoleName: model.RoleNameAdmin}, memberA.ID, &newGroupID); err == nil {
		t.Fatal("ordinary admin unexpectedly changed a member's group")
	}
	if _, err := accountService.UpdateUserGroup(context.Background(), adminuser.Actor{ID: superAdmin.ID, RoleName: model.RoleNameSuperAdmin}, memberA.ID, &newGroupID); err != nil {
		t.Fatalf("super admin could not change the group for a former group leader: %v", err)
	}
	var movedMembership model.UserGroupMember
	if err := db.Where("user_id = ?", memberA.ID).Preload("Group").First(&movedMembership).Error; err != nil {
		t.Fatalf("read moved membership: %v", err)
	}
	if movedMembership.GroupID != groupB.ID || movedMembership.Role != model.UserGroupMemberRoleMember {
		t.Fatalf("moved membership did not separate group assignment from title: %#v", movedMembership)
	}
	memberHistory, err := service.GetDashboard(context.Background(), memberA.ID, model.RoleNameUser)
	if err != nil || len(memberHistory.Reports) != 1 || memberHistory.Reports[0].GroupID == nil || *memberHistory.Reports[0].GroupID != groupA.ID {
		t.Fatalf("group change damaged the author's report history or scope: %#v, error=%v", memberHistory, err)
	}
	teamAfterMove, err := service.GetTeamWeek(context.Background(), adminB.ID, model.RoleNameAdmin, groupB.ID, "")
	if err != nil || teamAfterMove.TotalCount != 3 || teamAfterMove.SubmittedCount != 2 {
		t.Fatalf("moved member report leaked into the new group's scope: %#v, error=%v", teamAfterMove, err)
	}

	var changedRoles []struct {
		Action   string
		Metadata string
	}
	if err := db.Model(&model.AuditLog{}).Select("action, metadata").Where("actor_id = ? AND path = ?", superAdmin.ID, fmt.Sprintf("/api/admin/users/%d/group", memberA.ID)).Find(&changedRoles).Error; err != nil {
		t.Fatalf("read group-change audit history: %v", err)
	}
	if len(changedRoles) != 1 || !strings.Contains(changedRoles[0].Metadata, "\"role\":2") {
		t.Fatalf("group move did not retain the previous organization identity in audit history: %#v", changedRoles)
	}
}
