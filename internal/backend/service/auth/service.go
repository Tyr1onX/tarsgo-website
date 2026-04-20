package auth

import (
	"context"
	"errors"
	"fmt"
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
	"tarsgo-backend/model"
	"tarsgo-backend/service/usergroup"
)

const (
	codeTTL      = 10 * time.Minute
	codeCooldown = 60 * time.Second
)

type Service struct {
	db          *gorm.DB
	appConfig   config.AppConfig
	authConfig  config.AuthConfig
	configStore dynamicConfigStore
	now         func() time.Time
}

type dynamicConfigStore interface {
	SMTPConfig() config.SMTPConfig
	GitHubConfig() config.GitHubConfig
	GoogleConfig() config.GoogleConfig
}

type staticConfigStore struct {
	smtp   config.SMTPConfig
	github config.GitHubConfig
	google config.GoogleConfig
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

type SessionUserPortal struct {
	ShowRecruitmentEntry bool `json:"showRecruitmentEntry"`
}

type SessionUser struct {
	ID        uint64             `json:"id"`
	Email     string             `json:"email"`
	Phone     *string            `json:"phone,omitempty"`
	Nickname  *string            `json:"nickname,omitempty"`
	AvatarURL *string            `json:"avatarUrl,omitempty"`
	Role      SessionRole        `json:"role"`
	Portal    *SessionUserPortal `json:"portal,omitempty"`
}

type AuthResult struct {
	Token string       `json:"-"`
	User  *SessionUser `json:"user"`
}

type BootstrapStatus struct {
	SetupRequired bool `json:"setupRequired"`
}

type RegisterEmailInput struct {
	Email    string
	Password string
	RealName string
	Phone    string
	Code     string
}

type RegisterInitialSuperAdminInput struct {
	Email           string
	Password        string
	ConfirmPassword string
}

func NewService(cfg *config.Config, db *gorm.DB, configStore dynamicConfigStore) *Service {
	if configStore == nil {
		configStore = staticConfigStore{
			smtp:   cfg.SMTP,
			github: cfg.GitHub,
			google: cfg.Google,
		}
	}

	return &Service{
		db:          db,
		appConfig:   cfg.App,
		authConfig:  cfg.Auth,
		configStore: configStore,
		now:         time.Now,
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

func (s *Service) CookieName() string {
	return s.authConfig.CookieName
}

func (s *Service) OAuthStateCookieName() string {
	return s.authConfig.OAuthStateCookie
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

func (s *Service) AdminDashboardURL() string {
	return s.appConfig.AdminDashboardURL()
}

func (s *Service) SetupSuperAdminURL() string {
	return s.appConfig.BootstrapSetupURL()
}

func (s *Service) LoginErrorURL(code string) string {
	return s.appConfig.LoginErrorURL(code)
}

func (s *Service) ListOAuthLoginProviders() []OAuthLoginProvider {
	providers := make([]OAuthLoginProvider, 0, 2)
	for _, providerName := range []string{model.OAuthProviderGitHub, model.OAuthProviderGoogle} {
		provider, err := s.oauthProviderByName(providerName)
		if err != nil || !provider.Enabled() {
			continue
		}

		providers = append(providers, OAuthLoginProvider{
			Provider:    provider.Provider(),
			DisplayName: provider.DisplayName(),
		})
	}

	return providers
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
		return &ServiceError{Status: http.StatusConflict, Message: "该邮箱已注册"}
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
		return nil, &ServiceError{Status: http.StatusConflict, Message: "该邮箱已注册"}
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

		user := model.User{
			RoleID:       role.ID,
			Name:         deriveDisplayName(normalizedInput.Email, normalizedInput.RealName, ""),
			Email:        normalizedInput.Email,
			PasswordHash: stringPtr(passwordHash),
			Status:       1,
		}
		assignOptionalString(&user.RealName, normalizedInput.RealName)
		assignOptionalString(&user.Phone, normalizedInput.Phone)
		if err := tx.Create(&user).Error; err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "创建用户失败", Err: err}
		}
		if err := usergroup.AssignDefaultGroupTx(tx, user.ID); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "分配默认用户组失败", Err: err}
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
	Email    string
	Password string
	RealName string
	Phone    string
	Code     string
}

func normalizeRegisterEmailInput(input RegisterEmailInput) (*normalizedRegisterEmailInput, error) {
	normalized := &normalizedRegisterEmailInput{
		Email:    NormalizeEmail(input.Email),
		Password: strings.TrimSpace(input.Password),
		RealName: strings.TrimSpace(input.RealName),
		Phone:    strings.TrimSpace(input.Phone),
		Code:     strings.TrimSpace(input.Code),
	}

	if normalized.Email == "" || normalized.Password == "" || normalized.Code == "" {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "邮箱、密码和验证码不能为空"}
	}
	if normalized.RealName == "" || normalized.Phone == "" {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "真实姓名和手机号不能为空"}
	}
	if !isChineseRealName(normalized.RealName) {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "真实姓名需为汉字"}
	}

	return normalized, nil
}

