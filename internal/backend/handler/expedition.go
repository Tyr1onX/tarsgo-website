package handler

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"tarsgo-backend/middleware"
	"tarsgo-backend/service/expedition"
)

type ExpeditionHandler struct{ service *expedition.Service }

func NewExpeditionHandler(service *expedition.Service) *ExpeditionHandler {
	return &ExpeditionHandler{service: service}
}

func (h *ExpeditionHandler) ListMine(c *gin.Context) {
	items, err := h.service.ListMine(c.Request.Context(), currentExpeditionActor(c))
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取协作项目成功", items)
}

func (h *ExpeditionHandler) CreateProject(c *gin.Context) {
	var input expedition.ProjectInput
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, http.StatusBadRequest, "协作项目内容不合法")
		return
	}
	item, err := h.service.CreateProject(c.Request.Context(), currentExpeditionActor(c), input)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusCreated, "协作项目已创建", item)
}

func (h *ExpeditionHandler) ListAdmin(c *gin.Context) {
	items, err := h.service.ListAdmin(c.Request.Context(), currentExpeditionActor(c))
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取可管理协作项目成功", items)
}

func (h *ExpeditionHandler) ListGroupMembers(c *gin.Context) {
	groupID, err := strconv.ParseUint(strings.TrimSpace(c.Query("groupId")), 10, 64)
	if err != nil || groupID == 0 {
		writeAPIError(c, http.StatusBadRequest, "组别编号不合法")
		return
	}
	items, err := h.service.ListGroupMembers(c.Request.Context(), currentExpeditionActor(c), groupID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取组内成员成功", items)
}

func (h *ExpeditionHandler) SubmitEvidence(c *gin.Context) {
	id, ok := parseExpeditionID(c.Param("id"))
	if !ok {
		writeAPIError(c, http.StatusBadRequest, "项目阶段编号不合法")
		return
	}
	var input expedition.EvidenceInput
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, http.StatusBadRequest, "成果内容不合法")
		return
	}
	item, err := h.service.SubmitEvidence(c.Request.Context(), currentExpeditionActor(c), id, input.Content)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "阶段成果已提交", item)
}

func (h *ExpeditionHandler) ReviewMilestone(c *gin.Context) {
	id, ok := parseExpeditionID(c.Param("id"))
	if !ok {
		writeAPIError(c, http.StatusBadRequest, "项目阶段编号不合法")
		return
	}
	var input expedition.ReviewInput
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, http.StatusBadRequest, "阶段验收内容不合法")
		return
	}
	item, err := h.service.ReviewMilestone(c.Request.Context(), currentExpeditionActor(c), id, input)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "阶段验收状态已更新", item)
}

func currentExpeditionActor(c *gin.Context) expedition.Actor {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil {
		return expedition.Actor{}
	}
	return expedition.Actor{ID: user.ID, RoleName: user.Role.Name}
}

func parseExpeditionID(raw string) (uint64, bool) {
	value, err := strconv.ParseUint(strings.TrimSpace(raw), 10, 64)
	return value, err == nil && value > 0
}

func (h *ExpeditionHandler) fail(c *gin.Context, err error) {
	var serviceErr *expedition.ServiceError
	if errors.As(err, &serviceErr) {
		if serviceErr.Status >= http.StatusInternalServerError {
			middleware.LogInternalError(c, "expedition", serviceErr.Status, err)
		}
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}
	middleware.LogInternalError(c, "expedition", http.StatusInternalServerError, err)
	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}
