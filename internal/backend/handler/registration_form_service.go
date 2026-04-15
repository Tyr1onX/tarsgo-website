package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

var registrationFieldKeyPattern = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)

var registrationFieldTypeLabels = map[string]string{
	"text":              "单行文本",
	"textarea":          "多行文本",
	"number":            "数字",
	"select":            "下拉选择",
	"radio":             "单选",
	"checkbox":          "多选",
	"date":              "日期",
	"phone":             "手机号",
	"email":             "邮箱",
	"user_group_select": "意向组别",
	"file":              "文件上传",
	"image":             "图片上传",
}

type RegistrationFormService struct {
	repo registrationFormRepository
	now  func() time.Time
}

type registrationFormRepository interface {
	RunInTx(ctx context.Context, fn func(repo registrationFormRepository) error) error
	ListForms(ctx context.Context, filter ListRegistrationFormsInput) ([]model.RegistrationForm, error)
	GetFormStats(ctx context.Context) (RegistrationFormStats, error)
	GetFormByID(ctx context.Context, formID uint64) (*model.RegistrationForm, error)
	CreateForm(ctx context.Context, form *model.RegistrationForm) error
	UpdateForm(ctx context.Context, formID uint64, updates map[string]any) error
	ListPublishedForms(ctx context.Context) ([]model.RegistrationForm, error)
	FindRegistrationByFormAndUser(ctx context.Context, formID uint64, userID uint64) (*model.Registration, error)
	ListShownUserGroups(ctx context.Context) ([]model.UserGroup, error)
	IsUserInActiveDefaultGroup(ctx context.Context, userID uint64) (bool, error)
}

type gormRegistrationFormRepository struct {
	db *gorm.DB
}

type RegistrationFormActor struct {
	ID       uint64
	RoleName string
}

type ListRegistrationFormsInput struct {
	Keyword string
	Status  *uint8
}

type UpsertRegistrationFormInput struct {
	Title            string
	Description      string
	CoverImageURL    string
	FieldsSchema     []model.FormField
	MaxRegistrations *int
	StartTime        *time.Time
	EndTime          *time.Time
	Status           uint8
}

type RegistrationFormStats struct {
	Total     int64 `json:"total"`
	Draft     int64 `json:"draft"`
	Published int64 `json:"published"`
	Closed    int64 `json:"closed"`
}

type RegistrationFormListItem struct {
	ID               uint64     `json:"id"`
	Title            string     `json:"title"`
	Description      *string    `json:"description,omitempty"`
	CoverImageURL    *string    `json:"coverImageUrl,omitempty"`
	FieldCount       int        `json:"fieldCount"`
	RequiredCount    int        `json:"requiredCount"`
	MaxRegistrations *int       `json:"maxRegistrations,omitempty"`
	StartTime        *time.Time `json:"startTime,omitempty"`
	EndTime          *time.Time `json:"endTime,omitempty"`
	Status           uint8      `json:"status"`
	CreatedAt        time.Time  `json:"createdAt"`
	UpdatedAt        time.Time  `json:"updatedAt"`
}

type RegistrationFormDetail struct {
	RegistrationFormListItem
	FieldsSchema []model.FormField `json:"fieldsSchema"`
}

type ListRegistrationFormsResult struct {
	Items   []RegistrationFormListItem `json:"items"`
	Summary RegistrationFormStats      `json:"summary"`
}

type ActiveRegistrationFormResult struct {
	ID               uint64            `json:"id"`
	Title            string            `json:"title"`
	Description      *string           `json:"description,omitempty"`
	CoverImageURL    *string           `json:"coverImageUrl,omitempty"`
	FieldsSchema     []model.FormField `json:"fieldsSchema"`
	MaxRegistrations *int              `json:"maxRegistrations,omitempty"`
	StartTime        *time.Time        `json:"startTime,omitempty"`
	EndTime          *time.Time        `json:"endTime,omitempty"`
	Status           uint8             `json:"status"`
}

type RecruitmentPageData struct {
	PageMode            string                        `json:"pageMode"`
	Form                *ActiveRegistrationFormResult `json:"form,omitempty"`
	RegistrationSummary *RecruitmentRegistrationBrief `json:"registrationSummary,omitempty"`
	UnavailableReason   *string                       `json:"unavailableReason,omitempty"`
}

