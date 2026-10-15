package usergroup

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

type Service struct {
	repo        Repository
	fileStore   groupLogoFileStore
	qrFileStore admissionQRCodeFileStore
	now         func() time.Time
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
	Show        uint8
	Status      uint8
}

type UpdateGroupInput struct {
	Name        string
	Description string
	Logo        *multipart.FileHeader
	RemoveLogo  bool
	Tags        []string
	Show        uint8
	Status      uint8
}

type GroupStats struct {
	Total    int64 `json:"total"`
	Active   int64 `json:"active"`
	Disabled int64 `json:"disabled"`
}

type GroupListItem struct {
	ID                        uint64    `json:"id"`
	Name                      string    `json:"name"`
	Description               *string   `json:"description,omitempty"`
	LogoURL                   *string   `json:"logoUrl,omitempty"`
	AdmissionQRCodeConfigured bool      `json:"admissionQrCodeConfigured"`
	AdmissionQRCodeURL        *string   `json:"admissionQrCodeUrl,omitempty"`
	Tags                      []string  `json:"tags,omitempty"`
	Show                      uint8     `json:"show"`
	Status                    uint8     `json:"status"`
	CreatedAt                 time.Time `json:"createdAt"`
	UpdatedAt                 time.Time `json:"updatedAt"`
}

type AdmissionQRCodeConfiguration struct {
	GroupID            uint64  `json:"groupId"`
	GroupName          string  `json:"groupName"`
	Configured         bool    `json:"configured"`
	AdmissionQRCodeURL *string `json:"admissionQrCodeUrl,omitempty"`
}

type AdmissionQRCodeImage struct {
	Content     []byte
	ContentType string
}

