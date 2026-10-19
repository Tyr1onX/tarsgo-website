package adminuser

import (
	"context"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"

	"tarsgo-backend/database"
	"tarsgo-backend/model"
	"tarsgo-backend/service/auth"
	"tarsgo-backend/service/usergroup"
)

// Release baseline: a fresh credential login at or after this time confirms the account.
var accountActivityConfirmationStartedAt = time.Date(2026, time.October, 19, 11, 0, 0, 0, time.FixedZone("Asia/Shanghai", 8*60*60))

func accountActivityCutoff(now time.Time) time.Time {
	cutoff := now.Add(-90 * 24 * time.Hour)
	if accountActivityConfirmationStartedAt.After(cutoff) {
		return accountActivityConfirmationStartedAt
	}
	return cutoff
}

type Service struct {
	repo Repository
	now  func() time.Time
}

type ServiceError struct {
	Status  int
	Message string
	Err     error
}

type Actor struct {
	ID       uint64
	RoleName string
}

type ListUsersInput struct {
	Page            int
	PageSize        int
	Keyword         string
	Role            string
	Status          *uint8
	GroupState      string
	IncludeInactive bool
	ActivitySince   time.Time
}

type CreateUserInput struct {
	RoleID   uint64
	Name     string
	Email    string
	Password string
}

type UpdateUserInput struct {
	RoleID uint64
	Name   string
	Email  string
	Status uint8
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
}

type UserListItem struct {
	ID             uint64                `json:"id"`
	Name           string                `json:"name"`
	Email          string                `json:"email"`
	Role           RoleRef               `json:"role"`
	Status         uint8                 `json:"status"`
	AuthMethods    AuthMethods           `json:"authMethods"`
	LastLoginAt    *time.Time            `json:"lastLoginAt,omitempty"`
	CreatedAt      time.Time             `json:"createdAt"`
	GroupState     string                `json:"groupState"`
	GroupName      string                `json:"groupName,omitempty"`
	Groups         []UserGroupMembership `json:"groups"`
	CleanupPending bool                  `json:"cleanupPending"`
}

type UserDetail struct {
	ID                        uint64                   `json:"id"`
	Name                      string                   `json:"name"`
	Email                     string                   `json:"email"`
	Status                    uint8                    `json:"status"`
	Role                      RoleRef                  `json:"role"`
	AuthMethods               AuthMethods              `json:"authMethods"`
	LastLoginAt               *time.Time               `json:"lastLoginAt,omitempty"`
	CreatedAt                 time.Time                `json:"createdAt"`
	UpdatedAt                 time.Time                `json:"updatedAt"`
	RealName                  *string                  `json:"realName,omitempty"`
	Phone                     *string                  `json:"phone,omitempty"`
	RecruitmentHistory        []RecruitmentHistoryItem `json:"recruitmentHistory"`
	CurrentRecruitmentGroupID *uint64                  `json:"currentRecruitmentGroupId,omitempty"`
	GroupState                string                   `json:"groupState"`
	Groups                    []UserGroupMembership    `json:"groups"`
	CleanupPending            bool                     `json:"cleanupPending"`
}

type UserGroupMembership struct {
	GroupID uint64 `json:"groupId"`
	Name    string `json:"name"`
	Status  uint8  `json:"status"`
	Role    uint8  `json:"role"`
}

type RecruitmentHistoryItem struct {
	ID                uint64    `json:"id"`
	FormID            uint64    `json:"formId"`
	FormTitle         string    `json:"formTitle"`
	FormStatus        uint8     `json:"formStatus"`
	RecruitmentStatus string    `json:"recruitmentStatus"`
	PreferredGroupID  *uint64   `json:"preferredGroupId,omitempty"`
	PreferredGroup    string    `json:"preferredGroup"`
	SubmittedAt       time.Time `json:"submittedAt"`
}

type UserStats struct {
	Total             int64                   `json:"total"`
	Enabled           int64                   `json:"enabled"`
	Disabled          int64                   `json:"disabled"`
	Admins            int64                   `json:"admins"`
	Grouped           int64                   `json:"grouped"`
	Unassigned        int64                   `json:"unassigned"`
	Pending           int64                   `json:"pending"`
	CleanupPending    int64                   `json:"cleanupPending"`
	GroupDistribution []GroupDistributionItem `json:"groupDistribution"`
}

