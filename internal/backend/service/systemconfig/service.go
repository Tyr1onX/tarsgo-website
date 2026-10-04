package systemconfig

import (
	"context"
	"fmt"
	"net/http"
	"net/mail"
	"strings"

	"tarsgo-backend/config"
	"tarsgo-backend/model"
	"tarsgo-backend/service/auth"
	"tarsgo-backend/service/email"
	"tarsgo-backend/service/runtimeconfig"
)

const maskedSecretValue = "********"

type Service struct {
	store          configStore
	mailer         email.Mailer
	emailConfig    config.EmailConfig
	registerTester registerCodeTester
}

type configStore interface {
	OAuthSettings(provider string) (runtimeconfig.OAuthSettings, error)
	SaveOAuthSettings(ctx context.Context, provider string, settings runtimeconfig.OAuthSettings) error
}

type ServiceError struct {
	Status  int
	Message string
	Err     error
}

type EmailConfig struct {
	From       string `json:"from"`
	Configured bool   `json:"configured"`
}

type TestEmailInput struct{ To string }
type TestVerificationCodeInput struct{ To string }

type OAuthProviderConfig struct {
	Provider               string `json:"provider"`
	DisplayName            string `json:"displayName"`
	Enabled                bool   `json:"enabled"`
	ClientID               string `json:"clientId"`
	CallbackURL            string `json:"callbackUrl"`
	Scope                  string `json:"scope"`
	ClientSecretMasked     string `json:"clientSecretMasked"`
	ClientSecretConfigured bool   `json:"clientSecretConfigured"`
	RequiresRestart        bool   `json:"requiresRestart"`
}

type UpdateOAuthProviderInput struct {
	Enabled      bool
	ClientID     string
	ClientSecret string
	CallbackURL  string
	Scope        string
}

func NewService(store configStore, cfg config.EmailConfig, testers ...registerCodeTester) *Service {
	service := &Service{
		store:          store,
		mailer:         email.NewSender(cfg),
		emailConfig:    cfg,
		registerTester: nil,
	}
	if len(testers) > 0 {
		service.registerTester = testers[0]
	}
	return service
}

func (e *ServiceError) Error() string {
	if e.Err != nil {
		return e.Message + ": " + e.Err.Error()
	}
	return e.Message
}

func (e *ServiceError) Unwrap() error {
	return e.Err
}

func (s *Service) GetEmailConfig(ctx context.Context) (*EmailConfig, error) {
	return &EmailConfig{From: s.emailConfig.From, Configured: strings.TrimSpace(s.emailConfig.APIKey) != ""}, nil
}

func (s *Service) TestEmailConfig(ctx context.Context, input TestEmailInput) error {
	if !isValidEmail(strings.TrimSpace(input.To)) {
		return &ServiceError{Status: http.StatusBadRequest, Message: "测试收件邮箱格式不合法"}
	}
	message := email.Message{To: strings.TrimSpace(input.To), Subject: "吉甲大师邮件系统测试", Text: "这是一封测试邮件。中文主题和正文显示正常。", HTML: "<h1>吉甲大师</h1><p>这是一封邮件系统测试邮件。中文主题和 HTML 正文显示正常。</p>"}
	if err := s.mailer.SendEmail(ctx, message); err != nil {
		return &ServiceError{Status: http.StatusBadGateway, Message: "测试邮件发送失败：" + err.Error(), Err: err}
	}
	return nil
}

func (s *Service) TestVerificationCodeConfig(ctx context.Context, input TestVerificationCodeInput) error {
	if !isValidEmail(strings.TrimSpace(input.To)) {
		return &ServiceError{Status: http.StatusBadRequest, Message: "测试收件邮箱格式不合法"}
	}
	code, err := auth.GenerateNumericCode(6)
	if err != nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "生成测试验证码失败", Err: err}
	}
	message := email.Message{To: strings.TrimSpace(input.To), Subject: "吉甲大师验证码测试邮件", Text: fmt.Sprintf("你的验证码为：%s，10 分钟内有效。\n\n这是一封后台测试邮件，不会写入验证码记录。", code)}
	if err := s.mailer.SendEmail(ctx, message); err != nil {
		return &ServiceError{Status: http.StatusBadGateway, Message: "验证码测试邮件发送失败：" + err.Error(), Err: err}
	}
	return nil
}

