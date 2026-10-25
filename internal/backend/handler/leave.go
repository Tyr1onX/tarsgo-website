package handler

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"

	"github.com/gin-gonic/gin"
	"tarsgo-backend/middleware"
	"tarsgo-backend/model"
	"tarsgo-backend/service/leave"
)

type LeaveHandler struct{ service *leave.Service }

func NewLeaveHandler(service *leave.Service) *LeaveHandler { return &LeaveHandler{service: service} }

func (h *LeaveHandler) Colleges(c *gin.Context) {
	writeAPI(c, http.StatusOK, "获取学院列表成功", h.service.Colleges())
}

func (h *LeaveHandler) GetLeaveAccess(c *gin.Context) {
	userID, ok := leaveUserID(c)
	if !ok {
		return
	}
	state, err := h.service.LeaveAccessState(c.Request.Context(), userID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取请假开通状态成功", state)
}

func (h *LeaveHandler) RequestLeaveAccess(c *gin.Context) {
	userID, ok := leaveUserID(c)
	if !ok {
		return
	}
	state, err := h.service.RequestLeaveAccess(c.Request.Context(), userID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "请假开通申请已提交", state)
}

func (h *LeaveHandler) ListPendingLeaveAccessRequests(c *gin.Context) {
	rows, err := h.service.ListPendingLeaveAccessRequests(c.Request.Context())
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取请假开通申请成功", rows)
}

func (h *LeaveHandler) ReviewLeaveAccessRequest(c *gin.Context) {
	adminID, ok := leaveUserID(c)
	if !ok {
		return
	}
	requestID, ok := pathID(c, "id")
	if !ok {
		return
	}
	var input struct {
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, http.StatusBadRequest, "审核结果无效")
		return
	}
	state, err := h.service.ReviewLeaveAccessRequest(c.Request.Context(), requestID, adminID, input.Status)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "请假开通申请已审核", state)
}

func (h *LeaveHandler) GetProfile(c *gin.Context) {
	userID, ok := leaveUserID(c)
	if !ok {
		return
	}
	profile, err := h.service.GetProfile(c.Request.Context(), userID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取请假资料成功", profile)
}

func (h *LeaveHandler) SaveProfile(c *gin.Context) {
	userID, ok := leaveUserID(c)
	if !ok {
		return
	}
	var input leave.ProfileInput
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请假资料不完整")
		return
	}
	profile, err := h.service.SaveProfile(c.Request.Context(), userID, input)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "请假资料已保存", profile)
}

func (h *LeaveHandler) MyRequests(c *gin.Context) {
	id, ok := leaveUserID(c)
	if !ok {
		return
	}
	rows, err := h.service.ListMyRequests(c.Request.Context(), id)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取请假申请成功", rows)
}
func (h *LeaveHandler) CreateRequest(c *gin.Context) {
	id, ok := leaveUserID(c)
	if !ok {
		return
	}
	var input leave.RequestInput
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请假时间不完整")
		return
	}
	row, err := h.service.CreateRequest(c.Request.Context(), id, input)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusCreated, "请假申请已提交", row)
}
func (h *LeaveHandler) UpdateRequest(c *gin.Context) {
	id, ok := leaveUserID(c)
	if !ok {
		return
	}
	requestID, ok := pathID(c, "id")
	if !ok {
		return
	}
	var input leave.RequestInput
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请假时间不完整")
		return
	}
	row, err := h.service.UpdateRequest(c.Request.Context(), id, requestID, input)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "请假申请已更新", row)
}
func (h *LeaveHandler) WithdrawRequest(c *gin.Context) {
	id, ok := leaveUserID(c)
	if !ok {
		return
	}
	requestID, ok := pathID(c, "id")
	if !ok {
		return
	}
	row, err := h.service.WithdrawRequest(c.Request.Context(), id, requestID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "请假申请已撤回", row)
}

