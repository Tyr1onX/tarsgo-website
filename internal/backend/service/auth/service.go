package auth

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"
	"unicode"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/config"
	"tarsgo-backend/database"
	"tarsgo-backend/model"
	"tarsgo-backend/service/accountprofile"
	"tarsgo-backend/service/email"
	"tarsgo-backend/service/organization"
)

const (
	codeTTL                  = 10 * time.Minute
	codeCooldown             = 60 * time.Second
	passwordResetMaxAttempts = 5
)

type Service struct {
	db         *gorm.DB
	authConfig config.AuthConfig
	now        func() time.Time
	mailer     email.Mailer
}

type ServiceError struct {
	Status  int
	Message string
	Err     error
}

type SessionRole struct {
	ID          uint64 `json:"id"`
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
}

type SessionUser struct {
	WorkbenchAccess       bool                          `json:"workbenchAccess"`
	TeamIdentityStatus    string                        `json:"teamIdentityStatus"`
	ID                    uint64                        `json:"id"`
	Email                 string                        `json:"email"`
	Phone                 *string                       `json:"phone,omitempty"`
	AvatarURL             *string                       `json:"avatarUrl,omitempty"`
	RealName              *string                       `json:"realName,omitempty"`
	Role                  SessionRole                   `json:"role"`
	OrganizationPositions []organization.MemberPosition `json:"organizationPositions,omitempty"`
}

type AuthResult struct {
	User *SessionUser `json:"user"`
}

type BootstrapStatus struct {
	SetupRequired bool `json:"setupRequired"`
}

type RegisterEmailInput struct {
	accountprofile.Input
	Email    string
	Password string
	RealName string
	Code     string
}

type RegisterInitialSuperAdminInput struct {
	Email           string
	RealName        string
	Password        string
	ConfirmPassword string
}

func NewService(cfg *config.Config, db *gorm.DB) *Service {
	return &Service{
		db:         db,
		authConfig: cfg.Auth,
		now:        time.Now,
		mailer:     email.NewSender(cfg.Email),
	}
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

func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("hash password: %w", err)
	}
	return string(hash), nil
}

func ComparePassword(hash string, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}

func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func duplicateEmailConflict() *ServiceError {
	return &ServiceError{
		Status:  http.StatusConflict,
		Message: "该邮箱已注册，请先登录或使用邮箱验证码登录",
	}
}

func (s *Service) CookieName() string {
	return s.authConfig.CookieName
}

func (s *Service) CookieMaxAgeSeconds() int {
	return s.authConfig.CookieMaxAgeSeconds
}

func (s *Service) CookieSecure() bool {
	return s.authConfig.CookieSecure
}

func (s *Service) CookieSameSite() http.SameSite {
	return s.authConfig.CookieSameSite
}

func (s *Service) BootstrapStatus(ctx context.Context) (*BootstrapStatus, error) {
	setupRequired, err := s.isBootstrapRequired(ctx)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "检查系统初始化状态失败", Err: err}
	}

	return &BootstrapStatus{SetupRequired: setupRequired}, nil
}

func (s *Service) SendRegisterCode(ctx context.Context, email string) error {
	if err := s.ensureBootstrapCompleted(ctx); err != nil {
		return err
	}

	email = NormalizeEmail(email)
	if email == "" {
		return &ServiceError{Status: http.StatusBadRequest, Message: "邮箱不能为空"}
	}

	if _, err := s.findUserByEmail(ctx, email); err == nil {
		return duplicateEmailConflict()
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "检查邮箱注册状态失败", Err: err}
	}

	return s.sendCode(ctx, email, model.EmailCodePurposeRegister, "TARS-GO 注册验证码", "你的注册验证码为：%s，10 分钟内有效。")
}

