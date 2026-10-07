package handler

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/middleware"
	"tarsgo-backend/model"
	"tarsgo-backend/service/adminuser"
)

type AdminUserHandler struct {
	service adminUserService
}

type adminUserService interface {
	ListUsers(ctx context.Context, actor adminuser.Actor, input adminuser.ListUsersInput) (*adminuser.ListUsersResult, error)
	GetUser(ctx context.Context, actor adminuser.Actor, userID uint64) (*adminuser.UserDetail, error)
	ListRoles(ctx context.Context, actor adminuser.Actor) ([]adminuser.RoleOption, error)
	CreateUser(ctx context.Context, actor adminuser.Actor, input adminuser.CreateUserInput) (*adminuser.UserDetail, error)
	UpdateUser(ctx context.Context, actor adminuser.Actor, userID uint64, input adminuser.UpdateUserInput) (*adminuser.UserDetail, error)
	UpdateCurrentRecruitmentGroup(ctx context.Context, actor adminuser.Actor, userID uint64, groupID uint64) (*adminuser.UserDetail, error)
	ResetPassword(ctx context.Context, actor adminuser.Actor, userID uint64, password string) error
}

type listUsersQuery struct {
	Page     int    `form:"page"`
	PageSize int    `form:"pageSize"`
	Keyword  string `form:"keyword"`
	Role     string `form:"role"`
	Status   string `form:"status"`
}

type createUserRequest struct {
	RoleID   uint64 `json:"roleId" binding:"required"`
	Name     string `json:"name" binding:"required,max=100"`
	Email    string `json:"email" binding:"required,email,max=255"`
	Password string `json:"password" binding:"required,min=6,max=72"`
}

type updateUserRequest struct {
	RoleID uint64 `json:"roleId" binding:"required"`
	Name   string `json:"name" binding:"required,max=100"`
	Email  string `json:"email" binding:"required,email,max=255"`
	Status uint8  `json:"status"`
}

type resetPasswordRequest struct {
	Password string `json:"password" binding:"required,min=6,max=72"`
}

type updateRecruitmentGroupRequest struct {
	GroupID uint64 `json:"groupId" binding:"required"`
}

func NewAdminUserHandler(service adminUserService) *AdminUserHandler {
	return &AdminUserHandler{service: service}
}

func (h *AdminUserHandler) ListUsers(c *gin.Context) {
	var query listUsersQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		writeAPIError(c, http.StatusBadRequest, "查询参数不合法")
		return
	}

	status, err := parseOptionalStatus(query.Status)
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, err.Error())
		return
	}
	result, serviceErr := h.service.ListUsers(
		c.Request.Context(),
		currentActor(c),
		adminuser.ListUsersInput{
			Page:     query.Page,
			PageSize: query.PageSize,
			Keyword:  query.Keyword,
			Role:     query.Role,
			Status:   status,
		},
	)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}

	writeAPI(c, http.StatusOK, "获取用户列表成功", result)
}

func (h *AdminUserHandler) GetUser(c *gin.Context) {
	userID, err := parsePathUserID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的用户 ID")
		return
	}

	user, serviceErr := h.service.GetUser(c.Request.Context(), currentActor(c), userID)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}

	writeAPI(c, http.StatusOK, "获取用户详情成功", user)
}

func (h *AdminUserHandler) ListRoles(c *gin.Context) {
	roles, err := h.service.ListRoles(c.Request.Context(), currentActor(c))
	if err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "获取角色列表成功", gin.H{"items": roles})
}

func (h *AdminUserHandler) CreateUser(c *gin.Context) {
	var request createUserRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	user, serviceErr := h.service.CreateUser(
		c.Request.Context(),
		currentActor(c),
		adminuser.CreateUserInput{
			RoleID:   request.RoleID,
			Name:     request.Name,
			Email:    request.Email,
			Password: request.Password,
		},
	)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}
	_ = middleware.RecordBusinessActivity(c, middleware.ActivityInput{ActionKey: model.ActivityUserCreated, TargetUserID: &user.ID, EntityType: "user", EntityID: user.ID})

	writeAPI(c, http.StatusOK, "创建用户成功", user)
}

func (h *AdminUserHandler) UpdateUser(c *gin.Context) {
	userID, err := parsePathUserID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的用户 ID")
		return
	}

	var request updateUserRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	user, serviceErr := h.service.UpdateUser(
		c.Request.Context(),
		currentActor(c),
		userID,
		adminuser.UpdateUserInput{
			RoleID: request.RoleID,
			Name:   request.Name,
			Email:  request.Email,
			Status: request.Status,
		},
	)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}

	writeAPI(c, http.StatusOK, "更新用户成功", user)
}

func (h *AdminUserHandler) UpdateRecruitmentGroup(c *gin.Context) {
	userID, err := parsePathUserID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的用户 ID")
		return
	}
	var request updateRecruitmentGroupRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "招新组别不合法")
		return
	}
	user, serviceErr := h.service.UpdateCurrentRecruitmentGroup(c.Request.Context(), currentActor(c), userID, request.GroupID)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "招新意向组已修正", user)
}

func (h *AdminUserHandler) ResetPassword(c *gin.Context) {
	userID, err := parsePathUserID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "无效的用户 ID")
		return
	}

	var request resetPasswordRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	if err := h.service.ResetPassword(c.Request.Context(), currentActor(c), userID, request.Password); err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "重置密码成功", nil)
}

func (h *AdminUserHandler) handleServiceError(c *gin.Context, err error) {
	var serviceErr *adminuser.ServiceError
	if errors.As(err, &serviceErr) {
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}

	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}

func currentActor(c *gin.Context) adminuser.Actor {
	sessionUser, ok := middleware.CurrentSessionUser(c)
	if !ok || sessionUser == nil {
		return adminuser.Actor{}
	}

	return adminuser.Actor{
		RoleName: sessionUser.Role.Name,
	}
}

func parseOptionalStatus(raw string) (*uint8, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, nil
	}

	value, err := strconv.ParseUint(trimmed, 10, 8)
	if err != nil || value > 1 {
		return nil, errors.New("状态筛选值不合法")
	}
	status := uint8(value)
	return &status, nil
}

func parsePathUserID(raw string) (uint64, error) {
	value, err := strconv.ParseUint(strings.TrimSpace(raw), 10, 64)
	if err != nil || value == 0 {
		return 0, errors.New("invalid user id")
	}
	return value, nil
}
