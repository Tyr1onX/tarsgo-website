package handler

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/middleware"
	"tarsgo-backend/usergroup"
)

type UserGroupHandler struct {
	service userGroupService
}

type userGroupService interface {
	ListGroups(ctx context.Context, actor usergroup.Actor, input usergroup.ListGroupsInput) (*usergroup.ListGroupsResult, error)
	GetGroup(ctx context.Context, actor usergroup.Actor, groupID uint64) (*usergroup.GroupDetail, error)
	CreateGroup(ctx context.Context, actor usergroup.Actor, input usergroup.CreateGroupInput) (*usergroup.GroupDetail, error)
	UpdateGroup(ctx context.Context, actor usergroup.Actor, groupID uint64, input usergroup.UpdateGroupInput) (*usergroup.GroupDetail, error)
	DeleteGroup(ctx context.Context, actor usergroup.Actor, groupID uint64) error
	ListMemberCandidates(ctx context.Context, actor usergroup.Actor, groupID uint64, keyword string) ([]usergroup.GroupCandidateItem, error)
	AddMember(ctx context.Context, actor usergroup.Actor, groupID uint64, input usergroup.AddMemberInput) (*usergroup.GroupMemberItem, error)
	UpdateMember(ctx context.Context, actor usergroup.Actor, groupID uint64, memberID uint64, input usergroup.UpdateMemberInput) (*usergroup.GroupMemberItem, error)
	RemoveMember(ctx context.Context, actor usergroup.Actor, groupID uint64, memberID uint64) error
}

type listUserGroupsQuery struct {
	Page     int    `form:"page"`
	PageSize int    `form:"pageSize"`
	Keyword  string `form:"keyword"`
	Status   string `form:"status"`
}

type upsertUserGroupRequest struct {
	Name        string   `json:"name" binding:"required,max=100"`
	Description string   `json:"description" binding:"omitempty,max=500"`
	Tags        []string `json:"tags"`
	IsDefault   bool     `json:"isDefault"`
	Show        uint8    `json:"show"`
	Status      uint8    `json:"status"`
}

type listMemberCandidatesQuery struct {
	GroupID uint64 `form:"groupId" binding:"required"`
	Keyword string `form:"keyword"`
}

type addGroupMemberRequest struct {
	UserID uint64 `json:"userId" binding:"required"`
	Role   uint8  `json:"role"`
}

type updateGroupMemberRequest struct {
	Role uint8 `json:"role"`
}

func NewUserGroupHandler(service userGroupService) *UserGroupHandler {
	return &UserGroupHandler{service: service}
}

func (h *UserGroupHandler) ListGroups(c *gin.Context) {
	var query listUserGroupsQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		writeAPIError(c, http.StatusBadRequest, "查询参数不合法")
		return
	}

	status, err := parseOptionalGroupStatus(query.Status)
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, err.Error())
		return
	}

	result, serviceErr := h.service.ListGroups(
		c.Request.Context(),
		currentGroupActor(c),
		usergroup.ListGroupsInput{
			Page:     query.Page,
			PageSize: query.PageSize,
			Keyword:  query.Keyword,
			Status:   status,
		},
	)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}

	writeAPI(c, http.StatusOK, "获取用户组列表成功", result)
}

func (h *UserGroupHandler) GetGroup(c *gin.Context) {
	groupID, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的用户组 ID")
		return
	}

	group, serviceErr := h.service.GetGroup(c.Request.Context(), currentGroupActor(c), groupID)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}

	writeAPI(c, http.StatusOK, "获取用户组详情成功", group)
}

func (h *UserGroupHandler) CreateGroup(c *gin.Context) {
	var request upsertUserGroupRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	group, serviceErr := h.service.CreateGroup(
		c.Request.Context(),
		currentGroupActor(c),
		usergroup.CreateGroupInput{
			Name:        request.Name,
			Description: request.Description,
			Tags:        request.Tags,
			IsDefault:   request.IsDefault,
			Show:        request.Show,
			Status:      request.Status,
		},
	)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}

	writeAPI(c, http.StatusOK, "创建用户组成功", group)
}

