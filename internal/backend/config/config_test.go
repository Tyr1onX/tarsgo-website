package config

import "testing"

func setRequiredConfigEnvironment(t *testing.T) {
	t.Helper()
	t.Setenv("APP_ENV", "test")
	t.Setenv("DB_HOST", "127.0.0.1")
	t.Setenv("DB_NAME", "tarsgo")
	t.Setenv("DB_USER", "tarsgo")
	t.Setenv("DB_PASSWORD", "secret")
	t.Setenv("JWT_SECRET", "jwt-secret")
}

func TestAcceptanceConfigRequiresIsolatedLoopbackServices(t *testing.T) {
	setRequiredConfigEnvironment(t)
	t.Setenv("APP_ENV", "acceptance")
	t.Setenv("APP_HOST", "127.0.0.1")
	t.Setenv("APP_PORT", "8182")
	t.Setenv("DB_HOST", "127.0.0.1")
	t.Setenv("DB_PORT", "3317")
	t.Setenv("DB_NAME", "tarsgo_acceptance")
	t.Setenv("EMAIL_API_URL", "http://127.0.0.1:8126/emails")
	t.Setenv("TARSGO_ACCEPTANCE_SEED", "true")
	t.Setenv("TARSGO_TEST_USER_PASSWORD", "unit-test-user-password")
	t.Setenv("TARSGO_TEST_ADMIN_PASSWORD", "unit-test-admin-password")
	t.Setenv("TARSGO_TEST_SUPER_ADMIN_PASSWORD", "unit-test-superadmin-password")
	if _, err := Load(); err != nil {
		t.Fatalf("isolated acceptance config should load: %v", err)
	}

	t.Setenv("DB_NAME", "production")
	if _, err := Load(); err == nil {
		t.Fatal("acceptance config must reject a non-acceptance database")
	}
	t.Setenv("DB_NAME", "tarsgo_acceptance")
	t.Setenv("EMAIL_API_URL", "https://api.resend.com/emails")
	if _, err := Load(); err == nil {
		t.Fatal("acceptance config must reject an external email provider")
	}
}

func TestProductionEmailEndpointCannotBeOverridden(t *testing.T) {
	setRequiredConfigEnvironment(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("JWT_SECRET", "01234567890123456789012345678901")
	t.Setenv("JWT_COOKIE_SECURE", "true")
	t.Setenv("EMAIL_API_URL", "http://127.0.0.1:8126/emails")
	if _, err := Load(); err == nil {
		t.Fatal("production config must reject an email endpoint override")
	}
}

func TestLoadAutoMigrateDefaultsToEnabled(t *testing.T) {
	setRequiredConfigEnvironment(t)
	t.Setenv("APP_AUTO_MIGRATE", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if !cfg.App.AutoMigrate {
		t.Fatal("expected automatic migrations to be enabled by default")
	}
}

func TestLoadCanDisableAutoMigrate(t *testing.T) {
	setRequiredConfigEnvironment(t)
	t.Setenv("APP_AUTO_MIGRATE", "false")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if cfg.App.AutoMigrate {
		t.Fatal("expected APP_AUTO_MIGRATE=false to disable automatic migrations")
	}
}

func TestEmailConfigLoadsServerEnvironment(t *testing.T) {
	setRequiredConfigEnvironment(t)
	t.Setenv("RESEND_API_KEY", "test-key")
	t.Setenv("EMAIL_FROM", "吉甲大师 <noreply@jijiamaster.com>")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Email.APIKey != "test-key" || cfg.Email.From != "吉甲大师 <noreply@jijiamaster.com>" {
		t.Fatal("email environment not loaded")
	}
}

func TestFeishuBitableConfigLoadsOptionalCoordinates(t *testing.T) {
	setRequiredConfigEnvironment(t)
	t.Setenv("FEISHU_APP_ID", "cli_test")
	t.Setenv("FEISHU_APP_SECRET", "secret")
	t.Setenv("FEISHU_ENCRYPT_KEY", "encrypt-key")
	t.Setenv("FEISHU_VERIFICATION_TOKEN", "verification")
	t.Setenv("FEISHU_BITABLE_APP_TOKEN", "basc_test")
	t.Setenv("FEISHU_BITABLE_TABLE_ID", "tbl_test")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if cfg.Feishu.BitableAppToken != "basc_test" || cfg.Feishu.BitableTableID != "tbl_test" {
		t.Fatalf("Bitable coordinates not loaded: %+v", cfg.Feishu)
	}
	if cfg.Feishu.VerificationToken != "verification" {
		t.Fatalf("Feishu verification token not loaded: %q", cfg.Feishu.VerificationToken)
	}
	if cfg.Feishu.EncryptKey != "encrypt-key" {
		t.Fatalf("Feishu Encrypt Key not loaded: %q", cfg.Feishu.EncryptKey)
	}
}
