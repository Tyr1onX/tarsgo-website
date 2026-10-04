package auth

import (
	"context"
	"gorm.io/gorm"
	"net/http"
	"strings"
	"tarsgo-backend/model"
)

func (s *Service) VerifyRegisterCode(ctx context.Context, email string, code string) error {
	if err := s.ensureBootstrapCompleted(ctx); err != nil {
		return err
	}

	email = NormalizeEmail(email)
	code = strings.TrimSpace(code)
	if email == "" || code == "" {
		return &ServiceError{Status: http.StatusBadRequest, Message: "邮箱和验证码不能为空"}
	}

	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return s.consumeCode(tx, email, model.EmailCodePurposeRegister, code)
	})
}
