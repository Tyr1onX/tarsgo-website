package handler

import (
	"encoding/csv"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"tarsgo-backend/middleware"
	"tarsgo-backend/model"
	"tarsgo-backend/service/aisalon"
)

type AISalonHandler struct{ service *aisalon.Service }

func NewAISalonHandler(service *aisalon.Service) *AISalonHandler { return &AISalonHandler{service} }
func salonReply(c *gin.Context, data any, err error) {
	if err != nil {
		var e *aisalon.Error
		if errors.As(err, &e) {
			writeAPIError(c, e.Status, e.Message)
		} else if errors.Is(err, gorm.ErrRecordNotFound) {
			writeAPIError(c, 404, "活动或记录不存在")
		} else {
			_ = c.Error(err)
			writeAPIError(c, 500, "操作失败，请稍后重试")
		}
		return
	}
	writeAPI(c, 200, "操作成功", data)
}
func salonUser(c *gin.Context) uint64 { u, _ := middleware.CurrentSessionUser(c); return u.ID }
func (h *AISalonHandler) List(c *gin.Context) {
	data, err := h.service.List(c.Request.Context())
	salonReply(c, data, err)
}
func (h *AISalonHandler) Get(c *gin.Context) {
	id, ok := pathID(c, "id")
	if !ok {
		return
	}
	data, err := h.service.Get(c.Request.Context(), id)
	salonReply(c, data, err)
}
func (h *AISalonHandler) Mine(c *gin.Context) {
	data, err := h.service.Mine(c.Request.Context(), salonUser(c))
	salonReply(c, data, err)
}
func (h *AISalonHandler) Register(c *gin.Context) {
	id, ok := pathID(c, "id")
	if !ok {
		return
	}
	// Identity is deliberately never read from the request body.
	data, err := h.service.Register(c.Request.Context(), id, salonUser(c))
	salonReply(c, data, err)
}
func (h *AISalonHandler) Cancel(c *gin.Context) {
	id, ok := pathID(c, "id")
	if !ok {
		return
	}
	salonReply(c, nil, h.service.Cancel(c.Request.Context(), id, salonUser(c)))
}
func (h *AISalonHandler) CheckIn(c *gin.Context) {
	id, ok := pathID(c, "id")
	if !ok {
		return
	}
	salonReply(c, nil, h.service.CheckIn(c.Request.Context(), id, salonUser(c)))
}
func (h *AISalonHandler) AdminList(c *gin.Context) {
	data, err := h.service.AdminList(c.Request.Context())
	salonReply(c, data, err)
}
func (h *AISalonHandler) SaveEvent(c *gin.Context) {
	var id uint64
	if c.Param("id") != "" {
		var ok bool
		id, ok = pathID(c, "id")
		if !ok {
			return
		}
	}
	var e model.AISalonEvent
	if err := c.ShouldBindJSON(&e); err != nil {
		writeAPIError(c, 400, "活动格式无效")
		return
	}
	data, err := h.service.SaveEvent(c.Request.Context(), id, e)
	salonReply(c, data, err)
}
func (h *AISalonHandler) UploadPoster(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, aisalon.MaxPosterUploadBytes+(1<<20))
	parseErr := c.Request.ParseMultipartForm(1 << 20)
	if form := c.Request.MultipartForm; form != nil {
		defer form.RemoveAll()
	}
	if parseErr != nil {
		var limitErr *http.MaxBytesError
		if errors.As(parseErr, &limitErr) {
			writeAPIError(c, http.StatusRequestEntityTooLarge, "海报图片不能超过 10 MB")
		} else {
			writeAPIError(c, http.StatusBadRequest, "请选择有效的海报图片")
		}
		return
	}
	if form := c.Request.MultipartForm; form != nil {
		files := form.File["poster"]
		if len(form.File) != 1 || len(files) != 1 {
			writeAPIError(c, http.StatusBadRequest, "请选择一张海报图片")
			return
		}
		posterURL, err := h.service.UploadPoster(c.Request.Context(), files[0])
		salonReply(c, gin.H{"posterUrl": posterURL}, err)
		return
	}
	writeAPIError(c, http.StatusBadRequest, "请选择一张海报图片")
}
func (h *AISalonHandler) Delete(c *gin.Context) {
	id, ok := pathID(c, "id")
	if !ok {
		return
	}
	salonReply(c, nil, h.service.Delete(c.Request.Context(), id))
}
func (h *AISalonHandler) Roster(c *gin.Context) {
	id, ok := pathID(c, "id")
	if !ok {
		return
	}
	data, err := h.service.Roster(c.Request.Context(), id)
	salonReply(c, data, err)
}

// Quote CSV formula prefixes even when spreadsheet clients interpret quoted cells.
func salonCSVCell(value string) string {
	v := strings.TrimLeft(value, " \t\r\n")
	if len(v) > 0 && strings.ContainsRune("=+-@", rune(v[0])) {
		return "'" + value
	}
	return value
}
func (h *AISalonHandler) Export(c *gin.Context) {
	id, ok := pathID(c, "id")
	if !ok {
		return
	}
	data, err := h.service.Roster(c.Request.Context(), id)
	if err != nil {
		salonReply(c, nil, err)
		return
	}
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="ai-salon-roster.csv"`)
	c.Status(http.StatusOK)
	_, _ = c.Writer.Write([]byte{0xef, 0xbb, 0xbf})
	w := csv.NewWriter(c.Writer)
	_ = w.Write([]string{"真实姓名", "学院", "年级", "学号", "校区", "性别", "邮箱", "学生身份", "报名状态", "提交时间（北京时间）", "签到时间（北京时间）"})
	zone := time.FixedZone("CST", 8*60*60)
	for _, r := range data.Items {
		gender := ""
		if r.Gender == 1 {
			gender = "男"
		}
		if r.Gender == 2 {
			gender = "女"
		}
		status := map[string]string{aisalon.Registered: "已报名", aisalon.Waitlisted: "候补中", aisalon.Cancelled: "已取消"}[r.Status]
		check := ""
		if r.CheckedInAt != nil {
			check = r.CheckedInAt.In(zone).Format("2006-01-02 15:04:05")
		}
		student := "历史资料"
		if r.IsStudent != nil {
			student = "非在校学生"
			if *r.IsStudent {
				student = "在校学生"
			}
		}
		row := []string{r.RealName, r.College, r.Grade, r.StudentID, r.Campus, gender, r.Email, student, status, r.SubmittedAt.In(zone).Format("2006-01-02 15:04:05"), check}
		for i := range row {
			row[i] = salonCSVCell(row[i])
		}
		_ = w.Write(row)
	}
	w.Flush()
	if err := w.Error(); err != nil {
		_ = c.Error(err)
	}
}
