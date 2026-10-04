package adminuser

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"

	"tarsgo-backend/model"
	"tarsgo-backend/service/auth"
	"tarsgo-backend/service/usergroup"
)

type Service struct {
	repo Repository
}

type ServiceError struct {
	Status  int
	Message string
	Err     error
}

type Actor struct {
	ID                uint64
	RoleName          string
	AdminScope        string
	ManagementGroupID *uint64
	GroupRole         string
}

type ListUsersInput struct {
	Page     int
	PageSize int
	Keyword  string
	Role     string
	GroupID  *uint64
	Status   *uint8
}

const (
	UserFilterRoleMember      = "member"
	UserFilterRoleGroupAdmin  = "group_admin"
	UserFilterRoleLeader      = "leader"
	UserFilterRoleGlobal      = "global"
	UserFilterRoleGlobalAdmin = "global_admin"
	UserFilterRoleSuperAdmin  = "super_admin"
)

type CreateUserInput struct {
	RoleID            uint64
	Name              string
	Email             string
	Password          string
	Nickname          string
	AvatarURL         string
	Phone             string
	RealName          string
	Gender            uint8
	Birthday          *time.Time
	AdminScope        string
	ManagementGroupID *uint64
}

type UpdateUserInput struct {
	RoleID            uint64
	Name              string
	Email             string
	Nickname          string
	AvatarURL         string
	Phone             string
	RealName          string
	Gender            uint8
	Birthday          *time.Time
	Status            uint8
	AdminScope        string
	ManagementGroupID *uint64
}

type RoleRef struct {
	ID          uint64 `json:"id"`
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
}

type RoleOption struct {
	ID                     uint64 `json:"id"`
	Name                   string `json:"name"`
	DisplayName            string `json:"displayName"`
	EditableByCurrentActor bool   `json:"editableByCurrentActor"`
}

type AuthMethods struct {
	HasPassword bool `json:"hasPassword"`
	GitHubBound bool `json:"githubBound"`
}

type UserListItem struct {
	ID                uint64               `json:"id"`
	Name              string               `json:"name"`
	Email             string               `json:"email"`
	Phone             *string              `json:"phone,omitempty"`
	RealName          *string              `json:"realName,omitempty"`
	Role              RoleRef              `json:"role"`
	AdminScope        string               `json:"adminScope"`
	ManagementGroupID *uint64              `json:"managementGroupId"`
	Groups            []usergroup.GroupRef `json:"groups,omitempty"`
	Status            uint8                `json:"status"`
	AuthMethods       AuthMethods          `json:"authMethods"`
	LastLoginAt       *time.Time           `json:"lastLoginAt,omitempty"`
	CreatedAt         time.Time            `json:"createdAt"`
}

type UserDetail struct {
	ID                uint64               `json:"id"`
	Name              string               `json:"name"`
	Email             string               `json:"email"`
	Nickname          *string              `json:"nickname,omitempty"`
	AvatarURL         *string              `json:"avatarUrl,omitempty"`
	Phone             *string              `json:"phone,omitempty"`
	RealName          *string              `json:"realName,omitempty"`
	Gender            uint8                `json:"gender"`
	Birthday          *string              `json:"birthday,omitempty"`
	Status            uint8                `json:"status"`
	GitHubUsername    *string              `json:"githubUsername,omitempty"`
	Role              RoleRef              `json:"role"`
	AdminScope        string               `json:"adminScope"`
	ManagementGroupID *uint64              `json:"managementGroupId"`
	Groups            []usergroup.GroupRef `json:"groups,omitempty"`
	AuthMethods       AuthMethods          `json:"authMethods"`
	LastLoginAt       *time.Time           `json:"lastLoginAt,omitempty"`
	CreatedAt         time.Time            `json:"createdAt"`
	UpdatedAt         time.Time            `json:"updatedAt"`
}

type UserStats struct {
	Total       int64 `json:"total"`
	Enabled     int64 `json:"enabled"`
	Disabled    int64 `json:"disabled"`
	Admins      int64 `json:"admins"`
	GitHubBound int64 `json:"githubBound"`
}

