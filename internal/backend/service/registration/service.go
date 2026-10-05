package registration

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"mime/multipart"
	"net/http"
	"net/mail"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	mysqlDriver "github.com/go-sql-driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
	"tarsgo-backend/service/email"
)

var mainlandPhonePattern = regexp.MustCompile(`^1[3-9]\d{9}$`)

type RegistrationService struct {
	repo            registrationRepository
	fileStore       registrationFileStore
	now             func() time.Time
	mailer          email.Mailer
	loadInlineImage func(string) ([]byte, string, error)
}

type registrationRepository interface {
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
	DeleteRegistration(ctx context.Context, registrationID uint64) error
	ListShownUserGroups(ctx context.Context) ([]model.UserGroup, error)
	ListDefaultGroupIDs(ctx context.Context) ([]uint64, error)
	AddUserToGroupIfAbsent(ctx context.Context, groupID uint64, userID uint64) error
	RemoveUserFromGroupIfPresent(ctx context.Context, groupID uint64, userID uint64) error
	ListInterviewSessions(ctx context.Context, enabledOnly bool) ([]model.InterviewSession, error)
	GetInterviewSessionByID(ctx context.Context, sessionID uint64) (*model.InterviewSession, error)
	GetInterviewSessionByIDForUpdate(ctx context.Context, sessionID uint64) (*model.InterviewSession, error)
	CreateInterviewSession(ctx context.Context, session *model.InterviewSession) error
	UpdateInterviewSession(ctx context.Context, sessionID uint64, updates map[string]any) error
	CountInterviewSessionSelections(ctx context.Context, sessionID uint64) (int64, error)
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
	VisibleGroupIDs       []uint64
}

type RegistrationStats struct {
	Total            int64 `json:"total"`
	PendingScreening int64 `json:"pendingScreening"`
	PendingInterview int64 `json:"pendingInterview"`
	Admitted         int64 `json:"admitted"`
	Rejected         int64 `json:"rejected"`
	Withdrawn        int64 `json:"withdrawn"`
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
	Summary    RegistrationStats      `json:"summary"`
	Items      []RegistrationListItem `json:"items"`
	Pagination RegistrationPagination `json:"pagination"`
}

type RegistrationDetail struct {
	NotificationWarning string                   `json:"notificationWarning,omitempty"`
	ID                  uint64                   `json:"id"`
	FormID              uint64                   `json:"formId"`
	FormTitle           string                   `json:"formTitle"`
	ContactName         *string                  `json:"contactName,omitempty"`
	ContactPhone        *string                  `json:"contactPhone,omitempty"`
	ContactEmail        *string                  `json:"contactEmail,omitempty"`
	PreferredGroup      *RegistrationGroupRef    `json:"preferredGroup,omitempty"`
	Status              string                   `json:"status"`
	RejectedStage       *string                  `json:"rejectedStage,omitempty"`
	Screener            *RegistrationReviewerRef `json:"screener,omitempty"`
	ScreenedAt          *time.Time               `json:"screenedAt,omitempty"`
	ScreeningRemark     *string                  `json:"screeningRemark,omitempty"`
	Interviewer         *RegistrationReviewerRef `json:"interviewer,omitempty"`
	InterviewedAt       *time.Time               `json:"interviewedAt,omitempty"`
	InterviewRemark     *string                  `json:"interviewRemark,omitempty"`
	InterviewAttendance string                   `json:"interviewAttendance"`
	InterviewSession    *InterviewSessionView    `json:"interviewSession,omitempty"`
	CanScreen           bool                     `json:"canScreen"`
	CanUndoScreening    bool                     `json:"canUndoScreening"`
	CanInterview        bool                     `json:"canInterview"`
	SubmittedAt         time.Time                `json:"submittedAt"`
	UpdatedAt           time.Time                `json:"updatedAt"`
	FieldsSchema        []model.FormField        `json:"fieldsSchema"`
	FormData            map[string]any           `json:"formData"`
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

func (s *RegistrationService) SubmitRegistration(ctx context.Context, actor RegistrationFormActor, input SubmitRegistrationInput) (*SubmitRegistrationResult, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAuthenticatedActor(actor)); err != nil {
		return nil, err
	}
	if input.FormID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "报名表 ID 不合法"}
	}
	if checker, ok := s.repo.(interface {
		IsUserInActiveDefaultGroup(context.Context, uint64) (bool, error)
	}); ok {
		eligible, err := checker.IsUserInActiveDefaultGroup(ctx, actor.ID)
		if err != nil {
			return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "检查默认用户组资格失败", Err: err}
		}
		if !eligible {
			return nil, &ServiceError{Status: http.StatusForbidden, Message: "当前账号不属于有效的默认用户组，无法提交报名"}
		}
	}

	form, err := s.loadActiveFormForSubmission(ctx, input.FormID)
	if err != nil {
		return nil, err
	}

	normalized, err := normalizeRegistrationSubmission(form.FieldsSchema, input, nil)
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
			FormID:              form.ID,
			UserID:              actor.ID,
			FormData:            cloneStringAnyMap(normalized.FormData),
			ContactName:         copyStringPtr(normalized.ContactName),
			ContactPhone:        copyStringPtr(normalized.ContactPhone),
			ContactEmail:        copyStringPtr(normalized.ContactEmail),
			PreferredGroupID:    copyUint64Ptr(normalized.PreferredGroupID),
			RecruitmentStatus:   model.RecruitmentStatusPendingScreening,
			InterviewAttendance: model.InterviewAttendancePending,
			SubmittedAt:         now,
		}
		if err := repo.CreateRegistration(ctx, registration); err != nil {
			if isDuplicateRegistrationErr(err) {
				return &ServiceError{Status: http.StatusConflict, Message: "请勿重复提交同一张报名表"}
			}
			return &ServiceError{Status: http.StatusInternalServerError, Message: "创建报名记录失败", Err: err}
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
				return &ServiceError{Status: http.StatusInternalServerError, Message: "写入报名文件信息失败", Err: err}
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
		ID:                created.ID,
		FormID:            created.FormID,
		RecruitmentStatus: created.RecruitmentStatus,
		SubmittedAt:       created.SubmittedAt,
		UpdatedAt:         created.UpdatedAt,
	}, nil
}

func (s *RegistrationService) UpdateRecruitmentRegistration(ctx context.Context, actor RegistrationFormActor, registrationID uint64, input SubmitRegistrationInput) (*SubmitRegistrationResult, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAuthenticatedActor(actor)); err != nil {
		return nil, err
	}
	if registrationID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "报名记录 ID 不合法"}
	}

	now := s.now()
	var updated *model.Registration
	savedPaths := make([]string, 0)
	obsoletePaths := make([]string, 0)

	txErr := s.repo.RunInTx(ctx, func(repo registrationRepository) error {
		registration, form, err := s.loadSelfEditableRegistration(ctx, repo, actor, registrationID)
		if err != nil {
			return err
		}
		groups, err := repo.ListShownUserGroups(ctx)
		if err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "加载展示分组失败", Err: err}
		}
		form.FieldsSchema = hydrateUserGroupSelectFields(mergeLockedRegistrationFields(form.FieldsSchema), groups)

		normalized, err := normalizeRegistrationSubmission(form.FieldsSchema, input, registration.FormData)
		if err != nil {
			return err
		}

		finalFormData := cloneStringAnyMap(normalized.FormData)
		for _, upload := range normalized.Uploads {
			if currentValue, exists := registration.FormData[upload.Field.Key]; exists {
				obsoletePaths = append(obsoletePaths, collectRegistrationStoredPaths(map[string]any{
					upload.Field.Key: currentValue,
				})...)
			}

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

		updates := map[string]any{
			"contact_name":       copyStringPtr(normalized.ContactName),
			"contact_phone":      copyStringPtr(normalized.ContactPhone),
			"contact_email":      copyStringPtr(normalized.ContactEmail),
			"preferred_group_id": copyUint64Ptr(normalized.PreferredGroupID),
			"recruitment_status": model.RecruitmentStatusPendingScreening,
			"rejected_stage":     nil,
			"screened_by":        nil,
			"screened_at":        nil,
			"screening_remark":   nil,
			"interviewer_id":     nil,
			"interviewed_at":     nil,
			"interview_remark":   nil,
			"submitted_at":       now,
		}
		if err := repo.UpdateRegistration(ctx, registration.ID, updates); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "更新报名记录失败", Err: err}
		}
		if err := repo.UpdateRegistrationFormData(ctx, registration.ID, finalFormData); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "更新报名表单内容失败", Err: err}
		}

		registration.FormData = finalFormData
		registration.ContactName = copyStringPtr(normalized.ContactName)
		registration.ContactPhone = copyStringPtr(normalized.ContactPhone)
		registration.ContactEmail = copyStringPtr(normalized.ContactEmail)
		registration.PreferredGroupID = copyUint64Ptr(normalized.PreferredGroupID)
		registration.RecruitmentStatus = model.RecruitmentStatusPendingScreening
		registration.RejectedStage = nil
		registration.ScreenedBy = nil
		registration.ScreenedAt = nil
		registration.ScreeningRemark = nil
		registration.InterviewerID = nil
		registration.InterviewedAt = nil
		registration.InterviewRemark = nil
		registration.SubmittedAt = now
		registration.UpdatedAt = now
		updated = registration
		return nil
	})
	if txErr != nil {
		cleanupRegistrationSavedFiles(context.Background(), s.fileStore, savedPaths)
		return nil, txErr
	}

	cleanupRegistrationSavedFiles(context.Background(), s.fileStore, uniqueRegistrationPaths(obsoletePaths))
	return &SubmitRegistrationResult{
		ID:                updated.ID,
		FormID:            updated.FormID,
		RecruitmentStatus: updated.RecruitmentStatus,
		SubmittedAt:       updated.SubmittedAt,
		UpdatedAt:         updated.UpdatedAt,
	}, nil
}