func (h *LeaveHandler) AdminSchoolSummary(c *gin.Context) {
	id, ok := leaveUserID(c)
	if !ok {
		return
	}
	actor, _ := middleware.CurrentSessionUser(c)
	canReviewAccessRequests := actor != nil && actor.Role.Name == model.RoleNameSuperAdmin
	summary, err := h.service.Summary(c.Request.Context(), id, canReviewAccessRequests)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取请假汇总成功", summary)
}
func (h *LeaveHandler) AdminSchoolRequests(c *gin.Context) {
	adminID, ok := leaveUserID(c)
	if !ok {
		return
	}
	rows, err := h.service.ListAdminRequests(c.Request.Context(), adminID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取请假申请成功", rows)
}
func (h *LeaveHandler) AdminSchoolRuns(c *gin.Context) {
	rows, err := h.service.ListRuns(c.Request.Context())
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取请假历史成功", rows)
}
func (h *LeaveHandler) CollectSchoolRequests(c *gin.Context) {
	id, ok := leaveUserID(c)
	if !ok {
		return
	}
	run, err := h.service.Collect(c.Request.Context(), id)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "请假申请已汇总", run)
}
func (h *LeaveHandler) SchoolRunDetail(c *gin.Context) {
	id, ok := pathID(c, "id")
	if !ok {
		return
	}
	run, err := h.service.RunDetail(c.Request.Context(), id)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取请假汇总成功", run)
}
func (h *LeaveHandler) UpdateSchoolRunReason(c *gin.Context) {
	id, ok := pathID(c, "id")
	if !ok {
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	if c.ShouldBindJSON(&body) != nil {
		writeAPIError(c, 400, "请假事由不合法")
		return
	}
	run, err := h.service.UpdateRunReason(c.Request.Context(), id, body.Reason)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 200, "请假事由已更新", run)
}
func (h *LeaveHandler) CancelSchoolRun(c *gin.Context) {
	id, ok := pathID(c, "id")
	if !ok {
		return
	}
	run, err := h.service.CancelRun(c.Request.Context(), id)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 200, "请假汇总已取消", run)
}
func (h *LeaveHandler) DeleteSchoolRun(c *gin.Context) {
	id, ok := pathID(c, "id")
	if !ok {
		return
	}
	if err := h.service.DeleteRun(c.Request.Context(), id); err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 200, "请假历史已删除", nil)
}
func (h *LeaveHandler) SchoolRunDocument(c *gin.Context) {
	adminID, ok := leaveUserID(c)
	if !ok {
		return
	}
	runID, ok := pathID(c, "id")
	if !ok {
		return
	}
	index := 0
	if raw := c.Query("group"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 {
			writeAPIError(c, 400, "时间组无效")
			return
		}
		index = parsed
	}
	content, filename, err := h.service.RunDocument(c.Request.Context(), adminID, runID, index)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeDownload(c, content, filename, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", true)
}
func (h *LeaveHandler) UploadSchoolGroupResult(c *gin.Context) {
	adminID, ok := leaveUserID(c)
	if !ok {
		return
	}
	runID, ok := pathID(c, "id")
	if !ok {
		return
	}
	index, err := strconv.Atoi(c.Param("group"))
	if err != nil || index < 1 {
		writeAPIError(c, 400, "时间组无效")
		return
	}
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		writeAPIError(c, 400, "请选择签回材料")
		return
	}
	defer file.Close()
	result, err := h.service.UploadGroupResult(c.Request.Context(), adminID, runID, index, header.Filename, header.Header.Get("Content-Type"), file)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 200, "盖章结果已保存", result)
}
func (h *LeaveHandler) SchoolGroupResult(c *gin.Context) {
	userID, ok := leaveUserID(c)
	if !ok {
		return
	}
	runID, ok := pathID(c, "id")
	if !ok {
		return
	}
	index, err := strconv.Atoi(c.Param("group"))
	if err != nil || index < 1 {
		writeAPIError(c, 400, "时间组无效")
		return
	}
	content, filename, contentType, err := h.service.GroupResult(c.Request.Context(), userID, runID, index)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeDownload(c, content, filename, contentType, false)
}

