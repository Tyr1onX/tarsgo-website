package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"tarsgo-backend/middleware"
	"tarsgo-backend/service/assignment"
)

const maxAssignmentRequestBody = 52 << 20

type AssignmentHandler struct{ service *assignment.Service }

func NewAssignmentHandler(service *assignment.Service) *AssignmentHandler {
	return &AssignmentHandler{service: service}
}

type assignmentRequest struct {
	GroupID                uint64   `json:"groupId"`
	Title                  string   `json:"title"`
	Description            string   `json:"description"`
	DueAt                  string   `json:"dueAt"`
	AttachmentRequirements string   `json:"attachmentRequirements"`
	IsGroupWide            bool     `json:"isGroupWide"`
	TargetUserIDs          []uint64 `json:"targetUserIds"`
}

func (h *AssignmentHandler) ListMine(c *gin.Context) {
	items, err := h.service.ListMine(c.Request.Context(), currentAssignmentActor(c))
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取我的作业成功", items)
}

func (h *AssignmentHandler) GetMine(c *gin.Context) {
	assignmentID, ok := parseAssignmentPathID(c)
	if !ok {
		return
	}
	item, err := h.service.GetMine(c.Request.Context(), currentAssignmentActor(c), assignmentID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取作业详情成功", item)
}

func (h *AssignmentHandler) Submit(c *gin.Context) {
	assignmentID, ok := parseAssignmentPathID(c)
	if !ok {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxAssignmentRequestBody)
	if err := c.Request.ParseMultipartForm(1 << 20); err != nil {
		if c.Request.MultipartForm != nil {
			_ = c.Request.MultipartForm.RemoveAll()
		}
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			writeAPIError(c, http.StatusRequestEntityTooLarge, "附件总大小不能超过 50 MB")
			return
		}
		writeAPIError(c, http.StatusBadRequest, "作业附件提交参数不合法")
		return
	}
	if c.Request.MultipartForm != nil {
		defer c.Request.MultipartForm.RemoveAll()
	}
	var files []*multipart.FileHeader
	if c.Request.MultipartForm != nil {
		files = c.Request.MultipartForm.File["files"]
	}
	result, err := h.service.Submit(c.Request.Context(), currentAssignmentActor(c), assignmentID, files)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "作业已提交", result)
}

func (h *AssignmentHandler) ListAdmin(c *gin.Context) {
	var groupID uint64
	if raw := strings.TrimSpace(c.Query("groupId")); raw != "" {
		value, err := strconv.ParseUint(raw, 10, 64)
		if err != nil || value == 0 {
			writeAPIError(c, http.StatusBadRequest, "技术组参数不合法")
			return
		}
		groupID = value
	}
	items, err := h.service.ListAdmin(c.Request.Context(), currentAssignmentActor(c), groupID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取组内作业成功", items)
}

func (h *AssignmentHandler) ListGroupMembers(c *gin.Context) {
	groupID, err := strconv.ParseUint(strings.TrimSpace(c.Query("groupId")), 10, 64)
	if err != nil || groupID == 0 {
		writeAPIError(c, http.StatusBadRequest, "技术组参数不合法")
		return
	}
	items, serviceErr := h.service.ListGroupMembers(c.Request.Context(), currentAssignmentActor(c), groupID)
	if serviceErr != nil {
		h.fail(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "获取组内成员成功", items)
}

func (h *AssignmentHandler) Create(c *gin.Context) {
	input, ok := bindAssignmentRequest(c)
	if !ok {
		return
	}
	item, err := h.service.Create(c.Request.Context(), currentAssignmentActor(c), input)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusCreated, "作业已发布", item)
}

func (h *AssignmentHandler) PublishWithMaterials(c *gin.Context) {
	files, cleanup, ok := parseAssignmentMultipartFiles(c)
	if !ok {
		return
	}
	defer cleanup()
	if len(files) == 0 {
		writeAPIError(c, http.StatusBadRequest, "请至少添加一个教学资料附件")
		return
	}
	var request assignmentRequest
	if err := json.Unmarshal([]byte(c.PostForm("assignment")), &request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "作业信息不合法")
		return
	}
	input, ok := assignmentInput(request)
	if !ok {
		writeAPIError(c, http.StatusBadRequest, "请填写有效的北京时间截止时间")
		return
	}
	result, err := h.service.CreateWithMaterialFiles(c.Request.Context(), currentAssignmentActor(c), input, c.GetHeader("Idempotency-Key"), files)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusCreated, "作业及教学资料已发布", result)
}