func (s *RegistrationService) CancelRecruitmentRegistration(ctx context.Context, actor RegistrationFormActor, registrationID uint64) error {
	if err := wrapRegistrationActorError(ensureRegistrationAuthenticatedActor(actor)); err != nil {
		return err
	}
	if registrationID == 0 {
		return &ServiceError{Status: http.StatusBadRequest, Message: "报名记录 ID 不合法"}
	}

	txErr := s.repo.RunInTx(ctx, func(repo registrationRepository) error {
		registration, _, err := s.loadSelfEditableRegistration(ctx, repo, actor, registrationID)
		if err != nil {
			return err
		}
		if err := repo.UpdateRegistration(ctx, registration.ID, map[string]any{
			"recruitment_status": model.RecruitmentStatusWithdrawn,
		}); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "撤回报名失败", Err: err}
		}
		return nil
	})
	if txErr != nil {
		return txErr
	}

	return nil
}

func (s *RegistrationService) ListRegistrations(ctx context.Context, actor RegistrationFormActor, input ListRegistrationsInput) (*ListRegistrationsResult, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAdminActor(actor)); err != nil {
		return nil, err
	}
	if err := validateRegistrationListInput(input); err != nil {
		return nil, err
	}

	normalized := normalizeRegistrationListInput(input)
	scope, err := s.resolveRegistrationAccessScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	if !scope.fullAccess {
		normalized.VisibleGroupIDs = registrationScopeGroupIDs(scope)
	}

	total, err := s.repo.CountRegistrations(ctx, normalized)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询报名总数失败", Err: err}
	}
	totalPages := 0
	if total > 0 {
		totalPages = int((total + int64(normalized.PageSize) - 1) / int64(normalized.PageSize))
	}
	if totalPages == 0 {
		normalized.Page = 1
	} else if normalized.Page > totalPages {
		normalized.Page = totalPages
	}

	items, err := s.repo.ListRegistrations(ctx, normalized)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询报名列表失败", Err: err}
	}

	statsFilter := normalized
	statsFilter.Status = nil
	summary, err := s.repo.GetRegistrationStats(ctx, statsFilter)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询报名统计失败", Err: err}
	}

	resultItems := make([]RegistrationListItem, 0, len(items))
	for i := range items {
		resultItems = append(resultItems, toRegistrationListItem(&items[i], scope))
	}

	return &ListRegistrationsResult{
		Summary: summary,
		Items:   resultItems,
		Pagination: RegistrationPagination{
			Page:       normalized.Page,
			PageSize:   normalized.PageSize,
			Total:      total,
			TotalPages: totalPages,
		},
	}, nil
}

func (s *RegistrationService) GetRegistration(ctx context.Context, actor RegistrationFormActor, registrationID uint64) (*RegistrationDetail, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAdminActor(actor)); err != nil {
		return nil, err
	}
	if registrationID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "报名记录 ID 不合法"}
	}

	scope, err := s.resolveRegistrationAccessScope(ctx, actor)
	if err != nil {
		return nil, err
	}

	registration, err := s.repo.GetRegistrationByID(ctx, registrationID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名记录不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询报名详情失败", Err: err}
	}
	if !scope.canAccessRegistration(registration) {
		return nil, &ServiceError{Status: http.StatusForbidden, Message: "当前账号无权查看该报名记录"}
	}
	groups, err := s.repo.ListShownUserGroups(ctx)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载展示分组失败", Err: err}
	}

	formData := sanitizeRegistrationFormData(registration.FormData)
	if registration.PreferredGroupID != nil {
		formData["preferred_group"] = strconv.FormatUint(*registration.PreferredGroupID, 10)
	}
	detail := RegistrationDetail{
		ID:                  registration.ID,
		FormID:              registration.FormID,
		FormTitle:           registration.Form.Title,
		ContactName:         copyStringPtr(registration.ContactName),
		ContactPhone:        copyStringPtr(registration.ContactPhone),
		ContactEmail:        copyStringPtr(registration.ContactEmail),
		PreferredGroup:      toRegistrationGroupRef(registration.PreferredGroup),
		Status:              registration.RecruitmentStatus,
		RejectedStage:       copyStringPtr(registration.RejectedStage),
		Screener:            toRegistrationReviewerRef(registration.Screener),
		ScreenedAt:          copyTimePtr(registration.ScreenedAt),
		ScreeningRemark:     copyStringPtr(registration.ScreeningRemark),
		Interviewer:         toRegistrationReviewerRef(registration.Interviewer),
		InterviewedAt:       copyTimePtr(registration.InterviewedAt),
		InterviewRemark:     copyStringPtr(registration.InterviewRemark),
		InterviewAttendance: registration.InterviewAttendance,
		InterviewSession:    toInterviewSessionView(registration.InterviewSession, 0),
		CanScreen:           registration.RecruitmentStatus == model.RecruitmentStatusPendingScreening,
		CanUndoScreening: registration.RecruitmentStatus == model.RecruitmentStatusPendingInterview ||
			(registration.RecruitmentStatus == model.RecruitmentStatusRejected && valueOrEmpty(registration.RejectedStage) == model.RecruitmentRejectedStageScreening),
		CanInterview: registration.RecruitmentStatus == model.RecruitmentStatusPendingInterview,
		SubmittedAt:  registration.SubmittedAt,
		UpdatedAt:    registration.UpdatedAt,
		FieldsSchema: hydrateUserGroupSelectFields(mergeLockedRegistrationFields(registration.Form.FieldsSchema), groups),
		FormData:     formData,
	}
	return &detail, nil
}

type InterviewDecisionInput struct {
	Decision string
	Remark   string
}