func (h *UserGroupHandler) UpdateGroup(c *gin.Context) {
	groupID, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的用户组 ID")
		return
	}

	var request upsertUserGroupRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	group, serviceErr := h.service.UpdateGroup(
		c.Request.Context(),
		currentGroupActor(c),
		groupID,
		usergroup.UpdateGroupInput{
			Name:        request.Name,
			Description: request.Description,
			Tags:        request.Tags,
			IsDefault:   request.IsDefault,
			Show:        request.Show,
			Status:      request.Status,
		},
	)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}

	writeAPI(c, http.StatusOK, "更新用户组成功", group)
}

func (h *UserGroupHandler) DeleteGroup(c *gin.Context) {
	groupID, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的用户组 ID")
		return
	}

	if err := h.service.DeleteGroup(c.Request.Context(), currentGroupActor(c), groupID); err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "删除用户组成功", nil)
}

func (h *UserGroupHandler) ListMemberCandidates(c *gin.Context) {
	var query listMemberCandidatesQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		writeAPIError(c, http.StatusBadRequest, "查询参数不合法")
		return
	}

	items, err := h.service.ListMemberCandidates(c.Request.Context(), currentGroupActor(c), query.GroupID, query.Keyword)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "获取成员候选用户成功", gin.H{"items": items})
}

func (h *UserGroupHandler) AddMember(c *gin.Context) {
	groupID, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的用户组 ID")
		return
	}

	var request addGroupMemberRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	member, serviceErr := h.service.AddMember(
		c.Request.Context(),
		currentGroupActor(c),
		groupID,
		usergroup.AddMemberInput{
			UserID: request.UserID,
			Role:   request.Role,
		},
	)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}

	writeAPI(c, http.StatusOK, "添加成员成功", member)
}

func (h *UserGroupHandler) UpdateMember(c *gin.Context) {
	groupID, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的用户组 ID")
		return
	}
	memberID, err := parsePathID(c.Param("memberId"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的成员 ID")
		return
	}

	var request updateGroupMemberRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	member, serviceErr := h.service.UpdateMember(
		c.Request.Context(),
		currentGroupActor(c),
		groupID,
		memberID,
		usergroup.UpdateMemberInput{Role: request.Role},
	)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}

	writeAPI(c, http.StatusOK, "更新成员角色成功", member)
}

func (h *UserGroupHandler) RemoveMember(c *gin.Context) {
	groupID, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的用户组 ID")
		return
	}
	memberID, err := parsePathID(c.Param("memberId"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的成员 ID")
		return
	}

	if err := h.service.RemoveMember(c.Request.Context(), currentGroupActor(c), groupID, memberID); err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "移除成员成功", nil)
}

func (h *UserGroupHandler) handleServiceError(c *gin.Context, err error) {
	var serviceErr *usergroup.ServiceError
	if errors.As(err, &serviceErr) {
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}

	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}

func currentGroupActor(c *gin.Context) usergroup.Actor {
	sessionUser, ok := middleware.CurrentSessionUser(c)
	if !ok || sessionUser == nil {
		return usergroup.Actor{}
	}

	return usergroup.Actor{
		ID:       sessionUser.ID,
		RoleName: sessionUser.Role.Name,
	}
}

func parseOptionalGroupStatus(raw string) (*uint8, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, nil
	}

	value, err := strconv.ParseUint(trimmed, 10, 8)
	if err != nil || value > 1 {
		return nil, errors.New("用户组状态筛选值不合法")
	}

	status := uint8(value)
	return &status, nil
}

func parsePathID(raw string) (uint64, error) {
	value, err := strconv.ParseUint(strings.TrimSpace(raw), 10, 64)
	if err != nil || value == 0 {
		return 0, errors.New("invalid id")
	}
	return value, nil
}