type RecruitmentRegistrationBrief struct {
	ID          uint64    `json:"id"`
	FormID      uint64    `json:"formId"`
	FormTitle   string    `json:"formTitle"`
	Status      uint8     `json:"status"`
	SubmittedAt time.Time `json:"submittedAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type registrationFormServiceError struct {
	Status  int
	Message string
	Err     error
}

type normalizedRegistrationFormInput struct {
	Title            string
	Description      *string
	CoverImageURL    *string
	FieldsSchema     []model.FormField
	MaxRegistrations *int
	StartTime        *time.Time
	EndTime          *time.Time
	Status           uint8
}

func NewRegistrationFormService(db *gorm.DB) *RegistrationFormService {
	return &RegistrationFormService{
		repo: &gormRegistrationFormRepository{db: db},
		now:  time.Now,
	}
}

func newRegistrationFormServiceWithRepo(repo registrationFormRepository) *RegistrationFormService {
	return &RegistrationFormService{
		repo: repo,
		now:  time.Now,
	}
}

func (e *registrationFormServiceError) Error() string {
	if e.Err != nil {
		return e.Message + ": " + e.Err.Error()
	}
	return e.Message
}

func (e *registrationFormServiceError) Unwrap() error {
	return e.Err
}

func (s *RegistrationFormService) ListForms(ctx context.Context, actor RegistrationFormActor, input ListRegistrationFormsInput) (*ListRegistrationFormsResult, error) {
	if err := ensureRegistrationAdminActor(actor); err != nil {
		return nil, err
	}

	if input.Status != nil {
		if err := validateRegistrationFormStatus(*input.Status); err != nil {
			return nil, err
		}
	}
	input.Keyword = strings.TrimSpace(input.Keyword)

	items, err := s.repo.ListForms(ctx, input)
	if err != nil {
		return nil, &registrationFormServiceError{Status: http.StatusInternalServerError, Message: "查询报名表列表失败", Err: err}
	}

	stats, err := s.repo.GetFormStats(ctx)
	if err != nil {
		return nil, &registrationFormServiceError{Status: http.StatusInternalServerError, Message: "查询报名表统计失败", Err: err}
	}

	result := make([]RegistrationFormListItem, 0, len(items))
	for i := range items {
		result = append(result, toRegistrationFormListItem(&items[i]))
	}

	return &ListRegistrationFormsResult{
		Items:   result,
		Summary: stats,
	}, nil
}

func (s *RegistrationFormService) GetForm(ctx context.Context, actor RegistrationFormActor, formID uint64) (*RegistrationFormDetail, error) {
	if err := ensureRegistrationAdminActor(actor); err != nil {
		return nil, err
	}

	form, err := s.repo.GetFormByID(ctx, formID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &registrationFormServiceError{Status: http.StatusNotFound, Message: "报名表不存在"}
		}
		return nil, &registrationFormServiceError{Status: http.StatusInternalServerError, Message: "加载报名表详情失败", Err: err}
	}

	groups, err := s.repo.ListShownUserGroups(ctx)
	if err != nil {
		return nil, &registrationFormServiceError{Status: http.StatusInternalServerError, Message: "加载展示分组失败", Err: err}
	}

	detail := toRegistrationFormDetail(form, groups)
	return &detail, nil
}

func (s *RegistrationFormService) CreateForm(ctx context.Context, actor RegistrationFormActor, input UpsertRegistrationFormInput) (*RegistrationFormDetail, error) {
	if err := ensureRegistrationAdminActor(actor); err != nil {
		return nil, err
	}

	normalized, err := normalizeRegistrationFormInput(input)
	if err != nil {
		return nil, err
	}

	form := &model.RegistrationForm{
		CreatorID:        actor.ID,
		Title:            normalized.Title,
		Description:      copyStringPtr(normalized.Description),
		CoverImageURL:    copyStringPtr(normalized.CoverImageURL),
		FieldsSchema:     cloneRegistrationFields(normalized.FieldsSchema),
		MaxRegistrations: copyIntPtr(normalized.MaxRegistrations),
		StartTime:        copyTimePtr(normalized.StartTime),
		EndTime:          copyTimePtr(normalized.EndTime),
		Status:           normalized.Status,
	}

	if err := s.repo.RunInTx(ctx, func(repo registrationFormRepository) error {
		if normalized.Status == model.RegistrationFormStatusPublished {
			if err := ensureSinglePublishedForm(ctx, repo, 0); err != nil {
				return err
			}
		}
		return repo.CreateForm(ctx, form)
	}); err != nil {
		var serviceErr *registrationFormServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, &registrationFormServiceError{Status: http.StatusInternalServerError, Message: "创建报名表失败", Err: err}
	}

	return s.GetForm(ctx, actor, form.ID)
}

func (s *RegistrationFormService) UpdateForm(ctx context.Context, actor RegistrationFormActor, formID uint64, input UpsertRegistrationFormInput) (*RegistrationFormDetail, error) {
	if err := ensureRegistrationAdminActor(actor); err != nil {
		return nil, err
	}

	if _, err := s.repo.GetFormByID(ctx, formID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &registrationFormServiceError{Status: http.StatusNotFound, Message: "报名表不存在"}
		}
		return nil, &registrationFormServiceError{Status: http.StatusInternalServerError, Message: "加载报名表失败", Err: err}
	}

	normalized, err := normalizeRegistrationFormInput(input)
	if err != nil {
		return nil, err
	}

	updates := map[string]any{
		"title":             normalized.Title,
		"description":       copyStringPtr(normalized.Description),
		"cover_image_url":   copyStringPtr(normalized.CoverImageURL),
		"fields_schema":     cloneRegistrationFields(normalized.FieldsSchema),
		"max_registrations": copyIntPtr(normalized.MaxRegistrations),
		"start_time":        copyTimePtr(normalized.StartTime),
		"end_time":          copyTimePtr(normalized.EndTime),
		"status":            normalized.Status,
	}

	if err := s.repo.RunInTx(ctx, func(repo registrationFormRepository) error {
		if normalized.Status == model.RegistrationFormStatusPublished {
			if err := ensureSinglePublishedForm(ctx, repo, formID); err != nil {
				return err
			}
		}
		return repo.UpdateForm(ctx, formID, updates)
	}); err != nil {
		var serviceErr *registrationFormServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, &registrationFormServiceError{Status: http.StatusInternalServerError, Message: "更新报名表失败", Err: err}
	}

	return s.GetForm(ctx, actor, formID)
}

func (s *RegistrationFormService) GetRecruitmentPageData(ctx context.Context, actor RegistrationFormActor) (*RecruitmentPageData, error) {
	if err := ensureRegistrationAuthenticatedActor(actor); err != nil {
		return nil, err
	}

	forms, err := s.repo.ListPublishedForms(ctx)
	if err != nil {
		return nil, &registrationFormServiceError{Status: http.StatusInternalServerError, Message: "查询报名页面数据失败", Err: err}
	}
	if len(forms) == 0 {
		return buildUnavailableRecruitmentPageData("当前暂无开放中的报名表"), nil
	}
	if len(forms) > 1 {
		return buildUnavailableRecruitmentPageData("存在多个已发布报名表，请联系管理员处理"), nil
	}

	form := forms[0]
	registration, err := s.repo.FindRegistrationByFormAndUser(ctx, form.ID, actor.ID)
	if err == nil {
		return &RecruitmentPageData{
			PageMode: "submitted",
			RegistrationSummary: &RecruitmentRegistrationBrief{
				ID:          registration.ID,
				FormID:      registration.FormID,
				FormTitle:   form.Title,
				Status:      registration.Status,
				SubmittedAt: registration.SubmittedAt,
				UpdatedAt:   registration.UpdatedAt,
			},
		}, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, &registrationFormServiceError{Status: http.StatusInternalServerError, Message: "检查报名状态失败", Err: err}
	}

	inDefaultGroup, err := s.repo.IsUserInActiveDefaultGroup(ctx, actor.ID)
	if err != nil {
		return nil, &registrationFormServiceError{Status: http.StatusInternalServerError, Message: "检查报名资格失败", Err: err}
	}
	if !inDefaultGroup {
		return buildUnavailableRecruitmentPageData("当前账号暂无纳新报名资格"), nil
	}

	now := s.now()
	if form.StartTime != nil && now.Before(*form.StartTime) {
		return buildUnavailableRecruitmentPageData("报名尚未开始"), nil
	}
	if form.EndTime != nil && now.After(*form.EndTime) {
		return buildUnavailableRecruitmentPageData("报名已结束"), nil
	}

	result := ActiveRegistrationFormResult{
		ID:               form.ID,
		Title:            form.Title,
		Description:      copyStringPtr(form.Description),
		CoverImageURL:    copyStringPtr(form.CoverImageURL),
		MaxRegistrations: copyIntPtr(form.MaxRegistrations),
		StartTime:        copyTimePtr(form.StartTime),
		EndTime:          copyTimePtr(form.EndTime),
		Status:           form.Status,
	}
	groups, err := s.repo.ListShownUserGroups(ctx)
	if err != nil {
		return nil, &registrationFormServiceError{Status: http.StatusInternalServerError, Message: "加载展示分组失败", Err: err}
	}
	result.FieldsSchema = hydrateUserGroupSelectFields(form.FieldsSchema, groups)
	return &RecruitmentPageData{
		PageMode: "form",
		Form:     &result,
	}, nil
}

func buildUnavailableRecruitmentPageData(reason string) *RecruitmentPageData {
	trimmed := strings.TrimSpace(reason)
	if trimmed == "" {
		return &RecruitmentPageData{PageMode: "unavailable"}
	}
	return &RecruitmentPageData{
		PageMode:          "unavailable",
		UnavailableReason: &trimmed,
	}
}

func ensureRegistrationAdminActor(actor RegistrationFormActor) error {
	if actor.ID == 0 {
		return &registrationFormServiceError{Status: http.StatusUnauthorized, Message: "未登录"}
	}
	if actor.RoleName != model.RoleNameAdmin && actor.RoleName != model.RoleNameSuperAdmin {
		return &registrationFormServiceError{Status: http.StatusForbidden, Message: "当前账号无管理员权限"}
	}
	return nil
}

func ensureRegistrationAuthenticatedActor(actor RegistrationFormActor) error {
	if actor.ID == 0 {
		return &registrationFormServiceError{Status: http.StatusUnauthorized, Message: "未登录"}
	}
	return nil
}

func validateRegistrationFormStatus(status uint8) error {
	switch status {
	case model.RegistrationFormStatusDraft, model.RegistrationFormStatusPublished, model.RegistrationFormStatusClosed:
		return nil
	default:
		return &registrationFormServiceError{Status: http.StatusBadRequest, Message: "报名表状态不合法"}
	}
}

func normalizeRegistrationFormInput(input UpsertRegistrationFormInput) (*normalizedRegistrationFormInput, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return nil, &registrationFormServiceError{Status: http.StatusBadRequest, Message: "报名表标题不能为空"}
	}
	if len([]rune(title)) > 200 {
		return nil, &registrationFormServiceError{Status: http.StatusBadRequest, Message: "报名表标题长度不能超过 200 个字符"}
	}
	if err := validateRegistrationFormStatus(input.Status); err != nil {
		return nil, err
	}

	fields, err := normalizeRegistrationFields(input.FieldsSchema)
	if err != nil {
		return nil, err
	}

	maxRegistrations, err := normalizeMaxRegistrations(input.MaxRegistrations)
	if err != nil {
		return nil, err
	}
	startTime, endTime, err := normalizeRegistrationTimeRange(input.StartTime, input.EndTime)
	if err != nil {
		return nil, err
	}

	return &normalizedRegistrationFormInput{
		Title:            title,
		Description:      trimOptionalString(input.Description),
		CoverImageURL:    trimOptionalString(input.CoverImageURL),
		FieldsSchema:     fields,
		MaxRegistrations: maxRegistrations,
		StartTime:        startTime,
		EndTime:          endTime,
		Status:           input.Status,
	}, nil
}

func normalizeRegistrationFields(fields []model.FormField) ([]model.FormField, error) {
	if len(fields) == 0 {
		return nil, &registrationFormServiceError{Status: http.StatusBadRequest, Message: "报名表至少需要一个字段"}
	}

	seen := make(map[string]struct{}, len(fields))
	normalized := make([]model.FormField, 0, len(fields))
	lockedSeen := make(map[string]bool, len(registrationLockedFieldSpecs))
	for _, spec := range registrationLockedFieldSpecs {
		lockedSeen[spec.Key] = false
	}

	for _, field := range fields {
		item, err := normalizeRegistrationField(field, seen)
		if err != nil {
			return nil, err
		}
		if _, ok := registrationLockedFields[item.Key]; ok {
			lockedSeen[item.Key] = true
		}
		normalized = append(normalized, item)
	}

	for key := range registrationLockedFields {
		if !lockedSeen[key] {
			return nil, &registrationFormServiceError{Status: http.StatusBadRequest, Message: "姓名、手机号、邮箱、意向组别(1)、意向组别(2) 五个系统字段必须保留且为必填项"}
		}
	}

	return normalized, nil
}

func normalizeRegistrationField(field model.FormField, seen map[string]struct{}) (model.FormField, error) {
	key := strings.TrimSpace(field.Key)
	label := strings.TrimSpace(field.Label)
	fieldType := strings.TrimSpace(field.Type)

	if key == "" {
		return model.FormField{}, &registrationFormServiceError{Status: http.StatusBadRequest, Message: "字段 key 不能为空"}
	}
	if _, ok := seen[key]; ok {
		return model.FormField{}, &registrationFormServiceError{Status: http.StatusBadRequest, Message: "字段 key 不能重复"}
	}
	seen[key] = struct{}{}

	if label == "" {
		return model.FormField{}, &registrationFormServiceError{Status: http.StatusBadRequest, Message: "字段名称不能为空"}
	}
	if len([]rune(label)) > 50 {
		return model.FormField{}, &registrationFormServiceError{Status: http.StatusBadRequest, Message: "字段名称长度不能超过 50 个字符"}
	}

	if _, ok := registrationFieldTypeLabels[fieldType]; !ok {
		return model.FormField{}, &registrationFormServiceError{Status: http.StatusBadRequest, Message: "存在未支持的字段类型"}
	}

	if locked, ok := registrationLockedFields[key]; ok {
		if fieldType != locked.FieldType {
			return model.FormField{}, &registrationFormServiceError{Status: http.StatusBadRequest, Message: "系统字段类型不允许修改"}
		}
		if !field.Required {
			return model.FormField{}, &registrationFormServiceError{Status: http.StatusBadRequest, Message: "姓名、手机号、邮箱、意向组别(1)、意向组别(2) 五个系统字段必须为必填项"}
		}
		label = locked.Label
	} else if fieldType == "user_group_select" {
		return model.FormField{}, &registrationFormServiceError{Status: http.StatusBadRequest, Message: "意向组别字段仅允许系统锁定字段使用"}
	} else if !registrationFieldKeyPattern.MatchString(key) {
		return model.FormField{}, &registrationFormServiceError{Status: http.StatusBadRequest, Message: "自定义字段 key 仅支持小写字母、数字和下划线，且必须以字母开头"}
	}

	options, err := normalizeRegistrationFieldOptions(fieldType, field.Options)
	if err != nil {
		return model.FormField{}, err
	}
	fileConfig, err := normalizeRegistrationFileConfig(fieldType, field.FileConfig)
	if err != nil {
		return model.FormField{}, err
	}

	item := model.FormField{
		Key:           key,
		Label:         label,
		Type:          fieldType,
		Required:      field.Required,
		Placeholder:   strings.TrimSpace(field.Placeholder),
		Description:   strings.TrimSpace(field.Description),
		DefaultValue:  cloneDynamicValue(field.DefaultValue),
		Validation:    cloneStringAnyMap(field.Validation),
		Options:       options,
		FileConfig:    fileConfig,
		CascadeConfig: cloneStringAnyMap(field.CascadeConfig),
	}

	if len(item.Options) == 0 {
		item.Options = nil
	}
	if len(item.Validation) == 0 {
		item.Validation = nil
	}
	if len(item.FileConfig) == 0 {
		item.FileConfig = nil
	}
	if len(item.CascadeConfig) == 0 {
		item.CascadeConfig = nil
	}

	return item, nil
}

func normalizeRegistrationFieldOptions(fieldType string, options []model.FormFieldOption) ([]model.FormFieldOption, error) {
	switch fieldType {
	case "select", "radio", "checkbox":
	case "user_group_select":
		return nil, nil
	default:
		return nil, nil
	}

	if len(options) == 0 {
		return nil, &registrationFormServiceError{Status: http.StatusBadRequest, Message: "选项类字段至少需要一个可用选项"}
	}

	seen := make(map[string]struct{}, len(options))
	normalized := make([]model.FormFieldOption, 0, len(options))
	for _, option := range options {
		label := strings.TrimSpace(option.Label)
		value := strings.TrimSpace(option.Value)
		if label == "" || value == "" {
			return nil, &registrationFormServiceError{Status: http.StatusBadRequest, Message: "字段选项的名称和值不能为空"}
		}
		if _, ok := seen[value]; ok {
			return nil, &registrationFormServiceError{Status: http.StatusBadRequest, Message: "字段选项的值不能重复"}
		}
		seen[value] = struct{}{}
		normalized = append(normalized, model.FormFieldOption{
			Label: label,
			Value: value,
		})
	}

	return normalized, nil
}

func normalizeRegistrationFileConfig(fieldType string, raw map[string]any) (map[string]any, error) {
	if fieldType != "file" && fieldType != "image" {
		return nil, nil
	}

	if len(raw) == 0 {
		return nil, nil
	}

	normalized := make(map[string]any)
	if value, ok := raw["max_size_mb"]; ok {
		size, err := parsePositiveIntAny(value)
		if err != nil {
			return nil, &registrationFormServiceError{Status: http.StatusBadRequest, Message: "文件大小限制必须为正整数"}
		}
		normalized["max_size_mb"] = size
	}
	if value, ok := raw["allowed_types"]; ok {
		items, err := parseStringListAny(value)
		if err != nil || len(items) == 0 {
			return nil, &registrationFormServiceError{Status: http.StatusBadRequest, Message: "文件类型限制必须为非空字符串数组"}
		}
		normalized["allowed_types"] = items
	}
	if fieldType == "image" {
		if value, ok := raw["max_count"]; ok {
			count, err := parsePositiveIntAny(value)
			if err != nil {
				return nil, &registrationFormServiceError{Status: http.StatusBadRequest, Message: "图片数量限制必须为正整数"}
			}
			normalized["max_count"] = count
		}
	}

	return normalized, nil
}

func normalizeMaxRegistrations(value *int) (*int, error) {
	if value == nil {
		return nil, nil
	}
	if *value <= 0 {
		return nil, &registrationFormServiceError{Status: http.StatusBadRequest, Message: "报名人数上限必须大于 0"}
	}
	result := *value
	return &result, nil
}

func normalizeRegistrationTimeRange(startTime *time.Time, endTime *time.Time) (*time.Time, *time.Time, error) {
	startCopy := copyTimePtr(startTime)
	endCopy := copyTimePtr(endTime)
	if startCopy != nil && endCopy != nil && endCopy.Before(*startCopy) {
		return nil, nil, &registrationFormServiceError{Status: http.StatusBadRequest, Message: "报名截止时间不能早于开始时间"}
	}
	return startCopy, endCopy, nil
}

func ensureSinglePublishedForm(ctx context.Context, repo registrationFormRepository, currentFormID uint64) error {
	forms, err := repo.ListPublishedForms(ctx)
	if err != nil {
		return &registrationFormServiceError{Status: http.StatusInternalServerError, Message: "检查已发布报名表失败", Err: err}
	}
	for _, form := range forms {
		if form.ID != currentFormID {
			return &registrationFormServiceError{Status: http.StatusConflict, Message: "已有已发布报名表，请先手动关闭当前已发布表单"}
		}
	}
	return nil
}

func toRegistrationFormListItem(form *model.RegistrationForm) RegistrationFormListItem {
	requiredCount := 0
	for _, field := range form.FieldsSchema {
		if field.Required {
			requiredCount++
		}
	}

	return RegistrationFormListItem{
		ID:               form.ID,
		Title:            form.Title,
		Description:      copyStringPtr(form.Description),
		CoverImageURL:    copyStringPtr(form.CoverImageURL),
		FieldCount:       len(form.FieldsSchema),
		RequiredCount:    requiredCount,
		MaxRegistrations: copyIntPtr(form.MaxRegistrations),
		StartTime:        copyTimePtr(form.StartTime),
		EndTime:          copyTimePtr(form.EndTime),
		Status:           form.Status,
		CreatedAt:        form.CreatedAt,
		UpdatedAt:        form.UpdatedAt,
	}
}

func toRegistrationFormDetail(form *model.RegistrationForm, groups []model.UserGroup) RegistrationFormDetail {
	return RegistrationFormDetail{
		RegistrationFormListItem: toRegistrationFormListItem(form),
		FieldsSchema:             hydrateUserGroupSelectFields(form.FieldsSchema, groups),
	}
}

func (r *gormRegistrationFormRepository) RunInTx(ctx context.Context, fn func(repo registrationFormRepository) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(&gormRegistrationFormRepository{db: tx})
	})
}

func (r *gormRegistrationFormRepository) ListForms(ctx context.Context, filter ListRegistrationFormsInput) ([]model.RegistrationForm, error) {
	query := r.db.WithContext(ctx).Model(&model.RegistrationForm{})
	if filter.Keyword != "" {
		like := "%" + filter.Keyword + "%"
		query = query.Where("title LIKE ? OR description LIKE ?", like, like)
	}
	if filter.Status != nil {
		query = query.Where("status = ?", *filter.Status)
	}

	var forms []model.RegistrationForm
	if err := query.
		Order("updated_at DESC").
		Find(&forms).Error; err != nil {
		return nil, err
	}
	return forms, nil
}

func (r *gormRegistrationFormRepository) GetFormStats(ctx context.Context) (RegistrationFormStats, error) {
	stats := RegistrationFormStats{}
	query := r.db.WithContext(ctx).Model(&model.RegistrationForm{})

	if err := query.Count(&stats.Total).Error; err != nil {
		return stats, err
	}
	if err := query.Where("status = ?", model.RegistrationFormStatusDraft).Count(&stats.Draft).Error; err != nil {
		return stats, err
	}
	if err := query.Where("status = ?", model.RegistrationFormStatusPublished).Count(&stats.Published).Error; err != nil {
		return stats, err
	}
	if err := query.Where("status = ?", model.RegistrationFormStatusClosed).Count(&stats.Closed).Error; err != nil {
		return stats, err
	}

	return stats, nil
}

func (r *gormRegistrationFormRepository) GetFormByID(ctx context.Context, formID uint64) (*model.RegistrationForm, error) {
	var form model.RegistrationForm
	if err := r.db.WithContext(ctx).First(&form, formID).Error; err != nil {
		return nil, err
	}
	return &form, nil
}

func (r *gormRegistrationFormRepository) CreateForm(ctx context.Context, form *model.RegistrationForm) error {
	return r.db.WithContext(ctx).Create(form).Error
}

func (r *gormRegistrationFormRepository) UpdateForm(ctx context.Context, formID uint64, updates map[string]any) error {
	dbUpdates, err := prepareRegistrationFormUpdates(updates)
	if err != nil {
		return err
	}

	return r.db.WithContext(ctx).Model(&model.RegistrationForm{}).Where("id = ?", formID).Updates(dbUpdates).Error
}

func (r *gormRegistrationFormRepository) ListPublishedForms(ctx context.Context) ([]model.RegistrationForm, error) {
	var forms []model.RegistrationForm
	if err := r.db.WithContext(ctx).
		Where("status = ?", model.RegistrationFormStatusPublished).
		Order("updated_at DESC").
		Find(&forms).Error; err != nil {
		return nil, err
	}
	return forms, nil
}

func (r *gormRegistrationFormRepository) ListShownUserGroups(ctx context.Context) ([]model.UserGroup, error) {
	var groups []model.UserGroup
	if err := r.db.WithContext(ctx).
		Model(&model.UserGroup{}).
		Where("`show` = ?", 1).
		Order("is_default DESC").
		Order("created_at ASC").
		Find(&groups).Error; err != nil {
		return nil, err
	}
	return groups, nil
}

func (r *gormRegistrationFormRepository) IsUserInActiveDefaultGroup(ctx context.Context, userID uint64) (bool, error) {
	var count int64
	if err := r.db.WithContext(ctx).
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

func (r *gormRegistrationFormRepository) FindRegistrationByFormAndUser(ctx context.Context, formID uint64, userID uint64) (*model.Registration, error) {
	var registration model.Registration
	if err := r.db.WithContext(ctx).
		Where("form_id = ? AND user_id = ?", formID, userID).
		First(&registration).Error; err != nil {
		return nil, err
	}
	return &registration, nil
}

func trimOptionalString(value string) *string {
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
	cloned := *value
	return &cloned
}

func copyIntPtr(value *int) *int {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func copyTimePtr(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneRegistrationFields(fields []model.FormField) []model.FormField {
	if len(fields) == 0 {
		return nil
	}

	cloned := make([]model.FormField, 0, len(fields))
	for _, field := range fields {
		item := field
		item.Options = append([]model.FormFieldOption(nil), field.Options...)
		item.Validation = cloneStringAnyMap(field.Validation)
		item.FileConfig = cloneStringAnyMap(field.FileConfig)
		item.CascadeConfig = cloneStringAnyMap(field.CascadeConfig)
		item.DefaultValue = cloneDynamicValue(field.DefaultValue)
		cloned = append(cloned, item)
	}
	return cloned
}

func cloneStringAnyMap(input map[string]any) map[string]any {
	if len(input) == 0 {
		return nil
	}
	cloned := make(map[string]any, len(input))
	for key, value := range input {
		cloned[key] = cloneDynamicValue(value)
	}
	return cloned
}

func cloneDynamicValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		return cloneStringAnyMap(typed)
	case []any:
		items := make([]any, 0, len(typed))
		for _, item := range typed {
			items = append(items, cloneDynamicValue(item))
		}
		return items
	case []string:
		return append([]string(nil), typed...)
	default:
		return typed
	}
}

func parsePositiveIntAny(value any) (int, error) {
	switch typed := value.(type) {
	case int:
		if typed <= 0 {
			return 0, errors.New("not positive")
		}
		return typed, nil
	case int32:
		if typed <= 0 {
			return 0, errors.New("not positive")
		}
		return int(typed), nil
	case int64:
		if typed <= 0 {
			return 0, errors.New("not positive")
		}
		return int(typed), nil
	case float64:
		if typed <= 0 || float64(int(typed)) != typed {
			return 0, errors.New("not integer")
		}
		return int(typed), nil
	default:
		return 0, errors.New("not number")
	}
}

func parseStringListAny(value any) ([]string, error) {
	switch typed := value.(type) {
	case []string:
		result := make([]string, 0, len(typed))
		for _, item := range typed {
			trimmed := strings.TrimSpace(item)
			if trimmed == "" {
				return nil, errors.New("empty string")
			}
			result = append(result, trimmed)
		}
		return result, nil
	case []any:
		result := make([]string, 0, len(typed))
		for _, item := range typed {
			text, ok := item.(string)
			if !ok {
				return nil, errors.New("invalid item")
			}
			trimmed := strings.TrimSpace(text)
			if trimmed == "" {
				return nil, errors.New("empty string")
			}
			result = append(result, trimmed)
		}
		return result, nil
	default:
		return nil, errors.New("invalid type")
	}
}

func prepareRegistrationFormUpdates(updates map[string]any) (map[string]any, error) {
	if len(updates) == 0 {
		return map[string]any{}, nil
	}

	dbUpdates := make(map[string]any, len(updates))
	for key, value := range updates {
		if key != "fields_schema" {
			dbUpdates[key] = value
			continue
		}

		payload, err := json.Marshal(value)
		if err != nil {
			return nil, err
		}
		dbUpdates[key] = string(payload)
	}

	return dbUpdates, nil
}