func (s *RegistrationService) RecordInterviewResult(ctx context.Context, actor RegistrationFormActor, registrationID uint64, input InterviewDecisionInput) (*RegistrationDetail, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAdminActor(actor)); err != nil {
		return nil, err
	}
	if registrationID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "报名记录 ID 不合法"}
	}
	decision := strings.ToLower(strings.TrimSpace(input.Decision))
	if decision != "admit" && decision != "reject" {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "面试结果不合法"}
	}

	scope, err := s.resolveRegistrationAccessScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	now := s.now()
	var notification *interviewNotification
	if err := s.repo.RunInTx(ctx, func(repo registrationRepository) error {
		reg, err := repo.GetRegistrationByIDForUpdate(ctx, registrationID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return &ServiceError{Status: http.StatusNotFound, Message: "报名记录不存在"}
			}
			return &ServiceError{Status: http.StatusInternalServerError, Message: "加载报名记录失败", Err: err}
		}
		if !scope.canAccessRegistration(reg) {
			return &ServiceError{Status: http.StatusForbidden, Message: "当前账号无权操作该报名记录"}
		}
		if reg.RecruitmentStatus != model.RecruitmentStatusPendingInterview {
			return &ServiceError{Status: http.StatusConflict, Message: "只有待面试候选人可以录入面试结果"}
		}
		if reg.PreferredGroupID == nil || *reg.PreferredGroupID == 0 {
			return &ServiceError{Status: http.StatusConflict, Message: "候选人缺少有效意向组"}
		}

		remark := trimOptionalString(input.Remark)
		updates := map[string]any{
			"interviewer_id":   actor.ID,
			"interviewed_at":   now,
			"interview_remark": copyStringPtr(remark),
			"rejected_stage":   nil,
		}
		if decision == "admit" {
			updates["recruitment_status"] = model.RecruitmentStatusAdmitted
		} else {
			updates["recruitment_status"] = model.RecruitmentStatusRejected
			updates["rejected_stage"] = model.RecruitmentRejectedStageInterview
		}
		if err := repo.UpdateRegistration(ctx, reg.ID, updates); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "保存面试结果失败", Err: err}
		}

		if decision == "admit" {
			defaults, err := repo.ListDefaultGroupIDs(ctx)
			if err != nil {
				return &ServiceError{Status: http.StatusInternalServerError, Message: "加载默认分组失败", Err: err}
			}
			for _, groupID := range defaults {
				if groupID != *reg.PreferredGroupID {
					if err := repo.RemoveUserFromGroupIfPresent(ctx, groupID, reg.UserID); err != nil {
						return &ServiceError{Status: http.StatusInternalServerError, Message: "移除默认分组失败", Err: err}
					}
				}
			}
			if err := repo.AddUserToGroupIfAbsent(ctx, *reg.PreferredGroupID, reg.UserID); err != nil {
				return &ServiceError{Status: http.StatusInternalServerError, Message: "同步录取组失败", Err: err}
			}
			notification = buildAdmissionNotification(reg, now)
		} else {
			notification = buildInterviewRejectionNotification(reg, now)
		}
		return nil
	}); err != nil {
		return nil, err
	}

	detail, err := s.GetRegistration(ctx, actor, registrationID)
	if err != nil {
		return nil, err
	}
	if notification != nil && s.mailer != nil {
		message := email.Message{To: notification.To, Subject: notification.Subject, Text: notification.Body}
		if notification.InlineImageURL != nil {
			image, contentType, err := s.loadInlineImage(*notification.InlineImageURL)
			if err != nil {
				log.Print("admission notification failed: inline image unavailable")
				detail.NotificationWarning = "面试结果已保存，但录取群图片读取失败，请检查图片后重新发送通知。"
				return detail, nil
			}
			message.InlineImage, message.InlineImageType = image, contentType
		}
		if err := s.mailer.SendEmail(ctx, message); err != nil {
			detail.NotificationWarning = "面试结果已保存，但通知邮件发送失败：" + err.Error()
		}
	}
	return detail, nil
}

type interviewNotification struct {
	To             string
	Subject        string
	Body           string
	InlineImageURL *string
}

func buildScreeningNotification(reg *model.Registration, passed bool, now time.Time) *interviewNotification {
	if reg == nil {
		return nil
	}
	to := strings.TrimSpace(reg.User.Email)
	if reg.ContactEmail != nil && strings.TrimSpace(*reg.ContactEmail) != "" {
		to = strings.TrimSpace(*reg.ContactEmail)
	}
	if to == "" {
		return nil
	}
	groupName := ""
	if reg.PreferredGroup != nil {
		groupName = reg.PreferredGroup.Name
	}
	name := registrationContactName(reg)
	if passed {
		return &interviewNotification{
			To:      to,
			Subject: "吉甲大师纳新初筛结果通知（通过）",
			Body:    fmt.Sprintf("尊敬的 %s：\n\n你好！\n\n感谢你报名参加吉甲大师纳新。你的报名资料已通过初筛，接下来将进入线下面试环节。\n\n报名项目：%s\n意向组：%s\n当前状态：待面试\n\n请登录吉甲大师网站确认是否参加线下面试，并选择预计到场时段；如暂未开放时段，请等待后续通知。\n\n吉甲大师\n%s", name, reg.Form.Title, groupName, now.Format("2006年1月2日")),
		}
	}
	return &interviewNotification{
		To:      to,
		Subject: "吉甲大师纳新初筛结果通知（未通过）",
		Body:    fmt.Sprintf("尊敬的 %s：\n\n你好！\n\n感谢你报名参加吉甲大师纳新。经报名资料初筛，很遗憾你未能进入本次线下面试环节。\n\n报名项目：%s\n意向组：%s\n当前状态：未通过\n\n感谢你的关注与参与，祝你在今后的学习与实践中不断进步。\n\n吉甲大师\n%s", name, reg.Form.Title, groupName, now.Format("2006年1月2日")),
	}
}

func buildAdmissionNotification(reg *model.Registration, now time.Time) *interviewNotification {
	if reg == nil {
		return nil
	}
	to := strings.TrimSpace(reg.User.Email)
	if reg.ContactEmail != nil && strings.TrimSpace(*reg.ContactEmail) != "" {
		to = strings.TrimSpace(*reg.ContactEmail)
	}
	if to == "" {
		return nil
	}
	group := reg.PreferredGroup
	if group == nil {
		return nil
	}
	name := registrationContactName(reg)
	inlineImageURL := copyStringPtr(group.AdmissionImageURL)
	nextStep := "后续安排及相关事项请留意吉甲大师后续通知。"
	if inlineImageURL != nil {
		nextStep = "请扫描邮件内的图片加入录取群，后续安排及相关事项将在群内通知。"
	}
	return &interviewNotification{
		To:             to,
		Subject:        "吉甲大师纳新录取通知",
		InlineImageURL: inlineImageURL,
		Body:           fmt.Sprintf("尊敬的 %s：\n\n你好！\n\n感谢你报名参加吉甲大师纳新。经线下面试，恭喜你被“%s”录取！\n\n报名项目：%s\n录取组：%s\n当前状态：已录取\n\n%s\n\n感谢你的参与与配合。\n\n吉甲大师\n%s", name, group.Name, reg.Form.Title, group.Name, nextStep, now.Format("2006年1月2日")),
	}
}

func buildInterviewRejectionNotification(reg *model.Registration, now time.Time) *interviewNotification {
	if reg == nil {
		return nil
	}
	to := strings.TrimSpace(reg.User.Email)
	if reg.ContactEmail != nil && strings.TrimSpace(*reg.ContactEmail) != "" {
		to = strings.TrimSpace(*reg.ContactEmail)
	}
	if to == "" {
		return nil
	}
	groupName := ""
	if reg.PreferredGroup != nil {
		groupName = reg.PreferredGroup.Name
	}
	name := registrationContactName(reg)
	return &interviewNotification{
		To:      to,
		Subject: "吉甲大师纳新面试结果通知（未通过）",
		Body:    fmt.Sprintf("尊敬的 %s：\n\n你好！\n\n感谢你报名参加吉甲大师纳新，并参与“%s”的线下面试。\n\n经综合评估，很遗憾你未能通过本次面试，本次招新流程到此结束。\n\n报名项目：%s\n意向组：%s\n当前状态：未通过\n\n感谢你在报名及面试过程中所投入的时间与精力，祝你在今后的学习与实践中不断进步。\n\n吉甲大师\n%s", name, groupName, reg.Form.Title, groupName, now.Format("2006年1月2日")),
	}
}

func registrationContactName(reg *model.Registration) string {
	if reg == nil {
		return "同学"
	}
	if reg.ContactName != nil && strings.TrimSpace(*reg.ContactName) != "" {
		return strings.TrimSpace(*reg.ContactName)
	}
	if reg.User.RealName != nil && strings.TrimSpace(*reg.User.RealName) != "" {
		return strings.TrimSpace(*reg.User.RealName)
	}
	if strings.TrimSpace(reg.User.Name) != "" {
		return strings.TrimSpace(reg.User.Name)
	}
	return "同学"
}

