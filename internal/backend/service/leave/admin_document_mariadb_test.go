package leave

import (
	"context"
	"os"
	"strings"
	"testing"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/model"
)

func TestMariaDBAdminGenerateDoesNotGrantOrConsumeMemberAccess(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated database required")
	}
	setLeaveTemplateTestAssets(t)
	t.Setenv("LEAVE_CONTACT_PHONE", "0431-00000000")
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	tx := db.Begin()
	if tx.Error != nil {
		t.Fatal(tx.Error)
	}
	defer tx.Rollback()

	var admin model.User
	if err := tx.Where("email = ?", "test-super-admin@tarsgo.test").First(&admin).Error; err != nil {
		t.Fatal(err)
	}
	name := "代生成测试成员"
	student := true
	member := model.User{
		RoleID: admin.RoleID, Email: "manual-leave-test@tarsgo.test",
		RealName: &name, IsStudent: &student, StudentID: "26990001",
		College: "通信工程学院", Status: model.UserStatusEnabled,
	}
	if err := tx.Create(&member).Error; err != nil {
		t.Fatal(err)
	}
	access := model.LeaveAccessRequest{UserID: member.ID, Status: model.LeaveAccessRevoked, RequestedAt: tx.NowFunc()}
	if err := tx.Create(&access).Error; err != nil {
		t.Fatal(err)
	}
	service := NewService(tx)
	content, filename, err := service.AdminGenerateDailyDocument(context.Background(), admin.ID, member.ID, RequestInput{
		StartAt: "2026-11-17T08:00", EndAt: "2026-11-17T17:00",
	}, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(content) == 0 || !strings.Contains(filename, name) {
		t.Fatalf("invalid generated document: %d bytes, filename %q", len(content), filename)
	}
	var after model.LeaveAccessRequest
	if err := tx.Where("user_id = ?", member.ID).First(&after).Error; err != nil {
		t.Fatal(err)
	}
	if after.Status != model.LeaveAccessRevoked {
		t.Fatalf("admin generated document must not grant a revoked member: status=%q", after.Status)
	}
	var entry model.DailyLeaveEntry
	if err := tx.Where("user_id = ? AND student_id_snapshot = ?", member.ID, member.StudentID).First(&entry).Error; err != nil {
		t.Fatal(err)
	}
	var history model.DailyLeaveDocumentRequest
	if err := tx.Where("entry_id = ? AND request_stage = ?", entry.ID, "download").First(&history).Error; err != nil {
		t.Fatal(err)
	}
	if history.UserID == nil || *history.UserID != admin.ID {
		t.Fatalf("audit must record admin as actor: %#v", history.UserID)
	}

	// The administrator can create another letter without altering permissions.
	if _, _, err := service.AdminGenerateDailyDocument(context.Background(), admin.ID, member.ID, RequestInput{
		StartAt: "2026-11-18T08:00", EndAt: "2026-11-18T17:00",
	}, true); err != nil {
		t.Fatal(err)
	}
	var count int64
	if err := tx.Model(&model.DailyLeaveEntry{}).Where("user_id = ? AND window_id IS NULL", member.ID).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("expected two audited administrator-generated letters, got %d", count)
	}
}