type Pagination struct {
	Page       int   `json:"page"`
	PageSize   int   `json:"pageSize"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"totalPages"`
}

type ListUsersResult struct {
	Items      []UserListItem `json:"items"`
	Summary    UserStats      `json:"summary"`
	Pagination Pagination     `json:"pagination"`
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
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

func (s *Service) ListUsers(ctx context.Context, actor Actor, input ListUsersInput) (*ListUsersResult, error) {
	if err := ensureUserListActor(actor); err != nil {
		return nil, err
	}

	input.Page = normalizePage(input.Page)
	input.PageSize = normalizePageSize(input.PageSize)
	input.Keyword = strings.TrimSpace(input.Keyword)
	input.Role = strings.TrimSpace(input.Role)

	users, total, err := s.repo.ListUsers(ctx, input)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询用户列表失败", Err: err}
	}

	stats, err := s.repo.GetUserStats(ctx)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询用户统计失败", Err: err}
	}

	items := make([]UserListItem, 0, len(users))
	for i := range users {
		items = append(items, toUserListItem(&users[i]))
	}

	totalPages := 0
	if total > 0 {
		totalPages = int((total + int64(input.PageSize) - 1) / int64(input.PageSize))
	}

	return &ListUsersResult{
		Items:   items,
		Summary: stats,
		Pagination: Pagination{
			Page:       input.Page,
			PageSize:   input.PageSize,
			Total:      total,
			TotalPages: totalPages,
		},
	}, nil
}

func (s *Service) GetUser(ctx context.Context, actor Actor, userID uint64) (*UserDetail, error) {
	if err := ensureUserViewActor(actor); err != nil {
		return nil, err
	}

	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "用户不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载用户详情失败", Err: err}
	}
	detail := toUserDetail(user)
	return &detail, nil
}

func (s *Service) ListRoles(ctx context.Context, actor Actor) ([]RoleOption, error) {
	if err := ensureUserAdminActor(actor); err != nil {
		return nil, err
	}

	roles, err := s.repo.ListRoles(ctx)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询角色列表失败", Err: err}
	}

	options := make([]RoleOption, 0, len(roles))
	for _, role := range roles {
		options = append(options, RoleOption{
			ID:                     role.ID,
			Name:                   role.Name,
			DisplayName:            role.DisplayName,
			EditableByCurrentActor: canAssignRole(actor.RoleName, role.Name),
		})
	}
	return options, nil
}

func (s *Service) CreateUser(ctx context.Context, actor Actor, input CreateUserInput) (*UserDetail, error) {
	if err := ensureUserAdminActor(actor); err != nil {
		return nil, err
	}
	if err := validateGender(input.Gender); err != nil {
		return nil, err
	}

	email := auth.NormalizeEmail(input.Email)
	password := strings.TrimSpace(input.Password)
	name := strings.TrimSpace(input.Name)
	if email == "" || password == "" || name == "" {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "姓名、邮箱和密码不能为空"}
	}

	role, err := s.repo.GetRoleByID(ctx, input.RoleID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusBadRequest, Message: "角色不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载角色失败", Err: err}
	}
	if !canAssignRole(actor.RoleName, role.Name) {
		return nil, &ServiceError{Status: http.StatusForbidden, Message: "当前账号无权创建该角色"}
	}
	adminScope, managementGroupID, err := validateRequestedScope(role.Name, input.AdminScope, input.ManagementGroupID, nil)
	if err != nil {
		return nil, err
	}

	if _, err := s.repo.GetUserByEmail(ctx, email); err == nil {
		return nil, &ServiceError{Status: http.StatusConflict, Message: "该邮箱已存在"}
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "检查邮箱唯一性失败", Err: err}
	}

	passwordHash, err := auth.HashPassword(password)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "生成密码摘要失败", Err: err}
	}

	user := &model.User{
		RoleID:            role.ID,
		Name:              name,
		Email:             email,
		PasswordHash:      stringPtr(passwordHash),
		Status:            model.UserStatusEnabled,
		Gender:            input.Gender,
		Birthday:          input.Birthday,
		AdminScope:        adminScope,
		ManagementGroupID: managementGroupID,
	}
	assignOptionalString(&user.Nickname, input.Nickname)
	assignOptionalString(&user.AvatarURL, input.AvatarURL)
	assignOptionalString(&user.Phone, input.Phone)
	assignOptionalString(&user.RealName, input.RealName)

	if err := s.repo.CreateUser(ctx, user, role.Name == model.RoleNameUser); err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "创建用户失败", Err: err}
	}

	created, err := s.repo.GetUserByID(ctx, user.ID)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载新建用户失败", Err: err}
	}
	detail := toUserDetail(created)
	return &detail, nil
}

