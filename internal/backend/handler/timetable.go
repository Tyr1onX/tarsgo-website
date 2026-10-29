package handler

import (
	"errors"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"tarsgo-backend/middleware"
	"tarsgo-backend/service/timetable"
)

type TimetableHandler struct{ service *timetable.Service }

func NewTimetableHandler(s *timetable.Service) *TimetableHandler {
	return &TimetableHandler{service: s}
}
func timetableUserID(c *gin.Context) uint64 {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil {
		return 0
	}
	return user.ID
}
func (h *TimetableHandler) List(c *gin.Context) {
	out, err := h.service.List(c.Request.Context(), timetableUserID(c))
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "个人课表获取成功", out)
}
func (h *TimetableHandler) Import(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 6<<20)
	if err := c.Request.ParseMultipartForm(1 << 20); err != nil {
		var limit *http.MaxBytesError
		if errors.As(err, &limit) {
			writeAPIError(c, 413, "课表文件不能超过5 MB")
		} else {
			writeAPIError(c, 400, "无效的课表上传请求")
		}
		return
	}
	if c.Request.MultipartForm != nil {
		defer c.Request.MultipartForm.RemoveAll()
	}
	files := c.Request.MultipartForm.File["file"]
	if len(files) != 1 || len(c.Request.MultipartForm.File) != 1 {
		writeAPIError(c, 400, "请只上传一个 .xlsx 课表")
		return
	}
	f, err := files[0].Open()
	if err != nil {
		writeAPIError(c, 400, "无法读取上传文件")
		return
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, 5<<20+1))
	if err != nil || len(data) > 5<<20 {
		writeAPIError(c, 413, "课表文件不能超过5 MB")
		return
	}
	result, err := h.service.Import(c.Request.Context(), timetableUserID(c), c.PostForm("semester"), files[0].Filename, data)
	if err != nil {
		h.fail(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "课表已导入", result)
}
func (h *TimetableHandler) fail(c *gin.Context, err error) {
	var serviceErr *timetable.Error
	if errors.As(err, &serviceErr) {
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}
	writeAPIError(c, 500, "服务器内部错误")
}
