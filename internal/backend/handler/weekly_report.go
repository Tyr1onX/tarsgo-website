package handler

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/middleware"
	"tarsgo-backend/service/weeklyreport"
)

type weeklyReportService interface {
	GetDashboard(ctx context.Context, userID uint64, systemRole string) (*weeklyreport.Dashboard, error)
	SaveCurrentReport(ctx context.Context, userID uint64, input weeklyreport.ReportInput) (*weeklyreport.Report, error)
	UpdateReport(ctx context.Context, userID, reportID uint64, input weeklyreport.ReportInput) (*weeklyreport.Report, error)
	GetTeamWeek(ctx context.Context, userID uint64, systemRole, weekStart string) (*weeklyreport.TeamWeek, error)
}

type WeeklyReportHandler struct{ service weeklyReportService }

func NewWeeklyReportHandler(service weeklyReportService) *WeeklyReportHandler {
	return &WeeklyReportHandler{service: service}
}

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
	result, err := h.service.GetTeamWeek(c.Request.Context(), userID, roleName, c.Query("weekStart"))
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取组内周报成功", result)
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
