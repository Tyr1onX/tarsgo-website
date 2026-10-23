package handler

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"tarsgo-backend/middleware"
	"tarsgo-backend/service/skills"
)

type SkillsHandler struct{ service *skills.Service }

func NewSkillsHandler(service *skills.Service) *SkillsHandler {
	return &SkillsHandler{service: service}
}

func (h *SkillsHandler) ListMine(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil || user.ID == 0 {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	result, err := h.service.ListMy(c.Request.Context(), user.ID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取个人技能路线成功", result)
}

func (h *SkillsHandler) Start(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil || user.ID == 0 {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	nodeID, valid := parseSkillID(c.Param("id"))
	if !valid {
		writeAPIError(c, http.StatusBadRequest, "技能编号不合法")
		return
	}
	item, err := h.service.Start(c.Request.Context(), user.ID, nodeID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "已开始技能挑战", item)
}

func (h *SkillsHandler) ListAdminGroups(c *gin.Context) {
	items, err := h.service.ListAdminGroups(c.Request.Context(), currentSkillsActor(c))
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取可管理组别成功", items)
}

func (h *SkillsHandler) ListAdminNodes(c *gin.Context) {
	groupID, ok := parseSkillQueryID(c, "groupId")
	if !ok {
		return
	}
	items, err := h.service.ListAdminNodes(c.Request.Context(), currentSkillsActor(c), groupID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取组内技能节点成功", items)
}

func (h *SkillsHandler) CreateNode(c *gin.Context) {
	var input skills.NodeInput
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, http.StatusBadRequest, "技能节点内容不合法")
		return
	}
	item, err := h.service.CreateNode(c.Request.Context(), currentSkillsActor(c), input)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusCreated, "技能节点已创建", item)
}

func (h *SkillsHandler) UpdateNode(c *gin.Context) {
	nodeID, ok := parseSkillPathID(c, "id")
	if !ok {
		return
	}
	var input skills.NodeInput
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, http.StatusBadRequest, "技能节点内容不合法")
		return
	}
	item, err := h.service.UpdateNode(c.Request.Context(), currentSkillsActor(c), nodeID, input)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "技能节点已更新", item)
}

func (h *SkillsHandler) SetActive(c *gin.Context) {
	nodeID, ok := parseSkillPathID(c, "id")
	if !ok {
		return
	}
	var request struct {
		Active *bool `json:"active"`
	}
	if err := c.ShouldBindJSON(&request); err != nil || request.Active == nil {
		writeAPIError(c, http.StatusBadRequest, "技能状态不合法")
		return
	}
	if err := h.service.SetActive(c.Request.Context(), currentSkillsActor(c), nodeID, *request.Active); err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "技能节点状态已更新", gin.H{"active": *request.Active})
}

func (h *SkillsHandler) DeleteNode(c *gin.Context) {
	nodeID, ok := parseSkillPathID(c, "id")
	if !ok {
		return
	}
	if err := h.service.DeleteNode(c.Request.Context(), currentSkillsActor(c), nodeID); err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "技能测试节点已删除", gin.H{"id": nodeID})
}

func (h *SkillsHandler) ReorderNodes(c *gin.Context) {
	groupID, ok := parseSkillPathID(c, "groupId")
	if !ok {
		return
	}
	var request struct {
		Orders []skills.NodeOrder `json:"orders"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "技能路线顺序参数不合法")
		return
	}
	if err := h.service.ReorderNodes(c.Request.Context(), currentSkillsActor(c), groupID, request.Orders); err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "技能路线已自动整理", gin.H{"updated": len(request.Orders)})
}

func (h *SkillsHandler) SetPrerequisites(c *gin.Context) {
	nodeID, ok := parseSkillPathID(c, "id")
	if !ok {
		return
	}
	var request struct {
		PrerequisiteIDs []uint64 `json:"prerequisiteIds"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "前置技能参数不合法")
		return
	}
	if err := h.service.SetPrerequisites(c.Request.Context(), currentSkillsActor(c), nodeID, request.PrerequisiteIDs); err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "前置技能已更新", gin.H{"prerequisiteIds": request.PrerequisiteIDs})
}

func (h *SkillsHandler) SetAssignments(c *gin.Context) {
	nodeID, ok := parseSkillPathID(c, "id")
	if !ok {
		return
	}
	var request struct {
		AssignmentIDs []uint64 `json:"assignmentIds"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "训练作业参数不合法")
		return
	}
	if err := h.service.SetAssignments(c.Request.Context(), currentSkillsActor(c), nodeID, request.AssignmentIDs); err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "关联训练作业已更新", gin.H{"assignmentIds": request.AssignmentIDs})
}

func (h *SkillsHandler) ListMembers(c *gin.Context) {
	groupID, ok := parseSkillQueryID(c, "groupId")
	if !ok {
		return
	}
	nodeID, ok := parseSkillQueryID(c, "skillNodeId")
	if !ok {
		return
	}
	items, err := h.service.ListAdminMembers(c.Request.Context(), currentSkillsActor(c), groupID, nodeID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取技能挑战成员成功", items)
}

func (h *SkillsHandler) MemberHistory(c *gin.Context) {
	nodeID, ok := parseSkillPathID(c, "id")
	if !ok {
		return
	}
	userID, ok := parseSkillPathID(c, "userId")
	if !ok {
		return
	}
	items, err := h.service.MemberHistory(c.Request.Context(), currentSkillsActor(c), nodeID, userID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取技能审核历史成功", items)
}

func (h *SkillsHandler) Review(c *gin.Context) {
	nodeID, ok := parseSkillPathID(c, "id")
	if !ok {
		return
	}
	userID, ok := parseSkillPathID(c, "userId")
	if !ok {
		return
	}
	var input skills.ReviewInput
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, http.StatusBadRequest, "技能审核内容不合法")
		return
	}
	items, err := h.service.Review(c.Request.Context(), currentSkillsActor(c), nodeID, userID, input)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "技能审核记录已保存", items)
}

func currentSkillsActor(c *gin.Context) skills.Actor {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil {
		return skills.Actor{}
	}
	return skills.Actor{ID: user.ID, RoleName: user.Role.Name}
}

func parseSkillID(raw string) (uint64, bool) {
	value, err := strconv.ParseUint(strings.TrimSpace(raw), 10, 64)
	return value, err == nil && value > 0
}

func parseSkillPathID(c *gin.Context, key string) (uint64, bool) {
	value, ok := parseSkillID(c.Param(key))
	if !ok {
		writeAPIError(c, http.StatusBadRequest, "技能或成员编号不合法")
	}
	return value, ok
}

func parseSkillQueryID(c *gin.Context, key string) (uint64, bool) {
	value, ok := parseSkillID(c.Query(key))
	if !ok {
		writeAPIError(c, http.StatusBadRequest, "技能组别或节点参数不合法")
	}
	return value, ok
}

func (h *SkillsHandler) fail(c *gin.Context, err error) {
	var serviceErr *skills.ServiceError
	if errors.As(err, &serviceErr) {
		if serviceErr.Status >= http.StatusInternalServerError {
			middleware.LogInternalError(c, "skills", serviceErr.Status, err)
		}
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}
	middleware.LogInternalError(c, "skills", http.StatusInternalServerError, err)
	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}
