package auth

import (
	"context"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	mysqlDriver "gorm.io/driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/config"
	"tarsgo-backend/model"
)

func TestLoginWithPasswordRecordsCredentialLoginTime(t *testing.T) {
	db, mock := newAuthSQLMock(t)
	now := time.Date(2026, time.October, 20, 3, 4, 5, 0, time.UTC)
	passwordHash, err := HashPassword("Password123")
	if err != nil {
		t.Fatalf("hash test password: %v", err)
	}
	service := &Service{db: db, authConfig: config.AuthConfig{}, now: func() time.Time { return now }}

	expectBootstrapCompleted(mock)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `users` WHERE email = ? ORDER BY `users`.`id` LIMIT ?")).
		WithArgs("member@example.test", 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "role_id", "name", "email", "password_hash", "status"}).AddRow(
			uint64(7), uint64(3), "member", "member@example.test", passwordHash, model.UserStatusEnabled,
		))
	mock.ExpectQuery("SELECT \\* FROM `roles` WHERE `roles`.`id` = \\?").
		WithArgs(uint64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "display_name"}).AddRow(uint64(3), model.RoleNameUser, "普通用户"))
	mock.ExpectBegin()
	mock.ExpectExec("UPDATE `users` SET `last_login_at`=\\?,`updated_at`=\\? WHERE id = \\?").
		WithArgs(now, sqlmock.AnyArg(), uint64(7)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	result, err := service.LoginWithPassword(context.Background(), "member@example.test", "Password123")
	if err != nil {
		t.Fatalf("LoginWithPassword returned error: %v", err)
	}
	if result.User.ID != 7 || result.User.Role.Name != model.RoleNameUser {
		t.Fatalf("unexpected authenticated user: %#v", result.User)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet database expectation: %v", err)
	}
}

func TestLoginWithCodeRecordsCredentialLoginTime(t *testing.T) {
	db, mock := newAuthSQLMock(t)
	now := time.Date(2026, time.October, 20, 3, 4, 5, 0, time.UTC)
	service := &Service{db: db, authConfig: config.AuthConfig{}, now: func() time.Time { return now }}
	expectBootstrapCompleted(mock)
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT \\* FROM `email_codes` WHERE email = \\? AND purpose = \\? ORDER BY `email_codes`.`id` LIMIT \\? FOR UPDATE").
		WithArgs("member@example.test", model.EmailCodePurposeLogin, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "email", "purpose", "code_hash", "expires_at", "last_sent_at", "created_at", "updated_at"}).AddRow(
			uint64(12), "member@example.test", model.EmailCodePurposeLogin,
			HashVerificationCode("member@example.test", model.EmailCodePurposeLogin, "123456"), now.Add(time.Minute), now, now, now,
		))
	mock.ExpectExec("UPDATE `email_codes`").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `users` WHERE email = ? ORDER BY `users`.`id` LIMIT ?")).
		WithArgs("member@example.test", 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "role_id", "name", "email", "status"}).AddRow(
			uint64(7), uint64(3), "member", "member@example.test", model.UserStatusEnabled,
		))
	mock.ExpectQuery("SELECT \\* FROM `roles` WHERE `roles`.`id` = \\?").
		WithArgs(uint64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "display_name"}).AddRow(uint64(3), model.RoleNameUser, "普通用户"))
	mock.ExpectExec("UPDATE `users` SET `last_login_at`=\\?,`updated_at`=\\? WHERE id = \\?").
		WithArgs(now, sqlmock.AnyArg(), uint64(7)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	result, err := service.LoginWithCode(context.Background(), "member@example.test", "123456")
	if err != nil {
		t.Fatalf("LoginWithCode returned error: %v", err)
	}
	if result.User.ID != 7 {
		t.Fatalf("authenticated user ID = %d, want 7", result.User.ID)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet database expectation: %v", err)
	}
}