type GroupDetail struct {
	ID          uint64    `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	LogoURL     *string   `json:"logoUrl,omitempty"`
	Tags        []string  `json:"tags,omitempty"`
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
		repo:        repo,
		fileStore:   fileStore,
		qrFileStore: mustNewAdmissionQRCodeFileStore(),
		now:         time.Now,
	}
}

func newServiceWithDependencies(repo Repository, fileStore groupLogoFileStore) *Service {
	return &Service{
		repo:        repo,
		fileStore:   fileStore,
		qrFileStore: mustNewAdmissionQRCodeFileStore(),
		now:         time.Now,
	}
}

func newServiceWithAdmissionQRCodeDependencies(repo Repository, logoStore groupLogoFileStore, qrStore admissionQRCodeFileStore) *Service {
	return &Service{repo: repo, fileStore: logoStore, qrFileStore: qrStore, now: time.Now}
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

func (s *Service) UploadAdmissionQRCode(ctx context.Context, actor Actor, groupID uint64, file *multipart.FileHeader) (*AdmissionQRCodeConfiguration, error) {
	if err := ensureSuperAdminActor(actor); err != nil {
		return nil, err
	}
	if groupID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "用户组 ID 不合法"}
	}
	if file == nil {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "请选择 PNG 或 JPEG 图片"}
	}
	if s.qrFileStore == nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "录取群二维码存储不可用"}
	}
	now := s.now()
	saved, err := s.qrFileStore.Save(ctx, file, now)
	if err != nil {
		status := http.StatusBadRequest
		if !strings.Contains(err.Error(), "不能超过") && !strings.Contains(err.Error(), "PNG") && !strings.Contains(err.Error(), "JPEG") && !strings.Contains(err.Error(), "尺寸") && !strings.Contains(err.Error(), "图片") {
			status = http.StatusInternalServerError
		}
		return nil, &ServiceError{Status: status, Message: err.Error(), Err: err}
	}
	currentURL := stringPtr(saved.URL)
	updates := map[string]any{"admission_image_url": currentURL}
	var groupName string
	var previousURL *string
	if err := s.repo.RunInTx(ctx, func(repo Repository) error {
		group, err := repo.GetGroupByIDForUpdate(ctx, groupID)
		if err != nil {
			return err
		}
		groupName = group.Name
		previousURL = copyStringPtr(group.AdmissionImageURL)
		if err := repo.UpdateGroup(ctx, groupID, updates); err != nil {
			return err
		}
		return recordAdmissionQRCodeAudit(ctx, repo, actor, groupID, "user_group_admission_qr_updated", http.MethodPost, previousURL, currentURL)
	}); err != nil {
		_ = s.qrFileStore.Remove(context.Background(), saved.RelativePath)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "用户组不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "更新录取群二维码失败", Err: err}
	}
	return admissionQRCodeConfiguration(&model.UserGroup{ID: groupID, Name: groupName, AdmissionImageURL: currentURL}), nil
}

func (s *Service) RemoveAdmissionQRCode(ctx context.Context, actor Actor, groupID uint64) (*AdmissionQRCodeConfiguration, error) {
	if err := ensureSuperAdminActor(actor); err != nil {
		return nil, err
	}
	if groupID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "用户组 ID 不合法"}
	}
	var group *model.UserGroup
	var previousURL *string
	if err := s.repo.RunInTx(ctx, func(repo Repository) error {
		var err error
		group, err = repo.GetGroupByIDForUpdate(ctx, groupID)
		if err != nil {
			return err
		}
		previousURL = copyStringPtr(group.AdmissionImageURL)
		if previousURL == nil {
			return nil
		}
		if err := repo.UpdateGroup(ctx, groupID, map[string]any{"admission_image_url": nil}); err != nil {
			return err
		}
		return recordAdmissionQRCodeAudit(ctx, repo, actor, groupID, "user_group_admission_qr_removed", http.MethodDelete, previousURL, nil)
	}); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "用户组不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "移除录取群二维码失败", Err: err}
	}
	if previousURL == nil {
		return admissionQRCodeConfiguration(group), nil
	}
	// Keep the old file so pending notification snapshots remain usable.
	return admissionQRCodeConfiguration(&model.UserGroup{ID: group.ID, Name: group.Name}), nil
}

func (s *Service) OpenAdmissionQRCode(ctx context.Context, actor Actor, fileName string) (*AdmissionQRCodeImage, error) {
	if err := ensureAdminActor(actor); err != nil {
		return nil, err
	}
	if s.qrFileStore == nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "录取群二维码存储不可用"}
	}
	data, contentType, err := s.qrFileStore.Read(ctx, fileName)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusNotFound, Message: "录取群二维码不存在或无法读取", Err: err}
	}
	return &AdmissionQRCodeImage{Content: data, ContentType: contentType}, nil
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
		Name:   name,
		Tags:   normalizeTags(input.Tags),
		Status: input.Status,
		Show:   input.Show,
	}
	assignOptionalString(&group.Description, input.Description)
	if savedLogo != nil {
		group.LogoURL = stringPtr(savedLogo.URL)
	}

	if err := s.repo.RunInTx(ctx, func(repo Repository) error {
		return repo.CreateGroup(ctx, group)
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

	updates, err := buildGroupUpdates(name, input.Description, input.Tags, input.Status, input.Show, logoURL, includeLogo)
	if err != nil {
		if savedLogo != nil {
			_ = s.fileStore.Remove(context.Background(), savedLogo.RelativePath)
		}
		return nil, err
	}

	if err := s.repo.RunInTx(ctx, func(repo Repository) error {
		return repo.UpdateGroup(ctx, groupID, updates)
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

func ensureSuperAdminActor(actor Actor) error {
	if actor.RoleName == model.RoleNameSuperAdmin {
		return nil
	}
	return &ServiceError{Status: http.StatusForbidden, Message: "仅超级管理员可以管理录取群二维码"}
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
		ID:                        group.ID,
		Name:                      group.Name,
		Description:               group.Description,
		LogoURL:                   copyStringPtr(group.LogoURL),
		AdmissionQRCodeConfigured: group.AdmissionImageURL != nil && strings.TrimSpace(*group.AdmissionImageURL) != "",
		AdmissionQRCodeURL:        copyStringPtr(group.AdmissionImageURL),
		Tags:                      copyTags(group.Tags),
		Show:                      group.Show,
		Status:                    group.Status,
		CreatedAt:                 group.CreatedAt,
		UpdatedAt:                 group.UpdatedAt,
	}
}

func admissionQRCodeConfiguration(group *model.UserGroup) *AdmissionQRCodeConfiguration {
	if group == nil {
		return nil
	}
	url := copyStringPtr(group.AdmissionImageURL)
	return &AdmissionQRCodeConfiguration{
		GroupID: group.ID, GroupName: group.Name,
		Configured:         url != nil && strings.TrimSpace(*url) != "",
		AdmissionQRCodeURL: url,
	}
}

type admissionQRCodeAuditRepository interface {
	CreateAuditLog(ctx context.Context, audit *model.AuditLog) error
}

func recordAdmissionQRCodeAudit(ctx context.Context, repo Repository, actor Actor, groupID uint64, action string, method string, previousURL *string, currentURL *string) error {
	writer, ok := repo.(admissionQRCodeAuditRepository)
	if !ok {
		return fmt.Errorf("admission QR audit storage unavailable")
	}
	metadata, err := json.Marshal(map[string]any{
		"groupId": groupID, "previousUrl": previousURL, "currentUrl": currentURL,
	})
	if err != nil {
		return err
	}
	id := actor.ID
	return writer.CreateAuditLog(ctx, &model.AuditLog{
		ActorID: &id, Action: action, Method: method,
		Path:   fmt.Sprintf("/api/admin/user-groups/%d/admission-qr", groupID),
		Status: http.StatusOK, Metadata: string(metadata),
	})
}

func toGroupDetail(group *model.UserGroup) GroupDetail {
	return GroupDetail{
		ID:          group.ID,
		Name:        group.Name,
		Description: group.Description,
		LogoURL:     copyStringPtr(group.LogoURL),
		Tags:        copyTags(group.Tags),
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

func buildGroupUpdates(name string, description string, tags []string, status uint8, show uint8, logoURL *string, includeLogo bool) (map[string]any, error) {
	tagsJSON, err := json.Marshal(normalizeTags(tags))
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "序列化用户组标签失败", Err: err}
	}

	updates := map[string]any{
		"name":        name,
		"description": nullableString(description),
		"tags":        string(tagsJSON),
		"status":      status,
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