func (s *Service) RegisterWithEmail(ctx context.Context, input RegisterEmailInput) (*AuthResult, error) {
	if err := s.ensureBootstrapCompleted(ctx); err != nil {
		return nil, err
	}

	normalizedInput, err := normalizeRegisterEmailInput(input)
	if err != nil {
		return nil, err
	}

	if _, err := s.findUserByEmail(ctx, normalizedInput.Email); err == nil {
		return nil, duplicateEmailConflict()
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "检查邮箱注册状态失败", Err: err}
	}

	passwordHash, err := HashPassword(normalizedInput.Password)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "生成密码摘要失败", Err: err}
	}

	var result *AuthResult
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := s.consumeCode(tx, normalizedInput.Email, model.EmailCodePurposeRegister, normalizedInput.Code); err != nil {
			return err
		}

		role, err := s.findRoleByNameTx(tx, model.RoleNameUser)
		if err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "默认用户角色不存在", Err: err}
		}

		lastLoginAt := s.now()
		user := model.User{
			RoleID:       role.ID,
			Email:        normalizedInput.Email,
			PasswordHash: stringPtr(passwordHash),
			Status:       1,
			LastLoginAt:  &lastLoginAt,
		}
		assignOptionalString(&user.RealName, normalizedInput.RealName)
		user.IsStudent = normalizedInput.IsStudent
		user.StudentID = normalizedInput.StudentID
		user.College = normalizedInput.College
		user.Grade = normalizedInput.Grade
		if err := tx.Create(&user).Error; err != nil {
			if database.IsDuplicateKeyError(err) {
				return duplicateEmailConflict()
			}
			return &ServiceError{Status: http.StatusInternalServerError, Message: "创建用户失败", Err: err}
		}
		loadedUser, err := s.loadUserWithRoleTx(tx, user.ID)
		if err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "加载注册用户信息失败", Err: err}
		}

		authResult, err := s.buildAuthResult(loadedUser)
		if err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "生成登录态失败", Err: err}
		}
		result = authResult

		return nil
	})
	if err != nil {
		return nil, err
	}

	return result, nil
}

type normalizedRegisterEmailInput struct {
	accountprofile.Input
	Email    string
	Password string
	RealName string
	Code     string
}

func normalizeRegisterEmailInput(input RegisterEmailInput) (*normalizedRegisterEmailInput, error) {
	normalized := &normalizedRegisterEmailInput{
		Email:    NormalizeEmail(input.Email),
		Password: strings.TrimSpace(input.Password),
		RealName: strings.TrimSpace(input.RealName),
		Code:     strings.TrimSpace(input.Code),
	}

	if normalized.Email == "" || normalized.Password == "" || normalized.Code == "" {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "邮箱、密码和验证码不能为空"}
	}
	if normalized.RealName == "" {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "姓名不能为空"}
	}
	if !isChineseRealName(normalized.RealName) {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "姓名需为汉字"}
	}
	academic, err := accountprofile.Normalize(input.Input, time.Now())
	if err != nil {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: err.Error()}
	}
	normalized.Input = academic

	return normalized, nil
}

