package handler

import (
	"context"
	"errors"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/middleware"
	"tarsgo-backend/model"
	"tarsgo-backend/service/registration"
)

type RegistrationHandler struct {
	service registrationService
}

type registrationService interface {
	SubmitRegistration(ctx context.Context, actor registration.RegistrationFormActor, input registration.SubmitRegistrationInput) (*registration.SubmitRegistrationResult, error)
	UpdateRecruitmentRegistration(ctx context.Context, actor registration.RegistrationFormActor, registrationID uint64, input registration.SubmitRegistrationInput) (*registration.SubmitRegistrationResult, error)
	CancelRecruitmentRegistration(ctx context.Context, actor registration.RegistrationFormActor, registrationID uint64) error
	ListRegistrations(ctx context.Context, actor registration.RegistrationFormActor, input registration.ListRegistrationsInput) (*registration.ListRegistrationsResult, error)
	GetAdminWorkbenchSummary(ctx context.Context, actor registration.RegistrationFormActor) (*registration.AdminWorkbenchSummary, error)
	GetRegistration(ctx context.Context, actor registration.RegistrationFormActor, registrationID uint64) (*registration.RegistrationDetail, error)
	ScreenRegistration(ctx context.Context, actor registration.RegistrationFormActor, registrationID uint64, input registration.ScreeningDecisionInput) (*registration.RegistrationDetail, error)
	RecordInterviewResult(ctx context.Context, actor registration.RegistrationFormActor, registrationID uint64, input registration.InterviewDecisionInput) (*registration.RegistrationDetail, error)
	UndoScreening(ctx context.Context, actor registration.RegistrationFormActor, registrationID uint64) (*registration.RegistrationDetail, error)
	OpenRegistrationFile(ctx context.Context, actor registration.RegistrationFormActor, registrationID uint64, fieldKey string, index int) (*registration.RegistrationFileResult, error)
	ExportFormRegistrationsCSV(ctx context.Context, actor registration.RegistrationFormActor, formID uint64, baseURL string) (*registration.RegistrationCSVExportResult, error)
	ListInterviewSessions(ctx context.Context, actor registration.RegistrationFormActor) ([]registration.InterviewSessionView, error)
	CreateInterviewSession(ctx context.Context, actor registration.RegistrationFormActor, input registration.UpsertInterviewSessionInput) (*registration.InterviewSessionView, error)
	UpdateInterviewSession(ctx context.Context, actor registration.RegistrationFormActor, sessionID uint64, input registration.UpsertInterviewSessionInput) (*registration.InterviewSessionView, error)
	GetInterviewAttendance(ctx context.Context, actor registration.RegistrationFormActor, registrationID uint64) (*registration.InterviewAttendanceResult, error)
	UpdateInterviewAttendance(ctx context.Context, actor registration.RegistrationFormActor, registrationID uint64, input registration.InterviewAttendanceInput) (*registration.InterviewAttendanceResult, error)
}

type listRegistrationsQuery struct {
	Page                  int    `form:"page"`
	PageSize              int    `form:"pageSize"`
	Keyword               string `form:"keyword"`
	Status                string `form:"status"`
	FormID                string `form:"formId"`
	PreferredGroupID      string `form:"preferredGroupId"`
	InterviewAttendance   string `form:"interviewAttendance"`
	InterviewDate         string `form:"interviewDate"`
	InterviewSessionLabel string `form:"interviewSessionLabel"`
}

type recruitmentDecisionRequest struct {
	Decision string `json:"decision"`
	Remark   string `json:"remark"`
}

func NewRegistrationHandler(service registrationService) *RegistrationHandler {
	return &RegistrationHandler{service: service}
}

func (h *RegistrationHandler) SubmitRegistration(c *gin.Context) {
	if err := c.Request.ParseMultipartForm(64 << 20); err != nil {
		writeAPIError(c, http.StatusBadRequest, "报名提交参数不合法")
		return
	}

	formID, err := parsePathID(c.PostForm("formId"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的报名表 ID")
		return
	}

	values, files := cloneMultipartForm(c.Request.MultipartForm)
	delete(values, "formId")

	result, serviceErr := h.service.SubmitRegistration(c.Request.Context(), currentRegistrationFormActor(c), registration.SubmitRegistrationInput{
		FormID: formID,
		Values: values,
		Files:  files,
	})
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}
	actor := currentRegistrationFormActor(c)
	_ = middleware.RecordBusinessActivity(c, middleware.ActivityInput{ActionKey: model.ActivityRegistrationSubmitted, ActorID: &actor.ID, TargetUserID: &actor.ID, EntityType: "registration", EntityID: result.ID})

	writeAPI(c, http.StatusOK, "提交报名成功", result)
}

