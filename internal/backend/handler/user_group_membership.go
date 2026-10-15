package handler

import (
	"context"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"tarsgo-backend/middleware"
	"tarsgo-backend/service/usergroup"
)

type userGroupMembershipService interface {
	CurrentState(ctx context.Context, userID uint64) (*usergroup.MembershipResolution, error)
	Confirm(ctx context.Context, userID, groupID uint64) (*usergroup.MembershipResolution, error)
}

type UserGroupMembershipHandler struct {
	service userGroupMembershipService
}

type confirmUserGroupRequest struct {
	GroupID uint64 `json:"groupId" binding:"required"`
}

func NewUserGroupMembershipHandler(service userGroupMembershipService) *UserGroupMembershipHandler {
	return &UserGroupMembershipHandler{service: service}
}

func (h *UserGroupMembershipHandler) CurrentState(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil || user.ID == 0 {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	state, err := h.service.CurrentState(c.Request.Context(), user.ID)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	writeAPI(c, http.StatusOK, "获取所属组别状态成功", state)
}

func (h *UserGroupMembershipHandler) Confirm(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil || user.ID == 0 {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	var request confirmUserGroupRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请选择账号当前已有的有效组别")
		return
	}
	state, err := h.service.Confirm(c.Request.Context(), user.ID, request.GroupID)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "所属组别已确认", state)
}

func (h *UserGroupMembershipHandler) handleServiceError(c *gin.Context, err error) {
	var serviceErr *usergroup.ServiceError
	if errors.As(err, &serviceErr) {
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}
	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}