func (s *Service) RegisterInitialSuperAdmin(ctx context.Context, input RegisterInitialSuperAdminInput) (*AuthResult, error) {
	email := NormalizeEmail(input.Email)
	realName := strings.TrimSpace(input.RealName)
	password := strings.TrimSpace(input.Password)
	confirmPassword := strings.TrimSpace(input.ConfirmPassword)

	if email == "" || realName == "" || password == "" || confirmPassword == "" {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "真实姓名、邮箱、密码和确认密码不能为空"}
	}
	if !isChineseRealName(realName) {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "姓名需为汉字"}
	}
	if !isValidEmail(email) {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "邮箱格式不合法"}
	}
	if len(password) < 6 || len(password) > 72 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "密码长度需为 6 到 72 位"}
	}
	if password != confirmPassword {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "两次输入的密码不一致"}
	}

	passwordHash, err := HashPassword(password)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "生成密码摘要失败", Err: err}
	}

	var result *AuthResult
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		role, err := s.findRoleByNameForUpdateTx(tx, model.RoleNameSuperAdmin)
		if err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "超级管理员角色不存在", Err: err}
		}

		hasSuperAdmin, err := s.hasUsersByRoleIDTx(tx, role.ID)
		if err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "检查系统初始化状态失败", Err: err}
		}
		if hasSuperAdmin {
			return &ServiceError{Status: http.StatusConflict, Message: "系统已初始化，请直接登录"}
		}

		if _, err := s.findUserByEmailTx(tx, email); err == nil {
			return &ServiceError{Status: http.StatusConflict, Message: "该邮箱已注册"}
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "检查邮箱注册状态失败", Err: err}
		}

		lastLoginAt := s.now()
		user := model.User{
			RoleID:       role.ID,
			Email:        email,
			PasswordHash: stringPtr(passwordHash),
			Status:       model.UserStatusEnabled,
			LastLoginAt:  &lastLoginAt,
		}
		assignOptionalString(&user.RealName, realName)
		if err := tx.Create(&user).Error; err != nil {
			if database.IsDuplicateKeyError(err) {
				return duplicateEmailConflict()
			}
			return &ServiceError{Status: http.StatusInternalServerError, Message: "创建超级管理员失败", Err: err}
		}

		loadedUser, err := s.loadUserWithRoleTx(tx, user.ID)
		if err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "加载超级管理员信息失败", Err: err}
		}

		authResult, err := s.buildAuthResult(loadedUser)
		if err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "生成登录态失败", Err: err}
		}
		result = authResult
		return nil
	})
	if err != nil {
		return nil, err
	}

	return result, nil
}

func (s *Service) LoginWithPassword(ctx context.Context, email string, password string) (*AuthResult, error) {
	if err := s.ensureBootstrapCompleted(ctx); err != nil {
		return nil, err
	}

	user, err := s.findUserByEmail(ctx, NormalizeEmail(email))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusUnauthorized, Message: "邮箱或密码错误"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询用户失败", Err: err}
	}

	if user.PasswordHash == nil || ComparePassword(*user.PasswordHash, strings.TrimSpace(password)) != nil {
		return nil, &ServiceError{Status: http.StatusUnauthorized, Message: "邮箱或密码错误"}
	}
	if err := ensureUserEnabled(user); err != nil {
		return nil, err
	}
	if err := validateIdentityConsistency(user); err != nil {
		return nil, err
	}

	now := s.now()
	if err := s.db.WithContext(ctx).Model(&model.User{}).Where("id = ?", user.ID).Update("last_login_at", now).Error; err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "更新登录时间失败", Err: err}
	}
	user.LastLoginAt = &now

	return s.buildAuthResult(user)
}

func (s *Service) SendLoginCode(ctx context.Context, email string) error {
	if err := s.ensureBootstrapCompleted(ctx); err != nil {
		return err
	}

	email = NormalizeEmail(email)
	if email == "" {
		return &ServiceError{Status: http.StatusBadRequest, Message: "邮箱不能为空"}
	}

	user, err := s.findUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &ServiceError{Status: http.StatusNotFound, Message: "该邮箱未注册"}
		}
		return &ServiceError{Status: http.StatusInternalServerError, Message: "检查邮箱登录状态失败", Err: err}
	}
	if err := ensureUserEnabled(user); err != nil {
		return err
	}

	return s.sendCode(ctx, email, model.EmailCodePurposeLogin, "TARS-GO 登录验证码", "你的登录验证码为：%s，10 分钟内有效。")
}

// SendPasswordResetCode does not reveal if the email belongs to an active account.
// Existing email-code storage enforces 10-minute expiry and 60-second resends.
func (s *Service) SendPasswordResetCode(ctx context.Context, address string) error {
	if err := s.ensureBootstrapCompleted(ctx); err != nil {
		return err
	}
	address = NormalizeEmail(address)
	if !isValidEmail(address) {
		return &ServiceError{Status: http.StatusBadRequest, Message: "邮箱格式不合法"}
	}
	user, err := s.findUserByEmail(ctx, address)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "无法处理重置请求", Err: err}
	}
	if user.Status != model.UserStatusEnabled {
		return nil
	}
	if err := s.sendCode(ctx, address, model.EmailCodePurposePasswordReset,
		"TARS-GO 重置密码验证码", "你的密码重置验证码为：%s，10 分钟内有效。如果不是你本人操作，请忽略此邮件。"); err != nil {
		// Mail-provider errors and cooldowns must not disclose account existence.
		log.Printf("password reset email request could not be delivered")
	}
	return nil
}

