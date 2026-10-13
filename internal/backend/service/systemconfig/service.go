package systemconfig

import (
	"context"
	"fmt"
	"net/http"
	"net/mail"
	"strings"

	"tarsgo-backend/config"
	"tarsgo-backend/service/auth"
	"tarsgo-backend/service/email"
	"tarsgo-backend/service/emailtemplate"
)

type Service struct {
	mailer         email.Mailer
	emailConfig    config.EmailConfig
	registerTester registerCodeTester
	templateStore  emailtemplate.ConfigStore
}

type ServiceError struct {
	Status  int
	Message string
	Err     error
}

type EmailConfig struct {
	From                  string                   `json:"from"`
	Configured            bool                     `json:"configured"`
	NotificationTemplates emailtemplate.Templates  `json:"notificationTemplates"`
	AvailableVariables    []emailtemplate.Variable `json:"availableVariables"`
}

type TestEmailInput struct{ To string }
type TestVerificationCodeInput struct{ To string }

func NewService(cfg config.EmailConfig, testers ...registerCodeTester) *Service {
	service := &Service{
		mailer:         email.NewSender(cfg),
		emailConfig:    cfg,
		registerTester: nil,
	}
	if len(testers) > 0 {
		service.registerTester = testers[0]
	}
	return service
}

func NewServiceWithTemplateStore(cfg config.EmailConfig, store emailtemplate.ConfigStore, testers ...registerCodeTester) *Service {
	service := NewService(cfg, testers...)
	service.templateStore = store
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
	templates, err := emailtemplate.Load(ctx, s.templateStore)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "读取邮件模板失败", Err: err}
	}
	return &EmailConfig{
		From:                  s.emailConfig.From,
		Configured:            strings.TrimSpace(s.emailConfig.APIKey) != "",
		NotificationTemplates: templates,
		AvailableVariables:    emailtemplate.Variables(),
	}, nil
}

func (s *Service) SaveEmailNotificationTemplates(ctx context.Context, templates emailtemplate.Templates) (*EmailConfig, error) {
	if err := emailtemplate.Validate(templates); err != nil {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: err.Error()}
	}
	if s.templateStore == nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "邮件模板存储不可用"}
	}
	if err := emailtemplate.Save(ctx, s.templateStore, templates); err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "保存邮件模板失败", Err: err}
	}
	return s.GetEmailConfig(ctx)
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

func isValidEmail(value string) bool {
	parsed, err := mail.ParseAddress(strings.TrimSpace(value))
	if err != nil {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(parsed.Address), strings.TrimSpace(value))
}
