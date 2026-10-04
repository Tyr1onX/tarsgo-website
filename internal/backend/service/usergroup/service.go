package usergroup

import (
	"context"
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

type Service struct {
	repo      Repository
	fileStore groupLogoFileStore
	now       func() time.Time
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

type ListGroupsInput struct {
	Status *uint8
}

type CreateGroupInput struct {
	Name        string
	Description string
	Logo        *multipart.FileHeader
	Tags        []string
	IsDefault   bool
	Show        uint8
	Status      uint8
}

type UpdateGroupInput struct {
	Name        string
	Description string
	Logo        *multipart.FileHeader
	RemoveLogo  bool
	Tags        []string
	IsDefault   bool
	Show        uint8
	Status      uint8
}

type UpdateAdmissionImageInput struct {
	Image       *multipart.FileHeader
	RemoveImage bool
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
	MemberID   uint64 `json:"memberId"`
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

type GroupListItem struct {
	ID                uint64    `json:"id"`
	Name              string    `json:"name"`
	Description       *string   `json:"description,omitempty"`
	LogoURL           *string   `json:"logoUrl,omitempty"`
	AdmissionImageURL *string   `json:"admissionImageUrl,omitempty"`
	Tags              []string  `json:"tags,omitempty"`
	IsDefault         bool      `json:"isDefault"`
	Show              uint8     `json:"show"`
	Status            uint8     `json:"status"`
	MemberCount       int       `json:"memberCount"`
	Leaders           []string  `json:"leaders,omitempty"`
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

type GroupMemberUser struct {
	ID     uint64  `json:"id"`
	Name   string  `json:"name"`
	Email  string  `json:"email"`
	Phone  *string `json:"phone,omitempty"`
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
	ID                uint64            `json:"id"`
	Name              string            `json:"name"`
	Description       *string           `json:"description,omitempty"`
	LogoURL           *string           `json:"logoUrl,omitempty"`
	AdmissionImageURL *string           `json:"admissionImageUrl,omitempty"`
	Tags              []string          `json:"tags,omitempty"`
	IsDefault         bool              `json:"isDefault"`
	Show              uint8             `json:"show"`
	Status            uint8             `json:"status"`
	MemberCount       int               `json:"memberCount"`
	Leaders           []string          `json:"leaders,omitempty"`
	CreatedAt         time.Time         `json:"createdAt"`
	UpdatedAt         time.Time         `json:"updatedAt"`
	Members           []GroupMemberItem `json:"members"`
}

type GroupCandidateItem struct {
	ID     uint64              `json:"id"`
	Name   string              `json:"name"`
	Email  string              `json:"email"`
	Phone  *string             `json:"phone,omitempty"`
	Status uint8               `json:"status"`
	Role   RoleRef             `json:"role"`
	Groups []CandidateGroupRef `json:"groups,omitempty"`
}

type ListGroupsResult struct {
	Items   []GroupListItem `json:"items"`
	Summary GroupStats      `json:"summary"`
}

type GroupOption struct {
	ID     uint64 `json:"id"`
	Name   string `json:"name"`
	Status uint8  `json:"status"`
}

func NewService(repo Repository) *Service {
	fileStore, err := newLocalGroupLogoFileStore("")
	if err != nil {
		panic(err)
	}

	return &Service{
		repo:      repo,
		fileStore: fileStore,
		now:       time.Now,
	}
}

func newServiceWithDependencies(repo Repository, fileStore groupLogoFileStore) *Service {
	return &Service{
		repo:      repo,
		fileStore: fileStore,
		now:       time.Now,
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

func (s *Service) ListGroups(ctx context.Context, actor Actor, input ListGroupsInput) (*ListGroupsResult, error) {
	if actor.RoleName != model.RoleNameSuperAdmin {
		return nil, &ServiceError{Status: http.StatusForbidden, Message: "仅超级管理员可以管理用户组配置"}
	}

	groups, err := s.repo.ListGroups(ctx, input)
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

	return &ListGroupsResult{
		Items:   items,
		Summary: stats,
	}, nil
}

func (s *Service) ListGroupOptions(ctx context.Context, actor Actor) ([]GroupOption, error) {
	if actor.ID == 0 || (actor.RoleName != model.RoleNameSuperAdmin && actor.RoleName != model.RoleNameAdmin) {
		return nil, &ServiceError{Status: http.StatusForbidden, Message: "当前账号无权查看用户组筛选项"}
	}

	groups, err := s.repo.ListGroups(ctx, ListGroupsInput{})
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询用户组筛选项失败", Err: err}
	}

	options := make([]GroupOption, 0, len(groups))
	for _, group := range groups {
		options = append(options, GroupOption{ID: group.ID, Name: group.Name, Status: group.Status})
	}
	return options, nil
}

func (s *Service) GetGroup(ctx context.Context, actor Actor, groupID uint64) (*GroupDetail, error) {
	if err := ensureAdminActor(actor); err != nil {
		return nil, err
	}
	if actor.RoleName == model.RoleNameAdmin && actor.AdminScope == model.AdminScopeGroup && (actor.ManagementGroupID == nil || *actor.ManagementGroupID != groupID) {
		return nil, &ServiceError{Status: http.StatusForbidden, Message: "无权访问其他用户组"}
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
	if actor.RoleName != model.RoleNameSuperAdmin {
		return nil, &ServiceError{Status: http.StatusForbidden, Message: "仅超级管理员可以管理用户组配置"}
	}

	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "用户组名称不能为空"}
	}
	if err := validateGroupStatus(input.Status); err != nil {
		return nil, err
	}
	if err := validateGroupShow(input.Show); err != nil {
		return nil, err
	}
	if err := validateGroupLogoFile(input.Logo); err != nil {
		return nil, err
	}

	var savedLogo *storedGroupLogo
	if input.Logo != nil {
		stored, err := s.fileStore.Save(ctx, groupLogoSaveInput{
			File: input.Logo,
			Now:  s.now(),
		})
		if err != nil {
			return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "保存用户组 Logo 失败", Err: err}
		}
		savedLogo = stored
	}

	group := &model.UserGroup{
		Name:      name,
		Tags:      normalizeTags(input.Tags),
		Status:    input.Status,
		IsDefault: input.IsDefault && input.Status == model.UserGroupStatusActive,
		Show:      input.Show,
	}
	assignOptionalString(&group.Description, input.Description)
	if savedLogo != nil {
		group.LogoURL = stringPtr(savedLogo.URL)
	}

	if err := s.repo.RunInTx(ctx, func(repo Repository) error {
		if err := repo.CreateGroup(ctx, group); err != nil {
			return err
		}
		if group.IsDefault {
			return repo.ClearDefaultExcept(ctx, group.ID)
		}
		return nil
	}); err != nil {
		if savedLogo != nil {
			_ = s.fileStore.Remove(context.Background(), savedLogo.RelativePath)
		}
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
	if actor.RoleName != model.RoleNameSuperAdmin {
		return nil, &ServiceError{Status: http.StatusForbidden, Message: "仅超级管理员可以管理用户组配置"}
	}

	group, err := s.repo.GetGroupByID(ctx, groupID)
	if err != nil {
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
	if err := validateGroupShow(input.Show); err != nil {
		return nil, err
	}
	if err := validateGroupLogoFile(input.Logo); err != nil {
		return nil, err
	}

	var savedLogo *storedGroupLogo
	if input.Logo != nil {
		stored, err := s.fileStore.Save(ctx, groupLogoSaveInput{
			File: input.Logo,
			Now:  s.now(),
		})
		if err != nil {
			return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "保存用户组 Logo 失败", Err: err}
		}
		savedLogo = stored
	}

	isDefault := input.IsDefault && input.Status == model.UserGroupStatusActive
	var (
		logoURL     *string
		includeLogo bool
	)
	switch {
	case savedLogo != nil:
		logoURL = stringPtr(savedLogo.URL)
		includeLogo = true
	case input.RemoveLogo:
		includeLogo = true
	}

	updates, err := buildGroupUpdates(name, input.Description, input.Tags, input.Status, isDefault, input.Show, logoURL, includeLogo)
	if err != nil {
		if savedLogo != nil {
			_ = s.fileStore.Remove(context.Background(), savedLogo.RelativePath)
		}
		return nil, err
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
		if savedLogo != nil {
			_ = s.fileStore.Remove(context.Background(), savedLogo.RelativePath)
		}
		if isDuplicateError(err) {
			return nil, &ServiceError{Status: http.StatusConflict, Message: "用户组名称已存在", Err: err}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "更新用户组失败", Err: err}
	}

	if savedLogo != nil {
		cleanupManagedGroupLogoURL(context.Background(), s.fileStore, group.LogoURL, savedLogo.URL)
	} else if input.RemoveLogo {
		cleanupManagedGroupLogoURL(context.Background(), s.fileStore, group.LogoURL, "")
	}

	return s.GetGroup(ctx, actor, groupID)
}

func (s *Service) UpdateAdmissionImage(ctx context.Context, actor Actor, groupID uint64, input UpdateAdmissionImageInput) (*GroupDetail, error) {
	if actor.ID == 0 || actor.RoleName != model.RoleNameAdmin || actor.AdminScope != model.AdminScopeGroup || actor.ManagementGroupID == nil || *actor.ManagementGroupID != groupID || actor.GroupRole != "leader" {
		return nil, &ServiceError{Status: http.StatusForbidden, Message: "仅当前组组长可以配置录取群图片"}
	}
	if input.Image == nil && !input.RemoveImage {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "请选择要上传的录取群图片"}
	}
	if input.Image != nil && input.RemoveImage {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "不能同时上传和移除录取群图片"}
	}
	if err := validateAdmissionImageFile(input.Image); err != nil {
		return nil, err
	}

	group, err := s.repo.GetGroupByID(ctx, groupID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "用户组不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载用户组失败", Err: err}
	}

	var savedImage *storedGroupLogo
	if input.Image != nil {
		savedImage, err = s.fileStore.Save(ctx, groupLogoSaveInput{File: input.Image, Now: s.now()})
		if err != nil {
			return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "保存录取群图片失败", Err: err}
		}
	}

	var imageURL *string
	if savedImage != nil {
		imageURL = stringPtr(savedImage.URL)
	}
	if err := s.repo.UpdateGroup(ctx, groupID, map[string]any{"admission_image_url": imageURL}); err != nil {
		if savedImage != nil {
			_ = s.fileStore.Remove(context.Background(), savedImage.RelativePath)
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "更新录取群图片失败", Err: err}
	}

	if savedImage != nil {
		cleanupManagedGroupLogoURL(context.Background(), s.fileStore, group.AdmissionImageURL, savedImage.URL)
	} else {
		cleanupManagedGroupLogoURL(context.Background(), s.fileStore, group.AdmissionImageURL, "")
	}
	return s.GetGroup(ctx, actor, groupID)
}

