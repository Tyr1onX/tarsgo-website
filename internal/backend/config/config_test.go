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