func (h *RegistrationHandler) UpdateRecruitmentRegistration(c *gin.Context) {
	registrationID, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的报名记录 ID")
		return
	}
	if err := c.Request.ParseMultipartForm(64 << 20); err != nil {
		writeAPIError(c, http.StatusBadRequest, "报名提交参数不合法")
		return
	}

	values, files := cloneMultipartForm(c.Request.MultipartForm)
	delete(values, "formId")

	result, serviceErr := h.service.UpdateRecruitmentRegistration(c.Request.Context(), currentRegistrationFormActor(c), registrationID, registration.SubmitRegistrationInput{
		Values: values,
		Files:  files,
	})
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}

	writeAPI(c, http.StatusOK, "更新报名成功", result)
}

func (h *RegistrationHandler) CancelRecruitmentRegistration(c *gin.Context) {
	registrationID, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的报名记录 ID")
		return
	}

	serviceErr := h.service.CancelRecruitmentRegistration(c.Request.Context(), currentRegistrationFormActor(c), registrationID)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}

	writeAPI(c, http.StatusOK, "撤回报名成功", nil)
}

func (h *RegistrationHandler) ListRegistrations(c *gin.Context) {
	var query listRegistrationsQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		writeAPIError(c, http.StatusBadRequest, "查询参数不合法")
		return
	}

	status, err := parseOptionalRegistrationStatus(query.Status)
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, err.Error())
		return
	}
	formID, err := parseOptionalUint64(query.FormID, "报名表筛选值不合法")
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, err.Error())
		return
	}
	preferredGroupID, err := parseOptionalUint64(query.PreferredGroupID, "意向组筛选值不合法")
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, err.Error())
		return
	}

	result, serviceErr := h.service.ListRegistrations(c.Request.Context(), currentRegistrationFormActor(c), registration.ListRegistrationsInput{
		Page:                  query.Page,
		PageSize:              query.PageSize,
		Keyword:               query.Keyword,
		Status:                status,
		FormID:                formID,
		PreferredGroupID:      preferredGroupID,
		InterviewAttendance:   optionalString(query.InterviewAttendance),
		InterviewDate:         optionalString(query.InterviewDate),
		InterviewSessionLabel: optionalString(query.InterviewSessionLabel),
	})
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}

	writeAPI(c, http.StatusOK, "获取报名列表成功", result)
}

func (h *RegistrationHandler) GetAdminWorkbenchSummary(c *gin.Context) {
	result, serviceErr := h.service.GetAdminWorkbenchSummary(c.Request.Context(), currentRegistrationFormActor(c))
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "获取招新工作台统计成功", result)
}

func (h *RegistrationHandler) GetRegistration(c *gin.Context) {
	registrationID, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的报名记录 ID")
		return
	}

	detail, serviceErr := h.service.GetRegistration(c.Request.Context(), currentRegistrationFormActor(c), registrationID)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}

	writeAPI(c, http.StatusOK, "获取报名详情成功", detail)
}

func (h *RegistrationHandler) ScreenRegistration(c *gin.Context) {
	registrationID, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的报名记录 ID")
		return
	}

	var request recruitmentDecisionRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	detail, serviceErr := h.service.ScreenRegistration(c.Request.Context(), currentRegistrationFormActor(c), registrationID, registration.ScreeningDecisionInput{
		Decision: request.Decision,
		Remark:   request.Remark,
	})
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}
	actionKey := model.ActivityRegistrationRejected
	if strings.EqualFold(strings.TrimSpace(request.Decision), "approve") {
		actionKey = model.ActivityRegistrationApproved
	}
	_ = middleware.RecordBusinessActivity(c, middleware.ActivityInput{ActionKey: actionKey, EntityType: "registration", EntityID: registrationID, Metadata: map[string]any{"decision": strings.ToLower(strings.TrimSpace(request.Decision))}})

	writeAPI(c, http.StatusOK, "提交初筛结果成功", detail)
}

