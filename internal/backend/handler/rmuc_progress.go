package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"tarsgo-backend/middleware"
	"tarsgo-backend/model"
)

type RMUCProgressHandler struct{ db *gorm.DB }

func NewRMUCProgressHandler(db *gorm.DB) *RMUCProgressHandler { return &RMUCProgressHandler{db: db} }

type rmucProgressInput struct {
	CourseID  string `json:"courseId"`
	Version   uint16 `json:"version"`
	Completed bool   `json:"completed"`
	Position  uint16 `json:"position"`
}

func validRMUCProgress(input rmucProgressInput) bool {
	// Only syntactic bounds here: the browser owns the versioned course catalogue.
	if len(input.CourseID) == 0 || len(input.CourseID) > 32 || input.Version == 0 || input.Position > 100 {
		return false
	}
	for _, c := range input.CourseID {
		if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-') {
			return false
		}
	}
	return true
}

func (h *RMUCProgressHandler) List(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	rows := []model.RMUCLessonProgress{}
	if err := h.db.WithContext(c.Request.Context()).Where("user_id = ?", user.ID).Order("updated_at DESC").Find(&rows).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "学习进度加载失败")
		return
	}
	writeAPI(c, http.StatusOK, "学习进度", rows)
}

func (h *RMUCProgressHandler) Save(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
	var input rmucProgressInput
	if c.ShouldBindJSON(&input) != nil || !validRMUCProgress(input) {
		writeAPIError(c, http.StatusBadRequest, "课程进度无效")
		return
	}
	row := model.RMUCLessonProgress{UserID: user.ID, CourseID: input.CourseID, Version: input.Version, Completed: input.Completed, Position: input.Position, UpdatedAt: time.Now().UTC()}
	// Replaying a completed lesson must not revoke its completion.
	err := h.db.WithContext(c.Request.Context()).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}, {Name: "course_id"}, {Name: "version"}},
		DoUpdates: clause.Assignments(map[string]interface{}{"completed": gorm.Expr("completed OR ?", row.Completed), "position": row.Position, "updated_at": row.UpdatedAt}),
	}).Create(&row).Error
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "学习进度保存失败")
		return
	}
	var saved model.RMUCLessonProgress
	if err = h.db.WithContext(c.Request.Context()).Where("user_id = ? AND course_id = ? AND version = ?", user.ID, row.CourseID, row.Version).First(&saved).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "学习进度读取失败")
		return
	}
	writeAPI(c, http.StatusOK, "学习进度已保存", saved)
}
