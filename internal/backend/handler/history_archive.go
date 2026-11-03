package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"tarsgo-backend/middleware"
	"tarsgo-backend/service/historyarchive"
)

type HistoryArchiveHandler struct{ service *historyarchive.Service }

func NewHistoryArchiveHandler(s *historyarchive.Service) *HistoryArchiveHandler {
	return &HistoryArchiveHandler{service: s}
}
func (h *HistoryArchiveHandler) List(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	actor, ok := middleware.CurrentSessionUser(c)
	if !ok || actor == nil {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	page, err := h.service.List(c.Request.Context(), actor.Role.Name, c.DefaultQuery("dataset", "recruitment"), c.Query("cursor"))
	if err != nil {
		switch {
		case errors.Is(err, historyarchive.ErrForbidden):
			writeAPIError(c, http.StatusForbidden, err.Error())
		case errors.Is(err, historyarchive.ErrInvalid):
			writeAPIError(c, http.StatusBadRequest, err.Error())
		default:
			middleware.LogInternalError(c, "historyarchive", http.StatusInternalServerError, err)
			writeAPIError(c, http.StatusInternalServerError, "读取历史档案失败")
		}
		return
	}
	writeAPI(c, http.StatusOK, "获取历史档案成功", page)
}