func (s *Service) RegisterInitialSuperAdmin(ctx context.Context, input RegisterInitialSuperAdminInput) (*AuthResult, error) {
	email := NormalizeEmail(input.Email)
	password := strings.TrimSpace(input.Password)
	confirmPassword := strings.TrimSpace(input.ConfirmPassword)

	if email == "" || password == "" || confirmPassword == "" {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "邮箱、密码和确认密码不能为空"}
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

		user := model.User{
			RoleID:       role.ID,
			Name:         deriveDisplayName(email, "", ""),
			Email:        email,
			PasswordHash: stringPtr(passwordHash),
			Status:       model.UserStatusEnabled,
		}
		if err := tx.Create(&user).Error; err != nil {
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

func (s *Service) BuildOAuthLoginURL(providerName string) (string, string, error) {
	provider, err := s.getOAuthProvider(providerName)
	if err != nil {
		return "", "", err
	}

	state, err := GenerateRandomString(32)
	if err != nil {
		return "", "", &ServiceError{
			Status:  http.StatusInternalServerError,
			Message: fmt.Sprintf("生成 %s 登录态失败", provider.DisplayName()),
			Err:     err,
		}
	}

	return provider.BuildLoginURL(state), state, nil
}

func (s *Service) BuildGitHubLoginURL() (string, string, error) {
	return s.BuildOAuthLoginURL(model.OAuthProviderGitHub)
}

func (s *Service) HandleOAuthCallback(ctx context.Context, providerName string, code string) (*AuthResult, error) {
	if err := s.ensureBootstrapCompleted(ctx); err != nil {
		return nil, err
	}

	provider, err := s.getOAuthProvider(providerName)
	if err != nil {
		return nil, err
	}

	accessToken, err := provider.ExchangeCode(ctx, strings.TrimSpace(code))
	if err != nil {
		return nil, &ServiceError{
			Status:  http.StatusBadGateway,
			Message: fmt.Sprintf("获取 %s 访问令牌失败", provider.DisplayName()),
			Err:     err,
		}
	}

	profile, err := provider.FetchProfile(ctx, accessToken)
	if err != nil {
		return nil, &ServiceError{
			Status:  http.StatusBadGateway,
			Message: fmt.Sprintf("获取 %s 用户信息失败", provider.DisplayName()),
			Err:     err,
		}
	}

	profile.Provider = provider.Provider()
	oauthAccount, err := s.findOAuthAccountByProviderUserID(ctx, provider.Provider(), profile.ProviderUserID)
	if err == nil {
		user, loadErr := s.loadUserWithRole(ctx, oauthAccount.UserID)
		if loadErr != nil {
			if errors.Is(loadErr, gorm.ErrRecordNotFound) {
				return nil, &ServiceError{Status: http.StatusNotFound, Message: "当前用户不存在"}
			}
			return nil, &ServiceError{
				Status:  http.StatusInternalServerError,
				Message: fmt.Sprintf("查询 %s 用户失败", provider.DisplayName()),
				Err:     loadErr,
			}
		}
		return s.completeOAuthLogin(ctx, user, profile, false)
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, &ServiceError{
			Status:  http.StatusInternalServerError,
			Message: fmt.Sprintf("查询 %s 用户失败", provider.DisplayName()),
			Err:     err,
		}
	}

	email := NormalizeEmail(profile.Email)
	if email == "" {
		return nil, &ServiceError{
			Status:  http.StatusBadGateway,
			Message: fmt.Sprintf("%s 用户缺少可用邮箱", provider.DisplayName()),
		}
	}

	if profile.EmailVerified {
		user, err := s.findUserByEmail(ctx, email)
		if err == nil {
			if err := s.ensureOAuthBindingAllowed(ctx, user, provider.Provider(), profile.ProviderUserID); err != nil {
				return nil, err
			}
			return s.completeOAuthLogin(ctx, user, profile, true)
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询邮箱用户失败", Err: err}
		}
	} else if existingUser, lookupErr := s.findUserByEmail(ctx, email); lookupErr == nil {
		return nil, &ServiceError{
			Status:  http.StatusConflict,
			Message: fmt.Sprintf("%s 账号邮箱未验证，无法自动绑定已有账号 %s", provider.DisplayName(), existingUser.Email),
		}
	} else if !errors.Is(lookupErr, gorm.ErrRecordNotFound) {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询邮箱用户失败", Err: lookupErr}
	}

	var result *AuthResult
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		role, err := s.findRoleByNameTx(tx, model.RoleNameUser)
		if err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "默认用户角色不存在", Err: err}
		}

		createdUser := newOAuthUser(role.ID, email, profile)

		if err := tx.Create(&createdUser).Error; err != nil {
			return &ServiceError{
				Status:  http.StatusInternalServerError,
				Message: fmt.Sprintf("创建 %s 用户失败", provider.DisplayName()),
				Err:     err,
			}
		}
		if err := s.saveOAuthAccountTx(tx, createdUser.ID, profile); err != nil {
			return err
		}
		if err := usergroup.AssignDefaultGroupTx(tx, createdUser.ID); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "分配默认用户组失败", Err: err}
		}

		now := s.now()
		updates := buildOAuthUserUpdates(&createdUser, profile, now, false)
		if err := tx.Model(&model.User{}).Where("id = ?", createdUser.ID).Updates(updates).Error; err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "更新登录时间失败", Err: err}
		}

		loadedUser, err := s.loadUserWithRoleTx(tx, createdUser.ID)
		if err != nil {
			return &ServiceError{
				Status:  http.StatusInternalServerError,
				Message: fmt.Sprintf("加载 %s 用户信息失败", provider.DisplayName()),
				Err:     err,
			}
		}
		loadedUser.LastLoginAt = &now

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

