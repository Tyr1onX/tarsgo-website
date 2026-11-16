package registration

import (
	"context"
	"errors"
	"fmt"
	"gorm.io/gorm"
	"mime/multipart"
	"net/http"
	"os"
	"regexp"
	"strings"
	"tarsgo-backend/model"
	"tarsgo-backend/service/email"
	"tarsgo-backend/service/emailtemplate"
	"time"
)

var mainlandPhonePattern = regexp.MustCompile(`^1[3-9]\d{9}$`)

type RegistrationService struct {
	repo            registrationRepository
	fileStore       registrationFileStore
	now             func() time.Time
	mailer          email.Mailer
	templateStore   emailtemplate.ConfigStore
	loadInlineImage func(string) ([]byte, string, error)
}

type registrationRepository interface {
	SyncAdmissionMembership(context.Context, *model.Registration, string, uint64, time.Time) error
	RunInTx(ctx context.Context, fn func(repo registrationRepository) error) error
	ListPublishedForms(ctx context.Context) ([]model.RegistrationForm, error)
	GetFormByID(ctx context.Context, formID uint64) (*model.RegistrationForm, error)
	FindRegistrationByFormAndUser(ctx context.Context, formID uint64, userID uint64) (*model.Registration, error)
	CountRegistrationsByFormID(ctx context.Context, formID uint64) (int64, error)
	CreateRegistration(ctx context.Context, registration *model.Registration) error
	UpdateRegistration(ctx context.Context, registrationID uint64, updates map[string]any) error
	UpdateRegistrationFormData(ctx context.Context, registrationID uint64, formData map[string]any) error
	ListRegistrations(ctx context.Context, filter ListRegistrationsInput) ([]model.Registration, error)
	ListRegistrationsForExport(ctx context.Context, filter ListRegistrationsInput) ([]model.Registration, error)
	CountRegistrations(ctx context.Context, filter ListRegistrationsInput) (int64, error)
	GetRegistrationStats(ctx context.Context, filter ListRegistrationsInput) (RegistrationStats, error)
	GetRegistrationByID(ctx context.Context, registrationID uint64) (*model.Registration, error)
	GetRegistrationByIDForUpdate(ctx context.Context, registrationID uint64) (*model.Registration, error)
	ListShownUserGroups(ctx context.Context) ([]model.UserGroup, error)
	ListInterviewSessions(ctx context.Context, enabledOnly bool) ([]model.InterviewSession, error)
	GetInterviewSessionByID(ctx context.Context, sessionID uint64) (*model.InterviewSession, error)
	GetInterviewSessionByIDForUpdate(ctx context.Context, sessionID uint64) (*model.InterviewSession, error)
	CreateInterviewSession(ctx context.Context, session *model.InterviewSession) error
	UpdateInterviewSession(ctx context.Context, sessionID uint64, updates map[string]any) error
	CountInterviewSessionSelections(ctx context.Context, sessionID uint64) (int64, error)
	CountInterviewSessionSelectionsByIDs(ctx context.Context, sessionIDs []uint64) (map[uint64]int64, error)
}

type interviewResultRepository interface {
	CreateInterviewResultRevision(ctx context.Context, revision *model.InterviewResultRevision) error
	CreateInterviewResultNotification(ctx context.Context, notification *model.InterviewResultNotification) error
	ListInterviewResultRevisions(ctx context.Context, registrationID uint64) ([]model.InterviewResultRevision, error)
	GetLatestInterviewResultNotificationForUpdate(ctx context.Context, registrationID uint64) (*model.InterviewResultNotification, error)
	UpdateInterviewResultNotification(ctx context.Context, notificationID uint64, updates map[string]any) error
}

