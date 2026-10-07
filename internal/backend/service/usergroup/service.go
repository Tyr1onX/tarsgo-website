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
	ID       uint64
	RoleName string
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

type GroupStats struct {
	Total        int64 `json:"total"`
	Active       int64 `json:"active"`
	Disabled     int64 `json:"disabled"`
	DefaultCount int64 `json:"defaultCount"`
}

type GroupListItem struct {
	ID          uint64    `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	LogoURL     *string   `json:"logoUrl,omitempty"`
	Tags        []string  `json:"tags,omitempty"`
	IsDefault   bool      `json:"isDefault"`
	Show        uint8     `json:"show"`
	Status      uint8     `json:"status"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type GroupDetail struct {
	ID          uint64    `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	LogoURL     *string   `json:"logoUrl,omitempty"`
	Tags        []string  `json:"tags,omitempty"`
	IsDefault   bool      `json:"isDefault"`
	Show        uint8     `json:"show"`
	Status      uint8     `json:"status"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
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

func validateGroupShow(show uint8) error {
	if show != 0 && show != 1 {
		return &ServiceError{Status: http.StatusBadRequest, Message: "用户组展示状态不合法"}
	}
	return nil
}

func toGroupListItem(group *model.UserGroup) GroupListItem {
	return GroupListItem{
		ID:          group.ID,
		Name:        group.Name,
		Description: group.Description,
		LogoURL:     copyStringPtr(group.LogoURL),
		Tags:        copyTags(group.Tags),
		IsDefault:   group.IsDefault,
		Show:        group.Show,
		Status:      group.Status,
		CreatedAt:   group.CreatedAt,
		UpdatedAt:   group.UpdatedAt,
	}
}

func toGroupDetail(group *model.UserGroup) GroupDetail {
	return GroupDetail{
		ID:          group.ID,
		Name:        group.Name,
		Description: group.Description,
		LogoURL:     copyStringPtr(group.LogoURL),
		Tags:        copyTags(group.Tags),
		IsDefault:   group.IsDefault,
		Show:        group.Show,
		Status:      group.Status,
		CreatedAt:   group.CreatedAt,
		UpdatedAt:   group.UpdatedAt,
	}
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