func loadAdmissionInlineImage(rawURL string) ([]byte, string, error) {
	const prefix = "/upload/config/group/"
	trimmed := strings.TrimSpace(rawURL)
	if !strings.HasPrefix(trimmed, prefix) {
		return nil, "", fmt.Errorf("unsupported admission image URL")
	}
	relative := strings.TrimPrefix(trimmed, prefix)
	if relative == "" || filepath.Base(relative) != relative {
		return nil, "", fmt.Errorf("invalid admission image path")
	}

	file, err := os.Open(filepath.Join("upload", "config", "group", relative))
	if err != nil {
		return nil, "", err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, 2*1024*1024+1))
	if err != nil {
		return nil, "", err
	}
	if len(data) == 0 || len(data) > 2*1024*1024 {
		return nil, "", fmt.Errorf("admission image size is invalid")
	}
	contentType := http.DetectContentType(data)
	if !strings.HasPrefix(contentType, "image/") {
		return nil, "", fmt.Errorf("admission image content is not an image")
	}
	return data, contentType, nil
}

func valueOrEmpty(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func (s *RegistrationService) ScreenRegistration(ctx context.Context, actor RegistrationFormActor, registrationID uint64, input ScreeningDecisionInput) (*RegistrationDetail, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAdminActor(actor)); err != nil {
		return nil, err
	}
	if registrationID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "报名记录 ID 不合法"}
	}
	decision := strings.ToLower(strings.TrimSpace(input.Decision))
	if decision != "approve" && decision != "reject" {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "初筛结果不合法"}
	}

	scope, err := s.resolveRegistrationAccessScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	now := s.now()
	var notification *interviewNotification
	if err := s.repo.RunInTx(ctx, func(repo registrationRepository) error {
		registration, err := repo.GetRegistrationByIDForUpdate(ctx, registrationID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return &ServiceError{Status: http.StatusNotFound, Message: "报名记录不存在"}
			}
			return &ServiceError{Status: http.StatusInternalServerError, Message: "加载报名记录失败", Err: err}
		}
		if !scope.canAccessRegistration(registration) {
			return &ServiceError{Status: http.StatusForbidden, Message: "当前账号无权初筛该报名记录"}
		}
		if registration.RecruitmentStatus != model.RecruitmentStatusPendingScreening {
			return &ServiceError{Status: http.StatusConflict, Message: "只有待初筛候选人可以提交初筛结果"}
		}
		if registration.PreferredGroupID == nil || *registration.PreferredGroupID == 0 {
			return &ServiceError{Status: http.StatusConflict, Message: "候选人缺少有效意向组"}
		}

		remark := trimOptionalString(input.Remark)
		updates := map[string]any{
			"screened_by":      actor.ID,
			"screened_at":      now,
			"screening_remark": copyStringPtr(remark),
			"rejected_stage":   nil,
		}
		if decision == "approve" {
			updates["recruitment_status"] = model.RecruitmentStatusPendingInterview
			notification = buildScreeningNotification(registration, true, now)
		} else {
			updates["recruitment_status"] = model.RecruitmentStatusRejected
			updates["rejected_stage"] = model.RecruitmentRejectedStageScreening
			notification = buildScreeningNotification(registration, false, now)
		}
		if err := repo.UpdateRegistration(ctx, registrationID, updates); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "保存初筛结果失败", Err: err}
		}
		return nil
	}); err != nil {
		return nil, err
	}

	detail, err := s.GetRegistration(ctx, actor, registrationID)
	if err != nil {
		return nil, err
	}
	if notification != nil && s.mailer != nil {
		if err := s.mailer.SendEmail(ctx, email.Message{To: notification.To, Subject: notification.Subject, Text: notification.Body}); err != nil {
			detail.NotificationWarning = "初筛结果已保存，但通知邮件发送失败：" + err.Error()
		}
	}
	return detail, nil
}

func (s *RegistrationService) UndoScreening(ctx context.Context, actor RegistrationFormActor, registrationID uint64) (*RegistrationDetail, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAdminActor(actor)); err != nil {
		return nil, err
	}
	if registrationID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "报名记录 ID 不合法"}
	}
	scope, err := s.resolveRegistrationAccessScope(ctx, actor)
	if err != nil {
		return nil, err
	}
	if err := s.repo.RunInTx(ctx, func(repo registrationRepository) error {
		registration, err := repo.GetRegistrationByIDForUpdate(ctx, registrationID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return &ServiceError{Status: http.StatusNotFound, Message: "报名记录不存在"}
			}
			return &ServiceError{Status: http.StatusInternalServerError, Message: "加载报名记录失败", Err: err}
		}
		if !scope.canAccessRegistration(registration) {
			return &ServiceError{Status: http.StatusForbidden, Message: "当前账号无权撤销初筛"}
		}
		canUndo := registration.RecruitmentStatus == model.RecruitmentStatusPendingInterview ||
			(registration.RecruitmentStatus == model.RecruitmentStatusRejected && valueOrEmpty(registration.RejectedStage) == model.RecruitmentRejectedStageScreening)
		if !canUndo {
			return &ServiceError{Status: http.StatusConflict, Message: "当前状态不能撤销初筛"}
		}
		if registration.InterviewedAt != nil || registration.InterviewerID != nil {
			return &ServiceError{Status: http.StatusConflict, Message: "已有面试结果，不能撤销初筛"}
		}
		if err := repo.UpdateRegistration(ctx, registrationID, map[string]any{
			"recruitment_status": model.RecruitmentStatusPendingScreening,
			"rejected_stage":     nil,
			"screened_by":        nil,
			"screened_at":        nil,
			"screening_remark":   nil,
		}); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "撤销初筛失败", Err: err}
		}
		return nil
	}); err != nil {
		return nil, err
	}
	return s.GetRegistration(ctx, actor, registrationID)
}

