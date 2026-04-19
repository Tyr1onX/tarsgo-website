package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"gorm.io/gorm"

	"tarsgo-backend/config"
	"tarsgo-backend/model"
)

func (s *Service) SendRegisterCodeWithSMTPConfig(ctx context.Context, email string, smtpConfig config.SMTPConfig) error {
	if err := s.ensureBootstrapCompleted(ctx); err != nil {
		return err
	}

	email = NormalizeEmail(email)
	if email == "" {
		return &ServiceError{Status: http.StatusBadRequest, Message: "邮箱不能为空"}
	}

	if _, err := s.findUserByEmail(ctx, email); err == nil {
		return &ServiceError{Status: http.StatusConflict, Message: "该邮箱已注册"}
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "检查邮箱注册状态失败", Err: err}
	}

	return s.sendCodeWithSMTPConfig(
		ctx,
		email,
		model.EmailCodePurposeRegister,
		"TARS-GO 注册验证码",
		"你的注册验证码为：%s，10 分钟内有效。",
		smtpConfig,
	)
}

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

func (s *Service) sendCodeWithSMTPConfig(
	ctx context.Context,
	email string,
	purpose string,
	subject string,
	bodyTemplate string,
	smtpConfig config.SMTPConfig,
) error {
	now := s.now()

	previous, hasPrevious, err := s.getCodeRecord(ctx, email, purpose)
	if err != nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "查询验证码失败", Err: err}
	}
	if hasPrevious && now.Before(previous.LastSentAt.Add(codeCooldown)) {
		return &ServiceError{Status: http.StatusTooManyRequests, Message: "请求过于频繁，请60秒后重试"}
	}

	code, err := GenerateNumericCode(6)
	if err != nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "生成验证码失败", Err: err}
	}

	record := model.EmailCode{
		Email:      email,
		Purpose:    purpose,
		CodeHash:   HashVerificationCode(email, purpose, code),
		ExpiresAt:  now.Add(codeTTL),
		LastSentAt: now,
	}
	if hasPrevious {
		record.ID = previous.ID
	}

	if hasPrevious {
		if err := s.db.WithContext(ctx).Model(&model.EmailCode{}).Where("id = ?", previous.ID).Updates(map[string]any{
			"code_hash":    record.CodeHash,
			"expires_at":   record.ExpiresAt,
			"last_sent_at": record.LastSentAt,
			"consumed_at":  nil,
		}).Error; err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "保存验证码失败", Err: err}
		}
	} else {
		if err := s.db.WithContext(ctx).Create(&record).Error; err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "保存验证码失败", Err: err}
		}
	}

	if err := NewSMTPMailer(smtpConfig).Send(ctx, email, subject, fmt.Sprintf(bodyTemplate, code)); err != nil {
		if restoreErr := s.restoreCodeRecord(ctx, previous, hasPrevious, record.ID); restoreErr != nil {
			return &ServiceError{
				Status:  http.StatusInternalServerError,
				Message: "发送验证码失败",
				Err:     fmt.Errorf("%v; restore record: %w", err, restoreErr),
			}
		}
		return &ServiceError{Status: http.StatusInternalServerError, Message: "发送验证码失败", Err: err}
	}

	return nil
}