func (s *Service) DeleteGroup(ctx context.Context, actor Actor, groupID uint64) error {
	if err := ensureAdminActor(actor); err != nil {
		return err
	}
	if actor.RoleName != model.RoleNameSuperAdmin {
		return &ServiceError{Status: http.StatusForbidden, Message: "仅超级管理员可以管理用户组配置"}
	}

	group, err := s.repo.GetGroupByID(ctx, groupID)
	if err != nil {
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

	cleanupManagedGroupLogoURL(context.Background(), s.fileStore, group.LogoURL, "")
	cleanupManagedGroupLogoURL(context.Background(), s.fileStore, group.AdmissionImageURL, "")
	return nil
}

func (s *Service) ListMemberCandidates(ctx context.Context, actor Actor, groupID uint64) ([]GroupCandidateItem, error) {
	if actor.RoleName == model.RoleNameSuperAdmin && actor.AdminScope == "" {
		// compatibility for pre-scope internal callers
	} else if err := ensureMemberManager(actor, groupID, model.UserGroupMemberRoleMember, false); err != nil {
		return nil, err
	}

	if _, err := s.repo.GetGroupByID(ctx, groupID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "用户组不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载用户组失败", Err: err}
	}

	users, err := s.repo.ListCandidateUsers(ctx, groupID)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询成员候选用户失败", Err: err}
	}

	items := make([]GroupCandidateItem, 0, len(users))
	for i := range users {
		if actor.AdminScope != "" && (users[i].Status != model.UserStatusEnabled || !inActiveDefaultGroup(users[i].GroupMembers)) {
			continue
		}
		items = append(items, toGroupCandidateItem(&users[i]))
	}

	return items, nil
}