func (s *Service) HandleGitHubCallback(ctx context.Context, code string) (*AuthResult, error) {
	return s.HandleOAuthCallback(ctx, model.OAuthProviderGitHub, code)
}

func (s *Service) completeOAuthLogin(ctx context.Context, user *model.User, profile *OAuthProfile, bindAccount bool) (*AuthResult, error) {
	if err := ensureUserEnabled(user); err != nil {
		return nil, err
	}

	now := s.now()
	var result *AuthResult

	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if bindAccount {
			if err := s.saveOAuthAccountTx(tx, user.ID, profile); err != nil {
				return err
			}
		}

		updates := buildOAuthUserUpdates(user, profile, now, bindAccount)
		if err := tx.Model(&model.User{}).Where("id = ?", user.ID).Updates(updates).Error; err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "更新登录时间失败", Err: err}
		}

		loadedUser, err := s.loadUserWithRoleTx(tx, user.ID)
		if err != nil {
			return &ServiceError{
				Status:  http.StatusInternalServerError,
				Message: fmt.Sprintf("加载 %s 用户信息失败", providerDisplayName(profile.Provider)),
				Err:     err,
			}
		}
		loadedUser.LastLoginAt = &now

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

func (s *Service) CurrentUser(ctx context.Context, token string) (*SessionUser, error) {
	claims, err := ParseToken(s.authConfig.JWTSecret, strings.TrimSpace(token))
	if err != nil {
		return nil, &ServiceError{Status: http.StatusUnauthorized, Message: "登录态已失效", Err: err}
	}

	userID, err := strconv.ParseUint(claims.Subject, 10, 64)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusUnauthorized, Message: "登录态无效", Err: err}
	}

	user, err := s.loadUserWithRole(ctx, userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusUnauthorized, Message: "当前用户不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载当前用户失败", Err: err}
	}
	if err := ensureUserEnabled(user); err != nil {
		return nil, err
	}

	sessionUser := toSessionUser(user)
	portal, err := s.loadSessionUserPortal(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	sessionUser.Portal = portal
	return &sessionUser, nil
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

	if err := NewSMTPMailer(s.configStore.SMTPConfig()).Send(ctx, email, subject, fmt.Sprintf(bodyTemplate, code)); err != nil {
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
	claims := Claims{
		Subject:   strconv.FormatUint(user.ID, 10),
		Email:     user.Email,
		Role:      user.Role.Name,
		ExpiresAt: s.now().Add(s.authConfig.TokenTTL).Unix(),
		IssuedAt:  s.now().Unix(),
	}

	token, err := SignToken(s.authConfig.JWTSecret, claims)
	if err != nil {
		return nil, err
	}

	sessionUser := toSessionUser(user)
	return &AuthResult{
		Token: token,
		User:  &sessionUser,
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
			"code_hash":    previous.CodeHash,
			"expires_at":   previous.ExpiresAt,
			"last_sent_at": previous.LastSentAt,
			"consumed_at":  previous.ConsumedAt,
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
	var user model.User
	if err := tx.Preload("Role").Where("email = ?", email).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *Service) findUserByGitHubID(ctx context.Context, githubID string) (*model.User, error) {
	var user model.User
	if err := s.db.WithContext(ctx).Preload("Role").Where("github_id = ?", githubID).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
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
	var user model.User
	if err := tx.Preload("Role").First(&user, userID).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *Service) loadSessionUserPortal(ctx context.Context, userID uint64) (*SessionUserPortal, error) {
	showRecruitmentEntry, err := s.shouldShowRecruitmentEntry(ctx, userID)
	if err != nil {
		return nil, err
	}

	return &SessionUserPortal{
		ShowRecruitmentEntry: showRecruitmentEntry,
	}, nil
}

func (s *Service) shouldShowRecruitmentEntry(ctx context.Context, userID uint64) (bool, error) {
	hasPublishedForm, err := s.hasPublishedRecruitmentForm(ctx)
	if err != nil {
		return false, &ServiceError{Status: http.StatusInternalServerError, Message: "加载当前用户信息失败", Err: err}
	}
	if !hasPublishedForm {
		return false, nil
	}

	inDefaultGroup, err := s.isUserInActiveDefaultGroup(ctx, userID)
	if err != nil {
		return false, &ServiceError{Status: http.StatusInternalServerError, Message: "加载当前用户信息失败", Err: err}
	}
	if inDefaultGroup {
		return shouldShowRecruitmentEntryVisibility(hasPublishedForm, true, false), nil
	}

	hasSubmittedRegistration, err := s.hasSubmittedRegistrationForPublishedForm(ctx, userID)
	if err != nil {
		return false, &ServiceError{Status: http.StatusInternalServerError, Message: "加载当前用户信息失败", Err: err}
	}

	return shouldShowRecruitmentEntryVisibility(hasPublishedForm, inDefaultGroup, hasSubmittedRegistration), nil
}

func (s *Service) hasPublishedRecruitmentForm(ctx context.Context) (bool, error) {
	var count int64
	if err := s.db.WithContext(ctx).
		Model(&model.RegistrationForm{}).
		Where("status = ?", model.RegistrationFormStatusPublished).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *Service) isUserInActiveDefaultGroup(ctx context.Context, userID uint64) (bool, error) {
	var count int64
	if err := s.db.WithContext(ctx).
		Model(&model.UserGroupMember{}).
		Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
		Where(
			"user_group_members.user_id = ? AND user_groups.is_default = ? AND user_groups.status = ?",
			userID,
			true,
			model.UserGroupStatusActive,
		).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *Service) hasSubmittedRegistrationForPublishedForm(ctx context.Context, userID uint64) (bool, error) {
	var count int64
	if err := s.db.WithContext(ctx).
		Model(&model.Registration{}).
		Joins("JOIN registration_forms ON registration_forms.id = registrations.form_id").
		Where(
			"registrations.user_id = ? AND registration_forms.status = ?",
			userID,
			model.RegistrationFormStatusPublished,
		).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func shouldShowRecruitmentEntryVisibility(
	hasPublishedForm bool,
	inActiveDefaultGroup bool,
	hasSubmittedRegistration bool,
) bool {
	return hasPublishedForm && (inActiveDefaultGroup || hasSubmittedRegistration)
}

func toSessionUser(user *model.User) SessionUser {
	return SessionUser{
		ID:        user.ID,
		Email:     user.Email,
		Phone:     user.Phone,
		Nickname:  user.Nickname,
		AvatarURL: user.AvatarURL,
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

func deriveDisplayName(email string, preferred string, fallback string) string {
	for _, candidate := range []string{preferred, fallback} {
		trimmed := strings.TrimSpace(candidate)
		if trimmed != "" {
			return trimmed
		}
	}

	name := strings.TrimSpace(email)
	if before, _, ok := strings.Cut(name, "@"); ok && strings.TrimSpace(before) != "" {
		return before
	}

	return name
}

func (s *Service) getOAuthProvider(providerName string) (OAuthProvider, error) {
	provider, err := s.oauthProviderByName(providerName)
	if err != nil {
		return nil, err
	}
	if !provider.Enabled() {
		return nil, newDisabledOAuthProviderError(provider.Provider())
	}
	return provider, nil
}

func (s *Service) oauthProviderByName(providerName string) (OAuthProvider, error) {
	switch normalizeOAuthProvider(providerName) {
	case model.OAuthProviderGitHub:
		return NewGitHubClient(s.configStore.GitHubConfig()), nil
	case model.OAuthProviderGoogle:
		return NewGoogleClient(s.configStore.GoogleConfig()), nil
	default:
		return nil, newUnknownOAuthProviderError(providerName)
	}
}

func (s *Service) findOAuthAccountByProviderUserID(ctx context.Context, provider string, providerUserID string) (*model.OAuthAccount, error) {
	var account model.OAuthAccount
	if err := s.db.WithContext(ctx).
		Where("provider = ? AND provider_user_id = ?", normalizeOAuthProvider(provider), strings.TrimSpace(providerUserID)).
		First(&account).Error; err != nil {
		return nil, err
	}
	return &account, nil
}

func (s *Service) findOAuthAccountByUserProvider(ctx context.Context, userID uint64, provider string) (*model.OAuthAccount, error) {
	var account model.OAuthAccount
	if err := s.db.WithContext(ctx).
		Where("user_id = ? AND provider = ?", userID, normalizeOAuthProvider(provider)).
		First(&account).Error; err != nil {
		return nil, err
	}
	return &account, nil
}

func (s *Service) saveOAuthAccountTx(tx *gorm.DB, userID uint64, profile *OAuthProfile) error {
	if profile == nil {
		return &ServiceError{Status: http.StatusBadGateway, Message: "第三方账号信息为空"}
	}

	provider := normalizeOAuthProvider(profile.Provider)
	providerUserID := strings.TrimSpace(profile.ProviderUserID)
	if provider == "" || providerUserID == "" {
		return &ServiceError{Status: http.StatusBadGateway, Message: "第三方账号信息不完整"}
	}

	account := model.OAuthAccount{
		UserID:         userID,
		Provider:       provider,
		ProviderUserID: providerUserID,
		ProviderLogin:  nullableString(profile.Login),
		ProviderEmail:  nullableString(profile.Email),
		AvatarURL:      nullableString(profile.AvatarURL),
	}

	existing := model.OAuthAccount{}
	err := tx.
		Where("provider = ? AND provider_user_id = ?", provider, providerUserID).
		First(&existing).Error
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "保存第三方绑定失败", Err: err}
		}

		if err := tx.Create(&account).Error; err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "保存第三方绑定失败", Err: err}
		}
		return nil
	}

	updates := map[string]any{
		"user_id":          userID,
		"provider_login":   account.ProviderLogin,
		"provider_email":   account.ProviderEmail,
		"avatar_url":       account.AvatarURL,
		"provider_user_id": providerUserID,
	}
	if err := tx.Model(&model.OAuthAccount{}).Where("id = ?", existing.ID).Updates(updates).Error; err != nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "保存第三方绑定失败", Err: err}
	}

	return nil
}

