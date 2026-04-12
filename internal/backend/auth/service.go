package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/config"
	"tarsgo-backend/model"
	"tarsgo-backend/usergroup"
)

const (
	codeTTL      = 10 * time.Minute
	codeCooldown = 60 * time.Second
)

type Service struct {
	db           *gorm.DB
	appConfig    config.AppConfig
	authConfig   config.AuthConfig
	mailer       Mailer
	githubClient *GitHubClient
	now          func() time.Time
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
	ID       uint64      `json:"id"`
	Email    string      `json:"email"`
	Phone    *string     `json:"phone,omitempty"`
	Nickname *string     `json:"nickname,omitempty"`
	Role     SessionRole `json:"role"`
}

type AuthResult struct {
	Token string       `json:"-"`
	User  *SessionUser `json:"user"`
}

type RegisterEmailInput struct {
	Email    string
	Password string
	Phone    string
	Code     string
}

func NewService(cfg *config.Config, db *gorm.DB) *Service {
	return &Service{
		db:           db,
		appConfig:    cfg.App,
		authConfig:   cfg.Auth,
		mailer:       NewSMTPMailer(cfg.SMTP),
		githubClient: NewGitHubClient(cfg.GitHub),
		now:          time.Now,
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

func (s *Service) LoginErrorURL(code string) string {
	return strings.TrimRight(s.appConfig.FrontendURL, "/") + "/login?error=" + code
}

func (s *Service) SendRegisterCode(ctx context.Context, email string) error {
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
	email := NormalizeEmail(input.Email)
	password := strings.TrimSpace(input.Password)
	code := strings.TrimSpace(input.Code)

	if email == "" || password == "" || code == "" {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "邮箱、密码和验证码不能为空"}
	}

	if _, err := s.findUserByEmail(ctx, email); err == nil {
		return nil, &ServiceError{Status: http.StatusConflict, Message: "该邮箱已注册"}
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "检查邮箱注册状态失败", Err: err}
	}

	passwordHash, err := HashPassword(password)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "生成密码摘要失败", Err: err}
	}

	var result *AuthResult
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := s.consumeCode(tx, email, model.EmailCodePurposeRegister, code); err != nil {
			return err
		}

		role, err := s.findRoleByNameTx(tx, model.RoleNameUser)
		if err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "默认用户角色不存在", Err: err}
		}

		user := model.User{
			RoleID:       role.ID,
			Name:         deriveDisplayName(email, "", ""),
			Email:        email,
			PasswordHash: stringPtr(passwordHash),
			Status:       1,
		}
		assignOptionalString(&user.Phone, input.Phone)
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

func (s *Service) LoginWithPassword(ctx context.Context, email string, password string) (*AuthResult, error) {
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

func (s *Service) BuildGitHubLoginURL() (string, string, error) {
	state, err := GenerateRandomString(32)
	if err != nil {
		return "", "", &ServiceError{Status: http.StatusInternalServerError, Message: "生成 GitHub 登录态失败", Err: err}
	}

	return s.githubClient.BuildLoginURL(state), state, nil
}

func (s *Service) HandleGitHubCallback(ctx context.Context, code string) (*AuthResult, error) {
	accessToken, err := s.githubClient.ExchangeCode(ctx, strings.TrimSpace(code))
	if err != nil {
		return nil, &ServiceError{Status: http.StatusBadGateway, Message: "获取 GitHub 访问令牌失败", Err: err}
	}

	profile, err := s.githubClient.FetchProfile(ctx, accessToken)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusBadGateway, Message: "获取 GitHub 用户信息失败", Err: err}
	}

	githubID := strconv.FormatInt(profile.ID, 10)
	user, err := s.findUserByGitHubID(ctx, githubID)
	if err == nil {
		return s.completeGitHubLogin(ctx, user, profile, githubID, false)
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询 GitHub 用户失败", Err: err}
	}

	email := NormalizeEmail(stringValue(profile.Email))
	if email == "" {
		return nil, &ServiceError{Status: http.StatusBadGateway, Message: "GitHub 用户缺少可用邮箱"}
	}

	user, err = s.findUserByEmail(ctx, email)
	if err == nil {
		if err := ensureGitHubBindingAllowed(user, githubID); err != nil {
			return nil, err
		}
		return s.completeGitHubLogin(ctx, user, profile, githubID, true)
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询邮箱用户失败", Err: err}
	}

	var result *AuthResult
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		role, err := s.findRoleByNameTx(tx, model.RoleNameUser)
		if err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "默认用户角色不存在", Err: err}
		}

		createdUser := newGitHubUser(role.ID, email, profile, githubID)

		if err := tx.Create(&createdUser).Error; err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "创建 GitHub 用户失败", Err: err}
		}
		if err := usergroup.AssignDefaultGroupTx(tx, createdUser.ID); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "分配默认用户组失败", Err: err}
		}

		now := s.now()
		if err := tx.Model(&model.User{}).Where("id = ?", createdUser.ID).Update("last_login_at", now).Error; err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "更新登录时间失败", Err: err}
		}

		loadedUser, err := s.loadUserWithRoleTx(tx, createdUser.ID)
		if err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "加载 GitHub 用户信息失败", Err: err}
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

func (s *Service) completeGitHubLogin(ctx context.Context, user *model.User, profile *GitHubProfile, githubID string, bindGitHub bool) (*AuthResult, error) {
	if err := ensureUserEnabled(user); err != nil {
		return nil, err
	}

	now := s.now()
	var result *AuthResult

	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		updates := buildGitHubUserUpdates(user, profile, githubID, now, bindGitHub)
		if err := tx.Model(&model.User{}).Where("id = ?", user.ID).Updates(updates).Error; err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "更新登录时间失败", Err: err}
		}

		loadedUser, err := s.loadUserWithRoleTx(tx, user.ID)
		if err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "加载 GitHub 用户信息失败", Err: err}
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

	if err := s.mailer.Send(ctx, email, subject, fmt.Sprintf(bodyTemplate, code)); err != nil {
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

func toSessionUser(user *model.User) SessionUser {
	return SessionUser{
		ID:       user.ID,
		Email:    user.Email,
		Phone:    user.Phone,
		Nickname: user.Nickname,
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

func buildGitHubUserUpdates(user *model.User, profile *GitHubProfile, githubID string, now time.Time, bindGitHub bool) map[string]any {
	updates := map[string]any{
		"last_login_at": now,
	}

	if bindGitHub {
		updates["github_id"] = githubID
	}

	if username := strings.TrimSpace(profile.Login); username != "" {
		updates["github_username"] = username
	}
	if avatarURL := strings.TrimSpace(profile.AvatarURL); avatarURL != "" {
		updates["avatar_url"] = avatarURL
	}

	nickname := strings.TrimSpace(stringValue(profile.Name))
	if nickname != "" && (user.Nickname == nil || strings.TrimSpace(*user.Nickname) == "") {
		updates["nickname"] = nickname
	}

	return updates
}

func newGitHubUser(roleID uint64, email string, profile *GitHubProfile, githubID string) model.User {
	createdUser := model.User{
		RoleID:         roleID,
		Name:           deriveDisplayName(email, profile.Login, stringValue(profile.Name)),
		Email:          email,
		GitHubID:       stringPtr(githubID),
		GitHubUsername: stringPtr(profile.Login),
		AvatarURL:      stringPtr(profile.AvatarURL),
		Status:         1,
	}
	if profile.Name != nil {
		assignOptionalString(&createdUser.Nickname, *profile.Name)
	}
	return createdUser
}