func (s *RegistrationService) DeleteRegistration(ctx context.Context, actor RegistrationFormActor, registrationID uint64) error {
	if err := wrapRegistrationActorError(ensureRegistrationAdminActor(actor)); err != nil {
		return err
	}
	if registrationID == 0 {
		return &ServiceError{Status: http.StatusBadRequest, Message: "报名记录 ID 不合法"}
	}

	scope, err := s.resolveRegistrationAccessScope(ctx, actor)
	if err != nil {
		return err
	}

	var storedPaths []string
	txErr := s.repo.RunInTx(ctx, func(repo registrationRepository) error {
		registration, err := repo.GetRegistrationByIDForUpdate(ctx, registrationID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return &ServiceError{Status: http.StatusNotFound, Message: "报名记录不存在"}
			}
			return &ServiceError{Status: http.StatusInternalServerError, Message: "加载报名记录失败", Err: err}
		}
		if !scope.canAccessRegistration(registration) {
			return &ServiceError{Status: http.StatusForbidden, Message: "当前账号无权删除该报名记录"}
		}

		storedPaths = collectRegistrationStoredPaths(registration.FormData)
		if err := repo.DeleteRegistration(ctx, registrationID); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "删除报名记录失败", Err: err}
		}
		return nil
	})
	if txErr != nil {
		return txErr
	}

	cleanupRegistrationSavedFiles(context.Background(), s.fileStore, storedPaths)
	return nil
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

	scope, err := s.resolveRegistrationAccessScope(ctx, actor)
	if err != nil {
		return nil, err
	}

	registration, err := s.repo.GetRegistrationByID(ctx, registrationID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名记录不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载报名记录失败", Err: err}
	}
	if !scope.canAccessRegistration(registration) {
		return nil, &ServiceError{Status: http.StatusForbidden, Message: "当前账号无权查看该报名文件"}
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

func (s *RegistrationService) ExportFormRegistrationsCSV(ctx context.Context, actor RegistrationFormActor, formID uint64, baseURL string) (*RegistrationCSVExportResult, error) {
	if err := wrapRegistrationActorError(ensureRegistrationAdminActor(actor)); err != nil {
		return nil, err
	}
	if formID == 0 {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "报名表 ID 不合法"}
	}

	scope, err := s.resolveRegistrationAccessScope(ctx, actor)
	if err != nil {
		return nil, err
	}

	form, err := s.repo.GetFormByID(ctx, formID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名表不存在"}
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载报名表失败", Err: err}
	}

	groups, err := s.repo.ListShownUserGroups(ctx)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "加载展示分组失败", Err: err}
	}

	filter := ListRegistrationsInput{
		FormID: ptrUint64(formID),
	}
	if !scope.fullAccess {
		filter.VisibleGroupIDs = registrationScopeGroupIDs(scope)
	}

	registrations, err := s.repo.ListRegistrationsForExport(ctx, filter)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "查询报名导出数据失败", Err: err}
	}

	exportForm := *form
	exportForm.FieldsSchema = hydrateRegistrationExportFields(mergeLockedRegistrationFields(form.FieldsSchema), groups)

	content, err := buildRegistrationExportCSV(&exportForm, registrations, baseURL)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "生成报名导出文件失败", Err: err}
	}

	return &RegistrationCSVExportResult{
		FileName: fmt.Sprintf("registration-form-%d-registrations.csv", formID),
		Content:  content,
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

func (s *RegistrationService) resolveRegistrationAccessScope(_ context.Context, actor RegistrationFormActor) (registrationAccessScope, error) {
	if actor.RoleName == model.RoleNameSuperAdmin || actor.RoleName == model.RoleNameAdmin {
		return newRegistrationAccessScope(true, nil), nil
	}
	return registrationAccessScope{}, &ServiceError{Status: http.StatusForbidden, Message: "当前账号无管理员权限"}
}

func registrationScopeGroupIDs(_ registrationAccessScope) []uint64 {
	return nil
}

func validateRegistrationListInput(input ListRegistrationsInput) error {
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
	visibleGroupIDs := append([]uint64(nil), input.VisibleGroupIDs...)
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
		VisibleGroupIDs:       visibleGroupIDs,
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

func toRegistrationListItem(registration *model.Registration, _ registrationAccessScope) RegistrationListItem {
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

func buildRegistrationExportCSV(form *model.RegistrationForm, registrations []model.Registration, baseURL string) ([]byte, error) {
	fields := cloneRegistrationFields(form.FieldsSchema)
	extraKeys := collectRegistrationExportExtraKeys(fields, registrations)
	headers := append([]string{}, registrationExportPrefixHeaders...)
	for _, field := range fields {
		headers = append(headers, field.Label)
	}
	headers = append(headers, registrationExportSuffixHeaders...)
	headers = append(headers, extraKeys...)

	buffer := &bytes.Buffer{}
	buffer.WriteString("\uFEFF")

	writer := csv.NewWriter(buffer)
	writer.UseCRLF = true
	if err := writer.Write(headers); err != nil {
		return nil, err
	}

	formTitle := strings.TrimSpace(form.Title)
	for index := range registrations {
		row := buildRegistrationExportCSVRow(formTitle, fields, extraKeys, &registrations[index], baseURL)
		if err := writer.Write(row); err != nil {
			return nil, err
		}
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

var registrationExportPrefixHeaders = []string{
	"报名记录ID",
	"报名表ID",
	"报名表标题",
}

var registrationExportSuffixHeaders = []string{
	"当前状态",
	"初筛人",
	"初筛时间",
	"初筛备注",
	"面试人",
	"面试时间",
	"面试结果 / 最终结果",
	"面试备注",
	"提交时间",
}

func buildRegistrationExportCSVRow(formTitle string, fields []model.FormField, extraKeys []string, registration *model.Registration, baseURL string) []string {
	row := []string{
		registrationExportCell(strconv.FormatUint(registration.ID, 10)),
		registrationExportCell(strconv.FormatUint(registration.FormID, 10)),
		registrationExportCell(registrationExportFormTitle(registration, formTitle)),
	}

	for _, field := range fields {
		row = append(row, registrationExportCell(formatRegistrationExportFieldValue(registration, field, registration.FormData[field.Key], baseURL)))
	}
	row = append(row,
		registrationExportCell(recruitmentStatusLabel(registration.RecruitmentStatus)),
		registrationExportCell(registrationExportReviewerName(registration.Screener)),
		registrationExportCell(formatRegistrationExportTime(registration.ScreenedAt)),
		registrationExportCell(registrationExportOptionalString(registration.ScreeningRemark)),
		registrationExportCell(registrationExportReviewerName(registration.Interviewer)),
		registrationExportCell(formatRegistrationExportTime(registration.InterviewedAt)),
		registrationExportCell(recruitmentOutcomeLabel(registration)),
		registrationExportCell(registrationExportOptionalString(registration.InterviewRemark)),
		registrationExportCell(formatRegistrationExportTimeValue(registration.SubmittedAt)),
	)
	for _, key := range extraKeys {
		row = append(row, registrationExportCell(formatRegistrationExportValue(registration.FormData[key], baseURL)))
	}
	return row
}

func hydrateRegistrationExportFields(fields []model.FormField, groups []model.UserGroup) []model.FormField {
	result := cloneRegistrationFields(fields)
	options := buildVisibleUserGroupOptions(groups)
	for index := range result {
		if result[index].Type != "user_group_select" {
			continue
		}
		result[index].Options = append([]model.FormFieldOption(nil), options...)
	}
	return result
}

func collectRegistrationExportExtraKeys(fields []model.FormField, registrations []model.Registration) []string {
	if len(registrations) == 0 {
		return nil
	}

	fieldKeys := make(map[string]struct{}, len(fields))
	for _, field := range fields {
		fieldKeys[field.Key] = struct{}{}
	}

	extraKeys := make(map[string]struct{})
	for _, registration := range registrations {
		for key := range registration.FormData {
			if _, exists := fieldKeys[key]; exists {
				continue
			}
			if _, legacy := legacyRegistrationGroupFieldKeys[key]; legacy {
				continue
			}
			extraKeys[key] = struct{}{}
		}
	}

	result := make([]string, 0, len(extraKeys))
	for key := range extraKeys {
		result = append(result, key)
	}
	sort.Strings(result)
	return result
}

func registrationExportFormTitle(registration *model.Registration, fallback string) string {
	if registration != nil {
		title := strings.TrimSpace(registration.Form.Title)
		if title != "" {
			return title
		}
	}
	return strings.TrimSpace(fallback)
}

func recruitmentStatusLabel(status string) string {
	switch status {
	case model.RecruitmentStatusPendingScreening:
		return "待初筛"
	case model.RecruitmentStatusPendingInterview:
		return "待面试"
	case model.RecruitmentStatusAdmitted:
		return "已录取"
	case model.RecruitmentStatusRejected:
		return "未通过"
	case model.RecruitmentStatusWithdrawn:
		return "已撤回"
	default:
		return strings.TrimSpace(status)
	}
}

func recruitmentOutcomeLabel(registration *model.Registration) string {
	if registration == nil {
		return ""
	}
	switch registration.RecruitmentStatus {
	case model.RecruitmentStatusAdmitted:
		return "面试通过并录取"
	case model.RecruitmentStatusRejected:
		if valueOrEmpty(registration.RejectedStage) == model.RecruitmentRejectedStageScreening {
			return "初筛未通过"
		}
		if valueOrEmpty(registration.RejectedStage) == model.RecruitmentRejectedStageInterview {
			return "面试未通过"
		}
		return "未通过"
	default:
		return ""
	}
}

func registrationExportReviewerName(user *model.User) string {
	if user == nil {
		return ""
	}
	if name := strings.TrimSpace(user.Name); name != "" {
		return name
	}
	return strings.TrimSpace(user.Email)
}

func registrationExportOptionalString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func formatRegistrationExportTime(value *time.Time) string {
	if value == nil {
		return ""
	}
	return formatRegistrationExportTimeValue(*value)
}

func formatRegistrationExportTimeValue(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.In(time.Local).Format("2006-01-02 15:04:05")
}

func formatRegistrationExportFieldValue(registration *model.Registration, field model.FormField, value any, baseURL string) string {
	if field.Key == "preferred_group" && registration != nil && registration.PreferredGroup != nil {
		return registration.PreferredGroup.Name
	}
	switch field.Type {
	case "select", "radio", "user_group_select":
		return registrationExportOptionLabel(field.Options, valueAsString(value))
	case "checkbox":
		return strings.Join(registrationExportOptionLabels(field.Options, registrationExportStringSlice(value)), "；")
	case "file":
		texts := registrationExportStoredFiles(registration, field, value, baseURL)
		return strings.Join(texts, "；")
	case "image":
		texts := registrationExportStoredFiles(registration, field, value, baseURL)
		return strings.Join(texts, "；")
	default:
		return formatRegistrationExportValue(value, baseURL)
	}
}

func registrationExportOptionLabel(options []model.FormFieldOption, value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	for _, option := range options {
		if option.Value == trimmed {
			return option.Label
		}
	}
	return trimmed
}

func registrationExportOptionLabels(options []model.FormFieldOption, values []string) []string {
	if len(values) == 0 {
		return nil
	}
	labels := make([]string, 0, len(values))
	for _, value := range values {
		label := registrationExportOptionLabel(options, value)
		if strings.TrimSpace(label) == "" {
			continue
		}
		labels = append(labels, label)
	}
	return labels
}

func registrationExportStoredFiles(registration *model.Registration, field model.FormField, value any, baseURL string) []string {
	if registration == nil {
		return nil
	}

	switch typed := value.(type) {
	case map[string]any:
		text, ok := registrationExportStoredFileText(registration.ID, field.Key, 0, typed, baseURL)
		if !ok {
			return nil
		}
		return []string{text}
	case []map[string]any:
		texts := make([]string, 0, len(typed))
		for index, item := range typed {
			text, ok := registrationExportStoredFileText(registration.ID, field.Key, index, item, baseURL)
			if !ok {
				continue
			}
			texts = append(texts, text)
		}
		return texts
	case []any:
		texts := make([]string, 0, len(typed))
		for index, item := range typed {
			fileItem, ok := item.(map[string]any)
			if !ok {
				continue
			}
			text, exists := registrationExportStoredFileText(registration.ID, field.Key, index, fileItem, baseURL)
			if !exists {
				continue
			}
			texts = append(texts, text)
		}
		return texts
	default:
		return nil
	}
}

func registrationExportStoredFileText(registrationID uint64, fieldKey string, index int, value map[string]any, baseURL string) (string, bool) {
	fileName, _ := value["file_name"].(string)
	fileURL, _ := value["file_url"].(string)
	if stored, ok := registrationStoredFileFromAny(value); ok {
		fileName = stored.FileName
		fileURL = registrationExportAbsoluteURL(baseURL, fmt.Sprintf("/api/admin/registrations/%d/files/%s/%d", registrationID, fieldKey, index))
	}

	fileName = strings.TrimSpace(fileName)
	fileURL = registrationExportAbsoluteURL(baseURL, fileURL)
	if fileName == "" && fileURL == "" {
		return "", false
	}
	if fileName == "" {
		return fileURL, true
	}
	if fileURL == "" {
		return fileName, true
	}
	return fmt.Sprintf("%s: %s", fileName, fileURL), true
}

func formatRegistrationExportValue(value any, baseURL string) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(typed)
	case []string:
		return strings.Join(registrationExportTrimmedStrings(typed), "；")
	case []any:
		fileTexts := registrationExportLooseFileTexts(typed, baseURL)
		if len(fileTexts) > 0 {
			return strings.Join(fileTexts, "；")
		}
		stringValues := registrationExportStringSlice(typed)
		if len(stringValues) > 0 {
			return strings.Join(stringValues, "；")
		}
		return registrationExportJSONString(typed)
	case []map[string]any:
		fileTexts := make([]string, 0, len(typed))
		for _, item := range typed {
			text, ok := registrationExportLooseFileText(item, baseURL)
			if !ok {
				return registrationExportJSONString(typed)
			}
			fileTexts = append(fileTexts, text)
		}
		return strings.Join(fileTexts, "；")
	case map[string]any:
		if text, ok := registrationExportLooseFileText(typed, baseURL); ok {
			return text
		}
		return registrationExportJSONString(typed)
	default:
		return strings.TrimSpace(fmt.Sprint(typed))
	}
}

func registrationExportLooseFileTexts(values []any, baseURL string) []string {
	texts := make([]string, 0, len(values))
	for _, value := range values {
		item, ok := value.(map[string]any)
		if !ok {
			return nil
		}
		text, exists := registrationExportLooseFileText(item, baseURL)
		if !exists {
			return nil
		}
		texts = append(texts, text)
	}
	return texts
}

func registrationExportLooseFileText(value map[string]any, baseURL string) (string, bool) {
	fileName, _ := value["file_name"].(string)
	fileURL, _ := value["file_url"].(string)
	fileName = strings.TrimSpace(fileName)
	fileURL = registrationExportAbsoluteURL(baseURL, fileURL)
	if fileName == "" && fileURL == "" {
		return "", false
	}
	if fileName == "" {
		return fileURL, true
	}
	if fileURL == "" {
		return fileName, true
	}
	return fmt.Sprintf("%s: %s", fileName, fileURL), true
}

func registrationExportJSONString(value any) string {
	bytes, err := json.Marshal(value)
	if err != nil {
		return strings.TrimSpace(fmt.Sprint(value))
	}
	return string(bytes)
}

func registrationExportStringSlice(value any) []string {
	switch typed := value.(type) {
	case []string:
		return registrationExportTrimmedStrings(typed)
	case []any:
		values := make([]string, 0, len(typed))
		for _, item := range typed {
			switch item.(type) {
			case map[string]any, []any, []map[string]any:
				return nil
			}
			text := strings.TrimSpace(fmt.Sprint(item))
			if text == "" {
				continue
			}
			values = append(values, text)
		}
		return values
	default:
		return nil
	}
}

func registrationExportTrimmedStrings(values []string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		result = append(result, trimmed)
	}
	return result
}

func registrationExportCell(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}

	dangerous := strings.TrimLeft(trimmed, " \t\r\n")
	if dangerous != "" {
		switch dangerous[0] {
		case '=', '+', '-', '@':
			return "'" + trimmed
		}
	}
	return trimmed
}

func registrationExportAbsoluteURL(baseURL string, rawPath string) string {
	path := strings.TrimSpace(rawPath)
	if path == "" {
		return ""
	}
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		return path
	}

	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if base == "" {
		return path
	}
	if strings.HasPrefix(path, "/") {
		return base + path
	}
	return base + "/" + path
}

