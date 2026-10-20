package handler

import (
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"tarsgo-backend/middleware"
	"tarsgo-backend/service/trainingqa"
)

const maxQuestionRequestBody = 22 << 20

type TrainingQuestionHandler struct{ service *trainingqa.Service }

func NewTrainingQuestionHandler(service *trainingqa.Service) *TrainingQuestionHandler {
	return &TrainingQuestionHandler{service: service}
}

func (h *TrainingQuestionHandler) ListMember(c *gin.Context) {
	filter, ok := trainingQuestionFilter(c, true)
	if !ok {
		return
	}
	items, err := h.service.ListMember(c.Request.Context(), currentTrainingQuestionActor(c), filter)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取问题列表成功", items)
}

func (h *TrainingQuestionHandler) GetMember(c *gin.Context) {
	questionID, ok := parseTrainingQuestionID(c)
	if !ok {
		return
	}
	item, err := h.service.GetMember(c.Request.Context(), currentTrainingQuestionActor(c), questionID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取问题详情成功", item)
}

func (h *TrainingQuestionHandler) Create(c *gin.Context) {
	if !parseQuestionMultipart(c) {
		return
	}
	if c.Request.MultipartForm != nil {
		defer c.Request.MultipartForm.RemoveAll()
	}
	groupID, err := parseQuestionFormGroupID(c.PostForm("groupId"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "技术组参数不合法")
		return
	}
	var files []*multipart.FileHeader
	if c.Request.MultipartForm != nil {
		files = c.Request.MultipartForm.File["files"]
	}
	item, err := h.service.Create(c.Request.Context(), currentTrainingQuestionActor(c), groupID, c.PostForm("title"), c.PostForm("body"), c.PostForm("visibility"), files)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusCreated, "问题已发布", item)
}

func (h *TrainingQuestionHandler) ReplyMember(c *gin.Context) {
	h.reply(c, false)
}

func (h *TrainingQuestionHandler) ListAdmin(c *gin.Context) {
	filter, ok := trainingQuestionFilter(c, false)
	if !ok {
		return
	}
	items, err := h.service.ListAdmin(c.Request.Context(), currentTrainingQuestionActor(c), filter)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取组内问题成功", items)
}

func (h *TrainingQuestionHandler) GetAdmin(c *gin.Context) {
	questionID, ok := parseTrainingQuestionID(c)
	if !ok {
		return
	}
	item, err := h.service.GetAdmin(c.Request.Context(), currentTrainingQuestionActor(c), questionID)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取问题详情成功", item)
}

func (h *TrainingQuestionHandler) ReplyAdmin(c *gin.Context) {
	h.reply(c, true)
}

func (h *TrainingQuestionHandler) SetSolvedMember(c *gin.Context) { h.setSolved(c, false) }
func (h *TrainingQuestionHandler) SetSolvedAdmin(c *gin.Context)  { h.setSolved(c, true) }

func (h *TrainingQuestionHandler) SetFAQ(c *gin.Context) {
	questionID, ok := parseTrainingQuestionID(c)
	if !ok {
		return
	}
	var request struct {
		IsFAQ *bool `json:"isFaq"`
	}
	if err := c.ShouldBindJSON(&request); err != nil || request.IsFAQ == nil {
		writeAPIError(c, http.StatusBadRequest, "FAQ 状态不合法")
		return
	}
	item, err := h.service.SetFAQ(c.Request.Context(), currentTrainingQuestionActor(c), questionID, *request.IsFAQ)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "FAQ 状态已更新", item)
}

func (h *TrainingQuestionHandler) OpenFile(c *gin.Context) {
	fileID, ok := parseTrainingQuestionID(c)
	if !ok {
		return
	}
	file, err := h.service.OpenFile(c.Request.Context(), currentTrainingQuestionActor(c), fileID)
	if err != nil {
		h.fail(c, err)
		return
	}
	filename := url.PathEscape(file.FileName)
	c.Header("Content-Type", file.ContentType)
	c.Header("Content-Disposition", "inline; filename*=UTF-8''"+filename)
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Cache-Control", "private, no-store")
	c.Data(http.StatusOK, file.ContentType, file.Content)
}