func (s staticConfigStore) SMTPConfig() config.SMTPConfig {
	return s.smtp
}

func (s staticConfigStore) GitHubConfig() config.GitHubConfig {
	return s.github
}

func (s staticConfigStore) GoogleConfig() config.GoogleConfig {
	return s.google
}

func (s *Service) ensureOAuthBindingAllowed(ctx context.Context, user *model.User, provider string, providerUserID string) error {
	normalizedProvider := normalizeOAuthProvider(provider)
	normalizedProviderUserID := strings.TrimSpace(providerUserID)
	if normalizedProvider == model.OAuthProviderGitHub {
		if err := ensureGitHubBindingAllowed(user, normalizedProviderUserID); err != nil {
			return err
		}
	}

	account, err := s.findOAuthAccountByUserProvider(ctx, user.ID, normalizedProvider)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return &ServiceError{Status: http.StatusInternalServerError, Message: "检查第三方绑定状态失败", Err: err}
	}

	if strings.TrimSpace(account.ProviderUserID) == normalizedProviderUserID {
		return nil
	}

	return &ServiceError{
		Status:  http.StatusConflict,
		Message: fmt.Sprintf("当前邮箱已绑定其他 %s 账号", providerDisplayName(normalizedProvider)),
	}
}

func ensureGitHubBindingAllowed(user *model.User, githubID string) error {
	if user.GitHubID == nil {
		return nil
	}

	existingGitHubID := strings.TrimSpace(*user.GitHubID)
	if existingGitHubID == "" || existingGitHubID == githubID {
		return nil
	}

	return &ServiceError{Status: http.StatusConflict, Message: "当前邮箱已绑定其他 GitHub 账号"}
}

