package systemconfig

import (
	"context"
	"strings"
	"testing"

	"tarsgo-backend/config"
	"tarsgo-backend/model"
	"tarsgo-backend/service/auth"
	"tarsgo-backend/service/runtimeconfig"
)

func TestGetEmailConfigMasksPassword(t *testing.T) {
	t.Parallel()

	service := NewService(&fakeConfigStore{
		smtp: config.SMTPConfig{
			Host:     "smtp.example.com",
			Port:     "465",
			Username: "mailer",
			Password: "secret-password",
			From:     "noreply@example.com",
		},
	})

	result, err := service.GetEmailConfig(context.Background())
	if err != nil {
		t.Fatalf("GetEmailConfig returned error: %v", err)
	}

	if !result.PasswordConfigured {
		t.Fatalf("expected password to be marked configured")
	}
	if result.PasswordMasked != maskedSecretValue {
		t.Fatalf("expected masked password, got %q", result.PasswordMasked)
	}
	if result.RequiresRestart {
		t.Fatalf("expected requiresRestart to be false")
	}
}

func TestUpdateEmailConfigKeepsExistingPasswordWhenInputIsEmpty(t *testing.T) {
	t.Parallel()

	store := &fakeConfigStore{
		smtp: config.SMTPConfig{
			Host:     "smtp.example.com",
			Port:     "465",
			Username: "mailer",
			Password: "secret-password",
			From:     "noreply@example.com",
		},
	}
	service := NewService(store)

	if _, err := service.UpdateEmailConfig(context.Background(), UpdateEmailInput{
		Host:     "smtp.changed.example.com",
		Port:     "587",
		Username: "updated-mailer",
		Password: "",
		From:     "bot@example.com",
	}); err != nil {
		t.Fatalf("UpdateEmailConfig returned error: %v", err)
	}

	if store.smtp.Password != "secret-password" {
		t.Fatalf("expected SMTP password to be preserved, got %q", store.smtp.Password)
	}
	if store.smtp.Host != "smtp.changed.example.com" || store.smtp.Port != "587" {
		t.Fatalf("unexpected updated smtp values: %#v", store.smtp)
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
	service := NewService(store)

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

func TestTestVerificationCodeConfigUsesResolvedSMTPConfig(t *testing.T) {
	t.Parallel()

	store := &fakeConfigStore{
		smtp: config.SMTPConfig{
			Host:     "smtp.example.com",
			Port:     "465",
			Username: "mailer",
			Password: "secret-password",
			From:     "noreply@example.com",
		},
	}
	service := NewService(store)

	var sent fakeMail
	service.mailerFactory = func(cfg config.SMTPConfig) auth.Mailer {
		sent.cfg = cfg
		return &sent
	}

	err := service.TestVerificationCodeConfig(context.Background(), TestVerificationCodeInput{
		Host:     "smtp.changed.example.com",
		Port:     "587",
		Username: "updated-mailer",
		Password: "",
		From:     "bot@example.com",
		To:       "receiver@example.com",
	})
	if err != nil {
		t.Fatalf("TestVerificationCodeConfig returned error: %v", err)
	}

	if sent.cfg.Password != "secret-password" {
		t.Fatalf("expected password to fall back to stored value, got %q", sent.cfg.Password)
	}
	if sent.to != "receiver@example.com" {
		t.Fatalf("expected recipient to match, got %q", sent.to)
	}
	if !strings.Contains(sent.subject, "验证码") {
		t.Fatalf("expected verification-code subject, got %q", sent.subject)
	}
	if !strings.Contains(sent.body, "10 分钟内有效") {
		t.Fatalf("expected verification-code body, got %q", sent.body)
	}
}

func TestSendRegisterFlowCodeUsesResolvedSMTPConfig(t *testing.T) {
	t.Parallel()

	store := &fakeConfigStore{
		smtp: config.SMTPConfig{
			Host:     "smtp.example.com",
			Port:     "465",
			Username: "mailer",
			Password: "secret-password",
			From:     "noreply@example.com",
		},
	}
	tester := &fakeRegisterCodeTester{}
	service := NewService(store, tester)

	err := service.SendRegisterFlowCode(context.Background(), SendRegisterFlowCodeInput{
		Host:     "smtp.changed.example.com",
		Port:     "587",
		Username: "updated-mailer",
		Password: "",
		From:     "bot@example.com",
		Email:    "receiver@example.com",
	})
	if err != nil {
		t.Fatalf("SendRegisterFlowCode returned error: %v", err)
	}

	if tester.sendSMTPConfig.Password != "secret-password" {
		t.Fatalf("expected password to fall back to stored value, got %q", tester.sendSMTPConfig.Password)
	}
	if tester.sendEmail != "receiver@example.com" {
		t.Fatalf("expected receiver@example.com, got %q", tester.sendEmail)
	}
}

func TestVerifyRegisterFlowCodeDelegatesToTester(t *testing.T) {
	t.Parallel()

	tester := &fakeRegisterCodeTester{}
	service := NewService(&fakeConfigStore{}, tester)

	err := service.VerifyRegisterFlowCode(context.Background(), VerifyRegisterFlowCodeInput{
		Email: "receiver@example.com",
		Code:  "123456",
	})
	if err != nil {
		t.Fatalf("VerifyRegisterFlowCode returned error: %v", err)
	}

	if tester.verifyEmail != "receiver@example.com" {
		t.Fatalf("expected receiver@example.com, got %q", tester.verifyEmail)
	}
	if tester.verifyCode != "123456" {
		t.Fatalf("expected 123456, got %q", tester.verifyCode)
	}
}

type fakeConfigStore struct {
	smtp  config.SMTPConfig
	oauth map[string]runtimeconfig.OAuthSettings
}

func (s *fakeConfigStore) SMTPConfig() config.SMTPConfig {
	return s.smtp
}

func (s *fakeConfigStore) SaveSMTPConfig(ctx context.Context, cfg config.SMTPConfig) error {
	_ = ctx
	s.smtp = cfg
	return nil
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
	cfg     config.SMTPConfig
	to      string
	subject string
	body    string
	err     error
}

func (m *fakeMail) Send(ctx context.Context, to string, subject string, body string) error {
	_ = ctx
	m.to = to
	m.subject = subject
	m.body = body
	return m.err
}

type fakeRegisterCodeTester struct {
	sendEmail      string
	sendSMTPConfig config.SMTPConfig
	sendErr        error
	verifyEmail    string
	verifyCode     string
	verifyErr      error
}

func (t *fakeRegisterCodeTester) SendRegisterCodeWithSMTPConfig(
	ctx context.Context,
	email string,
	smtpConfig config.SMTPConfig,
) error {
	_ = ctx
	t.sendEmail = email
	t.sendSMTPConfig = smtpConfig
	return t.sendErr
}

func (t *fakeRegisterCodeTester) VerifyRegisterCode(ctx context.Context, email string, code string) error {
	_ = ctx
	t.verifyEmail = email
	t.verifyCode = code
	return t.verifyErr
}
