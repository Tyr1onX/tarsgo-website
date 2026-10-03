package handler

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/middleware"
	"tarsgo-backend/service/portal"
)

type portalService interface {
	ListAnnouncements(context.Context, portal.Actor, portal.ListAnnouncementsInput) (*portal.AnnouncementList, error)
	GetAnnouncement(context.Context, portal.Actor, uint64) (*portal.AnnouncementItem, error)
	CreateAnnouncement(context.Context, portal.Actor, portal.AnnouncementInput) (*portal.AnnouncementItem, error)
	UpdateAnnouncement(context.Context, portal.Actor, uint64, portal.AnnouncementInput) (*portal.AnnouncementItem, error)
	DeleteAnnouncement(context.Context, portal.Actor, uint64) error
	GetHome(context.Context, portal.Actor) (*portal.HomeData, error)
	ListEvents(context.Context, portal.Actor, portal.ListEventsInput) (*portal.EventList, error)
	GetEvent(context.Context, portal.Actor, uint64) (*portal.EventItem, error)
	CreateEvent(context.Context, portal.Actor, portal.EventInput) (*portal.EventItem, error)
	UpdateEvent(context.Context, portal.Actor, uint64, portal.EventInput) (*portal.EventItem, error)
	DeleteEvent(context.Context, portal.Actor, uint64) error
	ListLinks(context.Context, portal.Actor) ([]portal.LinkItem, error)
	GetLink(context.Context, portal.Actor, uint64) (*portal.LinkItem, error)
	CreateLink(context.Context, portal.Actor, portal.LinkInput) (*portal.LinkItem, error)
	UpdateLink(context.Context, portal.Actor, uint64, portal.LinkInput) (*portal.LinkItem, error)
	DeleteLink(context.Context, portal.Actor, uint64) error
	ListManagedGroups(context.Context, portal.Actor) ([]portal.ManagedGroupItem, error)
}

type PortalHandler struct{ service portalService }

type announcementRequest struct {
	Title          string   `json:"title"`
	Summary        string   `json:"summary"`
	Content        string   `json:"content"`
	Category       string   `json:"category"`
	Status         string   `json:"status"`
	IsPinned       bool     `json:"isPinned"`
	PublishAt      *string  `json:"publishAt"`
	ExpireAt       *string  `json:"expireAt"`
	AudienceType   string   `json:"audienceType"`
	TargetGroupIDs []uint64 `json:"targetGroupIds"`
}

func NewPortalHandler(service portalService) *PortalHandler { return &PortalHandler{service: service} }

func (h *PortalHandler) ListManagedGroups(c *gin.Context) {
	items, serviceErr := h.service.ListManagedGroups(c.Request.Context(), currentPortalActor(c))
	if serviceErr != nil {
		h.handleError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "获取负责用户组成功", gin.H{"items": items})
}

func (h *PortalHandler) ListAnnouncements(c *gin.Context) {
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
	result, serviceErr := h.service.ListAnnouncements(c.Request.Context(), currentPortalActor(c), portal.ListAnnouncementsInput{
		Status: strings.TrimSpace(c.Query("status")), Page: page, PageSize: pageSize,
	})
	if serviceErr != nil {
		h.handleError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "获取公告列表成功", result)
}

func (h *PortalHandler) GetAnnouncement(c *gin.Context) {
	id, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的公告 ID")
		return
	}
	result, serviceErr := h.service.GetAnnouncement(c.Request.Context(), currentPortalActor(c), id)
	if serviceErr != nil {
		h.handleError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "获取公告详情成功", result)
}

func (h *PortalHandler) CreateAnnouncement(c *gin.Context) {
	input, err := bindAnnouncement(c)
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, err.Error())
		return
	}
	result, serviceErr := h.service.CreateAnnouncement(c.Request.Context(), currentPortalActor(c), input)
	if serviceErr != nil {
		h.handleError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "创建公告成功", result)
}

func (h *PortalHandler) UpdateAnnouncement(c *gin.Context) {
	id, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的公告 ID")
		return
	}
	input, err := bindAnnouncement(c)
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, err.Error())
		return
	}
	result, serviceErr := h.service.UpdateAnnouncement(c.Request.Context(), currentPortalActor(c), id, input)
	if serviceErr != nil {
		h.handleError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "更新公告成功", result)
}

func (h *PortalHandler) DeleteAnnouncement(c *gin.Context) {
	id, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的公告 ID")
		return
	}
	if serviceErr := h.service.DeleteAnnouncement(c.Request.Context(), currentPortalActor(c), id); serviceErr != nil {
		h.handleError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "删除公告成功", nil)
}

func (h *PortalHandler) GetHome(c *gin.Context) {
	result, err := h.service.GetHome(c.Request.Context(), currentPortalActor(c))
	if err != nil {
		h.handleError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取主页数据成功", result)
}

func (h *PortalHandler) handleError(c *gin.Context, err error) {
	var serviceErr *portal.ServiceError
	if errors.As(err, &serviceErr) {
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}
	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}

func currentPortalActor(c *gin.Context) portal.Actor {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil {
		return portal.Actor{}
	}
	return portal.Actor{ID: user.ID, RoleName: user.Role.Name, AdminScope: user.AdminScope, ManagementGroupID: user.ManagementGroupID, GroupRole: user.GroupRole}
}

func bindAnnouncement(c *gin.Context) (portal.AnnouncementInput, error) {
	var request announcementRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		return portal.AnnouncementInput{}, errors.New("请求参数不合法")
	}
	publishAt, err := parseOptionalRFC3339(request.PublishAt)
	if err != nil {
		return portal.AnnouncementInput{}, errors.New("发布时间格式不合法")
	}
	expireAt, err := parseOptionalRFC3339(request.ExpireAt)
	if err != nil {
		return portal.AnnouncementInput{}, errors.New("失效时间格式不合法")
	}
	return portal.AnnouncementInput{
		Title: request.Title, Summary: request.Summary, Content: request.Content, Category: request.Category,
		Status: request.Status, IsPinned: request.IsPinned, PublishAt: publishAt, ExpireAt: expireAt,
		AudienceType: request.AudienceType, TargetGroupIDs: request.TargetGroupIDs,
	}, nil
}

func parseOptionalRFC3339(raw *string) (*time.Time, error) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return nil, nil
	}
	value, err := time.Parse(time.RFC3339, strings.TrimSpace(*raw))
	if err != nil {
		return nil, err
	}
	return &value, nil
}

func positiveQueryInt(raw string, fallback int) (int, error) {
	if strings.TrimSpace(raw) == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 1 {
		return 0, errors.New("invalid positive integer")
	}
	return value, nil
}