func buildOAuthUserUpdates(user *model.User, profile *OAuthProfile, now time.Time, bindAccount bool) map[string]any {
	updates := map[string]any{
		"last_login_at": now,
	}

	if normalizeOAuthProvider(profile.Provider) == model.OAuthProviderGitHub {
		if bindAccount {
			updates["github_id"] = strings.TrimSpace(profile.ProviderUserID)
		}
		if username := strings.TrimSpace(profile.Login); username != "" {
			updates["github_username"] = username
		}
	}

	if avatarURL := strings.TrimSpace(profile.AvatarURL); avatarURL != "" {
		updates["avatar_url"] = avatarURL
	}

	nickname := strings.TrimSpace(profile.Name)
	if nickname != "" && (user.Nickname == nil || strings.TrimSpace(*user.Nickname) == "") {
		updates["nickname"] = nickname
	}

	return updates
}

func buildGitHubUserUpdates(user *model.User, profile *OAuthProfile, githubID string, now time.Time, bindGitHub bool) map[string]any {
	compatProfile := &OAuthProfile{
		Provider:       model.OAuthProviderGitHub,
		ProviderUserID: githubID,
		Login:          profile.Login,
		Name:           profile.Name,
		AvatarURL:      profile.AvatarURL,
	}
	return buildOAuthUserUpdates(user, compatProfile, now, bindGitHub)
}

func newOAuthUser(roleID uint64, email string, profile *OAuthProfile) model.User {
	createdUser := model.User{
		RoleID:    roleID,
		Name:      deriveDisplayName(email, profile.Login, profile.Name),
		Email:     email,
		AvatarURL: stringPtr(profile.AvatarURL),
		Status:    1,
	}
	if normalizeOAuthProvider(profile.Provider) == model.OAuthProviderGitHub {
		createdUser.GitHubID = stringPtr(profile.ProviderUserID)
		createdUser.GitHubUsername = stringPtr(profile.Login)
	}
	if strings.TrimSpace(profile.Name) != "" {
		assignOptionalString(&createdUser.Nickname, profile.Name)
	}
	return createdUser
}

func newGitHubUser(roleID uint64, email string, profile *OAuthProfile, githubID string) model.User {
	compatProfile := &OAuthProfile{
		Provider:       model.OAuthProviderGitHub,
		ProviderUserID: githubID,
		Login:          profile.Login,
		Name:           profile.Name,
		AvatarURL:      profile.AvatarURL,
	}
	return newOAuthUser(roleID, email, compatProfile)
}

func nullableString(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
