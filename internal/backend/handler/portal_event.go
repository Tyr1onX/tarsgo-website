package handler

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/service/portal"
)

type eventRequest struct {
	Title          string   `json:"title"`
	Description    string   `json:"description"`
	Location       string   `json:"location"`
	StartsAt       string   `json:"startsAt"`
	EndsAt         string   `json:"endsAt"`
	Status         string   `json:"status"`
	AudienceType   string   `json:"audienceType"`
	TargetGroupIDs []uint64 `json:"targetGroupIds"`
}

func (h *PortalHandler) ListEvents(c *gin.Context) {
	page, err := positiveQueryInt(c.Query("page"), 1)
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "页码不合法")
		return
	}
	pageSize, err := positiveQueryInt(c.Query("pageSize"), 20)
	if err != nil || pageSize > 100 {
		writeAPIError(c, http.StatusBadRequest, "每页数量不合法")
		return
	}
	result, serviceErr := h.service.ListEvents(c.Request.Context(), currentPortalActor(c), portal.ListEventsInput{Status: strings.TrimSpace(c.Query("status")), Page: page, PageSize: pageSize})
	if serviceErr != nil {
		h.handleError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "获取日程列表成功", result)
}

func (h *PortalHandler) GetEvent(c *gin.Context) {
	id, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的日程 ID")
		return
	}
	result, serviceErr := h.service.GetEvent(c.Request.Context(), currentPortalActor(c), id)
	if serviceErr != nil {
		h.handleError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "获取日程详情成功", result)
}

func (h *PortalHandler) CreateEvent(c *gin.Context) {
	input, err := bindEvent(c)
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, err.Error())
		return
	}
	result, serviceErr := h.service.CreateEvent(c.Request.Context(), currentPortalActor(c), input)
	if serviceErr != nil {
		h.handleError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "创建日程成功", result)
}

func (h *PortalHandler) UpdateEvent(c *gin.Context) {
	id, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的日程 ID")
		return
	}
	input, err := bindEvent(c)
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, err.Error())
		return
	}
	result, serviceErr := h.service.UpdateEvent(c.Request.Context(), currentPortalActor(c), id, input)
	if serviceErr != nil {
		h.handleError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "更新日程成功", result)
}

func (h *PortalHandler) DeleteEvent(c *gin.Context) {
	id, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的日程 ID")
		return
	}
	if serviceErr := h.service.DeleteEvent(c.Request.Context(), currentPortalActor(c), id); serviceErr != nil {
		h.handleError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "删除日程成功", nil)
}

func bindEvent(c *gin.Context) (portal.EventInput, error) {
	var request eventRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		return portal.EventInput{}, errors.New("请求参数不合法")
	}
	startsAt, err := time.Parse(time.RFC3339, strings.TrimSpace(request.StartsAt))
	if err != nil {
		return portal.EventInput{}, errors.New("开始时间格式不合法")
	}
	endsAt, err := time.Parse(time.RFC3339, strings.TrimSpace(request.EndsAt))
	if err != nil {
		return portal.EventInput{}, errors.New("结束时间格式不合法")
	}
	return portal.EventInput{Title: request.Title, Description: request.Description, Location: request.Location, StartsAt: startsAt, EndsAt: endsAt, Status: request.Status, AudienceType: request.AudienceType, TargetGroupIDs: request.TargetGroupIDs}, nil
}
