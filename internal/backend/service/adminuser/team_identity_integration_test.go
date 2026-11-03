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

func TestAcceptanceDatabasePersistsTeamIdentityWithoutAuditHistory(t *testing.T) {
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
	if !db.Migrator().HasColumn(&model.User{}, "TeamIdentityStatus") || db.Migrator().HasTable("team_identity_changes") {
		t.Fatal("team identity status column must remain and obsolete history table must be removed")
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
		if err := db.Delete(&model.User{}, []uint64{target.ID, actor.ID}).Error; err != nil {
			t.Errorf("clean isolated identity accounts: %v", err)
		}
	})
	if target.TeamIdentityStatus != model.TeamIdentityCommunityMember {
		t.Fatalf("new account default identity = %q, want community_member", target.TeamIdentityStatus)
	}

	service := NewService(NewRepository(db))
	adminActor := Actor{ID: actor.ID, RoleName: model.RoleNameSuperAdmin}
	for _, status := range []string{model.TeamIdentityReserveMember, model.TeamIdentityFormalMember} {
		if _, err := service.UpdateTeamIdentity(context.Background(), adminActor, target.ID, UpdateTeamIdentityInput{Status: status}); err != nil {
			t.Fatalf("set isolated member identity to %q: %v", status, err)
		}
	}
	var unchanged model.User
	if err := db.First(&unchanged, target.ID).Error; err != nil {
		t.Fatalf("reload isolated account: %v", err)
	}
	if unchanged.RoleID != userRole.ID || unchanged.Status != model.UserStatusEnabled || unchanged.TeamIdentityStatus != model.TeamIdentityFormalMember {
		t.Fatalf("team identity update changed other account fields or failed to persist: role=%d accountStatus=%d identity=%q", unchanged.RoleID, unchanged.Status, unchanged.TeamIdentityStatus)
	}
}
