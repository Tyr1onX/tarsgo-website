package systemconfig

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"unicode"

	"tarsgo-backend/config"
	"tarsgo-backend/service/auth"
)

type registerCodeTester interface {
	SendRegisterCodeWithSMTPConfig(ctx context.Context, email string, smtpConfig config.SMTPConfig) error
	VerifyRegisterCode(ctx context.Context, email string, code string) error
}

type SendRegisterFlowCodeInput struct {
	Host     string
	Port     string
	Username string
	Password string
	From     string
	Email    string
}

type VerifyRegisterFlowCodeInput struct {
	Email string
	Code  string
}

func (s *Service) SendRegisterFlowCode(ctx context.Context, input SendRegisterFlowCodeInput) error {
	if s.registerTester == nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "注册验证码测试服务未配置"}
	}

	email := strings.TrimSpace(input.Email)
	if !isValidEmail(email) {
		return &ServiceError{Status: http.StatusBadRequest, Message: "测试邮箱格式不合法"}
	}

	current := s.store.SMTPConfig()
	resolvedPassword := resolveSecretValue(strings.TrimSpace(input.Password), strings.TrimSpace(current.Password))
	host := strings.TrimSpace(input.Host)
	port := strings.TrimSpace(input.Port)
	username := strings.TrimSpace(input.Username)
	from := strings.TrimSpace(input.From)

	if err := validateEmailSettings(host, port, username, resolvedPassword, from); err != nil {
		return err
	}

	if err := s.registerTester.SendRegisterCodeWithSMTPConfig(ctx, email, config.SMTPConfig{
		Host:     host,
		Port:     port,
		Username: username,
		Password: resolvedPassword,
		From:     from,
	}); err != nil {
		return mapRegisterFlowError(err, "发送注册验证码失败")
	}

	return nil
}

func (s *Service) VerifyRegisterFlowCode(ctx context.Context, input VerifyRegisterFlowCodeInput) error {
	if s.registerTester == nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "注册验证码测试服务未配置"}
	}

	email := strings.TrimSpace(input.Email)
	code := strings.TrimSpace(input.Code)
	if !isValidEmail(email) {
		return &ServiceError{Status: http.StatusBadRequest, Message: "测试邮箱格式不合法"}
	}
	if !isNumericCode(code) {
		return &ServiceError{Status: http.StatusBadRequest, Message: "验证码必须是 6 位数字"}
	}

	if err := s.registerTester.VerifyRegisterCode(ctx, email, code); err != nil {
		return mapRegisterFlowError(err, "验证码校验失败")
	}

	return nil
}

func mapRegisterFlowError(err error, fallback string) error {
	var authErr *auth.ServiceError
	if errors.As(err, &authErr) {
		return &ServiceError{Status: authErr.Status, Message: authErr.Message, Err: authErr.Err}
	}

	return &ServiceError{Status: http.StatusBadGateway, Message: fallback, Err: err}
}

func isNumericCode(value string) bool {
	if len(strings.TrimSpace(value)) != 6 {
		return false
	}

	for _, r := range value {
		if !unicode.IsDigit(r) {
			return false
		}
	}

	return true
}