func (h *AssignmentHandler) Update(c *gin.Context) {
	assignmentID, ok := parseAssignmentPathID(c)
	if !ok {
		return
	}
	input, ok := bindAssignmentRequest(c)
	if !ok {
		return
	}
	item, err := h.service.Update(c.Request.Context(), currentAssignmentActor(c), assignmentID, input)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "作业已更新", item)
}

func (h *AssignmentHandler) SetPublicationStatus(c *gin.Context) {
	assignmentID, ok := parseAssignmentPathID(c)
	if !ok {
		return
	}
	var request struct {
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "作业发布状态不合法")
		return
	}
	item, err := h.service.SetPublicationStatus(c.Request.Context(), currentAssignmentActor(c), assignmentID, request.Status)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "作业发布状态已更新", item)
}

func (h *AssignmentHandler) Delete(c *gin.Context) {
	assignmentID, ok := parseAssignmentPathID(c)
	if !ok {
		return
	}
	if err := h.service.Delete(c.Request.Context(), currentAssignmentActor(c), assignmentID); err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "无历史记录的作业已删除", gin.H{"id": assignmentID})
}

func (h *AssignmentHandler) UploadMaterialFiles(c *gin.Context) {
	assignmentID, ok := parseAssignmentPathID(c)
	if !ok {
		return
	}
	files, cleanup, ok := parseAssignmentMultipartFiles(c)
	if !ok {
		return
	}
	defer cleanup()
	result, err := h.service.UploadMaterialFiles(c.Request.Context(), currentAssignmentActor(c), assignmentID, files)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusCreated, "教学资料已上传", result)
}

func (h *AssignmentHandler) RemoveMaterialFile(c *gin.Context) {
	assignmentID, ok := parseAssignmentPathID(c)
	if !ok {
		return
	}
	fileID, err := strconv.ParseUint(strings.TrimSpace(c.Param("fileId")), 10, 64)
	if err != nil || fileID == 0 {
		writeAPIError(c, http.StatusBadRequest, "教学资料编号不合法")
		return
	}
	result, serviceErr := h.service.RemoveMaterialFile(c.Request.Context(), currentAssignmentActor(c), assignmentID, fileID)
	if serviceErr != nil {
		h.fail(c, serviceErr)
		return
	}
	writeAPI(c, http.StatusOK, "教学资料已移除", result)
}

func (h *AssignmentHandler) OpenMaterialFile(c *gin.Context) {
	fileID, ok := parseAssignmentPathID(c)
	if !ok {
		return
	}
	file, err := h.service.OpenMaterialFile(c.Request.Context(), currentAssignmentActor(c), fileID)
	if err != nil {
		h.fail(c, err)
		return
	}
	filename := url.PathEscape(file.FileName)
	c.Header("Content-Type", file.ContentType)
	c.Header("Content-Disposition", "attachment; filename*=UTF-8''"+filename)
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, file.ContentType, file.Content)
}

func parseAssignmentMultipartFiles(c *gin.Context) ([]*multipart.FileHeader, func(), bool) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxAssignmentRequestBody)
	if err := c.Request.ParseMultipartForm(1 << 20); err != nil {
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			writeAPIError(c, http.StatusRequestEntityTooLarge, "附件总大小不能超过 50 MB")
			return nil, func() {}, false
		}
		writeAPIError(c, http.StatusBadRequest, "作业附件参数不合法")
		return nil, func() {}, false
	}
	if c.Request.MultipartForm != nil {
		return c.Request.MultipartForm.File["files"], func() { _ = c.Request.MultipartForm.RemoveAll() }, true
	}
	return nil, func() {}, true
}

