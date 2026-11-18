package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"tarsgo-backend/middleware"
	"tarsgo-backend/model"
	"tarsgo-backend/service/operationssync"
)

type OperationsDouyinHandler struct{ client *operationssync.Douyin }

func NewOperationsDouyinHandler(client *operationssync.Douyin) *OperationsDouyinHandler {
	return &OperationsDouyinHandler{client: client}
}

func (h *OperationsDouyinHandler) superAdmin(c *gin.Context) (uint64, bool) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil || user.Role.Name != model.RoleNameSuperAdmin {
		writeAPIError(c, http.StatusForbidden, "只有超级管理员可以连接抖音账号")
		return 0, false
	}
	return user.ID, true
}

func (h *OperationsDouyinHandler) Status(c *gin.Context) {
	user, _ := middleware.CurrentSessionUser(c)
	enabled := user != nil && user.Role.Name == model.RoleNameSuperAdmin && h.client != nil
	writeAPI(c, http.StatusOK, "抖音自动同步", gin.H{
		"enabled":   enabled,
		"connected": enabled && h.client.Connected(c.Request.Context()),
	})
}

func (h *OperationsDouyinHandler) Authorize(c *gin.Context) {
	id, ok := h.superAdmin(c)
	if !ok {
		return
	}
	if h.client == nil {
		writeAPIError(c, http.StatusServiceUnavailable, "尚未配置抖音开放平台应用")
		return
	}
	c.Redirect(http.StatusFound, h.client.AuthorizeURL(id))
}

func (h *OperationsDouyinHandler) Callback(c *gin.Context) {
	id, ok := h.superAdmin(c)
	if !ok {
		return
	}
	if h.client == nil {
		writeAPIError(c, http.StatusServiceUnavailable, "尚未配置抖音开放平台应用")
		return
	}
	if c.Query("error") != "" {
		writeAPIError(c, http.StatusBadRequest, "抖音账号授权未完成")
		return
	}
	if err := h.client.Connect(c.Request.Context(), id, c.Query("state"), strings.TrimSpace(c.Query("code"))); err != nil {
		writeAPIError(c, http.StatusBadGateway, "抖音连接失败："+err.Error())
		return
	}
	c.Redirect(http.StatusFound, "/dashboard/workbench/operations?douyin=connected")
}