// ResetPassword consumes one code, limits guesses and invalidates browser sessions
// in a single transaction. The caller remains logged out after a successful reset.
func (s *Service) ResetPassword(ctx context.Context, address, code, newPassword string) error {
	if err := s.ensureBootstrapCompleted(ctx); err != nil {
		return err
	}
	address, code = NormalizeEmail(address), strings.TrimSpace(code)
	if !isValidEmail(address) || len(code) != 6 || len(newPassword) < 8 || len(newPassword) > 72 {
		return &ServiceError{Status: http.StatusBadRequest, Message: "邮箱、验证码或密码格式不合法"}
	}
	for _, digit := range code {
		if digit < '0' || digit > '9' {
			return &ServiceError{Status: http.StatusBadRequest, Message: "验证码格式不合法"}
		}
	}
	invalid := false
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var record model.EmailCode
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("email = ? AND purpose = ?", address, model.EmailCodePurposePasswordReset).First(&record).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				invalid = true
				return nil
			}
			return err
		}
		now := s.now().UTC()
		if record.ConsumedAt != nil || !now.Before(record.ExpiresAt) || record.FailedAttempts >= passwordResetMaxAttempts {
			invalid = true
			return nil
		}
		expected := HashVerificationCode(address, model.EmailCodePurposePasswordReset, code)
		if subtle.ConstantTimeCompare([]byte(record.CodeHash), []byte(expected)) != 1 {
			invalid = true
			// Commit the failed-attempt counter even when the request fails.
			return tx.Model(&record).Update("failed_attempts", record.FailedAttempts+1).Error
		}
		var user model.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("email = ? AND status = ?", address, model.UserStatusEnabled).First(&user).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				invalid = true
				return nil
			}
			return err
		}
		hash, err := HashPassword(newPassword)
		if err != nil {
			return err
		}
		if err := tx.Model(&record).Update("consumed_at", now).Error; err != nil {
			return err
		}
		if err := tx.Model(&user).Updates(map[string]any{"password_hash": hash, "password_reset_at": now}).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.AuthSession{}).Where("user_id = ? AND revoked_at IS NULL", user.ID).Update("revoked_at", now).Error; err != nil {
			return err
		}
		return tx.Where("user_id = ?", user.ID).Delete(&model.AccountVaultEntry{}).Error
	})
	if err != nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "重置密码失败", Err: err}
	}
	if invalid {
		return &ServiceError{Status: http.StatusBadRequest, Message: "验证码错误、已过期或尝试次数过多"}
	}
	return nil
}

func (s *Service) LoginWithCode(ctx context.Context, email string, code string) (*AuthResult, error) {
	if err := s.ensureBootstrapCompleted(ctx); err != nil {
		return nil, err
	}

	email = NormalizeEmail(email)
	code = strings.TrimSpace(code)
	if email == "" || code == "" {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "邮箱和验证码不能为空"}
	}

	var user *model.User
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := s.consumeCode(tx, email, model.EmailCodePurposeLogin, code); err != nil {
			return err
		}

		loadedUser, err := s.findUserByEmailTx(tx, email)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return &ServiceError{Status: http.StatusNotFound, Message: "该邮箱未注册"}
			}
			return &ServiceError{Status: http.StatusInternalServerError, Message: "查询用户失败", Err: err}
		}
		if err := ensureUserEnabled(loadedUser); err != nil {
			return err
		}

		now := s.now()
		if err := tx.Model(&model.User{}).Where("id = ?", loadedUser.ID).Update("last_login_at", now).Error; err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "更新登录时间失败", Err: err}
		}
		loadedUser.LastLoginAt = &now
		user = loadedUser
		return nil
	})
	if err != nil {
		return nil, err
	}

	return s.buildAuthResult(user)
}