func (h *LeaveHandler) AdminSchoolGroupResult(c *gin.Context) {
	runID, ok := pathID(c, "id")
	if !ok {
		return
	}
	index, err := strconv.Atoi(c.Param("group"))
	if err != nil || index < 1 {
		writeAPIError(c, 400, "时间组无效")
		return
	}
	content, filename, contentType, err := h.service.AdminGroupResult(c.Request.Context(), runID, index)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeDownload(c, content, filename, contentType, false)
}

func (h *LeaveHandler) ReadAdminRecord(c *gin.Context) {
	id, ok := leaveUserID(c)
	if !ok {
		return
	}
	var body struct {
		RecordType string `json:"recordType"`
		RecordID   uint64 `json:"recordId"`
	}
	if c.ShouldBindJSON(&body) != nil || body.RecordID == 0 {
		writeAPIError(c, 400, "记录信息不完整")
		return
	}
	if err := h.service.AdminRecordRead(c.Request.Context(), id, body.RecordType, body.RecordID); err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 200, "记录已标记为已读", nil)
}

func (h *LeaveHandler) DailyWindows(c *gin.Context) {
	id, ok := leaveUserID(c)
	if !ok {
		return
	}
	rows, err := h.service.ListDailyWindows(c.Request.Context(), id, false)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 200, "获取日常请假活动成功", rows)
}
func (h *LeaveHandler) AdminDailyWindows(c *gin.Context) {
	id, ok := leaveUserID(c)
	if !ok {
		return
	}
	rows, err := h.service.ListDailyWindows(c.Request.Context(), id, true)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 200, "获取日常请假活动成功", rows)
}
func (h *LeaveHandler) CreateDailyWindow(c *gin.Context) {
	id, ok := leaveUserID(c)
	if !ok {
		return
	}
	var input leave.DailyWindowInput
	if c.ShouldBindJSON(&input) != nil {
		writeAPIError(c, 400, "活动信息不完整")
		return
	}
	row, err := h.service.CreateDailyWindow(c.Request.Context(), id, input)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 201, "共享活动已创建", row)
}
func (h *LeaveHandler) EnableDailyPublicLink(c *gin.Context) {
	id, ok := pathID(c, "id")
	if !ok {
		return
	}
	row, err := h.service.EnableDailyPublicLink(c.Request.Context(), id)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 200, "公开链接已开启", row)
}
func (h *LeaveHandler) CloseDailyWindow(c *gin.Context) {
	id, ok := pathID(c, "id")
	if !ok {
		return
	}
	row, err := h.service.CloseDailyWindow(c.Request.Context(), id)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 200, "共享活动已关闭", row)
}
func (h *LeaveHandler) PrepareDailySelf(c *gin.Context) {
	userID, ok := leaveUserID(c)
	if !ok {
		return
	}
	var input leave.RequestInput
	if c.ShouldBindJSON(&input) != nil {
		writeAPIError(c, 400, "请假时间不完整")
		return
	}
	ready, err := h.service.PrepareDailyDocument(c.Request.Context(), userID, nil, input, c.Query("offline") == "true")
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 200, "请假事项已保存", ready)
}
func (h *LeaveHandler) PrepareDailyWindow(c *gin.Context) {
	userID, ok := leaveUserID(c)
	if !ok {
		return
	}
	id, ok := pathID(c, "id")
	if !ok {
		return
	}
	ready, err := h.service.PrepareDailyDocument(c.Request.Context(), userID, &id, leave.RequestInput{}, c.Query("offline") == "true")
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 200, "共享报名已保存", ready)
}
func (h *LeaveHandler) DownloadDailySelf(c *gin.Context) {
	userID, ok := leaveUserID(c)
	if !ok {
		return
	}
	id, ok := pathID(c, "id")
	if !ok {
		return
	}
	content, filename, err := h.service.DownloadDailyDocument(c.Request.Context(), userID, id, c.Query("offline") == "true")
	if err != nil {
		h.fail(c, err)
		return
	}
	writeDownload(c, content, filename, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", true)
}
func (h *LeaveHandler) DownloadDailyWindow(c *gin.Context) {
	userID, ok := leaveUserID(c)
	if !ok {
		return
	}
	windowID, ok := pathID(c, "id")
	if !ok {
		return
	}
	rows, err := h.service.ListDailyRecords(c.Request.Context(), &userID, nil)
	if err != nil {
		h.fail(c, err)
		return
	}
	var match uint64
	for _, row := range rows {
		if row.WindowID != nil && *row.WindowID == windowID {
			match = row.ID
			break
		}
	}
	if match == 0 {
		writeAPIError(c, 404, "请先生成该共享活动的请假材料")
		return
	}
	content, filename, err := h.service.DownloadDailyDocument(c.Request.Context(), userID, match, c.Query("offline") == "true")
	if err != nil {
		h.fail(c, err)
		return
	}
	writeDownload(c, content, filename, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", true)
}
func (h *LeaveHandler) PublicDailyWindow(c *gin.Context) {
	row, err := h.service.PublicDailyWindow(c.Request.Context(), c.Param("token"))
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 200, "获取公开活动成功", row)
}
func (h *LeaveHandler) PreparePublicDaily(c *gin.Context) {
	var input leave.DailyPublicInput
	if c.ShouldBindJSON(&input) != nil {
		writeAPIError(c, 400, "报名信息不完整")
		return
	}
	ready, err := h.service.PreparePublicDailyDocument(c.Request.Context(), c.Param("token"), input, c.Query("offline") == "true")
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 201, "报名和材料已准备", ready)
}
func (h *LeaveHandler) DownloadPublicDaily(c *gin.Context) {
	content, filename, err := h.service.DownloadPublicDailyDocument(c.Request.Context(), c.Param("credential"), c.Query("offline") == "true")
	if err != nil {
		h.fail(c, err)
		return
	}
	writeDownload(c, content, filename, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", true)
}
func (h *LeaveHandler) MyDailyRecords(c *gin.Context) {
	id, ok := leaveUserID(c)
	if !ok {
		return
	}
	rows, err := h.service.ListDailyRecords(c.Request.Context(), &id, nil)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 200, "获取日常请假历史成功", rows)
}
func (h *LeaveHandler) AdminDailyRecords(c *gin.Context) {
	adminID, ok := leaveUserID(c)
	if !ok {
		return
	}
	rows, err := h.service.ListDailyRecords(c.Request.Context(), nil, &adminID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 200, "获取日常请假历史成功", rows)
}

