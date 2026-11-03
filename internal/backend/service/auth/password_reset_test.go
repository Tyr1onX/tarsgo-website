package auth

import (
	"bytes"
	"context"
	"errors"
	"log"
	"net/http"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"

	"tarsgo-backend/config"
	"tarsgo-backend/model"
	"tarsgo-backend/service/email"
)

type passwordResetMailerStub struct {
	err     error
	calls   int
	message email.Message
}

func (m *passwordResetMailerStub) SendEmail(_ context.Context, message email.Message) error {
	m.calls++
	m.message = message
	return m.err
}

func TestPasswordResetRequestDoesNotDiscloseUnknownEmail(t *testing.T) {
	db, mock := newAuthSQLMock(t)
	service := &Service{db: db, authConfig: config.AuthConfig{}, now: time.Now}
	expectBootstrapCompleted(mock)
	mock.ExpectQuery("SELECT .* FROM .*users.* WHERE email =").WithArgs("missing@example.test", 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "email"}))
	if err := service.SendPasswordResetCode(context.Background(), "  MISSING@example.test "); err != nil {
		t.Fatalf("unknown email should receive generic success: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestPasswordResetRequestDoesNotSendForDisabledAccount(t *testing.T) {
	db, mock := newAuthSQLMock(t)
	mailer := &passwordResetMailerStub{}
	service := &Service{db: db, authConfig: config.AuthConfig{}, now: time.Now, mailer: mailer}
	expectBootstrapCompleted(mock)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT users.*, "+strings.Join(strings.Fields(model.WorkbenchAccessSQL), " ")+" FROM `users` WHERE email = ? ORDER BY `users`.`id` LIMIT ?")).
		WithArgs("disabled@example.test", 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "role_id", "email", "status"}).AddRow(uint64(19), uint64(3), "disabled@example.test", model.UserStatusDisabled))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `roles` WHERE `roles`.`id` = ?")).
		WithArgs(uint64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "display_name"}).AddRow(uint64(3), model.RoleNameUser, "普通用户"))
	if err := service.SendPasswordResetCode(context.Background(), "disabled@example.test"); err != nil {
		t.Fatalf("disabled email should receive generic success: %v", err)
	}
	if mailer.calls != 0 {
		t.Fatalf("disabled account received %d reset emails", mailer.calls)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestPasswordResetMailFailureKeepsGenericSuccessAndSafeLogs(t *testing.T) {
	db, mock := newAuthSQLMock(t)
	secretMarker := "provider-detail-with-code-654321"
	mailer := &passwordResetMailerStub{err: errors.New(secretMarker)}
	now := time.Date(2026, 11, 2, 10, 0, 0, 0, time.UTC)
	service := &Service{db: db, authConfig: config.AuthConfig{}, now: func() time.Time { return now }, mailer: mailer}
	expectBootstrapCompleted(mock)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT users.*, "+strings.Join(strings.Fields(model.WorkbenchAccessSQL), " ")+" FROM `users` WHERE email = ? ORDER BY `users`.`id` LIMIT ?")).
		WithArgs("member@example.test", 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "role_id", "email", "status"}).AddRow(uint64(7), uint64(3), "member@example.test", model.UserStatusEnabled))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `roles` WHERE `roles`.`id` = ?")).
		WithArgs(uint64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "display_name"}).AddRow(uint64(3), model.RoleNameUser, "普通用户"))
	mock.ExpectQuery("SELECT \\* FROM `email_codes` WHERE email = \\? AND purpose = \\? ORDER BY `email_codes`.`id` LIMIT \\?").
		WithArgs("member@example.test", model.EmailCodePurposePasswordReset, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO `email_codes`").WillReturnResult(sqlmock.NewResult(23, 1))
	mock.ExpectCommit()
	mock.ExpectBegin()
	mock.ExpectExec("DELETE FROM `email_codes` WHERE `email_codes`.`id` = \\?").
		WithArgs(uint64(23)).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	var output bytes.Buffer
	previousOutput := log.Writer()
	log.SetOutput(&output)
	t.Cleanup(func() { log.SetOutput(previousOutput) })
	if err := service.SendPasswordResetCode(context.Background(), "member@example.test"); err != nil {
		t.Fatalf("mail delivery failure must not disclose account existence: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("password reset code was not saved before sending: %v", err)
	}
	if mailer.calls != 1 || !strings.Contains(mailer.message.Text, "10 分钟内有效") {
		t.Fatalf("expected one reset email attempt, calls=%d body=%q", mailer.calls, mailer.message.Text)
	}
	if strings.Contains(output.String(), secretMarker) {
		t.Fatalf("provider details leaked into reset logs: %q", output.String())
	}
}

func TestPasswordResetWrongCodeCountsAttemptAndDoesNotChangePassword(t *testing.T) {
	db, mock := newAuthSQLMock(t)
	now := time.Date(2026, 11, 2, 10, 0, 0, 0, time.UTC)
	service := &Service{db: db, authConfig: config.AuthConfig{}, now: func() time.Time { return now }}
	expectBootstrapCompleted(mock)
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT .* FROM .*email_codes.* FOR UPDATE").
		WithArgs("member@example.test", model.EmailCodePurposePasswordReset, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "email", "purpose", "code_hash", "expires_at", "last_sent_at", "failed_attempts"}).
			AddRow(18, "member@example.test", model.EmailCodePurposePasswordReset,
				HashVerificationCode("member@example.test", model.EmailCodePurposePasswordReset, "123456"),
				now.Add(time.Minute), now, 2))
	mock.ExpectExec("UPDATE .*email_codes.* SET .*failed_attempts").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	err := service.ResetPassword(context.Background(), "member@example.test", "999999", "NewPassword456")
	serviceErr, ok := err.(*ServiceError)
	if !ok || serviceErr.Status != http.StatusBadRequest {
		t.Fatalf("wrong code: got %v, want 400", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestPasswordResetRevokesAllSessionsAndConsumesCode(t *testing.T) {
	db, mock := newAuthSQLMock(t)
	now := time.Date(2026, 11, 2, 10, 0, 0, 0, time.UTC)
	service := &Service{db: db, authConfig: config.AuthConfig{}, now: func() time.Time { return now }}
	expectBootstrapCompleted(mock)
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT .* FROM .*email_codes.* FOR UPDATE").
		WithArgs("member@example.test", model.EmailCodePurposePasswordReset, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "email", "purpose", "code_hash", "expires_at", "last_sent_at"}).
			AddRow(18, "member@example.test", model.EmailCodePurposePasswordReset,
				HashVerificationCode("member@example.test", model.EmailCodePurposePasswordReset, "123456"),
				now.Add(time.Minute), now))
	mock.ExpectQuery("SELECT .* FROM .*users.* FOR UPDATE").
		WithArgs("member@example.test", model.UserStatusEnabled, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "email", "status"}).
			AddRow(7, "member@example.test", model.UserStatusEnabled))
	mock.ExpectExec("UPDATE .*email_codes.* SET .*consumed_at").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("UPDATE .*users.* SET .*password_hash").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("UPDATE .*auth_sessions.* SET .*revoked_at").
		WithArgs(now, sqlmock.AnyArg(), uint64(7)).WillReturnResult(sqlmock.NewResult(0, 3))
	mock.ExpectExec("DELETE FROM .*account_vault_entries").
		WithArgs(uint64(7)).WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectCommit()
	if err := service.ResetPassword(context.Background(), "member@example.test", "123456", "NewPassword456"); err != nil {
		t.Fatalf("reset password: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestPasswordResetCodeCannotBeReused(t *testing.T) {
	db, mock := newAuthSQLMock(t)
	now := time.Date(2026, 11, 2, 10, 0, 0, 0, time.UTC)
	service := &Service{db: db, now: func() time.Time { return now }}
	expectBootstrapCompleted(mock)
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT .* FROM .*email_codes.* FOR UPDATE").
		WithArgs("member@example.test", model.EmailCodePurposePasswordReset, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "email", "purpose", "code_hash", "expires_at", "last_sent_at", "consumed_at"}).
			AddRow(18, "member@example.test", model.EmailCodePurposePasswordReset,
				HashVerificationCode("member@example.test", model.EmailCodePurposePasswordReset, "123456"),
				now.Add(time.Minute), now, now.Add(-time.Second)))
	mock.ExpectCommit()
	if err := service.ResetPassword(context.Background(), "member@example.test", "123456", "NewPassword456"); err == nil {
		t.Fatal("replayed code should be rejected")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestPasswordResetRejectsExpiredOrExhaustedCodes(t *testing.T) {
	now := time.Date(2026, 11, 2, 10, 0, 0, 0, time.UTC)
	for _, testCase := range []struct {
		name           string
		expiresAt      time.Time
		failedAttempts int
	}{
		{name: "expired exactly at boundary", expiresAt: now},
		{name: "guess limit reached", expiresAt: now.Add(time.Minute), failedAttempts: passwordResetMaxAttempts},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			db, mock := newAuthSQLMock(t)
			service := &Service{db: db, now: func() time.Time { return now }}
			expectBootstrapCompleted(mock)
			mock.ExpectBegin()
			mock.ExpectQuery("SELECT .* FROM .*email_codes.* FOR UPDATE").
				WithArgs("member@example.test", model.EmailCodePurposePasswordReset, 1).
				WillReturnRows(sqlmock.NewRows([]string{"id", "email", "purpose", "code_hash", "expires_at", "last_sent_at", "consumed_at", "failed_attempts"}).
					AddRow(18, "member@example.test", model.EmailCodePurposePasswordReset,
						HashVerificationCode("member@example.test", model.EmailCodePurposePasswordReset, "123456"),
						testCase.expiresAt, now, nil, testCase.failedAttempts))
			mock.ExpectCommit()
			err := service.ResetPassword(context.Background(), "member@example.test", "123456", "NewPassword456")
			serviceErr, ok := err.(*ServiceError)
			if !ok || serviceErr.Status != http.StatusBadRequest {
				t.Fatalf("invalid reset code: got %v, want 400", err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestPasswordResetInvalidatesLegacyJWTIssuedBeforeReset(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Second)
	token, err := SignToken("reset-test-secret", Claims{
		Subject: "7", Email: "member@example.test", Role: model.RoleNameUser,
		IssuedAt: now.Add(-time.Minute).Unix(), ExpiresAt: now.Add(time.Hour).Unix(),
	})
	if err != nil {
		t.Fatalf("sign legacy token: %v", err)
	}
	db, mock := newAuthSQLMock(t)
	service := &Service{db: db, authConfig: config.AuthConfig{JWTSecret: "reset-test-secret"}, now: func() time.Time { return now }}
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `auth_sessions` WHERE token_hash = ? ORDER BY `auth_sessions`.`id` LIMIT ?")).
		WithArgs(digestSecret(token), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "token_hash", "expires_at", "revoked_at", "created_at", "updated_at"}))
	mock.ExpectQuery("SELECT users\\.\\*, .* AS workbench_access FROM `users` WHERE `users`.`id` = \\? ORDER BY `users`.`id` LIMIT \\?").
		WithArgs(uint64(7), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "role_id", "name", "email", "status", "password_reset_at"}).
			AddRow(uint64(7), uint64(3), "member", "member@example.test", model.UserStatusEnabled, now))
	mock.ExpectQuery("SELECT \\* FROM `roles` WHERE `roles`.`id` = \\?").
		WithArgs(uint64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "display_name"}).AddRow(uint64(3), model.RoleNameUser, "普通用户"))
	_, err = service.CurrentUser(context.Background(), token)
	serviceErr, ok := err.(*ServiceError)
	if !ok || serviceErr.Status != http.StatusUnauthorized {
		t.Fatalf("legacy JWT remained valid after password reset: err=%v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