type GroupDistributionItem struct {
	GroupID   uint64 `json:"groupId"`
	Name      string `json:"name"`
	UserCount int64  `json:"userCount"`
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
	return &Service{repo: repo, now: time.Now}
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
	input.GroupState = strings.TrimSpace(input.GroupState)
	if input.IncludeInactive {
		input.ActivitySince = time.Time{}
	} else {
		input.ActivitySince = accountActivityCutoff(s.now())
	}
	if input.GroupState != "" && input.GroupState != usergroup.MembershipStateAssigned && input.GroupState != usergroup.MembershipStateUnassigned && input.GroupState != usergroup.MembershipStatePending && input.GroupState != "cleanup" {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "所属组别筛选值不合法"}
	}

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
	registrations, err := s.repo.ListRecruitmentHistory(ctx, userID)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载历史报名失败", Err: err}
	}
	detail.RecruitmentHistory = make([]RecruitmentHistoryItem, 0, len(registrations))
	for _, registration := range registrations {
		groupName := ""
		if registration.PreferredGroup != nil {
			groupName = registration.PreferredGroup.Name
		}
		item := RecruitmentHistoryItem{
			ID: registration.ID, FormID: registration.FormID, FormTitle: registration.Form.Title,
			FormStatus: registration.Form.Status, RecruitmentStatus: registration.RecruitmentStatus,
			PreferredGroupID: registration.PreferredGroupID, PreferredGroup: groupName, SubmittedAt: registration.SubmittedAt,
		}
		detail.RecruitmentHistory = append(detail.RecruitmentHistory, item)
		if detail.CurrentRecruitmentGroupID == nil && registration.Form.Status == model.RegistrationFormStatusPublished {
			detail.CurrentRecruitmentGroupID = registration.PreferredGroupID
		}
	}
	return &detail, nil
}

func (s *Service) UpdateCurrentRecruitmentGroup(ctx context.Context, actor Actor, userID uint64, groupID uint64) (*UserDetail, error) {
	if err := ensureUserAdminActor(actor); err != nil {
		return nil, err
	}
	if userID == 0 || groupID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "账号或招新组别不合法"}
	}
	if _, err := s.repo.GetUserByID(ctx, userID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "用户不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载用户失败", Err: err}
	}
	if err := s.repo.UpdateCurrentRecruitmentGroup(ctx, userID, groupID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusConflict, Message: "当前账号没有可修正的当届报名记录或组别已停用"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "修正招新意向组失败", Err: err}
	}
	return s.GetUser(ctx, actor, userID)
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
	adminScope, managementGroupID, err := scopeForRole(role.Name)
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
		Gender:            0,
		AdminScope:        adminScope,
		ManagementGroupID: managementGroupID,
	}

	if err := s.repo.CreateUser(ctx, user); err != nil {
		if database.IsDuplicateKeyError(err) {
			return nil, &ServiceError{Status: http.StatusConflict, Message: "该邮箱已存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "创建用户失败", Err: err}
	}

	created, err := s.repo.GetUserByID(ctx, user.ID)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载新建用户失败", Err: err}
	}
	detail := toUserDetail(created)
	return &detail, nil
}

func (s *Service) UpdateUserGroup(ctx context.Context, actor Actor, userID uint64, groupID *uint64) (*UserDetail, error) {
	if err := ensureUserAdminActor(actor); err != nil {
		return nil, err
	}
	if userID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "用户 ID 不合法"}
	}
	if err := s.repo.UpdateUserGroup(ctx, actor.ID, userID, groupID); err != nil {
		var userGroupError *usergroup.ServiceError
		if errors.As(err, &userGroupError) {
			return nil, &ServiceError{Status: userGroupError.Status, Message: userGroupError.Message, Err: userGroupError.Err}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "调整所属组别失败", Err: err}
	}
	return s.GetUser(ctx, actor, userID)
}

func (s *Service) UpdateUserGroupRole(ctx context.Context, actor Actor, userID, groupID uint64, role uint8) (*UserDetail, error) {
	if actor.RoleName != model.RoleNameSuperAdmin {
		return nil, &ServiceError{Status: http.StatusForbidden, Message: "仅超级管理员可以调整组内角色"}
	}
	if userID == 0 || groupID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "用户或组别 ID 不合法"}
	}
	if err := s.repo.UpdateUserGroupRole(ctx, actor.ID, userID, groupID, role); err != nil {
		var userGroupError *usergroup.ServiceError
		if errors.As(err, &userGroupError) {
			return nil, &ServiceError{Status: userGroupError.Status, Message: userGroupError.Message, Err: userGroupError.Err}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "更新组内角色失败", Err: err}
	}
	return s.GetUser(ctx, actor, userID)
}