func (h *TrainingQuestionHandler) reply(c *gin.Context, admin bool) {
	questionID, ok := parseTrainingQuestionID(c)
	if !ok {
		return
	}
	if !parseQuestionMultipart(c) {
		return
	}
	if c.Request.MultipartForm != nil {
		defer c.Request.MultipartForm.RemoveAll()
	}
	var files []*multipart.FileHeader
	if c.Request.MultipartForm != nil {
		files = c.Request.MultipartForm.File["files"]
	}
	item, err := h.service.Reply(c.Request.Context(), currentTrainingQuestionActor(c), questionID, trainingqa.PostInput{
		Kind: c.PostForm("kind"), Body: c.PostForm("body"), Files: files,
	})
	if err != nil {
		h.fail(c, err)
		return
	}
	if admin {
		// RequireAdmin has authenticated the role; the service still enforces group scope.
		item, err = h.service.GetAdmin(c.Request.Context(), currentTrainingQuestionActor(c), questionID)
		if err != nil {
			h.fail(c, err)
			return
		}
	}
	writeAPI(c, http.StatusCreated, "回复已发布", item)
}

func (h *TrainingQuestionHandler) setSolved(c *gin.Context, admin bool) {
	questionID, ok := parseTrainingQuestionID(c)
	if !ok {
		return
	}
	var request struct {
		IsSolved *bool `json:"isSolved"`
	}
	if err := c.ShouldBindJSON(&request); err != nil || request.IsSolved == nil {
		writeAPIError(c, http.StatusBadRequest, "解决状态不合法")
		return
	}
	item, err := h.service.SetSolved(c.Request.Context(), currentTrainingQuestionActor(c), questionID, *request.IsSolved)
	if err != nil {
		h.fail(c, err)
		return
	}
	if admin {
		item, err = h.service.GetAdmin(c.Request.Context(), currentTrainingQuestionActor(c), questionID)
		if err != nil {
			h.fail(c, err)
			return
		}
	}
	writeAPI(c, http.StatusOK, "问题状态已更新", item)
}

func parseQuestionMultipart(c *gin.Context) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxQuestionRequestBody)
	if err := c.Request.ParseMultipartForm(1 << 20); err != nil {
		if c.Request.MultipartForm != nil {
			_ = c.Request.MultipartForm.RemoveAll()
		}
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			writeAPIError(c, http.StatusRequestEntityTooLarge, "图片总大小不能超过 20 MB")
			return false
		}
		writeAPIError(c, http.StatusBadRequest, "问题信息或图片参数不合法")
		return false
	}
	return true
}

func trainingQuestionFilter(c *gin.Context, groupRequired bool) (trainingqa.ListFilter, bool) {
	filter := trainingqa.ListFilter{
		Keyword: strings.TrimSpace(c.Query("q")), Status: strings.TrimSpace(c.Query("status")),
		FAQOnly: c.Query("faqOnly") == "true", MineOnly: c.Query("mineOnly") == "true",
	}
	if raw := strings.TrimSpace(c.Query("groupId")); raw != "" {
		value, err := strconv.ParseUint(raw, 10, 64)
		if err != nil || value == 0 {
			writeAPIError(c, http.StatusBadRequest, "技术组参数不合法")
			return trainingqa.ListFilter{}, false
		}
		filter.GroupID = value
	}
	if groupRequired && filter.GroupID == 0 {
		writeAPIError(c, http.StatusBadRequest, "请选择技术组")
		return trainingqa.ListFilter{}, false
	}
	return filter, true
}

func parseQuestionFormGroupID(raw string) (uint64, error) {
	value, err := strconv.ParseUint(strings.TrimSpace(raw), 10, 64)
	if err != nil || value == 0 {
		return 0, fmt.Errorf("invalid group id")
	}
	return value, nil
}

func parseTrainingQuestionID(c *gin.Context) (uint64, bool) {
	raw := strings.TrimSpace(c.Param("id"))
	if raw == "" {
		raw = strings.TrimSpace(c.Param("fileId"))
	}
	value, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || value == 0 {
		writeAPIError(c, http.StatusBadRequest, "问题编号不合法")
		return 0, false
	}
	return value, true
}

func currentTrainingQuestionActor(c *gin.Context) trainingqa.Actor {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil {
		return trainingqa.Actor{}
	}
	return trainingqa.Actor{ID: user.ID, RoleName: user.Role.Name}
}

func (h *TrainingQuestionHandler) fail(c *gin.Context, err error) {
	var serviceErr *trainingqa.ServiceError
	if errors.As(err, &serviceErr) {
		if serviceErr.Status >= http.StatusInternalServerError {
			middleware.LogInternalError(c, "training question", serviceErr.Status, err)
		}
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}
	middleware.LogInternalError(c, "training question", http.StatusInternalServerError, err)
	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}
