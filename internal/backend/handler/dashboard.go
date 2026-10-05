package handler

import (
	"context"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/middleware"
	"tarsgo-backend/service/dashboard"
)

type dashboardService interface {
	Get(context.Context, dashboard.Actor) (*dashboard.Data, error)
}
type DashboardHandler struct{ service dashboardService }

func NewDashboardHandler(service dashboardService) *DashboardHandler {
	return &DashboardHandler{service: service}
}
func (h *DashboardHandler) Get(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	user, _ := middleware.CurrentSessionUser(c)
	actor := dashboard.Actor{}
	if user != nil {
		actor = dashboard.Actor{ID: user.ID, RoleName: user.Role.Name, AdminScope: user.AdminScope, ManagementGroupID: user.ManagementGroupID, GroupRole: user.GroupRole}
	}
	result, err := h.service.Get(c.Request.Context(), actor)
	if err != nil {
		var serviceErr *dashboard.ServiceError
		if errors.As(err, &serviceErr) {
			writeAPIError(c, serviceErr.Status, serviceErr.Message)
		} else {
			writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
		}
		return
	}
	writeAPI(c, http.StatusOK, "获取统计数据成功", result)
}