func (s *Service) UpdateUser(ctx context.Context, actor Actor, userID uint64, input UpdateUserInput) (*UserDetail, error) {
	if err := ensureUserAdminActor(actor); err != nil {
		return nil, err
	}
	if err := validateStatus(input.Status); err != nil {
		return nil, err
	}
	if err := validateGender(input.Gender); err != nil {
		return nil, err
	}

	target, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "用户不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载用户失败", Err: err}
	}
	if err := ensureTargetMutable(actor, target); err != nil {
		return nil, err
	}
	if isProfileOnlyActor(actor) {
		if err := validateProfileUpdate(actor, target, input); err != nil {
			return nil, err
		}
		updates := map[string]any{
			"name":       nameOrOriginal(input.Name, target.Name),
			"nickname":   nullableString(input.Nickname),
			"avatar_url": nullableString(input.AvatarURL),
			"phone":      nullableString(input.Phone),
			"real_name":  nullableString(input.RealName),
			"gender":     input.Gender,
			"birthday":   input.Birthday,
		}
		if target.Role.Name == model.RoleNameUser {
			updates["status"] = input.Status
		}
		if err := s.repo.UpdateUser(ctx, target.ID, updates); err != nil {
			return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "更新用户资料失败", Err: err}
		}
		updated, err := s.repo.GetUserByID(ctx, target.ID)
		if err != nil {
			return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载更新后的用户资料失败", Err: err}
		}
		detail := toUserDetail(updated)
		return &detail, nil
	}

	role, err := s.repo.GetRoleByID(ctx, input.RoleID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusBadRequest, Message: "角色不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载角色失败", Err: err}
	}
	if !canAssignRole(actor.RoleName, role.Name) {
		return nil, &ServiceError{Status: http.StatusForbidden, Message: "当前账号无权设置该角色"}
	}
	adminScope := target.AdminScope
	managementGroupID := target.ManagementGroupID
	if role.Name != target.Role.Name {
		adminScope, managementGroupID, err = validateRequestedScope(role.Name, input.AdminScope, input.ManagementGroupID, target)
		if err != nil {
			return nil, err
		}
	}

	email := auth.NormalizeEmail(input.Email)
	name := strings.TrimSpace(input.Name)
	if email == "" || name == "" {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "姓名和邮箱不能为空"}
	}

	if existing, err := s.repo.GetUserByEmail(ctx, email); err == nil && existing.ID != target.ID {
		return nil, &ServiceError{Status: http.StatusConflict, Message: "该邮箱已存在"}
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "检查邮箱唯一性失败", Err: err}
	}

	updates := map[string]any{
		"role_id":             role.ID,
		"name":                name,
		"email":               email,
		"nickname":            nullableString(input.Nickname),
		"avatar_url":          nullableString(input.AvatarURL),
		"phone":               nullableString(input.Phone),
		"real_name":           nullableString(input.RealName),
		"gender":              input.Gender,
		"birthday":            input.Birthday,
		"status":              input.Status,
		"admin_scope":         adminScope,
		"management_group_id": managementGroupID,
	}

	if err := s.repo.UpdateUser(ctx, target.ID, updates); err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "更新用户失败", Err: err}
	}

	updated, err := s.repo.GetUserByID(ctx, target.ID)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载更新后的用户失败", Err: err}
	}
	detail := toUserDetail(updated)
	return &detail, nil
}

