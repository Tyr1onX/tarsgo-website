package usergroup

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"gorm.io/gorm"

	"tarsgo-backend/model"
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
	ID       uint64
	RoleName string
}

type ListGroupsInput struct {
	Page     int
	PageSize int
	Keyword  string
	Status   *uint8
}

type CreateGroupInput struct {
	Name        string
	Description string
	Tags        []string
	IsDefault   bool
	Status      uint8
}

type UpdateGroupInput struct {
	Name        string
	Description string
	Tags        []string
	IsDefault   bool
	Status      uint8
}

type AddMemberInput struct {
	UserID uint64
	Role   uint8
}

type UpdateMemberInput struct {
	Role uint8
}

type RoleRef struct {
	ID          uint64 `json:"id"`
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
}

type GroupRef struct {
	ID         uint64 `json:"id"`
	Name       string `json:"name"`
	MemberRole uint8  `json:"memberRole"`
	Status     uint8  `json:"status,omitempty"`
}

type CandidateGroupRef struct {
	ID   uint64 `json:"id"`
	Name string `json:"name"`
}

type GroupStats struct {
	Total        int64 `json:"total"`
	Active       int64 `json:"active"`
	Disabled     int64 `json:"disabled"`
	DefaultCount int64 `json:"defaultCount"`
	TotalMembers int64 `json:"totalMembers"`
}

type Pagination struct {
	Page       int   `json:"page"`
	PageSize   int   `json:"pageSize"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"totalPages"`
}

type GroupListItem struct {
	ID          uint64    `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	Tags        []string  `json:"tags,omitempty"`
	IsDefault   bool      `json:"isDefault"`
	Status      uint8     `json:"status"`
	MemberCount int       `json:"memberCount"`
	Leaders     []string  `json:"leaders,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type GroupMemberUser struct {
	ID     uint64  `json:"id"`
	Name   string  `json:"name"`
	Email  string  `json:"email"`
	Status uint8   `json:"status"`
	Role   RoleRef `json:"role"`
}

type GroupMemberItem struct {
	ID       uint64          `json:"id"`
	UserID   uint64          `json:"userId"`
	Role     uint8           `json:"role"`
	JoinedAt time.Time       `json:"joinedAt"`
	User     GroupMemberUser `json:"user"`
}

type GroupDetail struct {
	ID          uint64            `json:"id"`
	Name        string            `json:"name"`
	Description *string           `json:"description,omitempty"`
	Tags        []string          `json:"tags,omitempty"`
	IsDefault   bool              `json:"isDefault"`
	Status      uint8             `json:"status"`
	MemberCount int               `json:"memberCount"`
	Leaders     []string          `json:"leaders,omitempty"`
	CreatedAt   time.Time         `json:"createdAt"`
	UpdatedAt   time.Time         `json:"updatedAt"`
	Members     []GroupMemberItem `json:"members"`
}

type GroupCandidateItem struct {
	ID     uint64              `json:"id"`
	Name   string              `json:"name"`
	Email  string              `json:"email"`
	Status uint8               `json:"status"`
	Role   RoleRef             `json:"role"`
	Groups []CandidateGroupRef `json:"groups,omitempty"`
}

type ListGroupsResult struct {
	Items      []GroupListItem `json:"items"`
	Summary    GroupStats      `json:"summary"`
	Pagination Pagination      `json:"pagination"`
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

func (s *Service) ListGroups(ctx context.Context, actor Actor, input ListGroupsInput) (*ListGroupsResult, error) {
	if err := ensureAdminActor(actor); err != nil {
		return nil, err
	}

	input.Page = normalizePage(input.Page)
	input.PageSize = normalizePageSize(input.PageSize)
	input.Keyword = strings.TrimSpace(input.Keyword)

	groups, total, err := s.repo.ListGroups(ctx, input)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询用户组列表失败", Err: err}
	}

	stats, err := s.repo.GetGroupStats(ctx)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询用户组统计失败", Err: err}
	}

	items := make([]GroupListItem, 0, len(groups))
	for i := range groups {
		items = append(items, toGroupListItem(&groups[i]))
	}

	totalPages := 0
	if total > 0 {
		totalPages = int((total + int64(input.PageSize) - 1) / int64(input.PageSize))
	}

	return &ListGroupsResult{
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

func (s *Service) GetGroup(ctx context.Context, actor Actor, groupID uint64) (*GroupDetail, error) {
	if err := ensureAdminActor(actor); err != nil {
		return nil, err
	}

	group, err := s.repo.GetGroupByID(ctx, groupID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "用户组不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载用户组详情失败", Err: err}
	}

	detail := toGroupDetail(group)
	return &detail, nil
}