func (s *Service) CurrentUser(ctx context.Context, token string) (*SessionUser, error) {
	user, _, err := s.currentUserWithSession(ctx, token)
	return user, err
}

// CurrentUserAndRenewal authenticates once and reuses the validated opaque
// session when deciding whether its idle expiry needs renewal.
func (s *Service) CurrentUserAndRenewal(ctx context.Context, token, vaultToken string) (*CurrentUserRenewalResult, error) {
	user, session, err := s.currentUserWithSession(ctx, token)
	if err != nil {
		return nil, err
	}
	renewal, renewalErr := s.renewAccountSession(ctx, token, vaultToken, session, true)
	return &CurrentUserRenewalResult{User: user, Renewal: renewal, RenewalError: renewalErr}, nil
}

func (s *Service) currentUserWithSession(ctx context.Context, token string) (*SessionUser, *model.AuthSession, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, nil, &ServiceError{Status: http.StatusUnauthorized, Message: "未登录"}
	}

	userID := uint64(0)
	legacyIssuedAt := int64(-1)
	session, found, sessionErr := s.findAuthSession(ctx, token)
	if sessionErr != nil {
		return nil, nil, &ServiceError{Status: http.StatusInternalServerError, Message: "读取登录会话失败", Err: sessionErr}
	}
	if found {
		if session.RevokedAt != nil || !s.now().Before(session.ExpiresAt) || !session.CreatedAt.Add(MaxSessionLifetime).After(s.now()) {
			return nil, nil, &ServiceError{Status: http.StatusUnauthorized, Message: "登录态已失效"}
		}
		userID = session.UserID
	} else {
		// JWT cookies issued before server-side account sessions remain valid
		// until their original expiry, then all new logins use opaque sessions.
		claims, err := ParseToken(s.authConfig.JWTSecret, token)
		if err != nil {
			return nil, nil, &ServiceError{Status: http.StatusUnauthorized, Message: "登录态已失效", Err: err}
		}
		legacyIssuedAt = claims.IssuedAt
		userID, err = strconv.ParseUint(claims.Subject, 10, 64)
		if err != nil {
			return nil, nil, &ServiceError{Status: http.StatusUnauthorized, Message: "登录态无效", Err: err}
		}
	}

	user, err := s.loadUserWithRole(ctx, userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, &ServiceError{Status: http.StatusUnauthorized, Message: "当前用户不存在"}
		}
		return nil, nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载当前用户失败", Err: err}
	}
	if err := ensureUserEnabled(user); err != nil {
		return nil, nil, err
	}
	if legacyIssuedAt >= 0 && user.PasswordResetAt != nil && legacyIssuedAt <= user.PasswordResetAt.Unix() {
		return nil, nil, &ServiceError{Status: http.StatusUnauthorized, Message: "登录态已失效，请重新登录"}
	}
	if err := validateIdentityConsistency(user); err != nil {
		return nil, nil, err
	}

	sessionUser := toSessionUser(user)
	if !found {
		session = nil
	}
	return &sessionUser, session, nil
}

func (s *Service) sendCode(ctx context.Context, email string, purpose string, subject string, bodyTemplate string) error {
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
			"code_hash":       record.CodeHash,
			"expires_at":      record.ExpiresAt,
			"last_sent_at":    record.LastSentAt,
			"consumed_at":     nil,
			"failed_attempts": 0,
		}).Error; err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "保存验证码失败", Err: err}
		}
	} else {
		if err := s.db.WithContext(ctx).Create(&record).Error; err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "保存验证码失败", Err: err}
		}
	}

	if err := s.mailer.SendEmail(ctx, mailMessage(email, subject, fmt.Sprintf(bodyTemplate, code))); err != nil {
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

func (s *Service) consumeCode(tx *gorm.DB, email string, purpose string, code string) error {
	var record model.EmailCode
	if err := tx.
		Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("email = ? AND purpose = ?", email, purpose).
		First(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &ServiceError{Status: http.StatusBadRequest, Message: "验证码错误或已过期"}
		}
		return &ServiceError{Status: http.StatusInternalServerError, Message: "查询验证码失败", Err: err}
	}

	now := s.now()
	if record.ConsumedAt != nil || now.After(record.ExpiresAt) || record.CodeHash != HashVerificationCode(email, purpose, code) {
		return &ServiceError{Status: http.StatusBadRequest, Message: "验证码错误或已过期"}
	}

	record.ConsumedAt = &now
	if err := tx.Save(&record).Error; err != nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "更新验证码状态失败", Err: err}
	}

	return nil
}