func normalizeRegistrationSubmission(fields []model.FormField, input SubmitRegistrationInput, existingFormData map[string]any) (*normalizedRegistrationSubmission, error) {
	formData := make(map[string]any, len(fields)+2)
	for legacyKey := range legacyRegistrationGroupFieldKeys {
		if value, ok := existingFormData[legacyKey]; ok {
			formData[legacyKey] = cloneDynamicValue(value)
		}
	}
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
		case "user_group_select":
			value, _, ok, err := normalizeSubmittedUserGroup(field, input.Values[field.Key])
			if err != nil {
				return nil, err
			}
			if ok {
				formData[field.Key] = value
			}
		case "file", "image":
			files, preserveExisting, err := normalizeSubmittedFiles(field, input.Files[field.Key], existingFormData[field.Key])
			if err != nil {
				return nil, err
			}
			if len(files) > 0 {
				uploads = append(uploads, registrationUploadField{
					Field: field,
					Files: files,
				})
				continue
			}
			if preserveExisting {
				formData[field.Key] = cloneDynamicValue(existingFormData[field.Key])
			}
		default:
			return nil, &ServiceError{Status: http.StatusBadRequest, Message: "存在未支持的报名字段类型"}
		}
		if value, exists := formData[field.Key]; exists {
			if err := validateRegistrationFieldValue(field, value); err != nil {
				return nil, err
			}
		}
	}

	contactName := valueAsOptionalString(formData["name"])
	contactPhone := valueAsOptionalString(formData["phone"])
	contactEmail := valueAsOptionalString(formData["email"])
	preferredGroupID, _ := parseOptionalUint64String(valueAsString(formData["preferred_group"]))
	if preferredGroupID == nil {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "意向组为必填项"}
	}

	return &normalizedRegistrationSubmission{
		FormData:         formData,
		Uploads:          uploads,
		ContactName:      contactName,
		ContactPhone:     contactPhone,
		ContactEmail:     contactEmail,
		PreferredGroupID: preferredGroupID,
	}, nil
}

