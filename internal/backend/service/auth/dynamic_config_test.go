package auth

import (
	"net/url"
	"strings"
	"testing"

	"tarsgo-backend/config"
)

func TestListOAuthLoginProvidersReflectsCurrentRuntimeConfig(t *testing.T) {
	t.Parallel()

	store := &fakeDynamicConfigStore{
		github: config.GitHubConfig{
			Enabled:     true,
			CallbackURL: "http://127.0.0.1:8080/api/login/github/callback",
			Scope:       "read:user user:email",
		},
		google: config.GoogleConfig{
			Enabled:     false,
			CallbackURL: "http://127.0.0.1:8080/api/login/google/callback",
			Scope:       "openid email profile",
		},
	}
	service := &Service{configStore: store}

	initial := service.ListOAuthLoginProviders()
	if len(initial) != 1 || initial[0].Provider != "github" {
		t.Fatalf("expected only github provider, got %#v", initial)
	}

	store.google.Enabled = true

	updated := service.ListOAuthLoginProviders()
	if len(updated) != 2 {
		t.Fatalf("expected 2 providers after enabling google, got %#v", updated)
	}
}

func TestBuildOAuthLoginURLUsesLatestRuntimeConfig(t *testing.T) {
	t.Parallel()

	store := &fakeDynamicConfigStore{
		github: config.GitHubConfig{
			Enabled:      true,
			ClientID:     "client-id",
			ClientSecret: "client-secret",
			CallbackURL:  "http://127.0.0.1:8080/api/login/github/callback",
			AuthorizeURL: "https://github.com/login/oauth/authorize",
			TokenURL:     "https://github.com/login/oauth/access_token",
			UserURL:      "https://api.github.com/user",
			EmailsURL:    "https://api.github.com/user/emails",
			Scope:        "read:user user:email",
		},
	}
	service := &Service{configStore: store}

	loginURL, _, err := service.BuildOAuthLoginURL("github")
	if err != nil {
		t.Fatalf("BuildOAuthLoginURL returned error: %v", err)
	}
	redirectURI := mustRedirectURI(t, loginURL)
	if redirectURI != store.github.CallbackURL {
		t.Fatalf("expected redirect_uri %q, got %q", store.github.CallbackURL, redirectURI)
	}

	store.github.CallbackURL = "http://127.0.0.1:8080/api/login/github/updated-callback"

	updatedURL, _, err := service.BuildOAuthLoginURL("github")
	if err != nil {
		t.Fatalf("BuildOAuthLoginURL returned error after update: %v", err)
	}
	updatedRedirectURI := mustRedirectURI(t, updatedURL)
	if updatedRedirectURI != store.github.CallbackURL {
		t.Fatalf("expected updated redirect_uri %q, got %q", store.github.CallbackURL, updatedRedirectURI)
	}
}

type fakeDynamicConfigStore struct {
	github config.GitHubConfig
	google config.GoogleConfig
}

func (s *fakeDynamicConfigStore) GitHubConfig() config.GitHubConfig {
	return s.github
}

func (s *fakeDynamicConfigStore) GoogleConfig() config.GoogleConfig {
	return s.google
}

func mustRedirectURI(t *testing.T, rawURL string) string {
	t.Helper()

	parsed, err := url.Parse(rawURL)
	if err != nil {
		t.Fatalf("parse login url: %v", err)
	}

	redirectURI := strings.TrimSpace(parsed.Query().Get("redirect_uri"))
	if redirectURI == "" {
		t.Fatalf("redirect_uri is empty in %q", rawURL)
	}
	return redirectURI
}
