package handler

import (
	"context"
	"errors"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

type RegistrationHandler struct {
	service registrationService
}

type registrationService interface {
	SubmitRegistration(ctx context.Context, actor RegistrationFormActor, input SubmitRegistrationInput) (*SubmitRegistrationResult, error)
	ListRegistrations(ctx context.Context, actor RegistrationFormActor, input ListRegistrationsInput) (*ListRegistrationsResult, error)
	GetRegistration(ctx context.Context, actor RegistrationFormActor, registrationID uint64) (*RegistrationDetail, error)
	OpenRegistrationFile(ctx context.Context, actor RegistrationFormActor, registrationID uint64, fieldKey string, index int) (*RegistrationFileResult, error)
}

type listRegistrationsQuery struct {
	Keyword string `form:"keyword"`
	Status  string `form:"status"`
	FormID  string `form:"formId"`
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

	result, serviceErr := h.service.SubmitRegistration(c.Request.Context(), currentRegistrationFormActor(c), SubmitRegistrationInput{
		FormID: formID,
		Values: values,
		Files:  files,
	})
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}

	writeAPI(c, http.StatusOK, "提交报名成功", result)
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

	result, serviceErr := h.service.ListRegistrations(c.Request.Context(), currentRegistrationFormActor(c), ListRegistrationsInput{
		Keyword: query.Keyword,
		Status:  status,
		FormID:  formID,
	})
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}

	writeAPI(c, http.StatusOK, "获取报名列表成功", result)
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

func (h *RegistrationHandler) handleServiceError(c *gin.Context, err error) {
	var serviceErr *registrationServiceError
	if errors.As(err, &serviceErr) {
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}

	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}

func parseOptionalRegistrationStatus(raw string) (*uint8, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, nil
	}

	value, err := strconv.ParseUint(trimmed, 10, 8)
	if err != nil {
		return nil, errors.New("报名状态筛选值不合法")
	}

	status := uint8(value)
	if err := validateRegistrationStatus(status); err != nil {
		return nil, errors.New(err.Error())
	}
	return &status, nil
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