func bindAssignmentRequest(c *gin.Context) (assignment.CreateInput, bool) {
	var request assignmentRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "作业信息不合法")
		return assignment.CreateInput{}, false
	}
	input, ok := assignmentInput(request)
	if !ok {
		writeAPIError(c, http.StatusBadRequest, "请填写有效的北京时间截止时间")
	}
	return input, ok
}

func assignmentInput(request assignmentRequest) (assignment.CreateInput, bool) {
	dueAt, err := parseAssignmentDueAt(request.DueAt)
	if err != nil {
		return assignment.CreateInput{}, false
	}
	return assignment.CreateInput{
		GroupID: request.GroupID, Title: request.Title, Description: request.Description,
		DueAt: dueAt, AttachmentRequirements: request.AttachmentRequirements,
		IsGroupWide: request.IsGroupWide, TargetUserIDs: request.TargetUserIDs,
	}, true
}

func parseAssignmentDueAt(raw string) (time.Time, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return time.Time{}, fmt.Errorf("missing due time")
	}
	if parsed, err := time.Parse(time.RFC3339, trimmed); err == nil {
		return parsed.In(time.FixedZone("Asia/Shanghai", 8*60*60)), nil
	}
	return time.ParseInLocation("2006-01-02T15:04", trimmed, time.FixedZone("Asia/Shanghai", 8*60*60))
}

func (h *AssignmentHandler) GetAdmin(c *gin.Context) {
	assignmentID, ok := parseAssignmentPathID(c)
	if !ok {
		return
	}
	item, err := h.service.GetAdmin(c.Request.Context(), currentAssignmentActor(c), assignmentID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取作业提交记录成功", item)
}

func (h *AssignmentHandler) Review(c *gin.Context) {
	submissionID, ok := parseAssignmentPathID(c)
	if !ok {
		return
	}
	var request struct {
		Score    *uint8 `json:"score"`
		Decision string `json:"decision"`
		Comment  string `json:"comment"`
	}
	if err := c.ShouldBindJSON(&request); err != nil || request.Score == nil {
		writeAPIError(c, http.StatusBadRequest, "评分、处理结果或评语不合法")
		return
	}
	item, err := h.service.Review(c.Request.Context(), currentAssignmentActor(c), submissionID, assignment.ReviewInput{
		Score: *request.Score, Decision: request.Decision, Comment: request.Comment,
	})
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "批改结果已保存", item)
}

func (h *AssignmentHandler) OpenFile(c *gin.Context) {
	fileID, ok := parseAssignmentPathID(c)
	if !ok {
		return
	}
	file, err := h.service.OpenFile(c.Request.Context(), currentAssignmentActor(c), fileID)
	if err != nil {
		h.fail(c, err)
		return
	}
	filename := url.PathEscape(file.FileName)
	c.Header("Content-Type", file.ContentType)
	c.Header("Content-Disposition", "attachment; filename*=UTF-8''"+filename)
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, file.ContentType, file.Content)
}

func parseAssignmentPathID(c *gin.Context) (uint64, bool) {
	value, err := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || value == 0 {
		writeAPIError(c, http.StatusBadRequest, "作业记录编号不合法")
		return 0, false
	}
	return value, true
}

func currentAssignmentActor(c *gin.Context) assignment.Actor {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil {
		return assignment.Actor{}
	}
	return assignment.Actor{ID: user.ID, RoleName: user.Role.Name}
}

func (h *AssignmentHandler) fail(c *gin.Context, err error) {
	var serviceErr *assignment.ServiceError
	if errors.As(err, &serviceErr) {
		if serviceErr.Status >= http.StatusInternalServerError {
			middleware.LogInternalError(c, "assignment", serviceErr.Status, err)
		}
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}
	middleware.LogInternalError(c, "assignment", http.StatusInternalServerError, err)
	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}