func TestCurrentSessionDoesNotRefreshLoginConfirmation(t *testing.T) {
	db, mock := newAuthSQLMock(t)
	now := time.Date(2026, time.October, 20, 3, 4, 5, 0, time.UTC)
	token := "existing-session-token"
	service := &Service{db: db, authConfig: config.AuthConfig{}, now: func() time.Time { return now }}
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `auth_sessions` WHERE token_hash = ? ORDER BY `auth_sessions`.`id` LIMIT ?")).
		WithArgs(digestSecret(token), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "token_hash", "expires_at", "created_at", "updated_at"}).AddRow(
			uint64(2), uint64(7), digestSecret(token), now.Add(time.Hour), now, now,
		))
	mock.ExpectQuery("SELECT \\* FROM `users` WHERE `users`.`id` = \\? ORDER BY `users`.`id` LIMIT \\?").
		WithArgs(uint64(7), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "role_id", "name", "email", "status"}).AddRow(
			uint64(7), uint64(3), "member", "member@example.test", model.UserStatusEnabled,
		))
	mock.ExpectQuery("SELECT \\* FROM `roles` WHERE `roles`.`id` = \\?").
		WithArgs(uint64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "display_name"}).AddRow(uint64(3), model.RoleNameUser, "普通用户"))

	user, err := service.CurrentUser(context.Background(), token)
	if err != nil {
		t.Fatalf("CurrentUser returned error: %v", err)
	}
	if user.ID != 7 {
		t.Fatalf("current user ID = %d, want 7", user.ID)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unexpected database write while reading an existing session: %v", err)
	}
}

func TestSwitchAccountSessionDoesNotRefreshLoginConfirmation(t *testing.T) {
	db, mock := newAuthSQLMock(t)
	now := time.Date(2026, time.October, 20, 3, 4, 5, 0, time.UTC)
	vaultToken := "browser-vault-token"
	service := &Service{db: db, authConfig: config.AuthConfig{}, now: func() time.Time { return now }}
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT \\* FROM `account_vaults` WHERE secret_hash = \\? AND expires_at > \\? ORDER BY `account_vaults`.`id` LIMIT \\?").
		WithArgs(digestSecret(vaultToken), now, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "secret_hash", "expires_at", "created_at", "updated_at"}).AddRow(
			uint64(8), digestSecret(vaultToken), now.Add(time.Hour), now, now,
		))
	mock.ExpectQuery("SELECT \\* FROM `account_vault_entries` WHERE id = \\? AND vault_id = \\? ORDER BY `account_vault_entries`.`id` LIMIT \\?").
		WithArgs(uint64(17), uint64(8), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "vault_id", "user_id", "session_id", "created_at"}).AddRow(
			uint64(17), uint64(8), uint64(7), uint64(9), now,
		))
	mock.ExpectQuery("SELECT \\* FROM `auth_sessions` WHERE `auth_sessions`.`id` = \\? ORDER BY `auth_sessions`.`id` LIMIT \\? FOR UPDATE").
		WithArgs(uint64(9), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "token_hash", "expires_at", "created_at", "updated_at"}).AddRow(
			uint64(9), uint64(7), "old-session-hash", now.Add(time.Hour), now, now,
		))
	expectSwitchUser(mock)
	mock.ExpectExec("UPDATE `auth_sessions` SET").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("UPDATE `account_vaults` SET").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("SELECT \\* FROM `account_vault_entries` WHERE vault_id = \\? ORDER BY created_at ASC, id ASC").
		WithArgs(uint64(8)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "vault_id", "user_id", "session_id", "created_at"}).AddRow(
			uint64(17), uint64(8), uint64(7), uint64(9), now,
		))
	mock.ExpectQuery("SELECT \\* FROM `auth_sessions` WHERE `auth_sessions`.`id` = \\? ORDER BY `auth_sessions`.`id` LIMIT \\?").
		WithArgs(uint64(9), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "token_hash", "expires_at", "created_at", "updated_at"}).AddRow(
			uint64(9), uint64(7), "new-session-hash", now.Add(72*time.Hour), now, now,
		))
	expectSwitchUser(mock)
	mock.ExpectCommit()

	result, err := service.SwitchAccountSession(context.Background(), vaultToken, 17)
	if err != nil {
		t.Fatalf("SwitchAccountSession returned error: %v", err)
	}
	if result.User == nil || result.User.ID != 7 || len(result.Accounts) != 1 {
		t.Fatalf("unexpected switched account result: %#v", result)
	}
	if !result.Accounts[0].ExpiresAt.Equal(now.Add(72*time.Hour)) || result.SessionCookieMaxAgeSeconds != int((72*time.Hour)/time.Second) || result.VaultCookieMaxAgeSeconds != int((72*time.Hour)/time.Second) {
		t.Fatalf("switch renewal/cookie lifetimes are not synchronized: %#v", result)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unexpected database write while switching accounts: %v", err)
	}
}

