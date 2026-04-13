package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"mime/multipart"
	"net/http"
	"net/mail"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	mysqlDriver "github.com/go-sql-driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/model"
)

var mainlandPhonePattern = regexp.MustCompile(`^1[3-9]\d{9}$`)

type RegistrationService struct {
	repo      registrationRepository
	fileStore registrationFileStore
	now       func() time.Time
}

type registrationRepository interface {
	RunInTx(ctx context.Context, fn func(repo registrationRepository) error) error
	ListPublishedForms(ctx context.Context) ([]model.RegistrationForm, error)
	GetFormByID(ctx context.Context, formID uint64) (*model.RegistrationForm, error)
	FindRegistrationByFormAndUser(ctx context.Context, formID uint64, userID uint64) (*model.Registration, error)
	CountRegistrationsByFormID(ctx context.Context, formID uint64) (int64, error)
	CreateRegistration(ctx context.Context, registration *model.Registration) error
	UpdateRegistrationFormData(ctx context.Context, registrationID uint64, formData map[string]any) error
	ListRegistrations(ctx context.Context, filter ListRegistrationsInput) ([]model.Registration, error)
	GetRegistrationStats(ctx context.Context, filter ListRegistrationsInput) (RegistrationStats, error)
	GetRegistrationByID(ctx context.Context, registrationID uint64) (*model.Registration, error)
}

type gormRegistrationRepository struct {
	db *gorm.DB
}

type SubmitRegistrationInput struct {
	FormID uint64
	Values map[string][]string
	Files  map[string][]*multipart.FileHeader
}

type SubmitRegistrationResult struct {
	ID          uint64    `json:"id"`
	FormID      uint64    `json:"formId"`
	Status      uint8     `json:"status"`
	SubmittedAt time.Time `json:"submittedAt"`
}

type ListRegistrationsInput struct {
	Keyword string
	Status  *uint8
	FormID  *uint64
}

type RegistrationStats struct {
	Total     int64 `json:"total"`
	Pending   int64 `json:"pending"`
	Approved  int64 `json:"approved"`
	Rejected  int64 `json:"rejected"`
	Cancelled int64 `json:"cancelled"`
}

