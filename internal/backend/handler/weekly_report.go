package handler

import (
	"context"
	"errors"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/middleware"
	"tarsgo-backend/service/weeklyreport"
)

type weeklyReportService interface {
	GetDashboard(ctx context.Context, userID uint64, systemRole string) (*weeklyreport.Dashboard, error)
	SaveCurrentReport(ctx context.Context, userID uint64, input weeklyreport.ReportInput) (*weeklyreport.Report, error)
	UpdateReport(ctx context.Context, userID, reportID uint64, input weeklyreport.ReportInput) (*weeklyreport.Report, error)
	GetTeamWeek(ctx context.Context, userID uint64, systemRole string, groupID uint64, weekStart string) (*weeklyreport.TeamWeek, error)
}

type weeklyReportAttachmentService interface {
	UploadAttachments(ctx context.Context, actor weeklyreport.Actor, reportID uint64, files []*multipart.FileHeader) ([]weeklyreport.AttachmentView, error)
	DeleteAttachment(ctx context.Context, actor weeklyreport.Actor, reportID, fileID uint64) error
	OpenAttachment(ctx context.Context, actor weeklyreport.Actor, reportID, fileID uint64) (*weeklyreport.Download, error)
}

type WeeklyReportHandler struct {
	service     weeklyReportService
	attachments weeklyReportAttachmentService
}

func NewWeeklyReportHandler(service weeklyReportService) *WeeklyReportHandler {
	attachments, _ := service.(weeklyReportAttachmentService)
	return &WeeklyReportHandler{service: service, attachments: attachments}
}

const maxWeeklyReportRequestBody = 52 << 20

func (h *WeeklyReportHandler) GetDashboard(c *gin.Context) {
	userID, roleName, ok := currentWeeklyReportActor(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	result, err := h.service.GetDashboard(c.Request.Context(), userID, roleName)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取工作周报成功", result)
}

func (h *WeeklyReportHandler) SaveCurrent(c *gin.Context) {
	var input weeklyreport.ReportInput
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, http.StatusBadRequest, "周报内容不合法")
		return
	}
	userID, _, ok := currentWeeklyReportActor(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	result, err := h.service.SaveCurrentReport(c.Request.Context(), userID, input)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "本周周报已保存", result)
}

func (h *WeeklyReportHandler) Update(c *gin.Context) {
	reportID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || reportID == 0 {
		writeAPIError(c, http.StatusBadRequest, "周报编号无效")
		return
	}
	var input weeklyreport.ReportInput
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, http.StatusBadRequest, "周报内容不合法")
		return
	}
	userID, _, ok := currentWeeklyReportActor(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	result, err := h.service.UpdateReport(c.Request.Context(), userID, reportID, input)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "周报已更新", result)
}

func (h *WeeklyReportHandler) GetTeamWeek(c *gin.Context) {
	userID, roleName, ok := currentWeeklyReportActor(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	groupID := uint64(0)
	if rawGroupID := c.Query("groupId"); rawGroupID != "" {
		parsed, err := strconv.ParseUint(rawGroupID, 10, 64)
		if err != nil || parsed == 0 {
			writeAPIError(c, http.StatusBadRequest, "组别编号无效")
			return
		}
		groupID = parsed
	}
	result, err := h.service.GetTeamWeek(c.Request.Context(), userID, roleName, groupID, c.Query("weekStart"))
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取组内周报成功", result)
}

func (h *WeeklyReportHandler) UploadAttachments(c *gin.Context) {
	if h.attachments == nil {
		writeAPIError(c, http.StatusServiceUnavailable, "周报附件暂不可用")
		return
	}
	reportID, _, ok := parseWeeklyReportAttachmentPath(c, false)
	if !ok {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxWeeklyReportRequestBody)
	if err := c.Request.ParseMultipartForm(1 << 20); err != nil {
		if c.Request.MultipartForm != nil {
			_ = c.Request.MultipartForm.RemoveAll()
		}
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			writeAPIError(c, http.StatusRequestEntityTooLarge, "附件总大小不能超过 50 MB")
			return
		}
		writeAPIError(c, http.StatusBadRequest, "周报附件参数不合法")
		return
	}
	if c.Request.MultipartForm != nil {
		defer c.Request.MultipartForm.RemoveAll()
	}
	var files []*multipart.FileHeader
	if c.Request.MultipartForm != nil {
		files = c.Request.MultipartForm.File["files"]
	}
	userID, roleName, ok := currentWeeklyReportActor(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	result, err := h.attachments.UploadAttachments(c.Request.Context(), weeklyreport.Actor{ID: userID, RoleName: roleName}, reportID, files)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusCreated, "周报附件已上传", result)
}

func (h *WeeklyReportHandler) DeleteAttachment(c *gin.Context) {
	if h.attachments == nil {
		writeAPIError(c, http.StatusServiceUnavailable, "周报附件暂不可用")
		return
	}
	reportID, fileID, ok := parseWeeklyReportAttachmentPath(c, true)
	if !ok {
		return
	}
	userID, roleName, ok := currentWeeklyReportActor(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	if err := h.attachments.DeleteAttachment(c.Request.Context(), weeklyreport.Actor{ID: userID, RoleName: roleName}, reportID, fileID); err != nil {
		h.handleServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "周报附件已删除", gin.H{"id": fileID})
}

func (h *WeeklyReportHandler) OpenAttachment(c *gin.Context) {
	if h.attachments == nil {
		writeAPIError(c, http.StatusServiceUnavailable, "周报附件暂不可用")
		return
	}
	reportID, fileID, ok := parseWeeklyReportAttachmentPath(c, true)
	if !ok {
		return
	}
	userID, roleName, ok := currentWeeklyReportActor(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	file, err := h.attachments.OpenAttachment(c.Request.Context(), weeklyreport.Actor{ID: userID, RoleName: roleName}, reportID, fileID)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	c.Header("Content-Type", file.ContentType)
	c.Header("Content-Disposition", "attachment; filename*=UTF-8''"+url.PathEscape(file.FileName))
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, file.ContentType, file.Content)
}

func parseWeeklyReportAttachmentPath(c *gin.Context, requireFileID bool) (uint64, uint64, bool) {
	reportID, err := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || reportID == 0 {
		writeAPIError(c, http.StatusBadRequest, "周报编号无效")
		return 0, 0, false
	}
	if !requireFileID {
		return reportID, 0, true
	}
	fileID, err := strconv.ParseUint(strings.TrimSpace(c.Param("fileId")), 10, 64)
	if err != nil || fileID == 0 {
		writeAPIError(c, http.StatusBadRequest, "附件编号无效")
		return 0, 0, false
	}
	return reportID, fileID, true
}

func currentWeeklyReportActor(c *gin.Context) (uint64, string, bool) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil || user.ID == 0 {
		return 0, "", false
	}
	return user.ID, user.Role.Name, true
}

func (h *WeeklyReportHandler) handleServiceError(c *gin.Context, err error) {
	var serviceErr *weeklyreport.ServiceError
	if errors.As(err, &serviceErr) {
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}
	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}
