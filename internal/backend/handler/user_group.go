package handler

import (
	"context"
	"errors"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/middleware"
	"tarsgo-backend/service/usergroup"
)

type UserGroupHandler struct {
	service userGroupService
}

type userGroupService interface {
	ListGroups(ctx context.Context, actor usergroup.Actor, input usergroup.ListGroupsInput) (*usergroup.ListGroupsResult, error)
	ListGroupOptions(ctx context.Context, actor usergroup.Actor) ([]usergroup.GroupOption, error)
	CreateGroup(ctx context.Context, actor usergroup.Actor, input usergroup.CreateGroupInput) (*usergroup.GroupDetail, error)
	UpdateGroup(ctx context.Context, actor usergroup.Actor, groupID uint64, input usergroup.UpdateGroupInput) (*usergroup.GroupDetail, error)
}

type listUserGroupsQuery struct {
	Status string `form:"status"`
}

type upsertUserGroupRequest struct {
	Name        string   `json:"name" binding:"required,max=100"`
	Description string   `json:"description" binding:"omitempty,max=500"`
	Tags        []string `json:"tags"`
	IsDefault   bool     `json:"isDefault"`
	Show        uint8    `json:"show"`
	Status      uint8    `json:"status"`
}

type parsedUpsertUserGroupRequest struct {
	upsertUserGroupRequest
	Logo       *multipart.FileHeader
	RemoveLogo bool
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
			Status: status,
		},
	)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}

	writeAPI(c, http.StatusOK, "获取用户组列表成功", result)
}

func (h *UserGroupHandler) ListGroupOptions(c *gin.Context) {
	items, serviceErr := h.service.ListGroupOptions(c.Request.Context(), currentGroupActor(c))
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "获取用户组筛选项成功", gin.H{"items": items})
}

func (h *UserGroupHandler) CreateGroup(c *gin.Context) {
	request, err := parseUpsertUserGroupRequest(c)
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	group, serviceErr := h.service.CreateGroup(
		c.Request.Context(),
		currentGroupActor(c),
		usergroup.CreateGroupInput{
			Name:        request.Name,
			Description: request.Description,
			Logo:        request.Logo,
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

	request, err := parseUpsertUserGroupRequest(c)
	if err != nil {
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
			Logo:        request.Logo,
			RemoveLogo:  request.RemoveLogo,
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

func parseUpsertUserGroupRequest(c *gin.Context) (*parsedUpsertUserGroupRequest, error) {
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(c.ContentType())), "multipart/form-data") {
		return parseMultipartUpsertUserGroupRequest(c)
	}

	var request upsertUserGroupRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		return nil, err
	}

	return &parsedUpsertUserGroupRequest{upsertUserGroupRequest: request}, nil
}

func parseMultipartUpsertUserGroupRequest(c *gin.Context) (*parsedUpsertUserGroupRequest, error) {
	if err := c.Request.ParseMultipartForm(8 << 20); err != nil {
		return nil, err
	}

	show, err := parseRequiredUint8(c.PostForm("show"))
	if err != nil {
		return nil, err
	}
	status, err := parseRequiredUint8(c.PostForm("status"))
	if err != nil {
		return nil, err
	}
	isDefault, err := parseRequiredBool(c.PostForm("isDefault"))
	if err != nil {
		return nil, err
	}
	removeLogo, err := parseOptionalBool(c.PostForm("removeLogo"))
	if err != nil {
		return nil, err
	}

	var logo *multipart.FileHeader
	if c.Request.MultipartForm != nil {
		files := c.Request.MultipartForm.File["logo"]
		if len(files) > 1 {
			return nil, errors.New("too many logo files")
		}
		if len(files) == 1 {
			logo = files[0]
		}
	}

	return &parsedUpsertUserGroupRequest{
		upsertUserGroupRequest: upsertUserGroupRequest{
			Name:        c.PostForm("name"),
			Description: c.PostForm("description"),
			Tags:        c.PostFormArray("tags"),
			IsDefault:   isDefault,
			Show:        show,
			Status:      status,
		},
		Logo:       logo,
		RemoveLogo: removeLogo,
	}, nil
}

func parseRequiredUint8(raw string) (uint8, error) {
	value, err := strconv.ParseUint(strings.TrimSpace(raw), 10, 8)
	if err != nil {
		return 0, err
	}
	return uint8(value), nil
}

func parseRequiredBool(raw string) (bool, error) {
	value, err := strconv.ParseBool(strings.TrimSpace(raw))
	if err != nil {
		return false, err
	}
	return value, nil
}

func parseOptionalBool(raw string) (bool, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return false, nil
	}
	return parseRequiredBool(trimmed)
}