func (s *Service) ResetPassword(ctx context.Context, actor Actor, userID uint64, password string) error {
	if actor.RoleName != model.RoleNameSuperAdmin {
		return &ServiceError{Status: http.StatusForbidden, Message: "仅超级管理员可以重置密码"}
	}

	password = strings.TrimSpace(password)
	if len(password) < 6 || len(password) > 72 {
		return &ServiceError{Status: http.StatusBadRequest, Message: "密码长度需要在 6 到 72 位之间"}
	}

	target, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &ServiceError{Status: http.StatusNotFound, Message: "用户不存在"}
		}
		return &ServiceError{Status: http.StatusInternalServerError, Message: "加载用户失败", Err: err}
	}
	if err := ensureTargetMutable(actor, target); err != nil {
		return err
	}

	passwordHash, err := auth.HashPassword(password)
	if err != nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "生成密码摘要失败", Err: err}
	}

	if err := s.repo.UpdatePasswordHash(ctx, target.ID, passwordHash); err != nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "重置密码失败", Err: err}
	}
	return nil
}

func ensureAdminActor(actor Actor) error {
	if actor.RoleName == model.RoleNameAdmin || actor.RoleName == model.RoleNameSuperAdmin {
		return nil
	}
	return &ServiceError{Status: http.StatusForbidden, Message: "当前账号无管理员权限"}
}

func ensureUserAdminActor(actor Actor) error {
	return ensureAdminActor(actor)
}

func ensureUserViewActor(actor Actor) error {
	return ensureAdminActor(actor)
}

func ensureUserListActor(actor Actor) error {
	return ensureUserViewActor(actor)
}

func ensureTargetMutable(actor Actor, target *model.User) error {
	if target.Role.Name == model.RoleNameSuperAdmin {
		return &ServiceError{Status: http.StatusForbidden, Message: "超级管理员账号只允许查看，不允许修改"}
	}
	if actor.RoleName != model.RoleNameAdmin && actor.RoleName != model.RoleNameSuperAdmin {
		return &ServiceError{Status: http.StatusForbidden, Message: "当前账号无权修改该用户"}
	}
	return nil
}

func isProfileOnlyActor(actor Actor) bool {
	return actor.RoleName == model.RoleNameAdmin
}

func validateProfileUpdate(actor Actor, target *model.User, input UpdateUserInput) error {
	if strings.TrimSpace(input.Name) == "" {
		return &ServiceError{Status: http.StatusBadRequest, Message: "姓名不能为空"}
	}
	if input.RoleID != 0 && input.RoleID != target.Role.ID {
		return &ServiceError{Status: http.StatusForbidden, Message: "不能通过资料接口修改系统角色"}
	}
	if email := auth.NormalizeEmail(input.Email); email != "" && email != target.Email {
		return &ServiceError{Status: http.StatusForbidden, Message: "不能通过资料接口修改登录邮箱"}
	}
	if input.AdminScope != "" && input.AdminScope != target.AdminScope {
		return &ServiceError{Status: http.StatusForbidden, Message: "不能通过资料接口修改管理范围"}
	}
	if input.ManagementGroupID != nil && (target.ManagementGroupID == nil || *input.ManagementGroupID != *target.ManagementGroupID) {
		return &ServiceError{Status: http.StatusForbidden, Message: "不能通过资料接口修改管理组"}
	}
	if target.Role.Name != model.RoleNameUser && input.Status != target.Status {
		return &ServiceError{Status: http.StatusForbidden, Message: "管理员只能启用或停用成员账号"}
	}
	return nil
}

func nameOrOriginal(value, original string) string {
	if trimmed := strings.TrimSpace(value); trimmed != "" {
		return trimmed
	}
	return original
}

func canAssignRole(actorRole string, targetRole string) bool {
	switch actorRole {
	case model.RoleNameSuperAdmin:
		return targetRole == model.RoleNameAdmin || targetRole == model.RoleNameUser
	case model.RoleNameAdmin:
		return targetRole == model.RoleNameUser
	default:
		return false
	}
}

