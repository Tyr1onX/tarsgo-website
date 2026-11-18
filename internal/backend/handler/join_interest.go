package handler

import (
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/middleware"
	"tarsgo-backend/model"
)

var joinInterestQQPattern = regexp.MustCompile(`^[1-9][0-9]{4,11}$`)

type JoinInterestHandler struct {
	db *gorm.DB
}

type joinInterestInput struct {
	PreferredGroupID *uint64 `json:"preferredGroupId"`
	QQ               string  `json:"qq"`
	Motivation       string  `json:"motivation"`
	Background       string  `json:"background"`
	Source           string  `json:"source"`
}

type joinInterestGroupOption struct {
	ID   uint64 `json:"id"`
	Name string `json:"name"`
}

type joinInterestAdminItem struct {
	ID         uint64    `json:"id"`
	UserID     uint64    `json:"userId"`
	RealName   string    `json:"realName"`
	Email      string    `json:"email"`
	College    string    `json:"college"`
	Grade      string    `json:"grade"`
	GroupName  string    `json:"groupName"`
	QQ         string    `json:"qq"`
	Motivation string    `json:"motivation"`
	Background string    `json:"background"`
	Source     string    `json:"source"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

func NewJoinInterestHandler(db *gorm.DB) *JoinInterestHandler {
	return &JoinInterestHandler{db: db}
}

func (h *JoinInterestHandler) Mine(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	var groups []joinInterestGroupOption
	if err := h.db.WithContext(c.Request.Context()).Model(&model.UserGroup{}).
		Select("id, name").Where("status = ? AND `show` = ? AND is_default = ?", model.UserGroupStatusActive, 1, false).
		Order("id ASC").Scan(&groups).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "无法加载意向组别")
		return
	}
	var interest model.JoinInterest
	err := h.db.WithContext(c.Request.Context()).Where("user_id = ?", user.ID).First(&interest).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		writeAPIError(c, http.StatusInternalServerError, "无法加载意向登记")
		return
	}
	var existing *model.JoinInterest
	if err == nil {
		existing = &interest
	}
	writeAPI(c, http.StatusOK, "获取意向登记成功", gin.H{"groups": groups, "interest": existing})
}

func normalizeJoinInterestInput(input *joinInterestInput) bool {
	input.QQ = strings.TrimSpace(input.QQ)
	input.Motivation = strings.TrimSpace(input.Motivation)
	input.Background = strings.TrimSpace(input.Background)
	input.Source = strings.TrimSpace(input.Source)
	return joinInterestQQPattern.MatchString(input.QQ) &&
		len([]rune(input.Motivation)) <= 500 &&
		len([]rune(input.Background)) <= 500 &&
		len([]rune(input.Source)) <= 60
}

func (h *JoinInterestHandler) Save(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	var input joinInterestInput
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请检查填写内容")
		return
	}
	if input.PreferredGroupID == nil || *input.PreferredGroupID == 0 {
		writeAPIError(c, http.StatusBadRequest, "请选择意向组别")
		return
	}
	if !normalizeJoinInterestInput(&input) {
		writeAPIError(c, http.StatusBadRequest, "请检查 QQ 号及填写内容")
		return
	}
	var count int64
	if err := h.db.WithContext(c.Request.Context()).Model(&model.UserGroup{}).
		Where("id = ? AND status = ? AND `show` = ? AND is_default = ?", *input.PreferredGroupID, model.UserGroupStatusActive, 1, false).
		Count(&count).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "验证组别失败")
		return
	}
	if count == 0 {
		writeAPIError(c, http.StatusBadRequest, "请选择有效的意向组别")
		return
	}
	interest := model.JoinInterest{
		UserID: user.ID, PreferredGroupID: input.PreferredGroupID, QQ: input.QQ,
		Motivation: input.Motivation, Background: input.Background, Source: input.Source,
		Status: "pending",
	}
	err := h.db.WithContext(c.Request.Context()).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"preferred_group_id", "qq", "motivation", "background", "status", "updated_at"}),
	}).Create(&interest).Error
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "保存意向登记失败")
		return
	}
	// Re-read the authoritative record: updating an interest reopens follow-up,
	// but preserves the original acquisition source and created time.
	var saved model.JoinInterest
	if err := h.db.WithContext(c.Request.Context()).Where("user_id = ?", user.ID).First(&saved).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "无法读取意向登记")
		return
	}
	writeAPI(c, http.StatusOK, "意向已保存", saved)
}

func (h *JoinInterestHandler) Withdraw(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	if err := h.db.WithContext(c.Request.Context()).Where("user_id = ?", user.ID).Delete(&model.JoinInterest{}).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "撤回意向失败")
		return
	}
	writeAPI(c, http.StatusOK, "意向已撤回", nil)
}

// List and SetStatus are only mounted under RequireSuperAdmin. Private contact
// details never appear in recruitment registrations, public pages or group APIs.
func (h *JoinInterestHandler) List(c *gin.Context) {
	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	if err != nil || page < 1 || page > 100000 {
		writeAPIError(c, http.StatusBadRequest, "页码不合法")
		return
	}
	status := strings.TrimSpace(c.Query("status"))
	if status != "" && status != "pending" && status != "contacted" && status != "closed" {
		writeAPIError(c, http.StatusBadRequest, "状态不合法")
		return
	}
	query := h.db.WithContext(c.Request.Context()).Table("join_interests AS i")
	if status != "" {
		query = query.Where("i.status = ?", status)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "获取意向数量失败")
		return
	}
	items := make([]joinInterestAdminItem, 0)
	err = query.Select("i.id, i.user_id, COALESCE(u.real_name, '') AS real_name, u.email, u.college, u.grade, COALESCE(g.name, '') AS group_name, i.qq, i.motivation, i.background, i.source, i.status, i.created_at, i.updated_at").
		Joins("JOIN users AS u ON u.id = i.user_id").
		Joins("LEFT JOIN user_groups AS g ON g.id = i.preferred_group_id").
		Order("i.created_at DESC, i.id DESC").
		Limit(50).Offset((page - 1) * 50).Scan(&items).Error
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "获取意向名单失败")
		return
	}
	writeAPI(c, http.StatusOK, "获取意向名单成功", gin.H{"items": items, "total": total, "page": page})
}

func (h *JoinInterestHandler) SetStatus(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		writeAPIError(c, http.StatusBadRequest, "意向记录不存在")
		return
	}
	var input struct {
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&input); err != nil ||
		(input.Status != "pending" && input.Status != "contacted" && input.Status != "closed") {
		writeAPIError(c, http.StatusBadRequest, "状态不合法")
		return
	}
	result := h.db.WithContext(c.Request.Context()).Model(&model.JoinInterest{}).Where("id = ?", id).Update("status", input.Status)
	if result.Error != nil {
		writeAPIError(c, http.StatusInternalServerError, "更新联系状态失败")
		return
	}
	if result.RowsAffected == 0 {
		writeAPIError(c, http.StatusNotFound, "意向记录不存在")
		return
	}
	writeAPI(c, http.StatusOK, "联系状态已更新", nil)
}
