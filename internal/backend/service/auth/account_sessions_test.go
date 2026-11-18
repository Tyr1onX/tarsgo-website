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
)

func TestUnknownSignedLookingTokenIsRejected(t *testing.T) {
	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	db, err := gorm.Open(mysqlDriver.New(mysqlDriver.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true})
	if err != nil {
		t.Fatal(err)
	}
	token := "header.payload.signature"
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `auth_sessions` WHERE token_hash = ? ORDER BY `auth_sessions`.`id` LIMIT ?")).
		WithArgs(digestSecret(token), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "token_hash", "expires_at", "revoked_at", "created_at", "updated_at"}))

	service := &Service{db: db}
	_, err = service.CurrentUser(context.Background(), token)
	serviceErr, ok := err.(*ServiceError)
	if !ok || serviceErr.Status != http.StatusUnauthorized {
		t.Fatalf("CurrentUser error = %v, want unauthorized for unknown token", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
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