func (s *Service) CreateGroup(ctx context.Context, actor Actor, input CreateGroupInput) (*GroupDetail, error) {
	if err := ensureAdminActor(actor); err != nil {
		return nil, err
	}

	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "用户组名称不能为空"}
	}
	if err := validateGroupStatus(input.Status); err != nil {
		return nil, err
	}

	group := &model.UserGroup{
		Name:      name,
		Tags:      normalizeTags(input.Tags),
		Status:    input.Status,
		IsDefault: input.IsDefault && input.Status == model.UserGroupStatusActive,
	}
	assignOptionalString(&group.Description, input.Description)

	if err := s.repo.RunInTx(ctx, func(repo Repository) error {
		if err := repo.CreateGroup(ctx, group); err != nil {
			return err
		}
		if group.IsDefault {
			return repo.ClearDefaultExcept(ctx, group.ID)
		}
		return nil
	}); err != nil {
		if isDuplicateError(err) {
			return nil, &ServiceError{Status: http.StatusConflict, Message: "用户组名称已存在", Err: err}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "创建用户组失败", Err: err}
	}

	return s.GetGroup(ctx, actor, group.ID)
}

func (s *Service) UpdateGroup(ctx context.Context, actor Actor, groupID uint64, input UpdateGroupInput) (*GroupDetail, error) {
	if err := ensureAdminActor(actor); err != nil {
		return nil, err
	}

	if _, err := s.repo.GetGroupByID(ctx, groupID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "用户组不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载用户组失败", Err: err}
	}

	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "用户组名称不能为空"}
	}
	if err := validateGroupStatus(input.Status); err != nil {
		return nil, err
	}

	isDefault := input.IsDefault && input.Status == model.UserGroupStatusActive
	updates := map[string]any{
		"name":        name,
		"description": nullableString(input.Description),
		"tags":        normalizeTags(input.Tags),
		"status":      input.Status,
		"is_default":  isDefault,
	}

	if err := s.repo.RunInTx(ctx, func(repo Repository) error {
		if err := repo.UpdateGroup(ctx, groupID, updates); err != nil {
			return err
		}
		if isDefault {
			return repo.ClearDefaultExcept(ctx, groupID)
		}
		return nil
	}); err != nil {
		if isDuplicateError(err) {
			return nil, &ServiceError{Status: http.StatusConflict, Message: "用户组名称已存在", Err: err}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "更新用户组失败", Err: err}
	}

	return s.GetGroup(ctx, actor, groupID)
}

func (s *Service) DeleteGroup(ctx context.Context, actor Actor, groupID uint64) error {
	if err := ensureAdminActor(actor); err != nil {
		return err
	}

	if _, err := s.repo.GetGroupByID(ctx, groupID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &ServiceError{Status: http.StatusNotFound, Message: "用户组不存在"}
		}
		return &ServiceError{Status: http.StatusInternalServerError, Message: "加载用户组失败", Err: err}
	}

	memberCount, err := s.repo.CountMembers(ctx, groupID)
	if err != nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "检查用户组成员失败", Err: err}
	}
	if memberCount > 0 {
		return &ServiceError{Status: http.StatusConflict, Message: "该用户组仍有成员，请先移除成员后再删除"}
	}

	if err := s.repo.DeleteGroup(ctx, groupID); err != nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "删除用户组失败", Err: err}
	}
	return nil
}

