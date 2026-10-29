package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"tarsgo-backend/middleware"
	"tarsgo-backend/service/cultivation"
)

type CultivationHandler struct{ service *cultivation.Service }

func NewCultivationHandler(service *cultivation.Service) *CultivationHandler {
	return &CultivationHandler{service: service}
}

func (h *CultivationHandler) Group(c *gin.Context) {
	groupID, ok := parseCultivationID(c.Query("groupId"))
	if !ok {
		writeAPIError(c, http.StatusBadRequest, "培养组别参数不合法")
		return
	}
	result, err := h.service.Group(c.Request.Context(), currentCultivationActor(c), groupID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取组内培养视图成功", result)
}

func (h *CultivationHandler) Member(c *gin.Context) {
	groupID, ok := parseCultivationID(c.Param("groupId"))
	if !ok {
		writeAPIError(c, http.StatusBadRequest, "培养组别参数不合法")
		return
	}
	userID, ok := parseCultivationID(c.Param("userId"))
	if !ok {
		writeAPIError(c, http.StatusBadRequest, "成员参数不合法")
		return
	}
	result, err := h.service.Member(c.Request.Context(), currentCultivationActor(c), groupID, userID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取成员成长档案成功", result)
}

func (h *CultivationHandler) UpdateFocus(c *gin.Context) {
	groupID, ok := parseCultivationID(c.Param("groupId"))
	if !ok {
		writeAPIError(c, http.StatusBadRequest, "培养组别参数不合法")
		return
	}
	userID, ok := parseCultivationID(c.Param("userId"))
	if !ok {
		writeAPIError(c, http.StatusBadRequest, "成员参数不合法")
		return
	}
	var input cultivation.FocusInput
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, http.StatusBadRequest, "培养记录内容不合法")
		return
	}
	if err := h.service.UpdateFocus(c.Request.Context(), currentCultivationActor(c), groupID, userID, input); err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "内部培养记录已保存", gin.H{"groupId": groupID, "userId": userID})
}

func currentCultivationActor(c *gin.Context) cultivation.Actor {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil {
		return cultivation.Actor{}
	}
	return cultivation.Actor{ID: user.ID, RoleName: user.Role.Name}
}

func parseCultivationID(value string) (uint64, bool) {
	parsed, err := strconv.ParseUint(value, 10, 64)
	return parsed, err == nil && parsed > 0
}

func (h *CultivationHandler) fail(c *gin.Context, err error) {
	var serviceErr *cultivation.ServiceError
	if errors.As(err, &serviceErr) {
		if serviceErr.Status >= http.StatusInternalServerError {
			middleware.LogInternalError(c, "cultivation", serviceErr.Status, err)
		}
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}
	middleware.LogInternalError(c, "cultivation", http.StatusInternalServerError, err)
	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}