func TestRenewAccountSessionSlidesIdleExpiryButCapsAbsoluteLifetime(t *testing.T) {
	for _, testCase := range []struct {
		name          string
		createdAt     time.Time
		wantCookieAge int
		wantRenewal   bool
	}{
		{name: "idle renewal", createdAt: time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC), wantRenewal: true},
		{name: "absolute cap", createdAt: time.Date(2026, 9, 26, 3, 4, 5, 0, time.UTC), wantRenewal: true},
		{name: "not near expiry", createdAt: time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC), wantRenewal: false},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			db, mock := newAuthSQLMock(t)
			now := time.Date(2026, 10, 25, 3, 4, 5, 0, time.UTC)
			createdAt := testCase.createdAt
			existingExpiry := now.Add(12 * time.Hour)
			if !testCase.wantRenewal {
				existingExpiry = now.Add(48 * time.Hour)
			}
			wantExpiry := existingExpiry
			if testCase.wantRenewal {
				wantExpiry = minTime(now.Add(72*time.Hour), createdAt.Add(MaxSessionLifetime))
			}
			service := &Service{db: db, authConfig: config.AuthConfig{TokenTTL: 72 * time.Hour, CookieMaxAgeSeconds: 72 * 60 * 60}, now: func() time.Time { return now }, lastAuthCleanup: now}
			token := "renewable-session"
			mock.ExpectBegin()
			mock.ExpectQuery("SELECT \\* FROM `auth_sessions` WHERE token_hash = \\? ORDER BY `auth_sessions`.`id` LIMIT \\? FOR UPDATE").
				WithArgs(digestSecret(token), 1).
				WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "token_hash", "expires_at", "revoked_at", "created_at", "updated_at"}).AddRow(
					uint64(4), uint64(7), digestSecret(token), existingExpiry, nil, createdAt, now,
				))
			if testCase.wantRenewal {
				mock.ExpectExec("UPDATE `auth_sessions` SET").WillReturnResult(sqlmock.NewResult(0, 1))
			}
			mock.ExpectCommit()
			renewal, err := service.RenewAccountSession(context.Background(), token, "")
			if err != nil {
				t.Fatalf("RenewAccountSession returned error: %v", err)
			}
			if renewal.AuthRenewed != testCase.wantRenewal || renewal.AuthCookieMaxAgeSeconds != int(wantExpiry.Sub(now).Seconds()) {
				t.Fatalf("renewal = %#v, want renewed=%t and cookie lifetime=%s", renewal, testCase.wantRenewal, wantExpiry.Sub(now))
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("unmet database expectation: %v", err)
			}
		})
	}
}

func TestAccountSessionStatusDistinguishesExpiredRevokedAndDisabled(t *testing.T) {
	now := time.Date(2026, time.October, 25, 3, 4, 5, 0, time.UTC)
	enabled := &model.User{ID: 7, Status: model.UserStatusEnabled, Role: model.Role{Name: model.RoleNameUser}}
	disabled := &model.User{ID: 7, Status: model.UserStatusDisabled, Role: model.Role{Name: model.RoleNameUser}}

	for _, testCase := range []struct {
		name          string
		sessionExists bool
		session       model.AuthSession
		user          *model.User
		want          string
	}{
		{name: "available", sessionExists: true, session: model.AuthSession{UserID: 7, ExpiresAt: now.Add(time.Hour)}, user: enabled, want: "available"},
		{name: "expired", sessionExists: true, session: model.AuthSession{UserID: 7, ExpiresAt: now}, user: enabled, want: "expired"},
		{name: "revoked", sessionExists: true, session: model.AuthSession{UserID: 7, ExpiresAt: now.Add(time.Hour), RevokedAt: &now}, user: enabled, want: "revoked"},
		{name: "disabled account", sessionExists: true, session: model.AuthSession{UserID: 7, ExpiresAt: now}, user: disabled, want: "disabled"},
		{name: "missing session", user: enabled, want: "expired"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			if got := accountSessionStatus(testCase.sessionExists, testCase.session, testCase.user, 7, now); got != testCase.want {
				t.Fatalf("accountSessionStatus = %q, want %q", got, testCase.want)
			}
		})
	}
}