func (s *Service) buildAuthResult(user *model.User) (*AuthResult, error) {
	if err := validateIdentityConsistency(user); err != nil {
		return nil, err
	}
	sessionUser := toSessionUser(user)
	return &AuthResult{
		User: &sessionUser,
	}, nil
}

func (s *Service) ensureBootstrapCompleted(ctx context.Context) error {
	setupRequired, err := s.isBootstrapRequired(ctx)
	if err != nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "检查系统初始化状态失败", Err: err}
	}
	if setupRequired {
		return &ServiceError{Status: http.StatusConflict, Message: "系统尚未初始化，请先完成超级管理员注册"}
	}
	return nil
}

func (s *Service) isBootstrapRequired(ctx context.Context) (bool, error) {
	hasSuperAdmin, err := s.hasSuperAdmin(ctx)
	if err != nil {
		return false, err
	}
	return !hasSuperAdmin, nil
}

func (s *Service) hasSuperAdmin(ctx context.Context) (bool, error) {
	return s.hasSuperAdminTx(s.db.WithContext(ctx))
}

func (s *Service) hasSuperAdminTx(tx *gorm.DB) (bool, error) {
	var role model.Role
	if err := tx.Select("id").Where("name = ?", model.RoleNameSuperAdmin).First(&role).Error; err != nil {
		return false, err
	}

	return s.hasUsersByRoleIDTx(tx, role.ID)
}

func (s *Service) hasUsersByRoleIDTx(tx *gorm.DB, roleID uint64) (bool, error) {
	var count int64
	if err := tx.Model(&model.User{}).Where("role_id = ?", roleID).Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *Service) getCodeRecord(ctx context.Context, email string, purpose string) (model.EmailCode, bool, error) {
	var record model.EmailCode
	err := s.db.WithContext(ctx).Where("email = ? AND purpose = ?", email, purpose).First(&record).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.EmailCode{}, false, nil
	}
	if err != nil {
		return model.EmailCode{}, false, err
	}
	return record, true, nil
}

func (s *Service) restoreCodeRecord(ctx context.Context, previous model.EmailCode, hasPrevious bool, createdID uint64) error {
	if hasPrevious {
		return s.db.WithContext(ctx).Model(&model.EmailCode{}).Where("id = ?", previous.ID).Updates(map[string]any{
			"code_hash":       previous.CodeHash,
			"expires_at":      previous.ExpiresAt,
			"last_sent_at":    previous.LastSentAt,
			"consumed_at":     previous.ConsumedAt,
			"failed_attempts": previous.FailedAttempts,
		}).Error
	}

	if createdID == 0 {
		return nil
	}

	return s.db.WithContext(ctx).Delete(&model.EmailCode{}, createdID).Error
}

func (s *Service) findUserByEmail(ctx context.Context, email string) (*model.User, error) {
	return s.findUserByEmailTx(s.db.WithContext(ctx), email)
}

func (s *Service) findUserByEmailTx(tx *gorm.DB, email string) (*model.User, error) {
	return loadSessionUser(tx.Where("email = ?", email))
}

func (s *Service) findRoleByNameTx(tx *gorm.DB, name string) (*model.Role, error) {
	var role model.Role
	if err := tx.Where("name = ?", name).First(&role).Error; err != nil {
		return nil, err
	}
	return &role, nil
}

