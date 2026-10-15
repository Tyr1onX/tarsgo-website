package auth

import (
	"context"
	"net/http"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	mysqlDriver "gorm.io/driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/config"
)

func TestRevokedLegacyJWTDoesNotFallBackToSignatureValidation(t *testing.T) {
	now := time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)
	token, err := SignToken("test-secret", Claims{
		Subject:   "42",
		Email:     "legacy@example.test",
		Role:      "admin",
		IssuedAt:  now.Add(-time.Minute).Unix(),
		ExpiresAt: now.Add(time.Hour).Unix(),
	})
	if err != nil {
		t.Fatalf("sign legacy token: %v", err)
	}

	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sql mock: %v", err)
	}
	defer sqlDB.Close()
	db, err := gorm.Open(mysqlDriver.New(mysqlDriver.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true})
	if err != nil {
		t.Fatalf("open gorm: %v", err)
	}

	service := &Service{db: db, authConfig: config.AuthConfig{JWTSecret: "test-secret"}, now: func() time.Time { return now }}
	tokenHash := digestSecret(token)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `auth_sessions` WHERE token_hash = ? ORDER BY `auth_sessions`.`id` LIMIT ?")).
		WithArgs(tokenHash, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "token_hash", "expires_at", "revoked_at", "created_at", "updated_at"}).AddRow(
			uint64(1), uint64(42), tokenHash, now.Add(time.Hour), now.Add(-time.Second), now, now,
		))

	_, err = service.CurrentUser(context.Background(), token)
	serviceErr, ok := err.(*ServiceError)
	if !ok || serviceErr.Status != http.StatusUnauthorized {
		t.Fatalf("CurrentUser error = %v, want unauthorized for revoked legacy JWT", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet database expectation: %v", err)
	}
}

func TestRevokeLegacyJWTPersistsDigestUntilOriginalExpiry(t *testing.T) {
	// ParseToken validates expiry against the real clock, so keep this token
	// valid independently of when the test suite runs.
	now := time.Now().UTC().Truncate(time.Second)
	expiresAt := now.Add(3 * time.Hour)
	token, err := SignToken("test-secret", Claims{
		Subject:   "17",
		Email:     "legacy@example.test",
		Role:      "user",
		IssuedAt:  now.Add(-time.Minute).Unix(),
		ExpiresAt: expiresAt.Unix(),
	})
	if err != nil {
		t.Fatalf("sign legacy token: %v", err)
	}

	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sql mock: %v", err)
	}
	defer sqlDB.Close()
	db, err := gorm.Open(mysqlDriver.New(mysqlDriver.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true})
	if err != nil {
		t.Fatalf("open gorm: %v", err)
	}

	service := &Service{db: db, authConfig: config.AuthConfig{JWTSecret: "test-secret"}, now: func() time.Time { return now }}
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `auth_sessions` WHERE token_hash = ? ORDER BY `auth_sessions`.`id` LIMIT ?")).
		WithArgs(digestSecret(token), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "token_hash", "expires_at", "revoked_at", "created_at", "updated_at"}))
	mock.ExpectExec("INSERT INTO `auth_sessions`").
		WithArgs(uint64(17), digestSecret(token), time.Unix(expiresAt.Unix(), 0), now).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	if err := db.Transaction(func(tx *gorm.DB) error {
		return service.revokeLegacyJWTTx(tx, token, 17, now)
	}); err != nil {
		t.Fatalf("revoke legacy token: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet database expectation: %v", err)
	}
}

func TestRevokeSessionTokenInvalidatesUnlinkedOpaqueSession(t *testing.T) {
	now := time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)
	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sql mock: %v", err)
	}
	defer sqlDB.Close()
	db, err := gorm.Open(mysqlDriver.New(mysqlDriver.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true})
	if err != nil {
		t.Fatalf("open gorm: %v", err)
	}

	service := &Service{}
	token := "opaque-session-token"
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("UPDATE `auth_sessions` SET `revoked_at`=?,`updated_at`=? WHERE token_hash = ? AND revoked_at IS NULL")).
		WithArgs(now, sqlmock.AnyArg(), digestSecret(token)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	if err := db.Transaction(func(tx *gorm.DB) error {
		return service.revokeSessionTokenTx(tx, token, now)
	}); err != nil {
		t.Fatalf("revoke session token: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet database expectation: %v", err)
	}
}