func (s *Service) ListMemberCandidates(ctx context.Context, actor Actor, groupID uint64, keyword string) ([]GroupCandidateItem, error) {
	if err := ensureAdminActor(actor); err != nil {
		return nil, err
	}

	if _, err := s.repo.GetGroupByID(ctx, groupID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "用户组不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载用户组失败", Err: err}
	}

	users, err := s.repo.SearchCandidateUsers(ctx, groupID, keyword, 20)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询成员候选用户失败", Err: err}
	}

	items := make([]GroupCandidateItem, 0, len(users))
	for i := range users {
		items = append(items, toGroupCandidateItem(&users[i]))
	}

	return items, nil
}

func (s *Service) AddMember(ctx context.Context, actor Actor, groupID uint64, input AddMemberInput) (*GroupMemberItem, error) {
	if err := ensureAdminActor(actor); err != nil {
		return nil, err
	}
	if err := validateMemberRole(input.Role); err != nil {
		return nil, err
	}

	if _, err := s.repo.GetGroupByID(ctx, groupID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "用户组不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载用户组失败", Err: err}
	}

	user, err := s.repo.GetUserByID(ctx, input.UserID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "目标用户不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载目标用户失败", Err: err}
	}
	if !EligibleRoleName(user.Role.Name) {
		return nil, &ServiceError{Status: http.StatusForbidden, Message: "该账号角色不允许加入用户组"}
	}

	if _, err := s.repo.FindMemberByUserID(ctx, groupID, input.UserID); err == nil {
		return nil, &ServiceError{Status: http.StatusConflict, Message: "该用户已经在当前分组中"}
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "检查成员关系失败", Err: err}
	}

	member := &model.UserGroupMember{
		GroupID: groupID,
		UserID:  input.UserID,
		Role:    input.Role,
	}
	if err := s.repo.CreateMember(ctx, member); err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "添加成员失败", Err: err}
	}

	loaded, err := s.repo.GetMemberByID(ctx, groupID, member.ID)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载新增成员失败", Err: err}
	}
	item := toGroupMemberItem(loaded)
	return &item, nil
}

func (s *Service) UpdateMember(ctx context.Context, actor Actor, groupID uint64, memberID uint64, input UpdateMemberInput) (*GroupMemberItem, error) {
	if err := ensureAdminActor(actor); err != nil {
		return nil, err
	}
	if err := validateMemberRole(input.Role); err != nil {
		return nil, err
	}

	if _, err := s.repo.GetMemberByID(ctx, groupID, memberID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "分组成员不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载分组成员失败", Err: err}
	}

	if err := s.repo.UpdateMember(ctx, groupID, memberID, map[string]any{"role": input.Role}); err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "更新成员角色失败", Err: err}
	}

	loaded, err := s.repo.GetMemberByID(ctx, groupID, memberID)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载更新后的成员失败", Err: err}
	}
	item := toGroupMemberItem(loaded)
	return &item, nil
}

func (s *Service) RemoveMember(ctx context.Context, actor Actor, groupID uint64, memberID uint64) error {
	if err := ensureAdminActor(actor); err != nil {
		return err
	}

	if _, err := s.repo.GetMemberByID(ctx, groupID, memberID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &ServiceError{Status: http.StatusNotFound, Message: "分组成员不存在"}
		}
		return &ServiceError{Status: http.StatusInternalServerError, Message: "加载分组成员失败", Err: err}
	}

	if err := s.repo.DeleteMember(ctx, groupID, memberID); err != nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "移除成员失败", Err: err}
	}

	return nil
}

func UserGroupRefsFromMembers(members []model.UserGroupMember, includeStatus bool) []GroupRef {
	if len(members) == 0 {
		return nil
	}

	refs := make([]GroupRef, 0, len(members))
	for _, member := range members {
		ref := GroupRef{
			ID:         member.Group.ID,
			Name:       member.Group.Name,
			MemberRole: member.Role,
		}
		if includeStatus {
			ref.Status = member.Group.Status
		}
		refs = append(refs, ref)
	}
	return refs
}

func ensureAdminActor(actor Actor) error {
	if actor.RoleName == model.RoleNameAdmin || actor.RoleName == model.RoleNameSuperAdmin {
		return nil
	}
	return &ServiceError{Status: http.StatusForbidden, Message: "当前账号无管理员权限"}
}