func TestRegisterWithEmailStoresInitialLoginTime(t *testing.T) {
	db, mock := newAuthSQLMock(t)
	now := time.Date(2026, time.October, 20, 3, 4, 5, 0, time.UTC)
	service := &Service{db: db, authConfig: config.AuthConfig{}, now: func() time.Time { return now }}
	var insertedLoginAt *time.Time
	if err := db.Callback().Create().Before("gorm:create").Register("test:capture-user-login-time", func(tx *gorm.DB) {
		if user, ok := tx.Statement.Dest.(*model.User); ok {
			if user.LastLoginAt != nil {
				value := *user.LastLoginAt
				insertedLoginAt = &value
			}
		}
	}); err != nil {
		t.Fatalf("register user create callback: %v", err)
	}

	expectBootstrapCompleted(mock)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `users` WHERE email = ? ORDER BY `users`.`id` LIMIT ?")).
		WithArgs("new@example.test", 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT \\* FROM `email_codes` WHERE email = \\? AND purpose = \\? ORDER BY `email_codes`.`id` LIMIT \\? FOR UPDATE").
		WithArgs("new@example.test", model.EmailCodePurposeRegister, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "email", "purpose", "code_hash", "expires_at", "last_sent_at", "created_at", "updated_at"}).AddRow(
			uint64(12), "new@example.test", model.EmailCodePurposeRegister,
			HashVerificationCode("new@example.test", model.EmailCodePurposeRegister, "123456"), now.Add(time.Minute), now, now, now,
		))
	mock.ExpectExec("UPDATE `email_codes`").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("SELECT \\* FROM `roles` WHERE name = \\?").
		WithArgs(model.RoleNameUser, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "display_name"}).AddRow(uint64(3), model.RoleNameUser, "普通用户"))
	mock.ExpectExec("INSERT INTO `users`.*last_login_at").WillReturnResult(sqlmock.NewResult(41, 1))
	mock.ExpectQuery("SELECT \\* FROM `users` WHERE `users`.`id` = \\? ORDER BY `users`.`id` LIMIT \\?").
		WithArgs(uint64(41), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "role_id", "admin_scope", "name", "email", "password_hash", "status", "last_login_at"}).AddRow(
			uint64(41), uint64(3), model.AdminScopeNone, "new", "new@example.test", "hash", model.UserStatusEnabled, now,
		))
	mock.ExpectQuery("SELECT \\* FROM `roles` WHERE `roles`.`id` = \\?").
		WithArgs(uint64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "display_name"}).AddRow(uint64(3), model.RoleNameUser, "普通用户"))
	mock.ExpectCommit()

	result, err := service.RegisterWithEmail(context.Background(), RegisterEmailInput{
		Email: "new@example.test", Password: "Password123", RealName: "新成员", Phone: "13800138000", Code: "123456",
	})
	if err != nil {
		t.Fatalf("RegisterWithEmail returned error: %v", err)
	}
	if result.User.ID != 41 {
		t.Fatalf("registered user ID = %d, want 41", result.User.ID)
	}
	if insertedLoginAt == nil || !insertedLoginAt.Equal(now) {
		t.Fatalf("new account last_login_at = %v, want %s", insertedLoginAt, now)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet database expectation: %v", err)
	}
}

func newAuthSQLMock(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
	t.Helper()
	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	db, err := gorm.Open(mysqlDriver.New(mysqlDriver.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true})
	if err != nil {
		t.Fatalf("open GORM over SQL mock: %v", err)
	}
	return db, mock
}

func expectBootstrapCompleted(mock sqlmock.Sqlmock) {
	mock.ExpectQuery(regexp.QuoteMeta("SELECT `id` FROM `roles` WHERE name = ?")).
		WithArgs(model.RoleNameSuperAdmin, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(uint64(1)))
	mock.ExpectQuery("SELECT count\\(\\*\\) FROM `users` WHERE role_id = \\?").
		WithArgs(uint64(1)).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
}

func expectSwitchUser(mock sqlmock.Sqlmock) {
	mock.ExpectQuery("SELECT \\* FROM `users` WHERE `users`.`id` = \\? ORDER BY `users`.`id` LIMIT \\?").
		WithArgs(uint64(7), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "role_id", "name", "email", "status"}).AddRow(
			uint64(7), uint64(3), "member", "member@example.test", model.UserStatusEnabled,
		))
	mock.ExpectQuery("SELECT \\* FROM `roles` WHERE `roles`.`id` = \\?").
		WithArgs(uint64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "display_name"}).AddRow(uint64(3), model.RoleNameUser, "普通用户"))
}