func (s *Service) UpdateUser(ctx context.Context, actor Actor, userID uint64, input UpdateUserInput) (*UserDetail, error) {
	if err := ensureUserAdminActor(actor); err != nil {
		return nil, err
	}
	if err := validateStatus(input.Status); err != nil {
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
		adminScope, managementGroupID, err = scopeForRole(role.Name)
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
		"status":              input.Status,
		"admin_scope":         adminScope,
		"management_group_id": managementGroupID,
	}

	if err := s.repo.UpdateUser(ctx, target.ID, updates); err != nil {
		if database.IsDuplicateKeyError(err) {
			return nil, &ServiceError{Status: http.StatusConflict, Message: "该邮箱已存在"}
		}
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
	if actor.RoleName == model.RoleNameSuperAdmin {
		return nil
	}
	return &ServiceError{Status: http.StatusForbidden, Message: "仅超级管理员可以管理账号"}
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
	if actor.RoleName != model.RoleNameSuperAdmin {
		return &ServiceError{Status: http.StatusForbidden, Message: "当前账号无权修改该用户"}
	}
	return nil
}

func canAssignRole(actorRole string, targetRole string) bool {
	return actorRole == model.RoleNameSuperAdmin &&
		(targetRole == model.RoleNameAdmin || targetRole == model.RoleNameUser)
}

func scopeForRole(roleName string) (string, *uint64, error) {
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
	groups := mapUserGroupMemberships(user.GroupMembers)
	state, groupName := membershipStateAndName(groups)
	activeCount := 0
	for _, group := range groups {
		if group.Status == model.UserGroupStatusActive {
			activeCount++
		}
	}
	return UserListItem{
		ID:             user.ID,
		Name:           user.Name,
		Email:          user.Email,
		Role:           toRoleRef(user.Role),
		Status:         user.Status,
		AuthMethods:    toAuthMethods(user),
		LastLoginAt:    user.LastLoginAt,
		CreatedAt:      user.CreatedAt,
		GroupState:     state,
		GroupName:      groupName,
		Groups:         groups,
		CleanupPending: len(groups) >= 2 && activeCount < 2,
	}
}

func toUserDetail(user *model.User) UserDetail {
	detail := UserDetail{
		ID:                 user.ID,
		Name:               user.Name,
		Email:              user.Email,
		Status:             user.Status,
		Role:               toRoleRef(user.Role),
		AuthMethods:        toAuthMethods(user),
		LastLoginAt:        user.LastLoginAt,
		CreatedAt:          user.CreatedAt,
		UpdatedAt:          user.UpdatedAt,
		RealName:           user.RealName,
		Phone:              user.Phone,
		RecruitmentHistory: []RecruitmentHistoryItem{},
		Groups:             mapUserGroupMemberships(user.GroupMembers),
	}
	detail.GroupState, _ = membershipStateAndName(detail.Groups)
	activeCount := 0
	for _, group := range detail.Groups {
		if group.Status == model.UserGroupStatusActive {
			activeCount++
		}
	}
	detail.CleanupPending = len(detail.Groups) >= 2 && activeCount < 2
	return detail
}

func mapUserGroupMemberships(members []model.UserGroupMember) []UserGroupMembership {
	groups := make([]UserGroupMembership, 0, len(members))
	for _, member := range members {
		groups = append(groups, UserGroupMembership{
			GroupID: member.GroupID,
			Name:    member.Group.Name,
			Status:  member.Group.Status,
			Role:    member.Role,
		})
	}
	sort.Slice(groups, func(i, j int) bool {
		if groups[i].Name == groups[j].Name {
			return groups[i].GroupID < groups[j].GroupID
		}
		return groups[i].Name < groups[j].Name
	})
	return groups
}

func membershipStateAndName(groups []UserGroupMembership) (string, string) {
	active := make([]UserGroupMembership, 0, len(groups))
	for _, group := range groups {
		if group.Status == model.UserGroupStatusActive {
			active = append(active, group)
		}
	}
	switch len(active) {
	case 0:
		return usergroup.MembershipStateUnassigned, ""
	case 1:
		return usergroup.MembershipStateAssigned, active[0].Name
	default:
		return usergroup.MembershipStatePending, ""
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
	}
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
