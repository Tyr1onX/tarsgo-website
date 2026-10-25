package auth

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/config"
	"tarsgo-backend/model"
)

func TestMariaDBSessionRenewalIntegration(t *testing.T) {
	dsn := os.Getenv("TARSGO_INTEGRATION_MYSQL_DSN")
	if dsn == "" {
		t.Skip("set TARSGO_INTEGRATION_MYSQL_DSN to run the isolated MariaDB integration test")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("connect to isolated MariaDB: %v", err)
	}

	now := time.Now().UTC().Truncate(time.Second)
	marker := fmt.Sprintf("session-renewal-%d", now.UnixNano())
	tx := db.Begin()
	if tx.Error != nil {
		t.Fatalf("begin isolated test transaction: %v", tx.Error)
	}
	t.Cleanup(func() { _ = tx.Rollback().Error })

	sessionToken := marker + "-session"
	vaultToken := marker + "-vault"
	createdAt := now.Add(-10 * 24 * time.Hour)
	session := model.AuthSession{UserID: 987654321, TokenHash: digestSecret(sessionToken), CreatedAt: createdAt, ExpiresAt: now.Add(12 * time.Hour)}
	vault := model.AccountVault{SecretHash: digestSecret(vaultToken), CreatedAt: createdAt, ExpiresAt: now.Add(12 * time.Hour)}
	if err := tx.Create(&session).Error; err != nil {
		t.Fatalf("create isolated session row: %v", err)
	}
	if err := tx.Create(&vault).Error; err != nil {
		t.Fatalf("create isolated vault row: %v", err)
	}

	service := &Service{
		db:              tx,
		authConfig:      config.AuthConfig{TokenTTL: 72 * time.Hour, CookieMaxAgeSeconds: 72 * 60 * 60},
		now:             func() time.Time { return now },
		lastAuthCleanup: now,
	}
	renewal, err := service.RenewAccountSession(context.Background(), sessionToken, vaultToken)
	if err != nil {
		t.Fatalf("renew isolated session: %v", err)
	}
	if !renewal.AuthRenewed || !renewal.VaultRenewed {
		t.Fatalf("session/container renewal flags = %#v", renewal)
	}
	if renewal.AuthCookieMaxAgeSeconds != 72*60*60 || renewal.VaultCookieMaxAgeSeconds != 72*60*60 {
		t.Fatalf("cookie max-age does not match persisted 72-hour expiration: %#v", renewal)
	}
	var savedSession model.AuthSession
	if err := tx.First(&savedSession, session.ID).Error; err != nil {
		t.Fatalf("read renewed session: %v", err)
	}
	var savedVault model.AccountVault
	if err := tx.First(&savedVault, vault.ID).Error; err != nil {
		t.Fatalf("read renewed account container: %v", err)
	}
	want := now.Add(72 * time.Hour)
	if !savedSession.ExpiresAt.Equal(want) || !savedVault.ExpiresAt.Equal(want) {
		t.Fatalf("persisted session/vault expiry = %s/%s, want %s/%s", savedSession.ExpiresAt, savedVault.ExpiresAt, want, want)
	}
}