type RegistrationListItem struct {
	ID           uint64     `json:"id"`
	FormID       uint64     `json:"formId"`
	FormTitle    string     `json:"formTitle"`
	ContactName  *string    `json:"contactName,omitempty"`
	ContactPhone *string    `json:"contactPhone,omitempty"`
	ContactEmail *string    `json:"contactEmail,omitempty"`
	Status       uint8      `json:"status"`
	SubmittedAt  time.Time  `json:"submittedAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}

type ListRegistrationsResult struct {
	Summary RegistrationStats    `json:"summary"`
	Items   []RegistrationListItem `json:"items"`
}

type RegistrationDetail struct {
	ID           uint64            `json:"id"`
	FormID       uint64            `json:"formId"`
	FormTitle    string            `json:"formTitle"`
	ContactName  *string           `json:"contactName,omitempty"`
	ContactPhone *string           `json:"contactPhone,omitempty"`
	ContactEmail *string           `json:"contactEmail,omitempty"`
	Status       uint8             `json:"status"`
	SubmittedAt  time.Time         `json:"submittedAt"`
	UpdatedAt    time.Time         `json:"updatedAt"`
	FieldsSchema []model.FormField `json:"fieldsSchema"`
	FormData     map[string]any    `json:"formData"`
}

type RegistrationFileResult struct {
	Path        string
	FileName    string
	ContentType string
	Inline      bool
}

type registrationServiceError struct {
	Status  int
	Message string
	Err     error
}

type normalizedRegistrationSubmission struct {
	FormData     map[string]any
	Uploads      []registrationUploadField
	ContactName  *string
	ContactPhone *string
	ContactEmail *string
}

type registrationUploadField struct {
	Field model.FormField
	Files []*multipart.FileHeader
}

type registrationStoredFileRef struct {
	Path        string
	FileName    string
	ContentType string
}

func NewRegistrationService(db *gorm.DB) *RegistrationService {
	fileStore, err := newLocalRegistrationFileStore("")
	if err != nil {
		panic(err)
	}

	return &RegistrationService{
		repo:      &gormRegistrationRepository{db: db},
		fileStore: fileStore,
		now:       time.Now,
	}
}

func newRegistrationServiceWithDependencies(repo registrationRepository, fileStore registrationFileStore) *RegistrationService {
	return &RegistrationService{
		repo:      repo,
		fileStore: fileStore,
		now:       time.Now,
	}
}

func (e *registrationServiceError) Error() string {
	if e.Err != nil {
		return e.Message + ": " + e.Err.Error()
	}
	return e.Message
}

func (e *registrationServiceError) Unwrap() error {
	return e.Err
}

func (s *RegistrationService) SubmitRegistration(ctx context.Context, actor RegistrationFormActor, input SubmitRegistrationInput) (*SubmitRegistrationResult, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAuthenticatedActor(actor)); err != nil {
		return nil, err
	}
	if input.FormID == 0 {
		return nil, &registrationServiceError{Status: http.StatusBadRequest, Message: "报名表 ID 不合法"}
	}

	form, err := s.loadActiveFormForSubmission(ctx, input.FormID)
	if err != nil {
		return nil, err
	}

	normalized, err := normalizeRegistrationSubmission(form.FieldsSchema, input)
	if err != nil {
		return nil, err
	}

	now := s.now()
	var created *model.Registration
	savedPaths := make([]string, 0)

	txErr := s.repo.RunInTx(ctx, func(repo registrationRepository) error {
		if err := ensureRegistrationDuplicateFree(ctx, repo, form.ID, actor.ID); err != nil {
			return err
		}
		if err := ensureRegistrationQuota(ctx, repo, form); err != nil {
			return err
		}

		registration := &model.Registration{
			FormID:       form.ID,
			UserID:       actor.ID,
			FormData:     cloneStringAnyMap(normalized.FormData),
			ContactName:  copyStringPtr(normalized.ContactName),
			ContactPhone: copyStringPtr(normalized.ContactPhone),
			ContactEmail: copyStringPtr(normalized.ContactEmail),
			Status:       model.RegistrationStatusPending,
			SubmittedAt:  now,
		}
		if err := repo.CreateRegistration(ctx, registration); err != nil {
			if isDuplicateRegistrationErr(err) {
				return &registrationServiceError{Status: http.StatusConflict, Message: "请勿重复提交同一张报名表"}
			}
			return &registrationServiceError{Status: http.StatusInternalServerError, Message: "创建报名记录失败", Err: err}
		}

		finalFormData := cloneStringAnyMap(normalized.FormData)
		for _, upload := range normalized.Uploads {
			filePayloads, err := s.saveRegistrationUploads(ctx, registration.ID, form.ID, actor.ID, upload, now, &savedPaths)
			if err != nil {
				return err
			}

			if upload.Field.Type == "file" {
				finalFormData[upload.Field.Key] = filePayloads[0]
				continue
			}
			finalFormData[upload.Field.Key] = filePayloads
		}

		if len(normalized.Uploads) > 0 {
			if err := repo.UpdateRegistrationFormData(ctx, registration.ID, finalFormData); err != nil {
				return &registrationServiceError{Status: http.StatusInternalServerError, Message: "写入报名文件信息失败", Err: err}
			}
		}

		registration.FormData = finalFormData
		created = registration
		return nil
	})

	if txErr != nil {
		cleanupRegistrationSavedFiles(context.Background(), s.fileStore, savedPaths)
		return nil, txErr
	}

	return &SubmitRegistrationResult{
		ID:          created.ID,
		FormID:      created.FormID,
		Status:      created.Status,
		SubmittedAt: created.SubmittedAt,
	}, nil
}

func (s *RegistrationService) ListRegistrations(ctx context.Context, actor RegistrationFormActor, input ListRegistrationsInput) (*ListRegistrationsResult, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAdminActor(actor)); err != nil {
		return nil, err
	}
	if err := validateRegistrationListInput(input); err != nil {
		return nil, err
	}

	normalized := normalizeRegistrationListInput(input)
	items, err := s.repo.ListRegistrations(ctx, normalized)
	if err != nil {
		return nil, &registrationServiceError{Status: http.StatusInternalServerError, Message: "查询报名列表失败", Err: err}
	}

	statsFilter := normalized
	statsFilter.Status = nil
	summary, err := s.repo.GetRegistrationStats(ctx, statsFilter)
	if err != nil {
		return nil, &registrationServiceError{Status: http.StatusInternalServerError, Message: "查询报名统计失败", Err: err}
	}

	resultItems := make([]RegistrationListItem, 0, len(items))
	for i := range items {
		resultItems = append(resultItems, toRegistrationListItem(&items[i]))
	}

	return &ListRegistrationsResult{
		Summary: summary,
		Items:   resultItems,
	}, nil
}

func (s *RegistrationService) GetRegistration(ctx context.Context, actor RegistrationFormActor, registrationID uint64) (*RegistrationDetail, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAdminActor(actor)); err != nil {
		return nil, err
	}
	if registrationID == 0 {
		return nil, &registrationServiceError{Status: http.StatusBadRequest, Message: "报名记录 ID 不合法"}
	}

	registration, err := s.repo.GetRegistrationByID(ctx, registrationID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &registrationServiceError{Status: http.StatusNotFound, Message: "报名记录不存在"}
		}
		return nil, &registrationServiceError{Status: http.StatusInternalServerError, Message: "查询报名详情失败", Err: err}
	}

	detail := RegistrationDetail{
		ID:           registration.ID,
		FormID:       registration.FormID,
		FormTitle:    registration.Form.Title,
		ContactName:  copyStringPtr(registration.ContactName),
		ContactPhone: copyStringPtr(registration.ContactPhone),
		ContactEmail: copyStringPtr(registration.ContactEmail),
		Status:       registration.Status,
		SubmittedAt:  registration.SubmittedAt,
		UpdatedAt:    registration.UpdatedAt,
		FieldsSchema: cloneRegistrationFields(registration.Form.FieldsSchema),
		FormData:     sanitizeRegistrationFormData(registration.FormData),
	}
	return &detail, nil
}

func (s *RegistrationService) OpenRegistrationFile(ctx context.Context, actor RegistrationFormActor, registrationID uint64, fieldKey string, index int) (*RegistrationFileResult, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAdminActor(actor)); err != nil {
		return nil, err
	}
	if registrationID == 0 {
		return nil, &registrationServiceError{Status: http.StatusBadRequest, Message: "报名记录 ID 不合法"}
	}
	if strings.TrimSpace(fieldKey) == "" {
		return nil, &registrationServiceError{Status: http.StatusBadRequest, Message: "字段 key 不合法"}
	}
	if index < 0 {
		return nil, &registrationServiceError{Status: http.StatusBadRequest, Message: "文件索引不合法"}
	}

	registration, err := s.repo.GetRegistrationByID(ctx, registrationID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &registrationServiceError{Status: http.StatusNotFound, Message: "报名记录不存在"}
		}
		return nil, &registrationServiceError{Status: http.StatusInternalServerError, Message: "加载报名记录失败", Err: err}
	}

	field, exists := findRegistrationField(registration.Form.FieldsSchema, fieldKey)
	if !exists || (field.Type != "file" && field.Type != "image") {
		return nil, &registrationServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
	}

	fileRef, err := extractRegistrationStoredFile(registration.FormData, field, index)
	if err != nil {
		return nil, err
	}

	filePath, err := s.fileStore.Resolve(fileRef.Path)
	if err != nil {
		return nil, &registrationServiceError{Status: http.StatusInternalServerError, Message: "解析报名文件路径失败", Err: err}
	}

	if _, err := os.Stat(filePath); err != nil {
		if os.IsNotExist(err) {
			return nil, &registrationServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
		}
		return nil, &registrationServiceError{Status: http.StatusInternalServerError, Message: "访问报名文件失败", Err: err}
	}

	return &RegistrationFileResult{
		Path:        filePath,
		FileName:    fileRef.FileName,
		ContentType: fileRef.ContentType,
		Inline:      field.Type == "image",
	}, nil
}

func (s *RegistrationService) loadActiveFormForSubmission(ctx context.Context, formID uint64) (*model.RegistrationForm, error) {
	forms, err := s.repo.ListPublishedForms(ctx)
	if err != nil {
		return nil, &registrationServiceError{Status: http.StatusInternalServerError, Message: "查询活动报名表失败", Err: err}
	}
	if len(forms) == 0 {
		return nil, &registrationServiceError{Status: http.StatusNotFound, Message: "当前暂无开放中的报名表"}
	}
	if len(forms) > 1 {
		return nil, &registrationServiceError{Status: http.StatusConflict, Message: "存在多个已发布报名表，请联系管理员处理"}
	}

	form := forms[0]
	if form.ID != formID {
		return nil, &registrationServiceError{Status: http.StatusNotFound, Message: "报名表不存在或当前不可报名"}
	}

	now := s.now()
	if form.StartTime != nil && now.Before(*form.StartTime) {
		return nil, &registrationServiceError{Status: http.StatusConflict, Message: "报名尚未开始"}
	}
	if form.EndTime != nil && now.After(*form.EndTime) {
		return nil, &registrationServiceError{Status: http.StatusConflict, Message: "报名已结束"}
	}

	return &form, nil
}

func (s *RegistrationService) saveRegistrationUploads(
	ctx context.Context,
	registrationID uint64,
	formID uint64,
	userID uint64,
	upload registrationUploadField,
	now time.Time,
	savedPaths *[]string,
) ([]map[string]any, error) {
	payloads := make([]map[string]any, 0, len(upload.Files))
	for index, fileHeader := range upload.Files {
		randomKey, err := generateRegistrationRandomKey()
		if err != nil {
			return nil, &registrationServiceError{Status: http.StatusInternalServerError, Message: "生成上传文件标识失败", Err: err}
		}

		saved, err := s.fileStore.Save(ctx, registrationFileSaveInput{
			FormID:    formID,
			UserID:    userID,
			FieldKey:  upload.Field.Key,
			File:      fileHeader,
			Now:       now,
			RandomKey: randomKey,
		})
		if err != nil {
			return nil, &registrationServiceError{Status: http.StatusInternalServerError, Message: "保存报名文件失败", Err: err}
		}

		*savedPaths = append(*savedPaths, saved.RelativePath)
		payloads = append(payloads, map[string]any{
			"file_name":    saved.FileName,
			"file_url":     fmt.Sprintf("/api/admin/registrations/%d/files/%s/%d", registrationID, upload.Field.Key, index),
			"file_size":    saved.Size,
			"storage_path": saved.RelativePath,
			"content_type": saved.ContentType,
		})
	}

	return payloads, nil
}

func validateRegistrationListInput(input ListRegistrationsInput) error {
	if input.Status != nil {
		if err := validateRegistrationStatus(*input.Status); err != nil {
			return err
		}
	}
	if input.FormID != nil && *input.FormID == 0 {
		return &registrationServiceError{Status: http.StatusBadRequest, Message: "报名表筛选值不合法"}
	}
	return nil
}

func normalizeRegistrationListInput(input ListRegistrationsInput) ListRegistrationsInput {
	return ListRegistrationsInput{
		Keyword: strings.TrimSpace(input.Keyword),
		Status:  input.Status,
		FormID:  input.FormID,
	}
}

func validateRegistrationStatus(status uint8) error {
	switch status {
	case model.RegistrationStatusPending,
		model.RegistrationStatusApproved,
		model.RegistrationStatusRejected,
		model.RegistrationStatusCancelled:
		return nil
	default:
		return &registrationServiceError{Status: http.StatusBadRequest, Message: "报名状态筛选值不合法"}
	}
}

func wrapRegistrationActorError(err error) error {
	if err == nil {
		return nil
	}

	var serviceErr *registrationFormServiceError
	if errors.As(err, &serviceErr) {
		return &registrationServiceError{
			Status:  serviceErr.Status,
			Message: serviceErr.Message,
			Err:     serviceErr.Err,
		}
	}

	return err
}

func ensureRegistrationDuplicateFree(ctx context.Context, repo registrationRepository, formID uint64, userID uint64) error {
	registration, err := repo.FindRegistrationByFormAndUser(ctx, formID, userID)
	if err == nil && registration != nil {
		return &registrationServiceError{Status: http.StatusConflict, Message: "请勿重复提交同一张报名表"}
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return &registrationServiceError{Status: http.StatusInternalServerError, Message: "检查重复报名失败", Err: err}
	}
	return nil
}

func ensureRegistrationQuota(ctx context.Context, repo registrationRepository, form *model.RegistrationForm) error {
	if form.MaxRegistrations == nil || *form.MaxRegistrations <= 0 {
		return nil
	}

	count, err := repo.CountRegistrationsByFormID(ctx, form.ID)
	if err != nil {
		return &registrationServiceError{Status: http.StatusInternalServerError, Message: "检查报名人数上限失败", Err: err}
	}
	if count >= int64(*form.MaxRegistrations) {
		return &registrationServiceError{Status: http.StatusConflict, Message: "报名人数已满"}
	}
	return nil
}

func cleanupRegistrationSavedFiles(ctx context.Context, fileStore registrationFileStore, relativePaths []string) {
	for _, relativePath := range relativePaths {
		if strings.TrimSpace(relativePath) == "" {
			continue
		}
		_ = fileStore.Remove(ctx, relativePath)
	}
}

func toRegistrationListItem(registration *model.Registration) RegistrationListItem {
	return RegistrationListItem{
		ID:           registration.ID,
		FormID:       registration.FormID,
		FormTitle:    registration.Form.Title,
		ContactName:  copyStringPtr(registration.ContactName),
		ContactPhone: copyStringPtr(registration.ContactPhone),
		ContactEmail: copyStringPtr(registration.ContactEmail),
		Status:       registration.Status,
		SubmittedAt:  registration.SubmittedAt,
		UpdatedAt:    registration.UpdatedAt,
	}
}

func normalizeRegistrationSubmission(fields []model.FormField, input SubmitRegistrationInput) (*normalizedRegistrationSubmission, error) {
	formData := make(map[string]any, len(fields))
	uploads := make([]registrationUploadField, 0)

	for _, field := range fields {
		switch field.Type {
		case "text", "textarea":
			value, ok, err := normalizeRequiredSingleValue(field, input.Values[field.Key])
			if err != nil {
				return nil, err
			}
			if ok {
				formData[field.Key] = value
			}
		case "number":
			value, ok, err := normalizeSubmittedNumber(field, input.Values[field.Key])
			if err != nil {
				return nil, err
			}
			if ok {
				formData[field.Key] = value
			}
		case "select", "radio":
			value, ok, err := normalizeSubmittedSingleOption(field, input.Values[field.Key])
			if err != nil {
				return nil, err
			}
			if ok {
				formData[field.Key] = value
			}
		case "checkbox":
			value, ok, err := normalizeSubmittedMultiOptions(field, input.Values[field.Key])
			if err != nil {
				return nil, err
			}
			if ok {
				formData[field.Key] = value
			}
		case "date":
			value, ok, err := normalizeSubmittedDate(field, input.Values[field.Key])
			if err != nil {
				return nil, err
			}
			if ok {
				formData[field.Key] = value
			}
		case "phone":
			value, ok, err := normalizeSubmittedPhone(field, input.Values[field.Key])
			if err != nil {
				return nil, err
			}
			if ok {
				formData[field.Key] = value
			}
		case "email":
			value, ok, err := normalizeSubmittedEmail(field, input.Values[field.Key])
			if err != nil {
				return nil, err
			}
			if ok {
				formData[field.Key] = value
			}
		case "file", "image":
			files, err := normalizeSubmittedFiles(field, input.Files[field.Key])
			if err != nil {
				return nil, err
			}
			if len(files) > 0 {
				uploads = append(uploads, registrationUploadField{
					Field: field,
					Files: files,
				})
			}
		default:
			return nil, &registrationServiceError{Status: http.StatusBadRequest, Message: "存在未支持的报名字段类型"}
		}
	}

	contactName := valueAsOptionalString(formData["name"])
	contactPhone := valueAsOptionalString(formData["phone"])
	contactEmail := valueAsOptionalString(formData["email"])

	return &normalizedRegistrationSubmission{
		FormData:     formData,
		Uploads:      uploads,
		ContactName:  contactName,
		ContactPhone: contactPhone,
		ContactEmail: contactEmail,
	}, nil
}

func normalizeRequiredSingleValue(field model.FormField, values []string) (string, bool, error) {
	value := firstTrimmedValue(values)
	if value == "" {
		if field.Required {
			return "", false, &registrationServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 为必填项", field.Label)}
		}
		return "", false, nil
	}
	return value, true, nil
}

func normalizeSubmittedNumber(field model.FormField, values []string) (any, bool, error) {
	value, ok, err := normalizeRequiredSingleValue(field, values)
	if err != nil || !ok {
		return nil, ok, err
	}

	numberValue, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return nil, false, &registrationServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 必须为数字", field.Label)}
	}

	if math.Trunc(numberValue) == numberValue {
		return int64(numberValue), true, nil
	}
	return numberValue, true, nil
}

func normalizeSubmittedSingleOption(field model.FormField, values []string) (string, bool, error) {
	value, ok, err := normalizeRequiredSingleValue(field, values)
	if err != nil || !ok {
		return "", ok, err
	}
	if !registrationOptionAllowed(field.Options, value) {
		return "", false, &registrationServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的选项值不合法", field.Label)}
	}
	return value, true, nil
}

func normalizeSubmittedMultiOptions(field model.FormField, values []string) ([]string, bool, error) {
	normalized := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))

	for _, raw := range values {
		value := strings.TrimSpace(raw)
		if value == "" {
			continue
		}
		if !registrationOptionAllowed(field.Options, value) {
			return nil, false, &registrationServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的选项值不合法", field.Label)}
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		normalized = append(normalized, value)
	}

	if len(normalized) == 0 {
		if field.Required {
			return nil, false, &registrationServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 为必填项", field.Label)}
		}
		return nil, false, nil
	}

	return normalized, true, nil
}

func normalizeSubmittedDate(field model.FormField, values []string) (string, bool, error) {
	value, ok, err := normalizeRequiredSingleValue(field, values)
	if err != nil || !ok {
		return "", ok, err
	}

	layouts := []string{"2006-01-02", time.RFC3339, "2006-01-02 15:04:05"}
	for _, layout := range layouts {
		if parsed, parseErr := time.Parse(layout, value); parseErr == nil {
			return parsed.Format("2006-01-02"), true, nil
		}
		if parsed, parseErr := time.ParseInLocation(layout, value, time.Local); parseErr == nil {
			return parsed.Format("2006-01-02"), true, nil
		}
	}

	return "", false, &registrationServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的日期格式不合法", field.Label)}
}

func normalizeSubmittedPhone(field model.FormField, values []string) (string, bool, error) {
	value, ok, err := normalizeRequiredSingleValue(field, values)
	if err != nil || !ok {
		return "", ok, err
	}
	if !mainlandPhonePattern.MatchString(value) {
		return "", false, &registrationServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的手机号格式不合法", field.Label)}
	}
	return value, true, nil
}

func normalizeSubmittedEmail(field model.FormField, values []string) (string, bool, error) {
	value, ok, err := normalizeRequiredSingleValue(field, values)
	if err != nil || !ok {
		return "", ok, err
	}

	address, parseErr := mail.ParseAddress(value)
	if parseErr != nil || strings.TrimSpace(address.Address) == "" {
		return "", false, &registrationServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的邮箱格式不合法", field.Label)}
	}

	return strings.TrimSpace(address.Address), true, nil
}

func normalizeSubmittedFiles(field model.FormField, headers []*multipart.FileHeader) ([]*multipart.FileHeader, error) {
	files := filterUploadHeaders(headers)
	if len(files) == 0 {
		if field.Required {
			return nil, &registrationServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 为必填项", field.Label)}
		}
		return nil, nil
	}

	if field.Type == "file" && len(files) > 1 {
		return nil, &registrationServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 仅允许上传一个文件", field.Label)}
	}

	if field.Type == "image" {
		if maxCount, ok := parseRegistrationFileConfigPositiveInt(field.FileConfig, "max_count"); ok && len(files) > maxCount {
			return nil, &registrationServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 上传图片数量超过限制", field.Label)}
		}
	}

	for _, fileHeader := range files {
		if err := validateRegistrationFileHeader(field, fileHeader); err != nil {
			return nil, err
		}
	}

	return files, nil
}

func validateRegistrationFileHeader(field model.FormField, fileHeader *multipart.FileHeader) error {
	if fileHeader == nil {
		return &registrationServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的上传文件不合法", field.Label)}
	}

	maxSize, hasMaxSize := parseRegistrationFileConfigPositiveInt(field.FileConfig, "max_size_mb")
	if hasMaxSize && fileHeader.Size > int64(maxSize)*1024*1024 {
		return &registrationServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的文件大小超过限制", field.Label)}
	}

	contentType := strings.TrimSpace(fileHeader.Header.Get("Content-Type"))
	if field.Type == "image" && !looksLikeImageUpload(fileHeader.Filename, contentType) {
		return &registrationServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 仅支持图片文件", field.Label)}
	}

	allowedTypes, hasAllowedTypes := parseRegistrationFileConfigStringList(field.FileConfig, "allowed_types")
	if hasAllowedTypes && !registrationUploadTypeAllowed(fileHeader.Filename, contentType, allowedTypes) {
		return &registrationServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的文件类型不被允许", field.Label)}
	}

	return nil
}

func parseRegistrationFileConfigPositiveInt(config map[string]any, key string) (int, bool) {
	if len(config) == 0 {
		return 0, false
	}
	value, ok := config[key]
	if !ok {
		return 0, false
	}
	parsed, err := parsePositiveIntAny(value)
	if err != nil {
		return 0, false
	}
	return parsed, true
}

func parseRegistrationFileConfigStringList(config map[string]any, key string) ([]string, bool) {
	if len(config) == 0 {
		return nil, false
	}
	value, ok := config[key]
	if !ok {
		return nil, false
	}
	parsed, err := parseStringListAny(value)
	if err != nil || len(parsed) == 0 {
		return nil, false
	}
	return parsed, true
}

func registrationUploadTypeAllowed(fileName string, contentType string, allowedTypes []string) bool {
	extension := strings.TrimPrefix(strings.ToLower(filepath.Ext(strings.TrimSpace(fileName))), ".")
	normalizedContentType := strings.ToLower(strings.TrimSpace(contentType))

	for _, allowedType := range allowedTypes {
		candidate := strings.ToLower(strings.TrimSpace(allowedType))
		candidate = strings.TrimPrefix(candidate, ".")
		if candidate == "" {
			continue
		}
		if extension != "" && candidate == extension {
			return true
		}
		if normalizedContentType != "" {
			if candidate == normalizedContentType {
				return true
			}
			if strings.HasSuffix(candidate, "/*") && strings.HasPrefix(normalizedContentType, strings.TrimSuffix(candidate, "*")) {
				return true
			}
		}
	}

	return false
}

func looksLikeImageUpload(fileName string, contentType string) bool {
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(contentType)), "image/") {
		return true
	}

	switch strings.TrimPrefix(strings.ToLower(filepath.Ext(strings.TrimSpace(fileName))), ".") {
	case "jpg", "jpeg", "png", "gif", "webp", "bmp", "svg":
		return true
	default:
		return false
	}
}

func registrationOptionAllowed(options []model.FormFieldOption, value string) bool {
	for _, option := range options {
		if strings.TrimSpace(option.Value) == value {
			return true
		}
	}
	return false
}

func filterUploadHeaders(headers []*multipart.FileHeader) []*multipart.FileHeader {
	files := make([]*multipart.FileHeader, 0, len(headers))
	for _, header := range headers {
		if header == nil {
			continue
		}
		if strings.TrimSpace(header.Filename) == "" && header.Size == 0 {
			continue
		}
		files = append(files, header)
	}
	return files
}

func firstTrimmedValue(values []string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func valueAsOptionalString(value any) *string {
	text, ok := value.(string)
	if !ok {
		return nil
	}
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func sanitizeRegistrationFormData(formData map[string]any) map[string]any {
	if len(formData) == 0 {
		return map[string]any{}
	}

	sanitized := make(map[string]any, len(formData))
	for key, value := range formData {
		sanitized[key] = sanitizeRegistrationDataValue(value)
	}
	return sanitized
}

func sanitizeRegistrationDataValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		cloned := make(map[string]any, len(typed))
		for key, item := range typed {
			if key == "storage_path" || key == "content_type" {
				continue
			}
			cloned[key] = sanitizeRegistrationDataValue(item)
		}
		return cloned
	case []any:
		items := make([]any, 0, len(typed))
		for _, item := range typed {
			items = append(items, sanitizeRegistrationDataValue(item))
		}
		return items
	case []map[string]any:
		items := make([]map[string]any, 0, len(typed))
		for _, item := range typed {
			sanitized, ok := sanitizeRegistrationDataValue(item).(map[string]any)
			if ok {
				items = append(items, sanitized)
			}
		}
		return items
	default:
		return cloneDynamicValue(typed)
	}
}

func findRegistrationField(fields []model.FormField, key string) (model.FormField, bool) {
	targetKey := strings.TrimSpace(key)
	for _, field := range fields {
		if field.Key == targetKey {
			return field, true
		}
	}
	return model.FormField{}, false
}

func extractRegistrationStoredFile(formData map[string]any, field model.FormField, index int) (*registrationStoredFileRef, error) {
	value, exists := formData[field.Key]
	if !exists {
		return nil, &registrationServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
	}

	if field.Type == "file" {
		fileRef, ok := registrationStoredFileFromAny(value)
		if !ok {
			return nil, &registrationServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
		}
		if index != 0 {
			return nil, &registrationServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
		}
		return fileRef, nil
	}

	if mappedItems, ok := value.([]map[string]any); ok {
		if index >= len(mappedItems) {
			return nil, &registrationServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
		}
		fileRef, exists := registrationStoredFileFromAny(mappedItems[index])
		if !exists {
			return nil, &registrationServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
		}
		return fileRef, nil
	}

	items, ok := value.([]any)
	if !ok {
		return nil, &registrationServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
	}
	if index >= len(items) {
		return nil, &registrationServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
	}

	fileRef, exists := registrationStoredFileFromAny(items[index])
	if !exists {
		return nil, &registrationServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
	}
	return fileRef, nil
}

func registrationStoredFileFromAny(value any) (*registrationStoredFileRef, bool) {
	item, ok := value.(map[string]any)
	if !ok {
		return nil, false
	}

	path, _ := item["storage_path"].(string)
	fileName, _ := item["file_name"].(string)
	contentType, _ := item["content_type"].(string)
	if strings.TrimSpace(path) == "" || strings.TrimSpace(fileName) == "" {
		return nil, false
	}

	return &registrationStoredFileRef{
		Path:        path,
		FileName:    fileName,
		ContentType: contentType,
	}, true
}

func (r *gormRegistrationRepository) RunInTx(ctx context.Context, fn func(repo registrationRepository) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(&gormRegistrationRepository{db: tx})
	})
}

func (r *gormRegistrationRepository) ListPublishedForms(ctx context.Context) ([]model.RegistrationForm, error) {
	return (&gormRegistrationFormRepository{db: r.db}).ListPublishedForms(ctx)
}

func (r *gormRegistrationRepository) GetFormByID(ctx context.Context, formID uint64) (*model.RegistrationForm, error) {
	return (&gormRegistrationFormRepository{db: r.db}).GetFormByID(ctx, formID)
}

func (r *gormRegistrationRepository) FindRegistrationByFormAndUser(ctx context.Context, formID uint64, userID uint64) (*model.Registration, error) {
	var registration model.Registration
	if err := r.db.WithContext(ctx).
		Where("form_id = ? AND user_id = ?", formID, userID).
		First(&registration).Error; err != nil {
		return nil, err
	}
	return &registration, nil
}

func (r *gormRegistrationRepository) CountRegistrationsByFormID(ctx context.Context, formID uint64) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&model.Registration{}).
		Where("form_id = ?", formID).
		Count(&count).Error
	return count, err
}

func (r *gormRegistrationRepository) CreateRegistration(ctx context.Context, registration *model.Registration) error {
	return r.db.WithContext(ctx).Create(registration).Error
}

func (r *gormRegistrationRepository) UpdateRegistrationFormData(ctx context.Context, registrationID uint64, formData map[string]any) error {
	registration := model.Registration{
		ID:       registrationID,
		FormData: formData,
	}
	return r.db.WithContext(ctx).
		Model(&registration).
		Select("FormData").
		Updates(&registration).Error
}

func (r *gormRegistrationRepository) ListRegistrations(ctx context.Context, filter ListRegistrationsInput) ([]model.Registration, error) {
	query := applyRegistrationListFilters(
		r.db.WithContext(ctx).
			Model(&model.Registration{}).
			Joins("JOIN registration_forms ON registration_forms.id = registrations.form_id"),
		filter,
		true,
	)

	var registrations []model.Registration
	if err := query.
		Preload("Form").
		Order("registrations.submitted_at DESC").
		Find(&registrations).Error; err != nil {
		return nil, err
	}

	return registrations, nil
}

func (r *gormRegistrationRepository) GetRegistrationStats(ctx context.Context, filter ListRegistrationsInput) (RegistrationStats, error) {
	stats := RegistrationStats{}

	total, err := r.countRegistrations(ctx, filter, nil)
	if err != nil {
		return stats, err
	}
	stats.Total = total

	pending, err := r.countRegistrations(ctx, filter, ptrRegistrationStatus(model.RegistrationStatusPending))
	if err != nil {
		return stats, err
	}
	stats.Pending = pending

	approved, err := r.countRegistrations(ctx, filter, ptrRegistrationStatus(model.RegistrationStatusApproved))
	if err != nil {
		return stats, err
	}
	stats.Approved = approved

	rejected, err := r.countRegistrations(ctx, filter, ptrRegistrationStatus(model.RegistrationStatusRejected))
	if err != nil {
		return stats, err
	}
	stats.Rejected = rejected

	cancelled, err := r.countRegistrations(ctx, filter, ptrRegistrationStatus(model.RegistrationStatusCancelled))
	if err != nil {
		return stats, err
	}
	stats.Cancelled = cancelled

	return stats, nil
}

func (r *gormRegistrationRepository) GetRegistrationByID(ctx context.Context, registrationID uint64) (*model.Registration, error) {
	var registration model.Registration
	if err := r.db.WithContext(ctx).
		Preload("Form").
		First(&registration, registrationID).Error; err != nil {
		return nil, err
	}
	return &registration, nil
}

func applyRegistrationListFilters(query *gorm.DB, filter ListRegistrationsInput, includeStatus bool) *gorm.DB {
	if filter.FormID != nil {
		query = query.Where("registrations.form_id = ?", *filter.FormID)
	}
	if includeStatus && filter.Status != nil {
		query = query.Where("registrations.status = ?", *filter.Status)
	}
	if filter.Keyword != "" {
		like := "%" + filter.Keyword + "%"
		query = query.Where(
			"registrations.contact_name LIKE ? OR registrations.contact_phone LIKE ? OR registrations.contact_email LIKE ? OR registration_forms.title LIKE ?",
			like, like, like, like,
		)
	}
	return query
}

func isDuplicateRegistrationErr(err error) bool {
	var mysqlErr *mysqlDriver.MySQLError
	if !errors.As(err, &mysqlErr) {
		return false
	}
	return mysqlErr.Number == 1062
}

func generateRegistrationRandomKey() (string, error) {
	buffer := make([]byte, 4)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}

func (r *gormRegistrationRepository) countRegistrations(ctx context.Context, filter ListRegistrationsInput, status *uint8) (int64, error) {
	countFilter := filter
	countFilter.Status = status

	var count int64
	err := applyRegistrationListFilters(
		r.db.WithContext(ctx).
			Model(&model.Registration{}).
			Joins("JOIN registration_forms ON registration_forms.id = registrations.form_id"),
		countFilter,
		status != nil,
	).Count(&count).Error
	return count, err
}

func ptrRegistrationStatus(status uint8) *uint8 {
	value := status
	return &value
}
