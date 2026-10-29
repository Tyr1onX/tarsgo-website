package handler

import (
	"errors"
	"net/http"
	"net/url"
	"strconv"

	"github.com/gin-gonic/gin"
	"tarsgo-backend/middleware"
	"tarsgo-backend/service/assignment"
)

type PracticeHandler struct{ service *assignment.PracticeService }

func NewPracticeHandler(s *assignment.PracticeService) *PracticeHandler {
	return &PracticeHandler{service: s}
}
func practiceID(c *gin.Context, key string) (uint64, bool) {
	n, e := strconv.ParseUint(c.Param(key), 10, 64)
	if e != nil || n == 0 {
		writeAPIError(c, 400, "编号无效")
		return 0, false
	}
	return n, true
}
func (h *PracticeHandler) fail(c *gin.Context, err error) {
	var e *assignment.ServiceError
	if errors.As(err, &e) {
		if e.Status >= 500 {
			middleware.LogInternalError(c, "practice", e.Status, err)
		}
		writeAPIError(c, e.Status, e.Message)
		return
	}
	middleware.LogInternalError(c, "practice", 500, err)
	writeAPIError(c, 500, "服务器内部错误")
}
func (h *PracticeHandler) Groups(c *gin.Context) {
	v, e := h.service.Groups(c.Request.Context(), currentAssignmentActor(c))
	if e != nil {
		h.fail(c, e)
		return
	}
	writeAPI(c, 200, "获取管理组别成功", v)
}
func (h *PracticeHandler) ListMine(c *gin.Context) {
	v, e := h.service.List(c.Request.Context(), currentAssignmentActor(c), false)
	if e != nil {
		h.fail(c, e)
		return
	}
	writeAPI(c, 200, "获取实践项目成功", v)
}
func (h *PracticeHandler) ListAdmin(c *gin.Context) {
	v, e := h.service.List(c.Request.Context(), currentAssignmentActor(c), true)
	if e != nil {
		h.fail(c, e)
		return
	}
	writeAPI(c, 200, "获取组内项目成功", v)
}
func (h *PracticeHandler) Get(c *gin.Context) {
	id, ok := practiceID(c, "id")
	if !ok {
		return
	}
	v, e := h.service.Get(c.Request.Context(), currentAssignmentActor(c), id)
	if e != nil {
		h.fail(c, e)
		return
	}
	writeAPI(c, 200, "获取项目详情成功", v)
}
func (h *PracticeHandler) Create(c *gin.Context) {
	var in assignment.PracticeInput
	if c.ShouldBindJSON(&in) != nil {
		writeAPIError(c, 400, "项目内容不合法")
		return
	}
	v, e := h.service.Create(c.Request.Context(), currentAssignmentActor(c), in)
	if e != nil {
		h.fail(c, e)
		return
	}
	writeAPI(c, 201, "项目已创建", v)
}
func (h *PracticeHandler) Edit(c *gin.Context) {
	id, ok := practiceID(c, "id")
	if !ok {
		return
	}
	var in assignment.PracticeInput
	if c.ShouldBindJSON(&in) != nil {
		writeAPIError(c, 400, "项目内容不合法")
		return
	}
	v, e := h.service.Edit(c.Request.Context(), currentAssignmentActor(c), id, in, false)
	if e != nil {
		h.fail(c, e)
		return
	}
	writeAPI(c, 200, "项目已修改", v)
}
func (h *PracticeHandler) Close(c *gin.Context) {
	id, ok := practiceID(c, "id")
	if !ok {
		return
	}
	v, e := h.service.Edit(c.Request.Context(), currentAssignmentActor(c), id, assignment.PracticeInput{}, true)
	if e != nil {
		h.fail(c, e)
		return
	}
	writeAPI(c, 200, "项目已关闭", v)
}
func (h *PracticeHandler) Join(c *gin.Context) {
	id, ok := practiceID(c, "id")
	if !ok {
		return
	}
	v, e := h.service.Join(c.Request.Context(), currentAssignmentActor(c), id)
	if e != nil {
		h.fail(c, e)
		return
	}
	writeAPI(c, 200, "报名成功", v)
}
func (h *PracticeHandler) Exit(c *gin.Context) {
	id, ok := practiceID(c, "id")
	if !ok {
		return
	}
	v, e := h.service.RequestExit(c.Request.Context(), currentAssignmentActor(c), id)
	if e != nil {
		h.fail(c, e)
		return
	}
	writeAPI(c, 200, "退出申请已提交", v)
}
func (h *PracticeHandler) DecideExit(c *gin.Context) {
	id, ok := practiceID(c, "id")
	if !ok {
		return
	}
	user, ok := practiceID(c, "userId")
	if !ok {
		return
	}
	var input struct {
		Approve *bool `json:"approve"`
	}
	if c.ShouldBindJSON(&input) != nil || input.Approve == nil {
		writeAPIError(c, 400, "请输入退出审批决定")
		return
	}
	v, e := h.service.DecideExit(c.Request.Context(), currentAssignmentActor(c), id, user, *input.Approve)
	if e != nil {
		h.fail(c, e)
		return
	}
	writeAPI(c, 200, "退出申请已处理", v)
}
func (h *PracticeHandler) Submit(c *gin.Context) {
	id, ok := practiceID(c, "id")
	if !ok {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 52<<20)
	if err := c.Request.ParseMultipartForm(1 << 20); err != nil {
		if c.Request.MultipartForm != nil {
			_ = c.Request.MultipartForm.RemoveAll()
		}
		writeAPIError(c, 400, "成果附件超出限制或格式不正确")
		return
	}
	if c.Request.MultipartForm != nil {
		defer c.Request.MultipartForm.RemoveAll()
	}
	var files = c.Request.MultipartForm.File["files"]
	v, e := h.service.Submit(c.Request.Context(), currentAssignmentActor(c), id, c.PostForm("progress"), c.PostForm("reflection"), files)
	if e != nil {
		h.fail(c, e)
		return
	}
	writeAPI(c, 200, "成果已提交", v)
}
func (h *PracticeHandler) Review(c *gin.Context) {
	id, ok := practiceID(c, "id")
	if !ok {
		return
	}
	subID, ok := practiceID(c, "submissionId")
	if !ok {
		return
	}
	var input struct {
		Decision string `json:"decision"`
		Comment  string `json:"comment"`
		Score    *uint8 `json:"score"`
	}
	if c.ShouldBindJSON(&input) != nil || input.Score == nil {
		writeAPIError(c, 400, "请输入评价结论、意见和分数")
		return
	}
	v, e := h.service.Review(c.Request.Context(), currentAssignmentActor(c), id, subID, input.Decision, input.Comment, *input.Score)
	if e != nil {
		h.fail(c, e)
		return
	}
	writeAPI(c, 200, "成果已验收", v)
}
func (h *PracticeHandler) OpenFile(c *gin.Context) {
	id, ok := practiceID(c, "fileId")
	if !ok {
		return
	}
	file, err := h.service.OpenFile(c.Request.Context(), currentAssignmentActor(c), id)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.Header("Content-Type", file.ContentType)
	c.Header("Content-Disposition", "attachment; filename*=UTF-8''"+url.PathEscape(file.FileName))
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, file.ContentType, file.Content)
}
