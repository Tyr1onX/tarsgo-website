package systemconfig

import (
	"context"
	"encoding/json"
	"strings"
	"tarsgo-backend/config"
	"tarsgo-backend/model"
	"tarsgo-backend/service/email"
	"tarsgo-backend/service/runtimeconfig"
	"testing"
)

func TestEmailStatusNeverExposesCredentials(t *testing.T) {
	service := NewService(&fakeConfigStore{}, config.EmailConfig{APIKey: "private-api-key", From: "吉甲大师 <noreply@jijiamaster.com>"})
	result, err := service.GetEmailConfig(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(result)
	if !result.Configured || strings.Contains(string(encoded), "private-api-key") {
		t.Fatal("unsafe email status")
	}
}

func TestVerificationEmailUsesConfiguredSender(t *testing.T) {
	service := NewService(&fakeConfigStore{}, config.EmailConfig{})
	mailer := &fakeMail{}
	service.mailer = mailer
	if err := service.TestVerificationCodeConfig(context.Background(), TestVerificationCodeInput{To: "receiver@example.com"}); err != nil {
		t.Fatal(err)
	}
	if mailer.message.To != "receiver@example.com" || !strings.Contains(mailer.message.Text, "10 分钟内有效") {
		t.Fatal("verification email content missing")
	}
}

func TestRegisterFlowUsesActualRegistrationPath(t *testing.T) {
	tester := &fakeRegisterCodeTester{}
	service := NewService(&fakeConfigStore{}, config.EmailConfig{}, tester)
	if err := service.SendRegisterFlowCode(context.Background(), SendRegisterFlowCodeInput{Email: "receiver@example.com"}); err != nil {
		t.Fatal(err)
	}
	if tester.sendEmail != "receiver@example.com" {
		t.Fatal("registration sender not called")
	}
	if err := service.VerifyRegisterFlowCode(context.Background(), VerifyRegisterFlowCodeInput{Email: "receiver@example.com", Code: "123456"}); err != nil {
		t.Fatal(err)
	}
	if tester.verifyCode != "123456" || tester.verifyEmail != "receiver@example.com" {
		t.Fatal("registration verifier not called")
	}
}

func TestUpdateOAuthConfigKeepsExistingSecretWhenInputIsEmpty(t *testing.T) {
	t.Parallel()

	store := &fakeConfigStore{
		oauth: map[string]runtimeconfig.OAuthSettings{
			model.OAuthProviderGitHub: {
				Enabled:      true,
				ClientID:     "client-id",
				ClientSecret: "client-secret",
				CallbackURL:  "http://127.0.0.1:8080/api/login/github/callback",
				Scope:        "read:user user:email",
			},
			model.OAuthProviderGoogle: {
				Scope: "openid email profile",
			},
		},
	}
	service := NewService(store, config.EmailConfig{})

	result, err := service.UpdateOAuthConfig(context.Background(), model.OAuthProviderGitHub, UpdateOAuthProviderInput{
		Enabled:      true,
		ClientID:     "updated-client-id",
		ClientSecret: "",
		CallbackURL:  "http://127.0.0.1:8080/api/login/github/callback",
		Scope:        "read:user user:email",
	})
	if err != nil {
		t.Fatalf("UpdateOAuthConfig returned error: %v", err)
	}

	if !result.ClientSecretConfigured {
		t.Fatalf("expected client secret to remain configured")
	}
	if result.RequiresRestart {
		t.Fatalf("expected requiresRestart to be false")
	}
	if store.oauth[model.OAuthProviderGitHub].ClientSecret != "client-secret" {
		t.Fatalf("expected client secret to be preserved, got %q", store.oauth[model.OAuthProviderGitHub].ClientSecret)
	}
	if store.oauth[model.OAuthProviderGitHub].ClientID != "updated-client-id" {
		t.Fatalf("expected client ID to update, got %q", store.oauth[model.OAuthProviderGitHub].ClientID)
	}
}

type fakeConfigStore struct {
	oauth map[string]runtimeconfig.OAuthSettings
}

func (s *fakeConfigStore) OAuthSettings(provider string) (runtimeconfig.OAuthSettings, error) {
	if s.oauth == nil {
		s.oauth = map[string]runtimeconfig.OAuthSettings{}
	}
	if settings, ok := s.oauth[provider]; ok {
		return settings, nil
	}
	return runtimeconfig.OAuthSettings{
		Scope: defaultOAuthScope(provider),
	}, nil
}

func (s *fakeConfigStore) SaveOAuthSettings(ctx context.Context, provider string, settings runtimeconfig.OAuthSettings) error {
	_ = ctx
	if s.oauth == nil {
		s.oauth = map[string]runtimeconfig.OAuthSettings{}
	}
	s.oauth[provider] = settings
	return nil
}

type fakeMail struct {
	message email.Message
	err     error
}

func (m *fakeMail) SendEmail(_ context.Context, message email.Message) error {
	m.message = message
	return m.err
}

type fakeRegisterCodeTester struct {
	sendEmail   string
	verifyEmail string
	verifyCode  string
}

func (t *fakeRegisterCodeTester) SendRegisterCode(_ context.Context, address string) error {
	t.sendEmail = address
	return nil
}
func (t *fakeRegisterCodeTester) VerifyRegisterCode(_ context.Context, address, code string) error {
	t.verifyEmail = address
	t.verifyCode = code
	return nil
}
