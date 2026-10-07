package config

import "testing"

func setRequiredConfigEnvironment(t *testing.T) {
	t.Helper()
	t.Setenv("DB_HOST", "127.0.0.1")
	t.Setenv("DB_NAME", "tarsgo")
	t.Setenv("DB_USER", "tarsgo")
	t.Setenv("DB_PASSWORD", "secret")
	t.Setenv("JWT_SECRET", "jwt-secret")
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
