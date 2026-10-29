package handler

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"tarsgo-backend/middleware"
	"tarsgo-backend/service/capabilities"
)

type CapabilitiesHandler struct{ service *capabilities.Service }

func NewCapabilitiesHandler(service *capabilities.Service) *CapabilitiesHandler {
	return &CapabilitiesHandler{service: service}
}

func (h *CapabilitiesHandler) ListMine(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil || user.ID == 0 {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	result, err := h.service.ListMine(c.Request.Context(), user.ID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取个人能力评价成功", result)
}

func (h *CapabilitiesHandler) ListAdminGroups(c *gin.Context) {
	items, err := h.service.ListAdminGroups(c.Request.Context(), currentCapabilitiesActor(c))
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取可管理能力组别成功", items)
}

func (h *CapabilitiesHandler) AdminGroup(c *gin.Context) {
	groupID, ok := parseCapabilityID(c.Query("groupId"))
	if !ok {
		writeAPIError(c, http.StatusBadRequest, "能力组别参数不合法")
		return
	}
	item, err := h.service.AdminGroup(c.Request.Context(), currentCapabilitiesActor(c), groupID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取组内能力评价成功", item)
}

func (h *CapabilitiesHandler) AdminMember(c *gin.Context) {
	groupID, ok := parseCapabilityPathID(c, "groupId")
	if !ok {
		return
	}
	userID, ok := parseCapabilityPathID(c, "userId")
	if !ok {
		return
	}
	item, err := h.service.AdminMember(c.Request.Context(), currentCapabilitiesActor(c), groupID, userID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取成员能力评价来源成功", item)
}

func (h *CapabilitiesHandler) CreateDimension(c *gin.Context) {
	var input capabilities.DimensionInput
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, http.StatusBadRequest, "能力维度内容不合法")
		return
	}
	item, err := h.service.CreateDimension(c.Request.Context(), currentCapabilitiesActor(c), input)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusCreated, "能力维度已创建", item)
}

func (h *CapabilitiesHandler) UpdateDimension(c *gin.Context) {
	dimensionID, ok := parseCapabilityPathID(c, "id")
	if !ok {
		return
	}
	var input capabilities.DimensionInput
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, http.StatusBadRequest, "能力维度内容不合法")
		return
	}
	item, err := h.service.UpdateDimension(c.Request.Context(), currentCapabilitiesActor(c), dimensionID, input)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "能力维度已更新", item)
}

func (h *CapabilitiesHandler) DeleteDimension(c *gin.Context) {
	dimensionID, ok := parseCapabilityPathID(c, "id")
	if !ok {
		return
	}
	if err := h.service.DeleteDimension(c.Request.Context(), currentCapabilitiesActor(c), dimensionID); err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "能力维度已删除，历史记录已保留", gin.H{"id": dimensionID})
}

func (h *CapabilitiesHandler) AddManualReview(c *gin.Context) {
	groupID, ok := parseCapabilityPathID(c, "groupId")
	if !ok {
		return
	}
	userID, ok := parseCapabilityPathID(c, "userId")
	if !ok {
		return
	}
	var input capabilities.ManualReviewInput
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, http.StatusBadRequest, "人工评价内容不合法")
		return
	}
	item, err := h.service.AddManualReview(c.Request.Context(), currentCapabilitiesActor(c), groupID, userID, input)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusCreated, "人工评价已追加", item)
}

func currentCapabilitiesActor(c *gin.Context) capabilities.Actor {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil {
		return capabilities.Actor{}
	}
	return capabilities.Actor{ID: user.ID, RoleName: user.Role.Name}
}

func parseCapabilityID(raw string) (uint64, bool) {
	value, err := strconv.ParseUint(strings.TrimSpace(raw), 10, 64)
	return value, err == nil && value > 0
}

func parseCapabilityPathID(c *gin.Context, key string) (uint64, bool) {
	value, ok := parseCapabilityID(c.Param(key))
	if !ok {
		writeAPIError(c, http.StatusBadRequest, "能力维度或成员编号不合法")
	}
	return value, ok
}

func (h *CapabilitiesHandler) fail(c *gin.Context, err error) {
	var serviceErr *capabilities.ServiceError
	if errors.As(err, &serviceErr) {
		if serviceErr.Status >= http.StatusInternalServerError {
			middleware.LogInternalError(c, "capabilities", serviceErr.Status, err)
		}
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}
	middleware.LogInternalError(c, "capabilities", http.StatusInternalServerError, err)
	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}