// validateRegistrationFieldValue enforces the field validation contract on the server.
// Invalid validation configuration is ignored; submitted values are always validated.
func validateRegistrationFieldValue(field model.FormField, value any) error {
	v := field.Validation
	if len(v) == 0 || value == nil {
		return nil
	}
	label := field.Label
	if label == "" {
		label = field.Key
	}
	if max, ok := validationInt(v["max_length"]); ok {
		if str, ok := value.(string); ok && len([]rune(str)) > max {
			return &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 长度不能超过 %d", label, max)}
		}
	}
	if pattern, ok := v["pattern"].(string); ok && strings.TrimSpace(pattern) != "" {
		if str, ok := value.(string); ok {
			re, err := regexp.Compile(pattern)
			if err == nil && !re.MatchString(str) {
				return &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 格式不符合要求", label)}
			}
		}
	}
	if field.Type == "number" {
		n, ok := numericValue(value)
		if ok {
			if min, exists := validationFloat(v["min"]); exists && n < min {
				return &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 不能小于 %v", label, min)}
			}
			if max, exists := validationFloat(v["max"]); exists && n > max {
				return &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 不能大于 %v", label, max)}
			}
			if places, exists := validationInt(v["decimal_places"]); exists && places >= 0 {
				text := strconv.FormatFloat(n, 'f', -1, 64)
				if dot := strings.IndexByte(text, '.'); dot >= 0 && len(text)-dot-1 > places {
					return &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 小数位数不能超过 %d", label, places)}
				}
			}
		}
	}
	if field.Type == "date" {
		if str, ok := value.(string); ok {
			if min, ok := v["min_date"].(string); ok && min != "" && str < min {
				return &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 日期不能早于 %s", label, min)}
			}
			if max, ok := v["max_date"].(string); ok && max != "" && str > max {
				return &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 日期不能晚于 %s", label, max)}
			}
		}
	}
	return nil
}

func validationFloat(value any) (float64, bool) {
	switch x := value.(type) {
	case float64:
		return x, true
	case float32:
		return float64(x), true
	case int:
		return float64(x), true
	case int64:
		return float64(x), true
	case json.Number:
		n, err := x.Float64()
		return n, err == nil
	case string:
		n, err := strconv.ParseFloat(strings.TrimSpace(x), 64)
		return n, err == nil
	default:
		return 0, false
	}
}

func validationInt(value any) (int, bool) {
	n, ok := validationFloat(value)
	return int(n), ok && n >= 0 && math.Trunc(n) == n
}
func numericValue(value any) (float64, bool) { return validationFloat(value) }

