package handler

import (
	"context"
	"encoding/json"
	"errors"
	"mime"
	"net/http"

	"github.com/gin-gonic/gin"
	"tarsgo-backend/middleware"
	"tarsgo-backend/service/workmanual"
)

type workManualService interface {
	OperationsCatalogue(ctx context.Context, actor workmanual.Actor) ([]byte, error)
	ApplicationForm(ctx context.Context, actor workmanual.Actor) (*workmanual.Download, error)
}

type WorkManualHandler struct {
	service workManualService
}

func NewWorkManualHandler(service workManualService) *WorkManualHandler {
	return &WorkManualHandler{service: service}
}

func (h *WorkManualHandler) OperationsCatalogue(c *gin.Context) {
	actor, ok := currentWorkManualActor(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	content, err := h.service.OperationsCatalogue(c.Request.Context(), actor)
	if err != nil {
		h.writeServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取运营组 SOP 成功", json.RawMessage(content))
}

func (h *WorkManualHandler) ApplicationForm(c *gin.Context) {
	actor, ok := currentWorkManualActor(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	file, err := h.service.ApplicationForm(c.Request.Context(), actor)
	if err != nil {
		h.writeServiceError(c, err)
		return
	}
	c.Header("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": file.FileName}))
	c.Data(http.StatusOK, file.ContentType, file.Content)
}

func currentWorkManualActor(c *gin.Context) (workmanual.Actor, bool) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil || user.ID == 0 {
		return workmanual.Actor{}, false
	}
	return workmanual.Actor{ID: user.ID, RoleName: user.Role.Name}, true
}

func (h *WorkManualHandler) writeServiceError(c *gin.Context, err error) {
	var serviceErr *workmanual.ServiceError
	if errors.As(err, &serviceErr) {
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}
	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}
