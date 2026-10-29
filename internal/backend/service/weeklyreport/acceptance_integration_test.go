package weeklyreport

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

	"tarsgo-backend/database"
	"tarsgo-backend/model"
	"tarsgo-backend/service/adminuser"
	"tarsgo-backend/service/privatefile"
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
	acceptanceNow := time.Date(2026, time.October, 25, 12, 0, 0, 0, time.FixedZone("Asia/Shanghai", 8*60*60))
	createUser := func(label, roleName string) model.User {
		t.Helper()
		name := "[TEST_WEEKLY] " + label
		lastLoginAt := acceptanceNow
		user := model.User{RoleID: roleIDs[roleName], Name: name, Email: strings.ToLower(strings.ReplaceAll(name, " ", "")) + "-" + suffix + "@example.test", Status: model.UserStatusEnabled, LastLoginAt: &lastLoginAt}
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
	cutoff := adminuser.AccountActivityCutoff(acceptanceNow)
	boundaryMember := createUser("activity-boundary", model.RoleNameUser)
	boundaryMember.LastLoginAt = &cutoff
	if err := db.Save(&boundaryMember).Error; err != nil {
		t.Fatalf("set boundary member login time: %v", err)
	}
	oldLoginMember := createUser("inactive-before-cutoff", model.RoleNameUser)
	oldLoginAt := cutoff.Add(-time.Second)
	oldLoginMember.LastLoginAt = &oldLoginAt
	if err := db.Save(&oldLoginMember).Error; err != nil {
		t.Fatalf("set inactive member login time: %v", err)
	}
	disabledMember := createUser("disabled-recent-login", model.RoleNameUser)
	disabledMember.Status = model.UserStatusDisabled
	if err := db.Save(&disabledMember).Error; err != nil {
		t.Fatalf("disable inactive member: %v", err)
	}
	neverLoggedInMember := createUser("never-logged-in", model.RoleNameUser)
	neverLoggedInMember.LastLoginAt = nil
	if err := db.Save(&neverLoggedInMember).Error; err != nil {
		t.Fatalf("clear never-logged-in member time: %v", err)
	}
	ids := []uint64{adminA.ID, memberA.ID, adminB.ID, memberB.ID, superAdmin.ID, unassigned.ID, boundaryMember.ID, oldLoginMember.ID, disabledMember.ID, neverLoggedInMember.ID}
	groupIDs := []uint64{groupA.ID, groupB.ID}
	cleanup := func() {
		var reportIDs []uint64
		_ = db.Model(&model.WeeklyReport{}).Where("user_id IN ?", ids).Pluck("id", &reportIDs).Error
		_ = db.Where("report_id IN ?", reportIDs).Delete(&model.WeeklyReportAttachment{}).Error
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
		{GroupID: groupA.ID, UserID: boundaryMember.ID, Role: model.UserGroupMemberRoleMember},
		{GroupID: groupA.ID, UserID: oldLoginMember.ID, Role: model.UserGroupMemberRoleMember},
		{GroupID: groupA.ID, UserID: disabledMember.ID, Role: model.UserGroupMemberRoleMember},
		{GroupID: groupA.ID, UserID: neverLoggedInMember.ID, Role: model.UserGroupMemberRoleMember},
		{GroupID: groupB.ID, UserID: adminB.ID, Role: model.UserGroupMemberRoleMember},
		{GroupID: groupB.ID, UserID: memberB.ID, Role: model.UserGroupMemberRoleMember},
	}
	if err := db.Create(&memberships).Error; err != nil {
		t.Fatalf("create isolated active memberships: %v", err)
	}
	historicalReports := []model.WeeklyReport{
		{GroupID: &groupA.ID, UserID: oldLoginMember.ID, WeekStart: "2026-10-12", Completed: "旧成员历史记录", Gains: "旧收获", Blockers: "旧问题", NextPlan: "旧计划"},
		{GroupID: &groupA.ID, UserID: disabledMember.ID, WeekStart: "2026-10-12", Completed: "停用成员历史记录", Gains: "旧收获", Blockers: "旧问题", NextPlan: "旧计划"},
		{GroupID: &groupA.ID, UserID: neverLoggedInMember.ID, WeekStart: "2026-10-12", Completed: "未登录成员历史记录", Gains: "旧收获", Blockers: "旧问题", NextPlan: "旧计划"},
	}
	if err := db.Create(&historicalReports).Error; err != nil {
		t.Fatalf("create preserved historical reports for inactive accounts: %v", err)
	}

	attachmentStore, err := privatefile.NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	service := NewService(NewGormRepository(db), attachmentStore)
	service.now = func() time.Time { return acceptanceNow }
	input := ReportInput{Completed: "学习并完成底盘设计", Gains: "掌握了装配基准", Blockers: "需要复核公差", NextPlan: "完善图纸"}
	adminAReport, err := service.SaveCurrentReport(context.Background(), adminA.ID, input)
	if err != nil || adminAReport.GroupID == nil || *adminAReport.GroupID != groupA.ID {
		t.Fatalf("ordinary administrator could not submit a personal report: %#v, error=%v", adminAReport, err)
	}
	memberReport, err := service.SaveCurrentReport(context.Background(), memberA.ID, input)
	if err != nil || memberReport.GroupID == nil || *memberReport.GroupID != groupA.ID {
		t.Fatalf("technical member report was not created in their group: %#v, error=%v", memberReport, err)
	}

	upload := weeklyReportUpload(t, "设计图.pdf", []byte("%PDF-1.7\nprivate weekly report attachment"))
	attachments, err := service.UploadAttachments(context.Background(), Actor{ID: memberA.ID, RoleName: model.RoleNameUser}, memberReport.ID, []*multipart.FileHeader{upload})
	if err != nil || len(attachments) != 1 || attachments[0].FileName != "设计图.pdf" {
		t.Fatalf("member could not upload a weekly report attachment: %#v, error=%v", attachments, err)
	}
	oversizedTotal := model.WeeklyReportAttachment{
		ReportID: memberReport.ID, FileName: "超过单篇总量.pdf",
		StoragePath: fmt.Sprintf("%d/%d/rejected.pdf", memberReport.ID, memberA.ID),
		ContentType: "application/pdf", ContentHash: strings.Repeat("a", 64),
		Size: privatefile.MaxFilesTotal, CreatedAt: acceptanceNow,
	}
	if _, err := NewGormRepository(db).CreateReportAttachments(context.Background(), memberA.ID, memberReport.ID, []model.WeeklyReportAttachment{oversizedTotal}); !errors.Is(err, ErrAttachmentSizeLimit) {
		t.Fatalf("repository did not recheck the aggregate attachment size inside its transaction: %v", err)
	}
	ownerDashboardWithFile, err := service.GetDashboard(context.Background(), memberA.ID, model.RoleNameUser)
	if err != nil || len(ownerDashboardWithFile.Reports) != 1 || len(ownerDashboardWithFile.Reports[0].Attachments) != 1 {
		t.Fatalf("member could not see attachment metadata in their own report: %#v, error=%v", ownerDashboardWithFile, err)
	}
	teamWithFile, err := service.GetTeamWeek(context.Background(), adminA.ID, model.RoleNameAdmin, groupA.ID, "")
	if err != nil {
		t.Fatalf("same-group admin could not read the weekly report list with attachment metadata: %v", err)
	}
	teamFoundAttachment := false
	for _, member := range teamWithFile.Members {
		if member.UserID == memberA.ID && member.Report != nil && len(member.Report.Attachments) == 1 {
			teamFoundAttachment = true
		}
	}
	if !teamFoundAttachment {
		t.Fatalf("authorized group report omitted attachment metadata: %#v", teamWithFile)
	}
	// Re-uploading identical content keeps one private file record.
	attachments, err = service.UploadAttachments(context.Background(), Actor{ID: memberA.ID, RoleName: model.RoleNameUser}, memberReport.ID, []*multipart.FileHeader{weeklyReportUpload(t, "设计图-副本.pdf", []byte("%PDF-1.7\nprivate weekly report attachment"))})
	if err != nil || len(attachments) != 1 {
		t.Fatalf("duplicate weekly report content was stored twice: %#v, error=%v", attachments, err)
	}
	ownerDownload, err := service.OpenAttachment(context.Background(), Actor{ID: memberA.ID, RoleName: model.RoleNameUser}, memberReport.ID, attachments[0].ID)
	if err != nil || string(ownerDownload.Content) != "%PDF-1.7\nprivate weekly report attachment" {
		t.Fatalf("owner could not read their private attachment: %#v, error=%v", ownerDownload, err)
	}
	if _, err := service.OpenAttachment(context.Background(), Actor{ID: boundaryMember.ID, RoleName: model.RoleNameUser}, memberReport.ID, attachments[0].ID); weeklyReportStatus(err) != http.StatusNotFound {
		t.Fatalf("another member read a private weekly report attachment: %v", err)
	}
	if _, err := service.OpenAttachment(context.Background(), Actor{ID: adminA.ID, RoleName: model.RoleNameAdmin}, memberReport.ID, attachments[0].ID); err != nil {
		t.Fatalf("same-group administrator could not read the weekly report attachment: %v", err)
	}
	if _, err := service.OpenAttachment(context.Background(), Actor{ID: adminB.ID, RoleName: model.RoleNameAdmin}, memberReport.ID, attachments[0].ID); weeklyReportStatus(err) != http.StatusNotFound {
		t.Fatalf("cross-group administrator read a private weekly report attachment: %v", err)
	}
	if _, err := service.OpenAttachment(context.Background(), Actor{ID: superAdmin.ID, RoleName: model.RoleNameSuperAdmin}, memberReport.ID, attachments[0].ID); err != nil {
		t.Fatalf("super admin could not read the weekly report attachment: %v", err)
	}
	if err := service.DeleteAttachment(context.Background(), Actor{ID: boundaryMember.ID, RoleName: model.RoleNameUser}, memberReport.ID, attachments[0].ID); weeklyReportStatus(err) != http.StatusNotFound {
		t.Fatalf("another member deleted a private weekly report attachment: %v", err)
	}
	if err := service.DeleteAttachment(context.Background(), Actor{ID: memberA.ID, RoleName: model.RoleNameUser}, memberReport.ID, attachments[0].ID); err != nil {
		t.Fatalf("owner could not delete their weekly report attachment: %v", err)
	}
	if _, err := service.OpenAttachment(context.Background(), Actor{ID: memberA.ID, RoleName: model.RoleNameUser}, memberReport.ID, attachments[0].ID); weeklyReportStatus(err) != http.StatusNotFound {
		t.Fatalf("deleted weekly report attachment remained accessible: %v", err)
	}
	attachments, err = service.UploadAttachments(context.Background(), Actor{ID: memberA.ID, RoleName: model.RoleNameUser}, memberReport.ID, []*multipart.FileHeader{weeklyReportUpload(t, "设计图.pdf", []byte("%PDF-1.7\nprivate weekly report attachment"))})
	if err != nil || len(attachments) != 1 {
		t.Fatalf("owner could not re-add an attachment after deletion: %#v, error=%v", attachments, err)
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
	if err != nil || teamA.GroupID != groupA.ID || teamA.TotalCount != 3 || teamA.SubmittedCount != 2 || len(teamA.AvailableWeeks) != 2 || teamA.AvailableWeeks[0] != "2026-10-19" || teamA.AvailableWeeks[1] != "2026-10-12" {
		t.Fatalf("group A report view mismatch: %#v, error=%v", teamA, err)
	}
	teamHistory, err := service.GetTeamWeek(context.Background(), adminA.ID, model.RoleNameAdmin, groupA.ID, "2026-10-12")
	if err != nil || teamHistory.TotalCount != 3 || teamHistory.SubmittedCount != 0 {
		t.Fatalf("inactive members' historical reports must not appear in the active roster: %#v, error=%v", teamHistory, err)
	}
	var preservedHistoricalCount int64
	if err := db.Model(&model.WeeklyReport{}).Where("user_id IN ? AND week_start = ?", []uint64{oldLoginMember.ID, disabledMember.ID, neverLoggedInMember.ID}, "2026-10-12").Count(&preservedHistoricalCount).Error; err != nil {
		t.Fatalf("count preserved inactive-member history: %v", err)
	}
	if preservedHistoricalCount != 3 {
		t.Fatalf("inactive member history was modified or deleted: got %d rows, want 3", preservedHistoricalCount)
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

func weeklyReportUpload(t *testing.T, fileName string, content []byte) *multipart.FileHeader {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("files", fileName)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	if err := request.ParseMultipartForm(1 << 20); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = request.MultipartForm.RemoveAll() })
	return request.MultipartForm.File["files"][0]
}

func weeklyReportStatus(err error) int {
	var serviceErr *ServiceError
	if errors.As(err, &serviceErr) {
		return serviceErr.Status
	}
	return 0
}
