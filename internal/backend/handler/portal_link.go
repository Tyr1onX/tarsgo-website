package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/service/portal"
)

type linkRequest struct {
	Name            string   `json:"name"`
	URL             string   `json:"url"`
	IconKey         string   `json:"iconKey"`
	SortOrder       int      `json:"sortOrder"`
	IsEnabled       *bool    `json:"isEnabled"`
	OpenInNewWindow bool     `json:"openInNewWindow"`
	AudienceType    string   `json:"audienceType"`
	TargetGroupIDs  []uint64 `json:"targetGroupIds"`
}

func (h *PortalHandler) ListLinks(c *gin.Context) {
	items, err := h.service.ListLinks(c.Request.Context(), currentPortalActor(c))
	if err != nil {
		h.handleError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取快捷链接列表成功", gin.H{"items": items})
}
func (h *PortalHandler) GetLink(c *gin.Context) {
	id, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的快捷链接 ID")
		return
	}
	item, serviceErr := h.service.GetLink(c.Request.Context(), currentPortalActor(c), id)
	if serviceErr != nil {
		h.handleError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "获取快捷链接详情成功", item)
}
func (h *PortalHandler) CreateLink(c *gin.Context) {
	input, err := bindLink(c)
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, err.Error())
		return
	}
	item, serviceErr := h.service.CreateLink(c.Request.Context(), currentPortalActor(c), input)
	if serviceErr != nil {
		h.handleError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "创建快捷链接成功", item)
}
func (h *PortalHandler) UpdateLink(c *gin.Context) {
	id, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的快捷链接 ID")
		return
	}
	input, err := bindLink(c)
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, err.Error())
		return
	}
	item, serviceErr := h.service.UpdateLink(c.Request.Context(), currentPortalActor(c), id, input)
	if serviceErr != nil {
		h.handleError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "更新快捷链接成功", item)
}
func (h *PortalHandler) DeleteLink(c *gin.Context) {
	id, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的快捷链接 ID")
		return
	}
	if serviceErr := h.service.DeleteLink(c.Request.Context(), currentPortalActor(c), id); serviceErr != nil {
		h.handleError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "删除快捷链接成功", nil)
}
func bindLink(c *gin.Context) (portal.LinkInput, error) {
	var request linkRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		return portal.LinkInput{}, errors.New("请求参数不合法")
	}
	if request.IsEnabled == nil {
		return portal.LinkInput{}, errors.New("必须指定启用状态")
	}
	return portal.LinkInput{Name: request.Name, URL: request.URL, IconKey: request.IconKey, SortOrder: request.SortOrder, IsEnabled: *request.IsEnabled, OpenInNewWindow: request.OpenInNewWindow, AudienceType: request.AudienceType, TargetGroupIDs: request.TargetGroupIDs}, nil
}
