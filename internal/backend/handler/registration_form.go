package handler

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/middleware"
	"tarsgo-backend/model"
	"tarsgo-backend/service/registration"
)

type RegistrationFormHandler struct {
	service registrationFormService
}

type registrationFormService interface {
	ListForms(ctx context.Context, actor registration.RegistrationFormActor, input registration.ListRegistrationFormsInput) (*registration.ListRegistrationFormsResult, error)
	GetForm(ctx context.Context, actor registration.RegistrationFormActor, formID uint64) (*registration.RegistrationFormDetail, error)
	CreateForm(ctx context.Context, actor registration.RegistrationFormActor, input registration.UpsertRegistrationFormInput) (*registration.RegistrationFormDetail, error)
	UpdateForm(ctx context.Context, actor registration.RegistrationFormActor, formID uint64, input registration.UpsertRegistrationFormInput) (*registration.RegistrationFormDetail, error)
	GetRecruitmentPageData(ctx context.Context, actor registration.RegistrationFormActor) (*registration.RecruitmentPageData, error)
}

type listRegistrationFormsQuery struct {
	Keyword string `form:"keyword"`
	Status  string `form:"status"`
}

type upsertRegistrationFormRequest struct {
	Title            string            `json:"title"`
	Description      string            `json:"description"`
	CoverImageURL    string            `json:"coverImageUrl"`
	FieldsSchema     []model.FormField `json:"fieldsSchema"`
	MaxRegistrations *int              `json:"maxRegistrations"`
	StartTime        string            `json:"startTime"`
	EndTime          string            `json:"endTime"`
	Status           uint8             `json:"status"`
}

func NewRegistrationFormHandler(service registrationFormService) *RegistrationFormHandler {
	return &RegistrationFormHandler{service: service}
}

func (h *RegistrationFormHandler) ListForms(c *gin.Context) {
	var query listRegistrationFormsQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		writeAPIError(c, http.StatusBadRequest, "查询参数不合法")
		return
	}

	status, err := parseOptionalRegistrationFormStatus(query.Status)
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, err.Error())
		return
	}

	result, serviceErr := h.service.ListForms(c.Request.Context(), currentRegistrationFormActor(c), registration.ListRegistrationFormsInput{
		Keyword: query.Keyword,
		Status:  status,
	})
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}

	writeAPI(c, http.StatusOK, "获取报名表列表成功", result)
}

func (h *RegistrationFormHandler) GetForm(c *gin.Context) {
	formID, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的报名表 ID")
		return
	}

	form, serviceErr := h.service.GetForm(c.Request.Context(), currentRegistrationFormActor(c), formID)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}

	writeAPI(c, http.StatusOK, "获取报名表详情成功", form)
}

func (h *RegistrationFormHandler) CreateForm(c *gin.Context) {
	input, ok := h.parseUpsertInput(c)
	if !ok {
		return
	}

	form, serviceErr := h.service.CreateForm(c.Request.Context(), currentRegistrationFormActor(c), input)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}

	writeAPI(c, http.StatusOK, "创建报名表成功", form)
}

func (h *RegistrationFormHandler) UpdateForm(c *gin.Context) {
	formID, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的报名表 ID")
		return
	}

	input, ok := h.parseUpsertInput(c)
	if !ok {
		return
	}

	form, serviceErr := h.service.UpdateForm(c.Request.Context(), currentRegistrationFormActor(c), formID, input)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}

	writeAPI(c, http.StatusOK, "更新报名表成功", form)
}

func (h *RegistrationFormHandler) GetRecruitmentPageData(c *gin.Context) {
	data, err := h.service.GetRecruitmentPageData(c.Request.Context(), currentRegistrationFormActor(c))
	if err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "获取报名信息页数据成功", data)
}

func (h *RegistrationFormHandler) parseUpsertInput(c *gin.Context) (registration.UpsertRegistrationFormInput, bool) {
	var request upsertRegistrationFormRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return registration.UpsertRegistrationFormInput{}, false
	}

	startTime, err := parseOptionalDateTime(request.StartTime)
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "报名开始时间格式不合法，请使用 YYYY-MM-DDTHH:mm")
		return registration.UpsertRegistrationFormInput{}, false
	}
	endTime, err := parseOptionalDateTime(request.EndTime)
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "报名截止时间格式不合法，请使用 YYYY-MM-DDTHH:mm")
		return registration.UpsertRegistrationFormInput{}, false
	}

	return registration.UpsertRegistrationFormInput{
		Title:            request.Title,
		Description:      request.Description,
		CoverImageURL:    request.CoverImageURL,
		FieldsSchema:     request.FieldsSchema,
		MaxRegistrations: request.MaxRegistrations,
		StartTime:        startTime,
		EndTime:          endTime,
		Status:           request.Status,
	}, true
}

func (h *RegistrationFormHandler) handleServiceError(c *gin.Context, err error) {
	var serviceErr *registration.FormServiceError
	if errors.As(err, &serviceErr) {
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}

	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}

func currentRegistrationFormActor(c *gin.Context) registration.RegistrationFormActor {
	sessionUser, ok := middleware.CurrentSessionUser(c)
	if !ok || sessionUser == nil {
		return registration.RegistrationFormActor{}
	}

	return registration.RegistrationFormActor{
		ID:       sessionUser.ID,
		RoleName: sessionUser.Role.Name,
	}
}

func parseOptionalRegistrationFormStatus(raw string) (*uint8, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, nil
	}

	value, err := strconv.ParseUint(trimmed, 10, 8)
	if err != nil || value > 2 {
		return nil, errors.New("报名表状态筛选值不合法")
	}

	status := uint8(value)
	return &status, nil
}

func parseOptionalDateTime(raw string) (*time.Time, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, nil
	}

	layouts := []string{
		"2006-01-02T15:04",
		time.RFC3339,
		"2006-01-02 15:04:05",
	}
	for _, layout := range layouts {
		value, err := time.ParseInLocation(layout, trimmed, time.Local)
		if err == nil {
			return &value, nil
		}
	}

	return nil, errors.New("invalid datetime")
}
