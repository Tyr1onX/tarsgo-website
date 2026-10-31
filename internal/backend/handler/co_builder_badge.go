package handler

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/middleware"
	"tarsgo-backend/service/cobuilderbadge"
)

type coBuilderBadgeService interface {
	GetMine(context.Context, cobuilderbadge.Actor) (*cobuilderbadge.Summary, error)
	GetForAdmin(context.Context, cobuilderbadge.Actor, uint64) (*cobuilderbadge.Summary, error)
	Grant(context.Context, cobuilderbadge.Actor, uint64, string) (*cobuilderbadge.Summary, error)
	Revoke(context.Context, cobuilderbadge.Actor, uint64, uint64) (*cobuilderbadge.Summary, error)
	ClaimUnlock(context.Context, cobuilderbadge.Actor) (*cobuilderbadge.UnlockNotice, error)
	AcknowledgeUnlock(context.Context, cobuilderbadge.Actor, string) error
}

type CoBuilderBadgeHandler struct {
	service coBuilderBadgeService
}

func NewCoBuilderBadgeHandler(service coBuilderBadgeService) *CoBuilderBadgeHandler {
	return &CoBuilderBadgeHandler{service: service}
}

func (h *CoBuilderBadgeHandler) Mine(c *gin.Context) {
	actor, ok := currentCoBuilderBadgeActor(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	summary, err := h.service.GetMine(c.Request.Context(), actor)
	if err != nil {
		h.writeServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取共建者勋章成功", summary)
}

func (h *CoBuilderBadgeHandler) ClaimUnlock(c *gin.Context) {
	actor, ok := currentCoBuilderBadgeActor(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	notice, err := h.service.ClaimUnlock(c.Request.Context(), actor)
	if err != nil {
		h.writeServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "读取勋章解锁提示成功", notice)
}

func (h *CoBuilderBadgeHandler) AcknowledgeUnlock(c *gin.Context) {
	actor, ok := currentCoBuilderBadgeActor(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	var request struct {
		ClaimToken string `json:"claimToken"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "勋章展示凭证格式不正确")
		return
	}
	if err := h.service.AcknowledgeUnlock(c.Request.Context(), actor, request.ClaimToken); err != nil {
		h.writeServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "勋章展示已确认", nil)
}

func (h *CoBuilderBadgeHandler) ForAdmin(c *gin.Context) {
	userID, err := parseCoBuilderPathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的用户 ID")
		return
	}
	actor, ok := currentCoBuilderBadgeActor(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	summary, err := h.service.GetForAdmin(c.Request.Context(), actor, userID)
	if err != nil {
		h.writeServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取共建者勋章成功", summary)
}

func (h *CoBuilderBadgeHandler) Grant(c *gin.Context) {
	userID, err := parseCoBuilderPathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的用户 ID")
		return
	}
	var request struct {
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "贡献说明格式不正确")
		return
	}
	actor, ok := currentCoBuilderBadgeActor(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	summary, err := h.service.Grant(c.Request.Context(), actor, userID, request.Description)
	if err != nil {
		h.writeServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "贡献已登记", summary)
}

func (h *CoBuilderBadgeHandler) Revoke(c *gin.Context) {
	userID, err := parseCoBuilderPathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的用户 ID")
		return
	}
	contributionID, err := parseCoBuilderPathID(c.Param("contributionID"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的贡献记录 ID")
		return
	}
	actor, ok := currentCoBuilderBadgeActor(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	summary, err := h.service.Revoke(c.Request.Context(), actor, userID, contributionID)
	if err != nil {
		h.writeServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "贡献记录已撤销", summary)
}

func (h *CoBuilderBadgeHandler) writeServiceError(c *gin.Context, err error) {
	var serviceErr *cobuilderbadge.ServiceError
	if errors.As(err, &serviceErr) {
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}
	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}

func currentCoBuilderBadgeActor(c *gin.Context) (cobuilderbadge.Actor, bool) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil || user.ID == 0 {
		return cobuilderbadge.Actor{}, false
	}
	return cobuilderbadge.Actor{ID: user.ID, RoleName: user.Role.Name}, true
}

func parseCoBuilderPathID(raw string) (uint64, error) {
	value, err := strconv.ParseUint(strings.TrimSpace(raw), 10, 64)
	if err != nil || value == 0 {
		return 0, errors.New("invalid identifier")
	}
	return value, nil
}