type registrationAuditRepository interface {
	CreateAuditLog(ctx context.Context, audit *model.AuditLog) error
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
	ID                uint64    `json:"id"`
	FormID            uint64    `json:"formId"`
	RecruitmentStatus string    `json:"status"`
	SubmittedAt       time.Time `json:"submittedAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

type ListRegistrationsInput struct {
	Page                  int
	PageSize              int
	Keyword               string
	Status                *string
	FormID                *uint64
	PreferredGroupID      *uint64
	InterviewAttendance   *string
	InterviewDate         *string
	InterviewSessionLabel *string
	InterviewResult       string
}

type RegistrationStats struct {
	Total            int64 `json:"total"`
	PendingScreening int64 `json:"pendingScreening"`
	PendingInterview int64 `json:"pendingInterview"`
	Admitted         int64 `json:"admitted"`
	Rejected         int64 `json:"rejected"`
	Withdrawn        int64 `json:"withdrawn"`
}

type AdminWorkbenchSummary struct {
	CurrentFormAvailable bool              `json:"currentFormAvailable"`
	Summary              RegistrationStats `json:"summary"`
}

type RegistrationPagination struct {
	Page       int   `json:"page"`
	PageSize   int   `json:"pageSize"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"totalPages"`
}

type RegistrationListItem struct {
	ID                  uint64                `json:"id"`
	FormID              uint64                `json:"formId"`
	FormTitle           string                `json:"formTitle"`
	ContactName         *string               `json:"contactName,omitempty"`
	ContactPhone        *string               `json:"contactPhone,omitempty"`
	ContactEmail        *string               `json:"contactEmail,omitempty"`
	PreferredGroup      *RegistrationGroupRef `json:"preferredGroup,omitempty"`
	Status              string                `json:"status"`
	RejectedStage       *string               `json:"rejectedStage,omitempty"`
	InterviewAttendance string                `json:"interviewAttendance"`
	InterviewSession    *InterviewSessionView `json:"interviewSession,omitempty"`
	CanScreen           bool                  `json:"canScreen"`
	CanInterview        bool                  `json:"canInterview"`
	SubmittedAt         time.Time             `json:"submittedAt"`
	UpdatedAt           time.Time             `json:"updatedAt"`
}

type ListRegistrationsResult struct {
	CurrentFormAvailable bool                   `json:"currentFormAvailable"`
	ArchivedView         bool                   `json:"archivedView"`
	Summary              RegistrationStats      `json:"summary"`
	Items                []RegistrationListItem `json:"items"`
	Pagination           RegistrationPagination `json:"pagination"`
}

type RegistrationDetail struct {
	NotificationWarning    string                       `json:"notificationWarning,omitempty"`
	InterviewResultHistory []InterviewResultHistoryItem `json:"interviewResultHistory"`
	ID                     uint64                       `json:"id"`
	UserID                 uint64                       `json:"userId"`
	FormID                 uint64                       `json:"formId"`
	FormTitle              string                       `json:"formTitle"`
	FormStatus             uint8                        `json:"formStatus"`
	ContactName            *string                      `json:"contactName,omitempty"`
	ContactPhone           *string                      `json:"contactPhone,omitempty"`
	ContactEmail           *string                      `json:"contactEmail,omitempty"`
	PreferredGroup         *RegistrationGroupRef        `json:"preferredGroup,omitempty"`
	Status                 string                       `json:"status"`
	RejectedStage          *string                      `json:"rejectedStage,omitempty"`
	Screener               *RegistrationReviewerRef     `json:"screener,omitempty"`
	ScreenedAt             *time.Time                   `json:"screenedAt,omitempty"`
	ScreeningRemark        *string                      `json:"screeningRemark,omitempty"`
	Interviewer            *RegistrationReviewerRef     `json:"interviewer,omitempty"`
	InterviewedAt          *time.Time                   `json:"interviewedAt,omitempty"`
	InterviewRemark        *string                      `json:"interviewRemark,omitempty"`
	InterviewAttendance    string                       `json:"interviewAttendance"`
	InterviewSession       *InterviewSessionView        `json:"interviewSession,omitempty"`
	CanScreen              bool                         `json:"canScreen"`
	CanUndoScreening       bool                         `json:"canUndoScreening"`
	CanInterview           bool                         `json:"canInterview"`
	SubmittedAt            time.Time                    `json:"submittedAt"`
	UpdatedAt              time.Time                    `json:"updatedAt"`
	FieldsSchema           []model.FormField            `json:"fieldsSchema"`
	FormData               map[string]any               `json:"formData"`
}

type InterviewResultHistoryItem struct {
	Revision       uint                        `json:"revision"`
	PreviousStatus *string                     `json:"previousStatus,omitempty"`
	ResultStatus   string                      `json:"resultStatus"`
	Reason         *string                     `json:"reason,omitempty"`
	Actor          *RegistrationReviewerRef    `json:"actor,omitempty"`
	CreatedAt      time.Time                   `json:"createdAt"`
	Notification   *InterviewNotificationState `json:"notification,omitempty"`
}

type InterviewNotificationState struct {
	Status            string     `json:"status"`
	Recipient         string     `json:"recipient,omitempty"`
	Subject           string     `json:"subject,omitempty"`
	Body              string     `json:"body,omitempty"`
	ProviderMessageID *string    `json:"providerMessageId,omitempty"`
	AttemptCount      uint       `json:"attemptCount"`
	LastAttemptAt     *time.Time `json:"lastAttemptAt,omitempty"`
	LastError         *string    `json:"lastError,omitempty"`
}

type InterviewNotificationPreview struct {
	Revision             uint   `json:"revision"`
	Status               string `json:"status"`
	Recipient            string `json:"recipient"`
	Subject              string `json:"subject"`
	Body                 string `json:"body"`
	QRCodeStatus         string `json:"qrCodeStatus"`
	QRCodeURL            string `json:"qrCodeUrl,omitempty"`
	QRCodeGroupName      string `json:"qrCodeGroupName,omitempty"`
	CurrentQRCodeStatus  string `json:"currentQrCodeStatus,omitempty"`
	CurrentQRCodeURL     string `json:"currentQrCodeUrl,omitempty"`
	CanRefreshQRCode     bool   `json:"canRefreshQrCode"`
	CanSend              bool   `json:"canSend"`
	RequiresConfirmation bool   `json:"requiresConfirmation"`
	Warning              string `json:"warning,omitempty"`
}

type InterviewNotificationAttempt struct {
	Status            string     `json:"status"`
	ProviderMessageID *string    `json:"providerMessageId,omitempty"`
	AttemptCount      uint       `json:"attemptCount"`
	LastAttemptAt     *time.Time `json:"lastAttemptAt,omitempty"`
	Message           string     `json:"message"`
}

type RegistrationFileResult struct {
	Path        string
	FileName    string
	ContentType string
	Inline      bool
}

type RegistrationCSVExportResult struct {
	FileName string
	Content  []byte
}

type ServiceError struct {
	Status  int
	Message string
	Err     error
}

type normalizedRegistrationSubmission struct {
	FormData         map[string]any
	Uploads          []registrationUploadField
	ContactName      *string
	ContactPhone     *string
	ContactEmail     *string
	PreferredGroupID *uint64
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
		repo:            &gormRegistrationRepository{db: db},
		fileStore:       fileStore,
		now:             time.Now,
		templateStore:   emailtemplate.NewGormStore(db),
		loadInlineImage: loadAdmissionInlineImage,
	}
}

func NewRegistrationServiceWithMailer(db *gorm.DB, mailer email.Mailer) *RegistrationService {
	service := NewRegistrationService(db)
	service.mailer = mailer
	return service
}

func newRegistrationServiceWithDependencies(repo registrationRepository, fileStore registrationFileStore) *RegistrationService {
	return &RegistrationService{
		repo:            repo,
		fileStore:       fileStore,
		now:             time.Now,
		loadInlineImage: loadAdmissionInlineImage,
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

func (s *RegistrationService) OpenRegistrationFile(ctx context.Context, actor RegistrationFormActor, registrationID uint64, fieldKey string, index int) (*RegistrationFileResult, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAdminActor(actor)); err != nil {
		return nil, err
	}
	if registrationID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "报名记录 ID 不合法"}
	}
	if strings.TrimSpace(fieldKey) == "" {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "字段 key 不合法"}
	}
	if index < 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "文件索引不合法"}
	}

	registration, err := s.repo.GetRegistrationByID(ctx, registrationID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名记录不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载报名记录失败", Err: err}
	}

	field, exists := findRegistrationField(registration.Form.FieldsSchema, fieldKey)
	if !exists || (field.Type != "file" && field.Type != "image") {
		return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
	}

	fileRef, err := extractRegistrationStoredFile(registration.FormData, field, index)
	if err != nil {
		return nil, err
	}

	filePath, err := s.fileStore.Resolve(fileRef.Path)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "解析报名文件路径失败", Err: err}
	}

	if _, err := os.Stat(filePath); err != nil {
		if os.IsNotExist(err) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "访问报名文件失败", Err: err}
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
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询活动报名表失败", Err: err}
	}
	if len(forms) == 0 {
		return nil, &ServiceError{Status: http.StatusNotFound, Message: "当前暂无开放中的报名表"}
	}
	if len(forms) > 1 {
		return nil, &ServiceError{Status: http.StatusConflict, Message: "存在多个已发布报名表，请联系管理员处理"}
	}

	form := forms[0]
	if form.ID != formID {
		return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名表不存在或当前不可报名"}
	}

	now := s.now()
	if form.StartTime != nil && now.Before(*form.StartTime) {
		return nil, &ServiceError{Status: http.StatusConflict, Message: "报名尚未开始"}
	}
	if form.EndTime != nil && now.After(*form.EndTime) {
		return nil, &ServiceError{Status: http.StatusConflict, Message: "报名已结束"}
	}

	groups, err := s.repo.ListShownUserGroups(ctx)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载展示分组失败", Err: err}
	}
	form.FieldsSchema = hydrateUserGroupSelectFields(mergeLockedRegistrationFields(form.FieldsSchema), groups)
	return &form, nil
}

func (s *RegistrationService) loadSelfEditableRegistration(
	ctx context.Context,
	repo registrationRepository,
	actor RegistrationFormActor,
	registrationID uint64,
) (*model.Registration, *model.RegistrationForm, error) {
	registration, err := repo.GetRegistrationByIDForUpdate(ctx, registrationID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, &ServiceError{Status: http.StatusNotFound, Message: "报名记录不存在"}
		}
		return nil, nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载报名记录失败", Err: err}
	}
	if registration.UserID != actor.ID {
		return nil, nil, &ServiceError{Status: http.StatusForbidden, Message: "当前账号无权操作该报名记录"}
	}
	if registration.Status == model.RegistrationStatusCancelled {
		return nil, nil, &ServiceError{Status: http.StatusConflict, Message: "当前报名已取消"}
	}
	if !canMutateRegistrationBeforeReview(registration) {
		return nil, nil, &ServiceError{Status: http.StatusConflict, Message: "当前报名已进入后续流程，无法再修改或撤回"}
	}

	form, err := repo.GetFormByID(ctx, registration.FormID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, &ServiceError{Status: http.StatusNotFound, Message: "报名表不存在"}
		}
		return nil, nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载报名表失败", Err: err}
	}
	return registration, form, nil
}

func ensureRegistrationFormOpenForModification(form *model.RegistrationForm, now time.Time) error {
	if form.Status != model.RegistrationFormStatusPublished {
		return &ServiceError{Status: http.StatusConflict, Message: "报名表已关闭，无法修改"}
	}
	if form.EndTime != nil && now.After(*form.EndTime) {
		return &ServiceError{Status: http.StatusConflict, Message: "报名已结束，无法修改"}
	}
	return nil
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
			return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "生成上传文件标识失败", Err: err}
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
			return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "保存报名文件失败", Err: err}
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
	if input.InterviewResult != "" && input.InterviewResult != "processed" {
		return &ServiceError{Status: http.StatusBadRequest, Message: "面试结果筛选值不合法"}
	}
	if input.Status != nil {
		if err := validateRecruitmentStatus(*input.Status); err != nil {
			return err
		}
	}
	if input.FormID != nil && *input.FormID == 0 {
		return &ServiceError{Status: http.StatusBadRequest, Message: "报名表筛选值不合法"}
	}
	if input.PreferredGroupID != nil && *input.PreferredGroupID == 0 {
		return &ServiceError{Status: http.StatusBadRequest, Message: "意向组筛选值不合法"}
	}
	if input.InterviewAttendance != nil {
		if err := validateInterviewAttendance(*input.InterviewAttendance, true); err != nil {
			return err
		}
	}
	if input.InterviewDate != nil {
		if _, err := time.Parse("2006-01-02", strings.TrimSpace(*input.InterviewDate)); err != nil {
			return &ServiceError{Status: http.StatusBadRequest, Message: "面试日期筛选值不合法"}
		}
	}
	return nil
}

func normalizeRegistrationListInput(input ListRegistrationsInput) ListRegistrationsInput {
	return ListRegistrationsInput{
		Page:                  normalizeRegistrationListPage(input.Page),
		PageSize:              normalizeRegistrationListPageSize(input.PageSize),
		Keyword:               strings.TrimSpace(input.Keyword),
		Status:                input.Status,
		FormID:                input.FormID,
		PreferredGroupID:      input.PreferredGroupID,
		InterviewAttendance:   input.InterviewAttendance,
		InterviewDate:         input.InterviewDate,
		InterviewSessionLabel: input.InterviewSessionLabel,
		InterviewResult:       input.InterviewResult,
	}
}

func normalizeRegistrationListPage(page int) int {
	if page <= 0 {
		return 1
	}
	return page
}

func normalizeRegistrationListPageSize(pageSize int) int {
	if pageSize <= 0 {
		return 10
	}
	if pageSize > 100 {
		return 100
	}
	return pageSize
}

func validateRecruitmentStatus(status string) error {
	switch strings.TrimSpace(status) {
	case model.RecruitmentStatusPendingScreening,
		model.RecruitmentStatusPendingInterview,
		model.RecruitmentStatusAdmitted,
		model.RecruitmentStatusRejected,
		model.RecruitmentStatusWithdrawn:
		return nil
	default:
		return &ServiceError{Status: http.StatusBadRequest, Message: "报名状态筛选值不合法"}
	}
}

func wrapRegistrationActorError(err error) error {
	if err == nil {
		return nil
	}

	var serviceErr *FormServiceError
	if errors.As(err, &serviceErr) {
		return &ServiceError{
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
		return &ServiceError{Status: http.StatusConflict, Message: "请勿重复提交同一张报名表"}
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "检查重复报名失败", Err: err}
	}
	return nil
}

func ensureRegistrationQuota(ctx context.Context, repo registrationRepository, form *model.RegistrationForm) error {
	if form.MaxRegistrations == nil || *form.MaxRegistrations <= 0 {
		return nil
	}

	count, err := repo.CountRegistrationsByFormID(ctx, form.ID)
	if err != nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "检查报名人数上限失败", Err: err}
	}
	if count >= int64(*form.MaxRegistrations) {
		return &ServiceError{Status: http.StatusConflict, Message: "报名人数已满"}
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

func collectRegistrationStoredPaths(formData map[string]any) []string {
	if len(formData) == 0 {
		return nil
	}

	seen := make(map[string]struct{})
	paths := make([]string, 0)
	for _, value := range formData {
		collectRegistrationStoredPathsFromValue(value, seen, &paths)
	}
	return paths
}

func uniqueRegistrationPaths(paths []string) []string {
	if len(paths) == 0 {
		return nil
	}

	seen := make(map[string]struct{}, len(paths))
	result := make([]string, 0, len(paths))
	for _, path := range paths {
		trimmed := strings.TrimSpace(path)
		if trimmed == "" {
			continue
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}
	return result
}

func collectRegistrationStoredPathsFromValue(value any, seen map[string]struct{}, paths *[]string) {
	switch typed := value.(type) {
	case map[string]any:
		if storagePath, ok := typed["storage_path"].(string); ok {
			trimmed := strings.TrimSpace(storagePath)
			if trimmed != "" {
				if _, exists := seen[trimmed]; !exists {
					seen[trimmed] = struct{}{}
					*paths = append(*paths, trimmed)
				}
			}
		}
		for _, item := range typed {
			collectRegistrationStoredPathsFromValue(item, seen, paths)
		}
	case []any:
		for _, item := range typed {
			collectRegistrationStoredPathsFromValue(item, seen, paths)
		}
	case []map[string]any:
		for _, item := range typed {
			collectRegistrationStoredPathsFromValue(item, seen, paths)
		}
	}
}

func toRegistrationListItem(registration *model.Registration) RegistrationListItem {
	return RegistrationListItem{
		ID:                  registration.ID,
		FormID:              registration.FormID,
		FormTitle:           registration.Form.Title,
		ContactName:         copyStringPtr(registration.ContactName),
		ContactPhone:        copyStringPtr(registration.ContactPhone),
		ContactEmail:        copyStringPtr(registration.ContactEmail),
		PreferredGroup:      toRegistrationGroupRef(registration.PreferredGroup),
		Status:              registration.RecruitmentStatus,
		RejectedStage:       copyStringPtr(registration.RejectedStage),
		InterviewAttendance: registration.InterviewAttendance,
		InterviewSession:    toInterviewSessionView(registration.InterviewSession, 0),
		CanScreen:           registration.RecruitmentStatus == model.RecruitmentStatusPendingScreening,
		CanInterview:        registration.RecruitmentStatus == model.RecruitmentStatusPendingInterview,
		SubmittedAt:         registration.SubmittedAt,
		UpdatedAt:           registration.UpdatedAt,
	}
}