func validateRequestedScope(roleName, _ string, _ *uint64, _ *model.User) (string, *uint64, error) {
	switch roleName {
	case model.RoleNameSuperAdmin, model.RoleNameAdmin:
		return model.AdminScopeGlobal, nil, nil
	case model.RoleNameUser:
		return model.AdminScopeNone, nil, nil
	default:
		return model.AdminScopeNone, nil, &ServiceError{Status: http.StatusBadRequest, Message: "角色不合法"}
	}
}

func validateStatus(status uint8) error {
	if status != model.UserStatusEnabled && status != model.UserStatusDisabled {
		return &ServiceError{Status: http.StatusBadRequest, Message: "用户状态不合法"}
	}
	return nil
}

func validateGender(gender uint8) error {
	if gender > 2 {
		return &ServiceError{Status: http.StatusBadRequest, Message: "性别取值不合法"}
	}
	return nil
}

func normalizePage(page int) int {
	if page <= 0 {
		return 1
	}
	return page
}

func normalizePageSize(pageSize int) int {
	if pageSize <= 0 {
		return 10
	}
	if pageSize > 100 {
		return 100
	}
	return pageSize
}

func toUserListItem(user *model.User) UserListItem {
	return UserListItem{
		ID:                user.ID,
		Name:              user.Name,
		Email:             user.Email,
		Phone:             user.Phone,
		RealName:          user.RealName,
		Role:              toRoleRef(user.Role),
		AdminScope:        user.AdminScope,
		ManagementGroupID: user.ManagementGroupID,
		Groups:            usergroup.UserGroupRefsFromMembers(user.GroupMembers, false),
		Status:            user.Status,
		AuthMethods:       toAuthMethods(user),
		LastLoginAt:       user.LastLoginAt,
		CreatedAt:         user.CreatedAt,
	}
}

func toUserDetail(user *model.User) UserDetail {
	return UserDetail{
		ID:                user.ID,
		Name:              user.Name,
		Email:             user.Email,
		Nickname:          user.Nickname,
		AvatarURL:         user.AvatarURL,
		Phone:             user.Phone,
		RealName:          user.RealName,
		Gender:            user.Gender,
		Birthday:          formatBirthday(user.Birthday),
		Status:            user.Status,
		GitHubUsername:    user.GitHubUsername,
		Role:              toRoleRef(user.Role),
		AdminScope:        user.AdminScope,
		ManagementGroupID: user.ManagementGroupID,
		Groups:            usergroup.UserGroupRefsFromMembers(user.GroupMembers, true),
		AuthMethods:       toAuthMethods(user),
		LastLoginAt:       user.LastLoginAt,
		CreatedAt:         user.CreatedAt,
		UpdatedAt:         user.UpdatedAt,
	}
}

func toRoleRef(role model.Role) RoleRef {
	return RoleRef{
		ID:          role.ID,
		Name:        role.Name,
		DisplayName: role.DisplayName,
	}
}

func toAuthMethods(user *model.User) AuthMethods {
	return AuthMethods{
		HasPassword: user.PasswordHash != nil && strings.TrimSpace(*user.PasswordHash) != "",
		GitHubBound: user.GitHubID != nil && strings.TrimSpace(*user.GitHubID) != "",
	}
}

func formatBirthday(value *time.Time) *string {
	if value == nil {
		return nil
	}
	formatted := value.Format("2006-01-02")
	return &formatted
}

func nullableString(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func assignOptionalString(target **string, value string) {
	*target = nullableString(value)
}

func stringPtr(value string) *string {
	return &value
}

func ParseUintID(raw string) (uint64, error) {
	value, err := strconv.ParseUint(strings.TrimSpace(raw), 10, 64)
	if err != nil || value == 0 {
		return 0, &ServiceError{Status: http.StatusBadRequest, Message: "无效的用户 ID"}
	}
	return value, nil
}