func (s *Service) findRoleByNameForUpdateTx(tx *gorm.DB, name string) (*model.Role, error) {
	var role model.Role
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("name = ?", name).First(&role).Error; err != nil {
		return nil, err
	}
	return &role, nil
}

func (s *Service) loadUserWithRole(ctx context.Context, userID uint64) (*model.User, error) {
	return s.loadUserWithRoleTx(s.db.WithContext(ctx), userID)
}

func (s *Service) loadUserWithRoleTx(tx *gorm.DB, userID uint64) (*model.User, error) {
	return loadSessionUser(tx.Where("`users`.`id` = ?", userID))
}

func loadSessionUser(tx *gorm.DB) (*model.User, error) {
	var row struct {
		model.User
		Eligible bool `gorm:"column:workbench_access"`
	}
	if err := tx.Model(&model.User{}).Select("users.*, " + model.WorkbenchAccessSQL).Preload("Role").First(&row).Error; err != nil {
		return nil, err
	}
	row.User.WorkbenchAccess = row.Eligible
	return &row.User, nil
}

func toSessionUser(user *model.User) SessionUser {
	var realName *string
	if user.RealName != nil {
		trimmed := strings.TrimSpace(*user.RealName)
		if trimmed != "" {
			realName = &trimmed
		}
	}
	return SessionUser{
		WorkbenchAccess:       user.WorkbenchAccess,
		TeamIdentityStatus:    model.NormalizeTeamIdentityStatus(user.TeamIdentityStatus),
		ID:                    user.ID,
		Email:                 user.Email,
		Phone:                 user.Phone,
		AvatarURL:             user.AvatarURL,
		RealName:              realName,
		OrganizationPositions: organization.MemberPositions(user.ID),
		Role: SessionRole{
			ID:          user.Role.ID,
			Name:        user.Role.Name,
			DisplayName: user.Role.DisplayName,
		},
	}
}

func ensureUserEnabled(user *model.User) error {
	if user.Status == model.UserStatusDisabled {
		return &ServiceError{Status: http.StatusForbidden, Message: "账号已停用"}
	}
	return nil
}

func validateIdentityConsistency(user *model.User) error {
	if user == nil {
		return &ServiceError{Status: http.StatusUnauthorized, Message: "当前用户不存在"}
	}
	switch user.Role.Name {
	case model.RoleNameSuperAdmin, model.RoleNameAdmin, model.RoleNameUser:
		// admin_scope, management_group_id and membership roles are retained as
		// compatibility / organizational metadata. They no longer decide whether
		// a valid system role may authenticate or use core admin capabilities.
		return nil
	default:
		return &ServiceError{Status: http.StatusForbidden, Message: "系统角色不合法"}
	}
}

func GenerateNumericCode(length int) (string, error) {
	value, err := GenerateRandomString(length)
	if err != nil {
		return "", err
	}

	builder := strings.Builder{}
	builder.Grow(length)
	for _, char := range value {
		builder.WriteByte(byte('0' + (char % 10)))
	}

	return builder.String(), nil
}

func assignOptionalString(target **string, value string) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return
	}
	*target = &trimmed
}

func stringPtr(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return &value
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func isValidEmail(email string) bool {
	parsed, err := mail.ParseAddress(email)
	if err != nil {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(parsed.Address), strings.TrimSpace(email))
}

func isChineseRealName(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return false
	}

	for _, r := range trimmed {
		if !unicode.Is(unicode.Han, r) {
			return false
		}
	}

	return true
}

func isValidMainlandMobile(phone string) bool {
	if len(phone) != 11 || phone[0] != '1' || phone[1] < '3' || phone[1] > '9' {
		return false
	}
	for i := 2; i < len(phone); i++ {
		if phone[i] < '0' || phone[i] > '9' {
			return false
		}
	}
	return true
}

func mailMessage(to, subject, text string) email.Message {
	return email.Message{To: to, Subject: subject, Text: text}
}
