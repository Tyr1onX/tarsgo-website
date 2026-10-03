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
	"tarsgo-backend/model"
	"tarsgo-backend/service/usergroup"
)

type UserGroupHandler struct {
	service userGroupService
}

type userGroupService interface {
	ListGroups(ctx context.Context, actor usergroup.Actor, input usergroup.ListGroupsInput) (*usergroup.ListGroupsResult, error)
	ListGroupOptions(ctx context.Context, actor usergroup.Actor) ([]usergroup.GroupOption, error)
	GetGroup(ctx context.Context, actor usergroup.Actor, groupID uint64) (*usergroup.GroupDetail, error)
	CreateGroup(ctx context.Context, actor usergroup.Actor, input usergroup.CreateGroupInput) (*usergroup.GroupDetail, error)
	UpdateGroup(ctx context.Context, actor usergroup.Actor, groupID uint64, input usergroup.UpdateGroupInput) (*usergroup.GroupDetail, error)
	UpdateAdmissionImage(ctx context.Context, actor usergroup.Actor, groupID uint64, input usergroup.UpdateAdmissionImageInput) (*usergroup.GroupDetail, error)
	DeleteGroup(ctx context.Context, actor usergroup.Actor, groupID uint64) error
	ListMemberCandidates(ctx context.Context, actor usergroup.Actor, groupID uint64) ([]usergroup.GroupCandidateItem, error)
	AddMember(ctx context.Context, actor usergroup.Actor, groupID uint64, input usergroup.AddMemberInput) (*usergroup.GroupMemberItem, error)
	UpdateMember(ctx context.Context, actor usergroup.Actor, groupID uint64, memberID uint64, input usergroup.UpdateMemberInput) (*usergroup.GroupMemberItem, error)
	RemoveMember(ctx context.Context, actor usergroup.Actor, groupID uint64, memberID uint64) error
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

type listMemberCandidatesQuery struct {
	GroupID uint64 `form:"groupId" binding:"required"`
	Email   string `form:"email"`
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

	items, err := h.service.ListMemberCandidates(c.Request.Context(), currentGroupActor(c), query.GroupID)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}

	if strings.TrimSpace(query.Email) != "" {
		email := strings.ToLower(strings.TrimSpace(query.Email))
		filtered := make([]usergroup.GroupCandidateItem, 0, 1)
		for _, item := range items {
			if strings.ToLower(item.Email) == email {
				filtered = append(filtered, item)
				break
			}
		}
		items = filtered
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
	_ = middleware.RecordBusinessActivity(c, middleware.ActivityInput{ActionKey: model.ActivityGroupMemberAdded, TargetUserID: &member.UserID, EntityType: "group_member", EntityID: member.ID, GroupID: &groupID})

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
	_ = middleware.RecordBusinessActivity(c, middleware.ActivityInput{ActionKey: model.ActivityGroupMemberRoleChanged, TargetUserID: &member.UserID, EntityType: "group_member", EntityID: member.ID, GroupID: &groupID, Metadata: map[string]any{"memberRole": int(request.Role)}})

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

	var targetUserID *uint64
	if group, loadErr := h.service.GetGroup(c.Request.Context(), currentGroupActor(c), groupID); loadErr == nil {
		for _, member := range group.Members {
			if member.ID == memberID {
				value := member.UserID
				targetUserID = &value
				break
			}
		}
	}
	if err := h.service.RemoveMember(c.Request.Context(), currentGroupActor(c), groupID, memberID); err != nil {
		h.handleServiceError(c, err)
		return
	}
	_ = middleware.RecordBusinessActivity(c, middleware.ActivityInput{ActionKey: model.ActivityGroupMemberRemoved, TargetUserID: targetUserID, EntityType: "group_member", EntityID: memberID, GroupID: &groupID})

	writeAPI(c, http.StatusOK, "移除成员成功", nil)
}

func (h *UserGroupHandler) managedGroupID(c *gin.Context) (uint64, bool) {
	actor := currentGroupActor(c)
	if actor.RoleName == model.RoleNameSuperAdmin {
		return 0, false
	}
	if actor.AdminScope != model.AdminScopeGroup || actor.ManagementGroupID == nil {
		writeAPIError(c, http.StatusForbidden, "当前账号没有管理组")
		return 0, false
	}
	return *actor.ManagementGroupID, true
}

func (h *UserGroupHandler) GetManagedGroup(c *gin.Context) {
	groupID, ok := h.managedGroupID(c)
	if !ok {
		return
	}
	group, err := h.service.GetGroup(c.Request.Context(), currentGroupActor(c), groupID)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	if currentGroupActor(c).GroupRole != "leader" && currentGroupActor(c).GroupRole != "group_admin" {
		group.Members = nil
	}
	writeAPI(c, http.StatusOK, "获取管理组信息成功", group)
}

func (h *UserGroupHandler) UpdateManagedGroupAdmissionImage(c *gin.Context) {
	groupID, ok := h.managedGroupID(c)
	if !ok {
		return
	}
	if err := c.Request.ParseMultipartForm(4 << 20); err != nil {
		writeAPIError(c, http.StatusBadRequest, "录取群图片参数不合法")
		return
	}

	removeImage, err := parseOptionalBool(c.PostForm("removeImage"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "移除图片参数不合法")
		return
	}
	var image *multipart.FileHeader
	if c.Request.MultipartForm != nil {
		files := c.Request.MultipartForm.File["image"]
		if len(files) > 1 {
			writeAPIError(c, http.StatusBadRequest, "一次只能上传一张录取群图片")
			return
		}
		if len(files) == 1 {
			image = files[0]
		}
	}

	group, serviceErr := h.service.UpdateAdmissionImage(c.Request.Context(), currentGroupActor(c), groupID, usergroup.UpdateAdmissionImageInput{
		Image: image, RemoveImage: removeImage,
	})
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "录取群图片已更新", group)
}