func normalizeRequiredSingleValue(field model.FormField, values []string) (string, bool, error) {
	value := firstTrimmedValue(values)
	if value == "" {
		if field.Required {
			return "", false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 为必填项", field.Label)}
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
		return nil, false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 必须为数字", field.Label)}
	}
	if places, exists := validationInt(field.Validation["decimal_places"]); exists {
		if dot := strings.IndexByte(value, '.'); dot >= 0 && len(strings.TrimRight(value[dot+1:], "0")) > places {
			return nil, false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 小数位数不能超过 %d", field.Label, places)}
		}
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
		return "", false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的选项值不合法", field.Label)}
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
			return nil, false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的选项值不合法", field.Label)}
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		normalized = append(normalized, value)
	}

	if len(normalized) == 0 {
		if field.Required {
			return nil, false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 为必填项", field.Label)}
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

	return "", false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的日期格式不合法", field.Label)}
}

func normalizeSubmittedPhone(field model.FormField, values []string) (string, bool, error) {
	value, ok, err := normalizeRequiredSingleValue(field, values)
	if err != nil || !ok {
		return "", ok, err
	}
	if !mainlandPhonePattern.MatchString(value) {
		return "", false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的手机号格式不合法", field.Label)}
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
		return "", false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的邮箱格式不合法", field.Label)}
	}

	return strings.TrimSpace(address.Address), true, nil
}

func normalizeSubmittedUserGroup(field model.FormField, values []string) (string, uint64, bool, error) {
	value, ok, err := normalizeRequiredSingleValue(field, values)
	if err != nil || !ok {
		return "", 0, ok, err
	}
	if !registrationOptionAllowed(field.Options, value) {
		return "", 0, false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的选项值不合法", field.Label)}
	}

	groupID, parseErr := strconv.ParseUint(value, 10, 64)
	if parseErr != nil || groupID == 0 {
		return "", 0, false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的选项值不合法", field.Label)}
	}
	return value, groupID, true, nil
}

func normalizeSubmittedFiles(field model.FormField, headers []*multipart.FileHeader, existingValue any) ([]*multipart.FileHeader, bool, error) {
	files := filterUploadHeaders(headers)
	if len(files) == 0 {
		if hasExistingRegistrationFiles(field, existingValue) {
			return nil, true, nil
		}
		if field.Required {
			return nil, false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 为必填项", field.Label)}
		}
		return nil, false, nil
	}

	if field.Type == "file" && len(files) > 1 {
		return nil, false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 仅允许上传一个文件", field.Label)}
	}

	if field.Type == "image" {
		if maxCount, ok := parseRegistrationFileConfigPositiveInt(field.FileConfig, "max_count"); ok && len(files) > maxCount {
			return nil, false, &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 上传图片数量超过限制", field.Label)}
		}
	}

	for _, fileHeader := range files {
		if err := validateRegistrationFileHeader(field, fileHeader); err != nil {
			return nil, false, err
		}
	}

	return files, false, nil
}

func hasExistingRegistrationFiles(field model.FormField, value any) bool {
	if value == nil {
		return false
	}
	if field.Type == "file" {
		_, ok := registrationStoredFileFromAny(value)
		return ok
	}

	items, ok := value.([]any)
	if ok {
		for _, item := range items {
			if _, exists := registrationStoredFileFromAny(item); exists {
				return true
			}
		}
		return false
	}

	mappedItems, ok := value.([]map[string]any)
	if ok {
		for _, item := range mappedItems {
			if _, exists := registrationStoredFileFromAny(item); exists {
				return true
			}
		}
	}
	return false
}

func validateRegistrationFileHeader(field model.FormField, fileHeader *multipart.FileHeader) error {
	if fileHeader == nil {
		return &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的上传文件不合法", field.Label)}
	}

	maxSize, hasMaxSize := parseRegistrationFileConfigPositiveInt(field.FileConfig, "max_size_mb")
	if hasMaxSize && fileHeader.Size > int64(maxSize)*1024*1024 {
		return &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的文件大小超过限制", field.Label)}
	}

	contentType := strings.TrimSpace(fileHeader.Header.Get("Content-Type"))
	if field.Type == "image" && !looksLikeImageUpload(fileHeader.Filename, contentType) {
		return &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 仅支持图片文件", field.Label)}
	}

	allowedTypes, hasAllowedTypes := parseRegistrationFileConfigStringList(field.FileConfig, "allowed_types")
	if hasAllowedTypes && !registrationUploadTypeAllowed(fileHeader.Filename, contentType, allowedTypes) {
		return &ServiceError{Status: http.StatusBadRequest, Message: fmt.Sprintf("字段 %s 的文件类型不被允许", field.Label)}
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

func valueAsString(value any) string {
	text, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(text)
}

func parseOptionalUint64String(value string) (*uint64, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil, nil
	}

	parsed, err := strconv.ParseUint(trimmed, 10, 64)
	if err != nil || parsed == 0 {
		return nil, errors.New("invalid uint64 string")
	}
	result := parsed
	return &result, nil
}

func copyUint64Ptr(value *uint64) *uint64 {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
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
		return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
	}

	if field.Type == "file" {
		fileRef, ok := registrationStoredFileFromAny(value)
		if !ok {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
		}
		if index != 0 {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
		}
		return fileRef, nil
	}

	if mappedItems, ok := value.([]map[string]any); ok {
		if index >= len(mappedItems) {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
		}
		fileRef, exists := registrationStoredFileFromAny(mappedItems[index])
		if !exists {
			return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
		}
		return fileRef, nil
	}

	items, ok := value.([]any)
	if !ok {
		return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
	}
	if index >= len(items) {
		return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
	}

	fileRef, exists := registrationStoredFileFromAny(items[index])
	if !exists {
		return nil, &ServiceError{Status: http.StatusNotFound, Message: "报名文件不存在"}
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
		Preload("PreferredGroup").
		Where("form_id = ? AND user_id = ?", formID, userID).
		First(&registration).Error; err != nil {
		return nil, err
	}
	return &registration, nil
}

func (r *gormRegistrationRepository) CountRegistrationsByFormID(ctx context.Context, formID uint64) (int64, error) {
	// Lock the parent form row while checking quota. SubmitRegistration performs
	// this inside RunInTx, serializing concurrent submissions for the same form.
	var form model.RegistrationForm
	if err := r.db.WithContext(ctx).Clauses(clause.Locking{Strength: "UPDATE"}).First(&form, formID).Error; err != nil {
		return 0, err
	}
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

func (r *gormRegistrationRepository) UpdateRegistration(ctx context.Context, registrationID uint64, updates map[string]any) error {
	return r.db.WithContext(ctx).
		Model(&model.Registration{}).
		Where("id = ?", registrationID).
		Updates(updates).Error
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
		Preload("PreferredGroup").
		Preload("Screener").
		Preload("Interviewer").
		Preload("InterviewSession").
		Order("registrations.submitted_at DESC").
		Offset((normalizeRegistrationListPage(filter.Page) - 1) * normalizeRegistrationListPageSize(filter.PageSize)).
		Limit(normalizeRegistrationListPageSize(filter.PageSize)).
		Find(&registrations).Error; err != nil {
		return nil, err
	}

	return registrations, nil
}

func (r *gormRegistrationRepository) ListRegistrationsForExport(ctx context.Context, filter ListRegistrationsInput) ([]model.Registration, error) {
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
		Preload("PreferredGroup").
		Preload("Screener").
		Preload("Interviewer").
		Preload("InterviewSession").
		Order("registrations.submitted_at DESC").
		Find(&registrations).Error; err != nil {
		return nil, err
	}
	return registrations, nil
}

func (r *gormRegistrationRepository) CountRegistrations(ctx context.Context, filter ListRegistrationsInput) (int64, error) {
	return r.countRegistrations(ctx, filter, filter.Status)
}

func (r *gormRegistrationRepository) GetRegistrationStats(ctx context.Context, filter ListRegistrationsInput) (RegistrationStats, error) {
	var stats RegistrationStats
	err := applyRegistrationListFilters(
		r.db.WithContext(ctx).
			Model(&model.Registration{}).
			Joins("JOIN registration_forms ON registration_forms.id = registrations.form_id"),
		filter,
		false,
	).Select(
		`COUNT(*) AS total,
		COALESCE(SUM(CASE WHEN registrations.recruitment_status = ? THEN 1 ELSE 0 END), 0) AS pending_screening,
		COALESCE(SUM(CASE WHEN registrations.recruitment_status = ? THEN 1 ELSE 0 END), 0) AS pending_interview,
		COALESCE(SUM(CASE WHEN registrations.recruitment_status = ? THEN 1 ELSE 0 END), 0) AS admitted,
		COALESCE(SUM(CASE WHEN registrations.recruitment_status = ? THEN 1 ELSE 0 END), 0) AS rejected,
		COALESCE(SUM(CASE WHEN registrations.recruitment_status = ? THEN 1 ELSE 0 END), 0) AS withdrawn`,
		model.RecruitmentStatusPendingScreening,
		model.RecruitmentStatusPendingInterview,
		model.RecruitmentStatusAdmitted,
		model.RecruitmentStatusRejected,
		model.RecruitmentStatusWithdrawn,
	).Scan(&stats).Error
	return stats, err
}

func (r *gormRegistrationRepository) GetRegistrationByID(ctx context.Context, registrationID uint64) (*model.Registration, error) {
	var registration model.Registration
	if err := r.db.WithContext(ctx).
		Preload("Form").
		Preload("PreferredGroup").
		Preload("Screener").
		Preload("Interviewer").
		Preload("InterviewSession").
		First(&registration, registrationID).Error; err != nil {
		return nil, err
	}
	return &registration, nil
}

func (r *gormRegistrationRepository) GetRegistrationByIDForUpdate(ctx context.Context, registrationID uint64) (*model.Registration, error) {
	var registration model.Registration
	if err := r.db.WithContext(ctx).
		Clauses(clause.Locking{Strength: "UPDATE"}).
		Preload("User").
		Preload("Form").
		Preload("PreferredGroup").
		Preload("Screener").
		Preload("Interviewer").
		Preload("InterviewSession").
		First(&registration, registrationID).Error; err != nil {
		return nil, err
	}
	return &registration, nil
}

func (r *gormRegistrationRepository) DeleteRegistration(ctx context.Context, registrationID uint64) error {
	return r.db.WithContext(ctx).
		Delete(&model.Registration{}, registrationID).Error
}

func applyRegistrationListFilters(query *gorm.DB, filter ListRegistrationsInput, includeStatus bool) *gorm.DB {
	if filter.FormID != nil {
		query = query.Where("registrations.form_id = ?", *filter.FormID)
	}
	if filter.PreferredGroupID != nil {
		query = query.Where("registrations.preferred_group_id = ?", *filter.PreferredGroupID)
	}
	if filter.InterviewAttendance != nil {
		query = query.Where("registrations.interview_attendance = ?", strings.TrimSpace(*filter.InterviewAttendance))
	}
	if filter.InterviewDate != nil || filter.InterviewSessionLabel != nil {
		query = query.Joins("JOIN interview_sessions ON interview_sessions.id = registrations.interview_session_id")
	}
	if filter.InterviewDate != nil {
		query = query.Where("interview_sessions.date = ?", strings.TrimSpace(*filter.InterviewDate))
	}
	if filter.InterviewSessionLabel != nil && strings.TrimSpace(*filter.InterviewSessionLabel) != "" {
		query = query.Where("interview_sessions.label = ?", strings.TrimSpace(*filter.InterviewSessionLabel))
	}
	if includeStatus && filter.Status != nil {
		query = query.Where("registrations.recruitment_status = ?", strings.TrimSpace(*filter.Status))
	}
	if filter.Keyword != "" {
		like := "%" + filter.Keyword + "%"
		query = query.Where(
			`registrations.contact_name LIKE ? OR registrations.contact_phone LIKE ? OR registrations.contact_email LIKE ? OR registration_forms.title LIKE ?`,
			like, like, like, like,
		)
	}
	if len(filter.VisibleGroupIDs) > 0 {
		query = query.Where("registrations.preferred_group_id IN ?", filter.VisibleGroupIDs)
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

func (r *gormRegistrationRepository) countRegistrations(ctx context.Context, filter ListRegistrationsInput, status *string) (int64, error) {
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

func ptrUint64(value uint64) *uint64 {
	result := value
	return &result
}

func containsUint64(values []uint64, target uint64) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func (r *gormRegistrationRepository) ListShownUserGroups(ctx context.Context) ([]model.UserGroup, error) {
	return (&gormRegistrationFormRepository{db: r.db}).ListShownUserGroups(ctx)
}

func (r *gormRegistrationRepository) ListDefaultGroupIDs(ctx context.Context) ([]uint64, error) {
	var groupIDs []uint64
	if err := r.db.WithContext(ctx).
		Model(&model.UserGroup{}).
		Where("is_default = ?", true).
		Pluck("id", &groupIDs).Error; err != nil {
		return nil, err
	}
	return groupIDs, nil
}

func (r *gormRegistrationRepository) IsUserInActiveDefaultGroup(ctx context.Context, userID uint64) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&model.UserGroupMember{}).
		Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
		Where("user_group_members.user_id = ? AND user_groups.is_default = ? AND user_groups.status = ?", userID, true, model.UserGroupStatusActive).
		Count(&count).Error
	return count > 0, err
}

func (r *gormRegistrationRepository) AddUserToGroupIfAbsent(ctx context.Context, groupID uint64, userID uint64) error {
	member := model.UserGroupMember{
		GroupID: groupID,
		UserID:  userID,
		Role:    model.UserGroupMemberRoleMember,
	}
	return r.db.WithContext(ctx).
		Where("group_id = ? AND user_id = ?", groupID, userID).
		Attrs(map[string]any{"role": member.Role}).
		FirstOrCreate(&member).Error
}

func (r *gormRegistrationRepository) RemoveUserFromGroupIfPresent(ctx context.Context, groupID uint64, userID uint64) error {
	return r.db.WithContext(ctx).
		Where("group_id = ? AND user_id = ?", groupID, userID).
		Delete(&model.UserGroupMember{}).Error
}
