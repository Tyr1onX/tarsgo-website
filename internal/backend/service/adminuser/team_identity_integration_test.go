package adminuser

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

	"tarsgo-backend/model"
)

func TestAcceptanceDatabasePersistsTeamIdentityAndAuditHistory(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TARSGO_QA_TEST_DSN"))
	if dsn == "" {
		t.Skip("TARSGO_QA_TEST_DSN is not set")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("refusing team identity verification outside the isolated local acceptance database")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatalf("open isolated acceptance database: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal("open isolated acceptance SQL connection")
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	if !db.Migrator().HasColumn(&model.User{}, "TeamIdentityStatus") || !db.Migrator().HasTable(&model.TeamIdentityChange{}) {
		t.Fatal("team identity migration is missing from isolated acceptance database")
	}

	var userRole, superAdminRole model.Role
	if err := db.Where("name = ?", model.RoleNameUser).First(&userRole).Error; err != nil {
		t.Fatalf("load member role: %v", err)
	}
	if err := db.Where("name = ?", model.RoleNameSuperAdmin).First(&superAdminRole).Error; err != nil {
		t.Fatalf("load super-admin role: %v", err)
	}
	nonce := time.Now().UTC().Format("20060102T150405.000000000")
	actor := model.User{RoleID: superAdminRole.ID, Name: "[TEST_QA] 身份操作人", Email: fmt.Sprintf("team-identity-admin-%s@tarsgo.test", nonce), Status: model.UserStatusEnabled}
	target := model.User{RoleID: userRole.ID, Name: "[TEST_QA] 身份成员", Email: fmt.Sprintf("team-identity-member-%s@tarsgo.test", nonce), Status: model.UserStatusEnabled}
	if err := db.Create(&actor).Error; err != nil {
		t.Fatalf("create isolated identity administrator: %v", err)
	}
	if err := db.Create(&target).Error; err != nil {
		_ = db.Delete(&actor).Error
		t.Fatalf("create isolated identity member: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Where("user_id = ? OR actor_user_id = ?", target.ID, actor.ID).Delete(&model.TeamIdentityChange{}).Error; err != nil {
			t.Errorf("clean isolated identity history: %v", err)
		}
		if err := db.Delete(&model.User{}, []uint64{target.ID, actor.ID}).Error; err != nil {
			t.Errorf("clean isolated identity accounts: %v", err)
		}
	})
	if target.TeamIdentityStatus != model.TeamIdentityCommunityMember {
		t.Fatalf("new account default identity = %q, want community_member", target.TeamIdentityStatus)
	}

	service := NewService(NewRepository(db))
	adminActor := Actor{ID: actor.ID, RoleName: model.RoleNameSuperAdmin}
	if _, err := service.UpdateTeamIdentity(context.Background(), adminActor, target.ID, UpdateTeamIdentityInput{
		Status: model.TeamIdentityReserveMember, Reason: "经纳新进入战队培养体系",
	}); err != nil {
		t.Fatalf("promote isolated member to reserve status: %v", err)
	}
	detail, err := service.UpdateTeamIdentity(context.Background(), adminActor, target.ID, UpdateTeamIdentityInput{
		Status: model.TeamIdentityFormalMember, Reason: "2026 正式考核通过，负责人确认",
		AssessmentPassed: true, LeaderConfirmed: true,
	})
	if err != nil {
		t.Fatalf("promote isolated member to formal status: %v", err)
	}
	if detail.TeamIdentityStatus != model.TeamIdentityFormalMember || len(detail.TeamIdentityHistory) != 2 {
		t.Fatalf("database identity and audit history mismatch: %#v", detail)
	}
	latest := detail.TeamIdentityHistory[0]
	if latest.PreviousStatus != model.TeamIdentityReserveMember || latest.NextStatus != model.TeamIdentityFormalMember ||
		latest.ActorUserID != actor.ID || latest.ActorName != actor.Name || !latest.AssessmentPassed || !latest.LeaderConfirmed {
		t.Fatalf("formal-member evidence and actor were not durably recorded: %#v", latest)
	}
	var unchanged model.User
	if err := db.First(&unchanged, target.ID).Error; err != nil {
		t.Fatalf("reload isolated account: %v", err)
	}
	if unchanged.RoleID != userRole.ID || unchanged.TeamIdentityStatus != model.TeamIdentityFormalMember {
		t.Fatalf("team identity update changed system permission or failed to persist: role=%d status=%q", unchanged.RoleID, unchanged.TeamIdentityStatus)
	}
}