func (s *Service) GetOAuthConfigs(ctx context.Context) ([]OAuthProviderConfig, error) {
	_ = ctx

	items := make([]OAuthProviderConfig, 0, 2)
	for _, provider := range []string{model.OAuthProviderGitHub, model.OAuthProviderGoogle} {
		settings, err := s.store.OAuthSettings(provider)
		if err != nil {
			return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载第三方登录配置失败", Err: err}
		}
		items = append(items, buildOAuthProviderConfig(provider, settings))
	}

	return items, nil
}

func (s *Service) UpdateOAuthConfig(ctx context.Context, provider string, input UpdateOAuthProviderInput) (*OAuthProviderConfig, error) {
	normalizedProvider := strings.ToLower(strings.TrimSpace(provider))
	if normalizedProvider != model.OAuthProviderGitHub && normalizedProvider != model.OAuthProviderGoogle {
		return nil, &ServiceError{Status: http.StatusNotFound, Message: "不支持的第三方登录类型"}
	}

	current, err := s.store.OAuthSettings(normalizedProvider)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载第三方登录配置失败", Err: err}
	}

	resolvedSecret := resolveSecretValue(strings.TrimSpace(input.ClientSecret), strings.TrimSpace(current.ClientSecret))
	scope := strings.TrimSpace(input.Scope)
	if scope == "" {
		scope = defaultOAuthScope(normalizedProvider)
	}
	if err := validateOAuthSettings(
		input.Enabled,
		strings.TrimSpace(input.ClientID),
		resolvedSecret,
		strings.TrimSpace(input.CallbackURL),
		scope,
	); err != nil {
		return nil, err
	}

	settings := runtimeconfig.OAuthSettings{
		Enabled:      input.Enabled,
		ClientID:     strings.TrimSpace(input.ClientID),
		ClientSecret: resolvedSecret,
		CallbackURL:  strings.TrimSpace(input.CallbackURL),
		Scope:        scope,
	}
	if err := s.store.SaveOAuthSettings(ctx, normalizedProvider, settings); err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "保存第三方登录配置失败", Err: err}
	}

	result := buildOAuthProviderConfig(normalizedProvider, settings)
	return &result, nil
}

func buildOAuthProviderConfig(provider string, settings runtimeconfig.OAuthSettings) OAuthProviderConfig {
	clientSecret := strings.TrimSpace(settings.ClientSecret)
	return OAuthProviderConfig{
		Provider:               provider,
		DisplayName:            oauthDisplayName(provider),
		Enabled:                settings.Enabled,
		ClientID:               strings.TrimSpace(settings.ClientID),
		CallbackURL:            strings.TrimSpace(settings.CallbackURL),
		Scope:                  strings.TrimSpace(settings.Scope),
		ClientSecretMasked:     maskSecret(clientSecret),
		ClientSecretConfigured: clientSecret != "",
		RequiresRestart:        false,
	}
}

func validateOAuthSettings(enabled bool, clientID string, clientSecret string, callbackURL string, scope string) error {
	if !enabled {
		return nil
	}

	switch {
	case clientID == "":
		return &ServiceError{Status: http.StatusBadRequest, Message: "Client ID 不能为空"}
	case clientSecret == "":
		return &ServiceError{Status: http.StatusBadRequest, Message: "Client Secret 不能为空"}
	case callbackURL == "":
		return &ServiceError{Status: http.StatusBadRequest, Message: "回调地址不能为空"}
	case scope == "":
		return &ServiceError{Status: http.StatusBadRequest, Message: "Scope 不能为空"}
	default:
		return nil
	}
}

func defaultOAuthScope(provider string) string {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case model.OAuthProviderGoogle:
		return "openid email profile"
	default:
		return "read:user user:email"
	}
}

func oauthDisplayName(provider string) string {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case model.OAuthProviderGoogle:
		return "Google"
	default:
		return "GitHub"
	}
}

func resolveSecretValue(candidate string, existing string) string {
	if candidate == "" {
		return strings.TrimSpace(existing)
	}
	if candidate == maskedSecretValue {
		return strings.TrimSpace(existing)
	}
	return candidate
}

func maskSecret(value string) string {
	if strings.TrimSpace(value) == "" {
		return ""
	}
	return maskedSecretValue
}

func getValueOrDefault(value string, fallback string) string {
	if trimmed := strings.TrimSpace(value); trimmed != "" {
		return trimmed
	}
	return fallback
}

func isValidEmail(value string) bool {
	parsed, err := mail.ParseAddress(strings.TrimSpace(value))
	if err != nil {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(parsed.Address), strings.TrimSpace(value))
}
