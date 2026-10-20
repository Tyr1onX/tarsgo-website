package handler

import (
	"context"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/middleware"
	"tarsgo-backend/service/growth"
)

type growthService interface {
	GetMine(ctx context.Context, userID uint64) (*growth.Profile, error)
}

type GrowthHandler struct{ service growthService }

func NewGrowthHandler(service growthService) *GrowthHandler {
	return &GrowthHandler{service: service}
}

func (h *GrowthHandler) GetMine(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil || user.ID == 0 {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	profile, err := h.service.GetMine(c.Request.Context(), user.ID)
	if err != nil {
		var serviceErr *growth.ServiceError
		if errors.As(err, &serviceErr) {
			if serviceErr.Status >= http.StatusInternalServerError {
				middleware.LogInternalError(c, "growth", serviceErr.Status, err)
			}
			writeAPIError(c, serviceErr.Status, serviceErr.Message)
			return
		}
		middleware.LogInternalError(c, "growth", http.StatusInternalServerError, err)
		writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	writeAPI(c, http.StatusOK, "获取个人成长档案成功", profile)
}
