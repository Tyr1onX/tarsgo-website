package handler

import (
	"errors"
	"github.com/gin-gonic/gin"
	"net/http"
	"strconv"
	"strings"
	"tarsgo-backend/service/availability"
)

type AvailabilityHandler struct{ service *availability.Service }

func NewAvailabilityHandler(service *availability.Service) *AvailabilityHandler {
	return &AvailabilityHandler{service: service}
}
func availabilityActor(c *gin.Context) (availability.Actor, bool) {
	id, role, ok := currentWeeklyReportActor(c)
	return availability.Actor{UserID: id, Role: role}, ok
}
func (h *AvailabilityHandler) Options(c *gin.Context) {
	actor, ok := availabilityActor(c)
	if !ok {
		writeAPIError(c, 401, "请先登录")
		return
	}
	result, err := h.service.Options(c.Request.Context(), actor)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取可管理组别成功", result)
}
func (h *AvailabilityHandler) Analyze(c *gin.Context) {
	actor, ok := availabilityActor(c)
	if !ok {
		writeAPIError(c, 401, "请先登录")
		return
	}
	getInt := func(key string) (int, bool) {
		v, err := strconv.Atoi(c.Query(key))
		return v, err == nil
	}
	groupID, err := strconv.ParseUint(c.Query("groupId"), 10, 64)
	if err != nil || groupID == 0 {
		writeAPIError(c, 400, "组别编号不合法")
		return
	}
	week, wok := getInt("week")
	weekday, dok := getInt("weekday")
	start, sok := getInt("startSection")
	end, eok := getInt("endSection")
	if !wok || !dok || !sok || !eok {
		writeAPIError(c, 400, "教学周、星期或节次无效")
		return
	}
	result, err := h.service.Analyze(c.Request.Context(), actor, availability.Filter{GroupID: groupID, Semester: strings.TrimSpace(c.Query("semester")), Week: week, Weekday: weekday, StartSection: start, EndSection: end})
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 200, "查询组内时间段成功", result)
}
func (h *AvailabilityHandler) fail(c *gin.Context, err error) {
	var e *availability.Error
	if errors.As(err, &e) {
		writeAPIError(c, e.Status, e.Message)
		return
	}
	writeAPIError(c, 500, "查询失败")
}
