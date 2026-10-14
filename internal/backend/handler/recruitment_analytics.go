package handler

import (
	"context"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/middleware"
	"tarsgo-backend/service/recruitmentanalytics"
)

type RecruitmentAnalyticsHandler struct {
	service recruitmentAnalyticsService
}

type recruitmentAnalyticsService interface {
	GetReport(ctx context.Context, roleName string) (*recruitmentanalytics.Report, error)
}

func NewRecruitmentAnalyticsHandler(service recruitmentAnalyticsService) *RecruitmentAnalyticsHandler {
	return &RecruitmentAnalyticsHandler{service: service}
}

func (h *RecruitmentAnalyticsHandler) GetReport(c *gin.Context) {
	actor, ok := middleware.CurrentSessionUser(c)
	if !ok || actor == nil {
		writeAPIError(c, http.StatusUnauthorized, "未登录")
		return
	}

	report, err := h.service.GetReport(c.Request.Context(), actor.Role.Name)
	if err != nil {
		var serviceErr *recruitmentanalytics.ServiceError
		if errors.As(err, &serviceErr) {
			writeAPIError(c, serviceErr.Status, serviceErr.Message)
			return
		}
		writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
		return
	}

	writeAPI(c, http.StatusOK, "获取招新数据分析成功", report)
}