func validateGroupStatus(status uint8) error {
	if status != model.UserGroupStatusActive && status != model.UserGroupStatusDisabled {
		return &ServiceError{Status: http.StatusBadRequest, Message: "用户组状态不合法"}
	}
	return nil
}

func validateMemberRole(role uint8) error {
	if role != model.UserGroupMemberRoleMember && role != model.UserGroupMemberRoleLeader {
		return &ServiceError{Status: http.StatusBadRequest, Message: "组内角色不合法"}
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

func toRoleRef(role model.Role) RoleRef {
	return RoleRef{
		ID:          role.ID,
		Name:        role.Name,
		DisplayName: role.DisplayName,
	}
}

func toGroupListItem(group *model.UserGroup) GroupListItem {
	return GroupListItem{
		ID:          group.ID,
		Name:        group.Name,
		Description: group.Description,
		Tags:        copyTags(group.Tags),
		IsDefault:   group.IsDefault,
		Status:      group.Status,
		MemberCount: len(group.Members),
		Leaders:     leaderNames(group.Members),
		CreatedAt:   group.CreatedAt,
		UpdatedAt:   group.UpdatedAt,
	}
}

func toGroupDetail(group *model.UserGroup) GroupDetail {
	members := make([]GroupMemberItem, 0, len(group.Members))
	for _, member := range group.Members {
		members = append(members, toGroupMemberItem(&member))
	}

	return GroupDetail{
		ID:          group.ID,
		Name:        group.Name,
		Description: group.Description,
		Tags:        copyTags(group.Tags),
		IsDefault:   group.IsDefault,
		Status:      group.Status,
		MemberCount: len(group.Members),
		Leaders:     leaderNames(group.Members),
		CreatedAt:   group.CreatedAt,
		UpdatedAt:   group.UpdatedAt,
		Members:     members,
	}
}

func toGroupMemberItem(member *model.UserGroupMember) GroupMemberItem {
	return GroupMemberItem{
		ID:       member.ID,
		UserID:   member.UserID,
		Role:     member.Role,
		JoinedAt: member.JoinedAt,
		User: GroupMemberUser{
			ID:     member.User.ID,
			Name:   member.User.Name,
			Email:  member.User.Email,
			Status: member.User.Status,
			Role:   toRoleRef(member.User.Role),
		},
	}
}

func toGroupCandidateItem(user *model.User) GroupCandidateItem {
	return GroupCandidateItem{
		ID:     user.ID,
		Name:   user.Name,
		Email:  user.Email,
		Status: user.Status,
		Role:   toRoleRef(user.Role),
		Groups: candidateGroups(user.GroupMembers),
	}
}

func leaderNames(members []model.UserGroupMember) []string {
	leaders := make([]string, 0, len(members))
	for _, member := range members {
		if member.Role != model.UserGroupMemberRoleLeader {
			continue
		}
		name := strings.TrimSpace(member.User.Name)
		if name == "" {
			name = strings.TrimSpace(member.User.Email)
		}
		if name != "" {
			leaders = append(leaders, name)
		}
	}
	return leaders
}

func candidateGroups(members []model.UserGroupMember) []CandidateGroupRef {
	if len(members) == 0 {
		return nil
	}

	groups := make([]CandidateGroupRef, 0, len(members))
	for _, member := range members {
		groups = append(groups, CandidateGroupRef{
			ID:   member.Group.ID,
			Name: member.Group.Name,
		})
	}
	return groups
}

func normalizeTags(tags []string) []string {
	if len(tags) == 0 {
		return nil
	}

	seen := make(map[string]struct{}, len(tags))
	result := make([]string, 0, len(tags))
	for _, tag := range tags {
		trimmed := strings.TrimSpace(tag)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}
	if len(result) == 0 {
		return nil
	}
	return result
}

func copyTags(tags []string) []string {
	if len(tags) == 0 {
		return nil
	}
	copied := make([]string, len(tags))
	copy(copied, tags)
	return copied
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

func isDuplicateError(err error) bool {
	return strings.Contains(strings.ToLower(err.Error()), "duplicate") || strings.Contains(strings.ToLower(err.Error()), "unique")
}