func (h *RegistrationHandler) UndoScreening(c *gin.Context) {
	registrationID, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的报名记录 ID")
		return
	}

	detail, serviceErr := h.service.UndoScreening(c.Request.Context(), currentRegistrationFormActor(c), registrationID)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}
	_ = middleware.RecordBusinessActivity(c, middleware.ActivityInput{ActionKey: model.ActivityRegistrationReviewUndo, EntityType: "registration", EntityID: registrationID})

	writeAPI(c, http.StatusOK, "撤销初筛成功", detail)
}

func (h *RegistrationHandler) RecordInterviewResult(c *gin.Context) {
	registrationID, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的报名记录 ID")
		return
	}
	var request recruitmentDecisionRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}
	detail, serviceErr := h.service.RecordInterviewResult(c.Request.Context(), currentRegistrationFormActor(c), registrationID, registration.InterviewDecisionInput{Decision: request.Decision, Remark: request.Remark})
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "更新面试结果成功", detail)
}

func (h *RegistrationHandler) OpenRegistrationFile(c *gin.Context) {
	registrationID, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的报名记录 ID")
		return
	}

	indexValue, err := strconv.Atoi(strings.TrimSpace(c.Param("index")))
	if err != nil || indexValue < 0 {
		writeAPIError(c, http.StatusBadRequest, "无效的文件索引")
		return
	}

	result, serviceErr := h.service.OpenRegistrationFile(
		c.Request.Context(),
		currentRegistrationFormActor(c),
		registrationID,
		c.Param("fieldKey"),
		indexValue,
	)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}

	if strings.TrimSpace(result.ContentType) != "" {
		c.Header("Content-Type", result.ContentType)
	}
	if result.Inline {
		c.Header("Content-Disposition", "inline; filename="+strconv.Quote(result.FileName))
		c.File(result.Path)
		return
	}

	c.FileAttachment(result.Path, result.FileName)
}

func (h *RegistrationHandler) ExportFormRegistrationsCSV(c *gin.Context) {
	formID, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的报名表 ID")
		return
	}

	result, serviceErr := h.service.ExportFormRegistrationsCSV(
		c.Request.Context(),
		currentRegistrationFormActor(c),
		formID,
		buildRequestBaseURL(c.Request),
	)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename="+strconv.Quote(result.FileName))
	c.Data(http.StatusOK, "text/csv; charset=utf-8", result.Content)
}

func (h *RegistrationHandler) handleServiceError(c *gin.Context, err error) {
	var serviceErr *registration.ServiceError
	if errors.As(err, &serviceErr) {
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}

	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}

func parseOptionalRegistrationStatus(raw string) (*string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, nil
	}
	switch trimmed {
	case model.RecruitmentStatusPendingScreening,
		model.RecruitmentStatusPendingInterview,
		model.RecruitmentStatusAdmitted,
		model.RecruitmentStatusRejected,
		model.RecruitmentStatusWithdrawn:
		return &trimmed, nil
	default:
		return nil, errors.New("报名状态筛选值不合法")
	}
}

func parseOptionalUint64(raw string, message string) (*uint64, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, nil
	}

	value, err := strconv.ParseUint(trimmed, 10, 64)
	if err != nil || value == 0 {
		return nil, errors.New(message)
	}

	result := uint64(value)
	return &result, nil
}

func optionalString(raw string) *string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func buildRequestBaseURL(request *http.Request) string {
	if request == nil {
		return ""
	}

	scheme := forwardedHeaderValue(request.Header.Get("X-Forwarded-Proto"))
	if scheme == "" {
		if request.TLS != nil {
			scheme = "https"
		} else {
			scheme = "http"
		}
	}

	host := forwardedHeaderValue(request.Header.Get("X-Forwarded-Host"))
	if host == "" {
		host = strings.TrimSpace(request.Host)
	}
	if host == "" {
		return ""
	}

	return scheme + "://" + host
}

func forwardedHeaderValue(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	if comma := strings.Index(trimmed, ","); comma >= 0 {
		return strings.TrimSpace(trimmed[:comma])
	}
	return trimmed
}

func cloneMultipartForm(form *multipart.Form) (map[string][]string, map[string][]*multipart.FileHeader) {
	values := make(map[string][]string)
	files := make(map[string][]*multipart.FileHeader)
	if form == nil {
		return values, files
	}

	for key, items := range form.Value {
		values[key] = append([]string(nil), items...)
	}
	for key, items := range form.File {
		files[key] = append([]*multipart.FileHeader(nil), items...)
	}
	return values, files
}