func (h *LeaveHandler) MemberCampEvents(c *gin.Context) {
	id, ok := leaveUserID(c)
	if !ok {
		return
	}
	rows, err := h.service.ListCampEvents(c.Request.Context(), id, false)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 200, "获取集中请假活动成功", rows)
}
func (h *LeaveHandler) AdminCampEvents(c *gin.Context) {
	id, ok := leaveUserID(c)
	if !ok {
		return
	}
	rows, err := h.service.ListCampEvents(c.Request.Context(), id, true)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 200, "获取集中请假活动成功", rows)
}
func (h *LeaveHandler) CreateCampEvent(c *gin.Context) {
	id, ok := leaveUserID(c)
	if !ok {
		return
	}
	var input leave.CampEventInput
	if c.ShouldBindJSON(&input) != nil {
		writeAPIError(c, 400, "活动信息不完整")
		return
	}
	row, err := h.service.CreateCampEvent(c.Request.Context(), id, input)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 201, "集中请假活动已创建", row)
}
func (h *LeaveHandler) CampEventDetail(c *gin.Context) {
	id, ok := pathID(c, "id")
	if !ok {
		return
	}
	row, err := h.service.CampEventDetail(c.Request.Context(), id)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 200, "获取集中请假名单成功", row)
}
func (h *LeaveHandler) JoinCampEvent(c *gin.Context) {
	userID, ok := leaveUserID(c)
	if !ok {
		return
	}
	id, ok := pathID(c, "id")
	if !ok {
		return
	}
	row, err := h.service.JoinCampEvent(c.Request.Context(), id, userID, nil)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 201, "已确认参加", row)
}
func (h *LeaveHandler) LeaveCampEvent(c *gin.Context) {
	userID, ok := leaveUserID(c)
	if !ok {
		return
	}
	id, ok := pathID(c, "id")
	if !ok {
		return
	}
	if err := h.service.LeaveCampEvent(c.Request.Context(), id, userID); err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 200, "已取消参加", nil)
}
func (h *LeaveHandler) PublicCampEvent(c *gin.Context) {
	row, err := h.service.PublicCampEvent(c.Request.Context(), c.Param("token"))
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 200, "获取公开报名活动成功", row)
}
func (h *LeaveHandler) PublicJoinCampEvent(c *gin.Context) {
	event, err := h.service.PublicCampEvent(c.Request.Context(), c.Param("token"))
	if err != nil {
		h.fail(c, err)
		return
	}
	var input leave.DailyPublicInput
	if c.ShouldBindJSON(&input) != nil {
		writeAPIError(c, 400, "报名信息不完整")
		return
	}
	row, err := h.service.JoinCampEvent(c.Request.Context(), event.ID, 0, &input)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 201, "报名已提交", row)
}
func (h *LeaveHandler) CloseCampEvent(c *gin.Context) {
	id, ok := pathID(c, "id")
	if !ok {
		return
	}
	row, err := h.service.CloseCampEvent(c.Request.Context(), id)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 200, "报名收集已关闭", row)
}
func (h *LeaveHandler) RemoveCampParticipant(c *gin.Context) {
	eventID, ok := pathID(c, "id")
	if !ok {
		return
	}
	participantID, ok := pathID(c, "participantId")
	if !ok {
		return
	}
	if err := h.service.RemoveCampParticipant(c.Request.Context(), eventID, participantID); err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, 200, "报名记录已移除", nil)
}
func (h *LeaveHandler) MemberCampDocument(c *gin.Context) {
	userID, ok := leaveUserID(c)
	if !ok {
		return
	}
	eventID, ok := pathID(c, "id")
	if !ok {
		return
	}
	content, filename, err := h.service.CampDocument(c.Request.Context(), eventID, &userID, "", c.Query("offline") == "true")
	if err != nil {
		h.fail(c, err)
		return
	}
	writeDownload(c, content, filename, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", true)
}
func (h *LeaveHandler) AdminCampDocument(c *gin.Context) {
	eventID, ok := pathID(c, "id")
	if !ok {
		return
	}
	content, filename, err := h.service.CampDocument(c.Request.Context(), eventID, nil, c.Param("college"), c.Query("offline") == "true")
	if err != nil {
		h.fail(c, err)
		return
	}
	writeDownload(c, content, filename, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", true)
}

func leaveUserID(c *gin.Context) (uint64, bool) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil || user.ID == 0 {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return 0, false
	}
	return user.ID, true
}
func pathID(c *gin.Context, key string) (uint64, bool) {
	id, err := strconv.ParseUint(c.Param(key), 10, 64)
	if err != nil || id == 0 {
		writeAPIError(c, http.StatusBadRequest, "记录编号不合法")
		return 0, false
	}
	return id, true
}
func writeDownload(c *gin.Context, content []byte, filename, contentType string, attachment bool) {
	disposition := "inline"
	if attachment {
		disposition = "attachment"
	}
	c.Header("Content-Type", contentType)
	c.Header("Content-Disposition", fmt.Sprintf("%s; filename*=UTF-8''%s", disposition, url.PathEscape(filename)))
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, contentType, content)
}

func (h *LeaveHandler) fail(c *gin.Context, err error) {
	var serviceErr *leave.ServiceError
	if errors.As(err, &serviceErr) {
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}
	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}