func inActiveDefaultGroup(members []model.UserGroupMember) bool {
	for _, member := range members {
		if member.Group.IsDefault && member.Group.Status == model.UserGroupStatusActive {
			return true
		}
	}
	return false
}

func (s *Service) AddMember(ctx context.Context, actor Actor, groupID uint64, input AddMemberInput) (*GroupMemberItem, error) {
	if err := ensureMemberManager(actor, groupID, input.Role, false); err != nil {
		return nil, err
	}
	if err := validateMemberRole(input.Role); err != nil {
		return nil, err
	}

	group, err := s.repo.GetGroupByID(ctx, groupID)
	if err != nil {
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
	if user.Role.Name == model.RoleNameSuperAdmin {
		return nil, &ServiceError{Status: http.StatusForbidden, Message: "超级管理员不能加入普通用户组"}
	}
	if actor.RoleName != model.RoleNameSuperAdmin && user.Role.Name == model.RoleNameAdmin {
		return nil, &ServiceError{Status: http.StatusForbidden, Message: "管理员不能调整其他管理员的组内身份"}
	}
	if input.Role != model.UserGroupMemberRoleMember {
		for _, existing := range user.GroupMembers {
			if existing.Role == model.UserGroupMemberRoleMember || existing.GroupID == groupID {
				continue
			}
			return nil, &ServiceError{Status: http.StatusConflict, Message: "该用户已在其他用户组担任管理职务"}
		}
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

	if err := s.repo.RunInTx(ctx, func(repo Repository) error {
		if err := repo.CreateMember(ctx, member); err != nil {
			return err
		}
		if group.IsDefault {
			return nil
		}
		return removeActiveDefaultMemberships(ctx, repo, input.UserID)
	}); err != nil {
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
	if err := ensureMemberManager(actor, groupID, input.Role, true); err != nil {
		return nil, err
	}
	if err := validateMemberRole(input.Role); err != nil {
		return nil, err
	}

	member, err := s.repo.GetMemberByID(ctx, groupID, memberID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "分组成员不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载分组成员失败", Err: err}
	}
	if member.UserID == actor.ID && member.Role == model.UserGroupMemberRoleLeader {
		return nil, &ServiceError{Status: http.StatusForbidden, Message: "组长不能撤销自己的组长身份"}
	}
	if member.Role == model.UserGroupMemberRoleLeader && input.Role == model.UserGroupMemberRoleMember {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "组长不能直接降为普通成员，请先降为组内管理员"}
	}
	if input.Role == model.UserGroupMemberRoleLeader && actor.RoleName != model.RoleNameSuperAdmin {
		return nil, &ServiceError{Status: http.StatusForbidden, Message: "只有超级管理员可以任命组长"}
	}
	if member.User.Role.Name == model.RoleNameAdmin && actor.RoleName != model.RoleNameSuperAdmin {
		return nil, &ServiceError{Status: http.StatusForbidden, Message: "管理员不能调整其他管理员的组内身份"}
	}
	if input.Role != model.UserGroupMemberRoleMember {
		for _, existing := range member.User.GroupMembers {
			if existing.ID == member.ID || existing.Role == model.UserGroupMemberRoleMember {
				continue
			}
			return nil, &ServiceError{Status: http.StatusConflict, Message: "该用户已在其他用户组担任管理职务"}
		}
	}

	if err := s.repo.RunInTx(ctx, func(repo Repository) error {
		return repo.UpdateMember(ctx, groupID, memberID, map[string]any{"role": input.Role})
	}); err != nil {
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
	if err := ensureMemberManager(actor, groupID, model.UserGroupMemberRoleMember, true); err != nil {
		return err
	}
	member, err := s.repo.GetMemberByID(ctx, groupID, memberID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &ServiceError{Status: http.StatusNotFound, Message: "分组成员不存在"}
		}
		return &ServiceError{Status: http.StatusInternalServerError, Message: "加载分组成员失败", Err: err}
	}
	if member.Role != model.UserGroupMemberRoleMember {
		return &ServiceError{Status: http.StatusConflict, Message: "请先撤销组内管理身份后再移除成员"}
	}

	if err := s.repo.RunInTx(ctx, func(repo Repository) error {
		if err := repo.DeleteMember(ctx, groupID, memberID); err != nil {
			return err
		}
		if member.Group.IsDefault {
			return nil
		}
		return ensureDefaultMembershipWhenNoNonDefaultGroups(ctx, repo, member.UserID)
	}); err != nil {
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
			MemberID:   member.ID,
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

func ensureMemberManager(actor Actor, groupID uint64, targetRole uint8, updating bool) error {
	if actor.RoleName == model.RoleNameSuperAdmin {
		return nil
	}
	// Legacy service callers without the new scope fields are treated as
	// unrestricted admins; HTTP requests always carry explicit scope values.
	if actor.RoleName == model.RoleNameAdmin && actor.AdminScope == "" {
		if targetRole == model.UserGroupMemberRoleLeader {
			return &ServiceError{Status: http.StatusForbidden, Message: "组长不能任命组长"}
		}
		return nil
	}
	if actor.RoleName != model.RoleNameAdmin || actor.AdminScope != model.AdminScopeGroup || actor.ManagementGroupID == nil || *actor.ManagementGroupID != groupID || actor.GroupRole != "leader" {
		return &ServiceError{Status: http.StatusForbidden, Message: "仅当前组组长可以管理成员"}
	}
	if targetRole == model.UserGroupMemberRoleLeader {
		return &ServiceError{Status: http.StatusForbidden, Message: "组长不能任命组长"}
	}
	return nil
}

func validateGroupStatus(status uint8) error {
	if status != model.UserGroupStatusActive && status != model.UserGroupStatusDisabled {
		return &ServiceError{Status: http.StatusBadRequest, Message: "用户组状态不合法"}
	}
	return nil
}

func validateGroupShow(show uint8) error {
	if show != 0 && show != 1 {
		return &ServiceError{Status: http.StatusBadRequest, Message: "用户组展示状态不合法"}
	}
	return nil
}

func validateMemberRole(role uint8) error {
	if role != model.UserGroupMemberRoleMember && role != model.UserGroupMemberRoleGroupAdmin && role != model.UserGroupMemberRoleLeader {
		return &ServiceError{Status: http.StatusBadRequest, Message: "组内角色不合法"}
	}
	return nil
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
		ID:                group.ID,
		Name:              group.Name,
		Description:       group.Description,
		LogoURL:           copyStringPtr(group.LogoURL),
		AdmissionImageURL: copyStringPtr(group.AdmissionImageURL),
		Tags:              copyTags(group.Tags),
		IsDefault:         group.IsDefault,
		Show:              group.Show,
		Status:            group.Status,
		MemberCount:       len(group.Members),
		Leaders:           leaderNames(group.Members),
		CreatedAt:         group.CreatedAt,
		UpdatedAt:         group.UpdatedAt,
	}
}

func toGroupDetail(group *model.UserGroup) GroupDetail {
	members := make([]GroupMemberItem, 0, len(group.Members))
	for _, member := range group.Members {
		members = append(members, toGroupMemberItem(&member))
	}

	return GroupDetail{
		ID:                group.ID,
		Name:              group.Name,
		Description:       group.Description,
		LogoURL:           copyStringPtr(group.LogoURL),
		AdmissionImageURL: copyStringPtr(group.AdmissionImageURL),
		Tags:              copyTags(group.Tags),
		IsDefault:         group.IsDefault,
		Show:              group.Show,
		Status:            group.Status,
		MemberCount:       len(group.Members),
		Leaders:           leaderNames(group.Members),
		CreatedAt:         group.CreatedAt,
		UpdatedAt:         group.UpdatedAt,
		Members:           members,
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
			Phone:  copyStringPtr(member.User.Phone),
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
		Phone:  copyStringPtr(user.Phone),
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

func removeActiveDefaultMemberships(ctx context.Context, repo Repository, userID uint64) error {
	user, err := repo.GetUserByID(ctx, userID)
	if err != nil {
		return err
	}

	for _, member := range user.GroupMembers {
		if !member.Group.IsDefault || member.Group.Status != model.UserGroupStatusActive {
			continue
		}
		if err := repo.DeleteMember(ctx, member.GroupID, member.ID); err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
	}

	return nil
}

func ensureDefaultMembershipWhenNoNonDefaultGroups(ctx context.Context, repo Repository, userID uint64) error {
	user, err := repo.GetUserByID(ctx, userID)
	if err != nil {
		return err
	}

	for _, member := range user.GroupMembers {
		if !member.Group.IsDefault {
			return nil
		}
	}

	defaultGroup, err := repo.GetActiveDefaultGroup(ctx)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}

	if _, err := repo.FindMemberByUserID(ctx, defaultGroup.ID, userID); err == nil {
		return nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	return repo.CreateMember(ctx, &model.UserGroupMember{
		GroupID: defaultGroup.ID,
		UserID:  userID,
		Role:    model.UserGroupMemberRoleMember,
	})
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

func buildGroupUpdates(name string, description string, tags []string, status uint8, isDefault bool, show uint8, logoURL *string, includeLogo bool) (map[string]any, error) {
	tagsJSON, err := json.Marshal(normalizeTags(tags))
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "序列化用户组标签失败", Err: err}
	}

	updates := map[string]any{
		"name":        name,
		"description": nullableString(description),
		"tags":        string(tagsJSON),
		"status":      status,
		"is_default":  isDefault,
		"show":        show,
	}
	if includeLogo {
		updates["logo_url"] = copyStringPtr(logoURL)
	}
	return updates, nil
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
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func copyStringPtr(value *string) *string {
	if value == nil {
		return nil
	}
	copied := *value
	return &copied
}

func validateGroupLogoFile(fileHeader *multipart.FileHeader) error {
	if fileHeader == nil {
		return nil
	}
	if fileHeader.Size > 2*1024*1024 {
		return &ServiceError{Status: http.StatusBadRequest, Message: "分组 Logo 不能超过 2MB"}
	}
	contentType := strings.TrimSpace(fileHeader.Header.Get("Content-Type"))
	if !looksLikeGroupLogo(fileHeader.Filename, contentType) {
		return &ServiceError{Status: http.StatusBadRequest, Message: "分组 Logo 必须为图片文件"}
	}
	return nil
}

func validateAdmissionImageFile(fileHeader *multipart.FileHeader) error {
	if fileHeader == nil {
		return nil
	}
	if fileHeader.Size > 2*1024*1024 {
		return &ServiceError{Status: http.StatusBadRequest, Message: "录取群图片不能超过 2MB"}
	}
	if !looksLikeGroupLogo(fileHeader.Filename, fileHeader.Header.Get("Content-Type")) {
		return &ServiceError{Status: http.StatusBadRequest, Message: "录取群图片必须为 PNG、JPG、WebP 或 GIF 图片"}
	}
	return nil
}

func looksLikeGroupLogo(fileName string, contentType string) bool {
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(contentType)), "image/") {
		return true
	}

	switch strings.TrimPrefix(strings.ToLower(filepath.Ext(strings.TrimSpace(fileName))), ".") {
	case "png", "jpg", "jpeg", "webp", "gif":
		return true
	default:
		return false
	}
}

func cleanupManagedGroupLogoURL(ctx context.Context, store groupLogoFileStore, logoURL *string, exceptURL string) {
	if logoURL == nil || store == nil {
		return
	}

	trimmedLogoURL := strings.TrimSpace(*logoURL)
	if trimmedLogoURL == "" || trimmedLogoURL == strings.TrimSpace(exceptURL) {
		return
	}

	relativePath, ok := store.RelativePathFromURL(trimmedLogoURL)
	if !ok {
		return
	}

	_ = store.Remove(ctx, relativePath)
}

func isDuplicateError(err error) bool {
	return strings.Contains(strings.ToLower(err.Error()), "duplicate") || strings.Contains(strings.ToLower(err.Error()), "unique")
}
