package config

import "testing"

func TestFrontendRouteUsesRelativePathWhenFrontendURLIsEmpty(t *testing.T) {
	t.Parallel()

	cfg := AppConfig{}

	if got := cfg.AdminDashboardURL(); got != "/dashboard" {
		t.Fatalf("expected relative dashboard path, got %q", got)
	}

	if got := cfg.BootstrapSetupURL(); got != "/dashboard/setup/super-admin" {
		t.Fatalf("expected relative setup path, got %q", got)
	}

	if got := cfg.LoginErrorURL("oauth_failed"); got != "/login?error=oauth_failed" {
		t.Fatalf("expected relative login error path, got %q", got)
	}
}

func TestFrontendRouteUsesConfiguredFrontendURL(t *testing.T) {
	t.Parallel()

	cfg := AppConfig{FrontendURL: "http://127.0.0.1:5173/"}

	if got := cfg.AdminDashboardURL(); got != "http://127.0.0.1:5173/dashboard" {
		t.Fatalf("expected configured dashboard url, got %q", got)
	}

	if got := cfg.BootstrapSetupURL(); got != "http://127.0.0.1:5173/dashboard/setup/super-admin" {
		t.Fatalf("expected configured setup url, got %q", got)
	}

	if got := cfg.LoginErrorURL("oauth_failed"); got != "http://127.0.0.1:5173/login?error=oauth_failed" {
		t.Fatalf("expected configured login error url, got %q", got)
	}
}

func TestLoadIgnoresSMTPAndOAuthEnvironment(t *testing.T) {
	t.Setenv("DB_HOST", "127.0.0.1")
	t.Setenv("DB_NAME", "tarsgo")
	t.Setenv("DB_USER", "tarsgo")
	t.Setenv("DB_PASSWORD", "secret")
	t.Setenv("JWT_SECRET", "jwt-secret")
	t.Setenv("SMTP_HOST", "smtp.example.com")
	t.Setenv("SMTP_PORT", "2525")
	t.Setenv("SMTP_USERNAME", "mailer")
	t.Setenv("SMTP_PASSWORD", "mailer-secret")
	t.Setenv("SMTP_FROM", "noreply@example.com")
	t.Setenv("GITHUB_ENABLED", "true")
	t.Setenv("GITHUB_CLIENT_ID", "github-client-id")
	t.Setenv("GITHUB_CLIENT_SECRET", "github-client-secret")
	t.Setenv("GITHUB_CALLBACK_URL", "https://example.com/api/login/github/callback")
	t.Setenv("GITHUB_SCOPE", "custom:github")
	t.Setenv("GITHUB_AUTHORIZE_URL", "https://github.example.com/authorize")
	t.Setenv("GITHUB_TOKEN_URL", "https://github.example.com/token")
	t.Setenv("GITHUB_USER_URL", "https://github.example.com/user")
	t.Setenv("GITHUB_EMAILS_URL", "https://github.example.com/user/emails")
	t.Setenv("GOOGLE_ENABLED", "true")
	t.Setenv("GOOGLE_CLIENT_ID", "google-client-id")
	t.Setenv("GOOGLE_CLIENT_SECRET", "google-client-secret")
	t.Setenv("GOOGLE_CALLBACK_URL", "https://example.com/api/login/google/callback")
	t.Setenv("GOOGLE_SCOPE", "custom:google")
	t.Setenv("GOOGLE_AUTHORIZE_URL", "https://google.example.com/authorize")
	t.Setenv("GOOGLE_TOKEN_URL", "https://google.example.com/token")
	t.Setenv("GOOGLE_USER_URL", "https://google.example.com/userinfo")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}

	if cfg.SMTP.Host != "" || cfg.SMTP.Username != "" || cfg.SMTP.Password != "" || cfg.SMTP.From != "" {
		t.Fatalf("expected SMTP config to ignore environment values, got %#v", cfg.SMTP)
	}
	if cfg.SMTP.Port != "465" {
		t.Fatalf("expected SMTP port default 465, got %q", cfg.SMTP.Port)
	}
	if cfg.GitHub.Enabled || cfg.GitHub.ClientID != "" || cfg.GitHub.ClientSecret != "" || cfg.GitHub.CallbackURL != "" {
		t.Fatalf("expected GitHub login config to ignore environment values, got %#v", cfg.GitHub)
	}
	if cfg.GitHub.Scope != "read:user user:email" {
		t.Fatalf("expected GitHub scope default, got %q", cfg.GitHub.Scope)
	}
	if cfg.GitHub.AuthorizeURL != "https://github.com/login/oauth/authorize" ||
		cfg.GitHub.TokenURL != "https://github.com/login/oauth/access_token" ||
		cfg.GitHub.UserURL != "https://api.github.com/user" ||
		cfg.GitHub.EmailsURL != "https://api.github.com/user/emails" {
		t.Fatalf("expected GitHub provider endpoints to ignore environment values, got %#v", cfg.GitHub)
	}
	if cfg.Google.Enabled || cfg.Google.ClientID != "" || cfg.Google.ClientSecret != "" || cfg.Google.CallbackURL != "" {
		t.Fatalf("expected Google login config to ignore environment values, got %#v", cfg.Google)
	}
	if cfg.Google.Scope != "openid email profile" {
		t.Fatalf("expected Google scope default, got %q", cfg.Google.Scope)
	}
	if cfg.Google.AuthorizeURL != "https://accounts.google.com/o/oauth2/v2/auth" ||
		cfg.Google.TokenURL != "https://oauth2.googleapis.com/token" ||
		cfg.Google.UserURL != "https://openidconnect.googleapis.com/v1/userinfo" {
		t.Fatalf("expected Google provider endpoints to ignore environment values, got %#v", cfg.Google)
	}
}
