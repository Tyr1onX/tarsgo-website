package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"tarsgo-backend/middleware"
	"tarsgo-backend/service/recruitmentrecords"
)

type RecruitmentRecordsHandler struct{ service *recruitmentrecords.Service }

func NewRecruitmentRecordsHandler(s *recruitmentrecords.Service) *RecruitmentRecordsHandler {
	return &RecruitmentRecordsHandler{service: s}
}
func (h *RecruitmentRecordsHandler) List(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	actor, ok := middleware.CurrentSessionUser(c)
	if !ok || actor == nil {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	page, err := h.service.List(c.Request.Context(), actor.Role.Name, c.DefaultQuery("dataset", "recruitment"), c.Query("cursor"))
	if err != nil {
		switch {
		case errors.Is(err, recruitmentrecords.ErrForbidden):
			writeAPIError(c, http.StatusForbidden, err.Error())
		case errors.Is(err, recruitmentrecords.ErrInvalid):
			writeAPIError(c, http.StatusBadRequest, err.Error())
		default:
			middleware.LogInternalError(c, "recruitmentrecords", http.StatusInternalServerError, err)
			writeAPIError(c, http.StatusInternalServerError, "读取保留记录失败")
		}
		return
	}
	writeAPI(c, http.StatusOK, "获取保留记录成功", page)
}