func (h *UserGroupHandler) ListManagedGroupMembers(c *gin.Context) {
	groupID, ok := h.managedGroupID(c)
	if !ok {
		return
	}
	group, err := h.service.GetGroup(c.Request.Context(), currentGroupActor(c), groupID)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	if currentGroupActor(c).GroupRole != "leader" && currentGroupActor(c).GroupRole != "group_admin" {
		writeAPIError(c, http.StatusForbidden, "组内管理员不能查看成员")
		return
	}
	writeAPI(c, http.StatusOK, "获取管理组成员成功", gin.H{"items": group.Members})
}

func (h *UserGroupHandler) ListManagedGroupCandidates(c *gin.Context) {
	groupID, ok := h.managedGroupID(c)
	if !ok {
		return
	}
	items, err := h.service.ListMemberCandidates(c.Request.Context(), currentGroupActor(c), groupID)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	if currentGroupActor(c).GroupRole != "leader" {
		writeAPIError(c, http.StatusForbidden, "组内管理员不能管理成员")
		return
	}
	writeAPI(c, http.StatusOK, "获取成员候选用户成功", gin.H{"items": items})
}

func (h *UserGroupHandler) AddManagedGroupMember(c *gin.Context) {
	groupID, ok := h.managedGroupID(c)
	if !ok {
		return
	}
	var request addGroupMemberRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}
	member, err := h.service.AddMember(c.Request.Context(), currentGroupActor(c), groupID, usergroup.AddMemberInput{UserID: request.UserID, Role: request.Role})
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "添加成员成功", member)
}

func (h *UserGroupHandler) UpdateManagedGroupMember(c *gin.Context) {
	groupID, ok := h.managedGroupID(c)
	if !ok {
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
	member, serviceErr := h.service.UpdateMember(c.Request.Context(), currentGroupActor(c), groupID, memberID, usergroup.UpdateMemberInput{Role: request.Role})
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "更新成员角色成功", member)
}

func (h *UserGroupHandler) RemoveManagedGroupMember(c *gin.Context) {
	groupID, ok := h.managedGroupID(c)
	if !ok {
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
		ID:                sessionUser.ID,
		RoleName:          sessionUser.Role.Name,
		AdminScope:        sessionUser.AdminScope,
		ManagementGroupID: sessionUser.ManagementGroupID,
		GroupRole:         sessionUser.GroupRole,
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
