package handler

import (
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"tarsgo-backend/middleware"
	"tarsgo-backend/model"
)

type OperationsProgressHandler struct{ db *gorm.DB }

func NewOperationsProgressHandler(db *gorm.DB) *OperationsProgressHandler {
	return &OperationsProgressHandler{db: db}
}

type operationsProgressInput struct {
	Title        string     `json:"title"`
	Kind         string     `json:"kind"`
	Stage        string     `json:"stage"`
	Owner        string     `json:"owner"`
	IntervalDays int        `json:"intervalDays"`
	NextAction   string     `json:"nextAction"`
	NextCheckAt  *time.Time `json:"nextCheckAt"`
	Status       string     `json:"status"`
}

type operationsUpdateInput struct {
	Content     string  `json:"content"`
	Kind        string  `json:"kind"`
	Link        string  `json:"link"`
	PublishedOn *string `json:"publishedOn"`
}

type operationsProgressView struct {
	model.OperationsProgressItem
	LastUpdate         *model.OperationsProgressUpdate `json:"lastUpdate"`
	LastCompletedOn    *string                         `json:"lastCompletedOn"`
	LastStageChangedAt *time.Time                      `json:"lastStageChangedAt"`
	LastConfirmedAt    *time.Time                      `json:"lastConfirmedAt"`
}

func validateOperationsProgress(input *operationsProgressInput) bool {
	input.Title = strings.TrimSpace(input.Title)
	input.Owner = strings.TrimSpace(input.Owner)
	input.NextAction = strings.TrimSpace(input.NextAction)
	if input.Title == "" || len([]rune(input.Title)) > 120 || len([]rune(input.Owner)) > 80 ||
		len([]rune(input.NextAction)) > 300 || input.IntervalDays < 0 || input.IntervalDays > 365 {
		return false
	}
	if input.Status != "active" && input.Status != "blocked" && input.Status != "done" {
		return false
	}
	if input.Kind != "workstream" && input.Kind != "channel" && input.Kind != "video" && input.Kind != "merchandise" {
		return false
	}
	if !validOperationsStage(input.Kind, input.Stage) {
		return false
	}
	if input.Kind != "workstream" && input.IntervalDays != 0 {
		return false
	}
	if input.Kind == "workstream" && input.IntervalDays == 0 && input.Status != "done" && input.NextCheckAt == nil {
		return false
	}
	// A recurring item's next review is calculated from recorded completions.
	if input.IntervalDays > 0 {
		input.NextCheckAt = nil
	}
	return true
}

func validateOperationsUpdate(input *operationsUpdateInput) bool {
	input.Content = strings.TrimSpace(input.Content)
	input.Link = strings.TrimSpace(input.Link)
	if input.Content == "" || len([]rune(input.Content)) > 1000 || len(input.Link) > 500 ||
		(input.Kind != "progress" && input.Kind != "completed") {
		return false
	}
	if input.Kind == "completed" {
		if input.PublishedOn == nil {
			return false
		}
		_, err := time.Parse("2006-01-02", *input.PublishedOn)
		if err != nil || *input.PublishedOn > time.Now().In(time.FixedZone("Beijing", 8*3600)).Format("2006-01-02") {
			return false
		}
	} else if input.PublishedOn != nil {
		return false
	}
	if input.Link != "" {
		link, err := url.Parse(input.Link)
		if err != nil || (link.Scheme != "http" && link.Scheme != "https") || link.Host == "" || link.User != nil {
			return false
		}
	}
	return true
}

// Authorization stays on the server; callers cannot grant their own edit rights.
func (h *OperationsProgressHandler) canManage(c *gin.Context) (bool, error) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil {
		return false, nil
	}
	if user.Role.Name == model.RoleNameSuperAdmin {
		return true, nil
	}
	var count int64
	err := h.db.WithContext(c.Request.Context()).
		Table("user_group_members AS m").
		Joins("JOIN user_groups AS g ON g.id = m.group_id").
		Where("m.user_id = ? AND g.name = ? AND g.status = ?", user.ID, "运营组", model.UserGroupStatusActive).
		Count(&count).Error
	return count > 0, err
}

func (h *OperationsProgressHandler) requireEditor(c *gin.Context) bool {
	canManage, err := h.canManage(c)
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "权限检查失败")
		return false
	}
	if !canManage {
		writeAPIError(c, http.StatusForbidden, "只有运营组成员和超级管理员可以维护运营进展")
		return false
	}
	return true
}

func (h *OperationsProgressHandler) List(c *gin.Context) {
	canManage, err := h.canManage(c)
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "读取权限失败")
		return
	}
	var items []model.OperationsProgressItem
	if err := h.db.WithContext(c.Request.Context()).Order("id DESC").Find(&items).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "运营进展读取失败")
		return
	}
	views := make([]operationsProgressView, len(items))
	byID := make(map[uint64]int, len(items))
	for i, item := range items {
		views[i] = operationsProgressView{OperationsProgressItem: item}
		byID[item.ID] = i
	}

	// One batch for the latest note per item; no per-item database round trips.
	var latest []model.OperationsProgressUpdate
	latestIDs := h.db.Model(&model.OperationsProgressUpdate{}).
		Select("MAX(id)").Group("item_id")
	if err := h.db.WithContext(c.Request.Context()).Where("id IN (?)", latestIDs).Find(&latest).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "运营进展读取失败")
		return
	}
	for i := range latest {
		if at, exists := byID[latest[i].ItemID]; exists {
			views[at].LastUpdate = &latest[i]
		}
	}

	type completion struct {
		ItemID uint64
		Day    *string
	}
	var completed []completion
	if err := h.db.WithContext(c.Request.Context()).Model(&model.OperationsProgressUpdate{}).
		Select("item_id, MAX(COALESCE(published_on, DATE_FORMAT(created_at, '%Y-%m-%d'))) AS day").Where("kind = ?", "completed").Group("item_id").
		Scan(&completed).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "运营进展读取失败")
		return
	}
	for _, entry := range completed {
		if at, exists := byID[entry.ItemID]; exists {
			views[at].LastCompletedOn = entry.Day
		}
	}

	type activity struct {
		ItemID        uint64
		LastChanged   *time.Time
		LastConfirmed *time.Time
	}
	var activities []activity
	if err := h.db.WithContext(c.Request.Context()).Model(&model.OperationsProgressUpdate{}).
		Select("item_id, MAX(CASE WHEN kind = 'stage' THEN created_at END) AS last_changed, MAX(CASE WHEN kind IN ('stage','confirmed') THEN created_at END) AS last_confirmed").
		Group("item_id").Scan(&activities).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "阶段进度读取失败")
		return
	}
	for _, entry := range activities {
		if at, exists := byID[entry.ItemID]; exists {
			views[at].LastStageChangedAt = entry.LastChanged
			views[at].LastConfirmedAt = entry.LastConfirmed
		}
	}

	var snapshots []model.OperationsAccountSnapshot
	if err := h.db.WithContext(c.Request.Context()).Order("observed_on ASC").Find(&snapshots).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "账号历史数据读取失败")
		return
	}
	var posts []model.OperationsPlatformPost
	if err := h.db.WithContext(c.Request.Context()).Order("published_at DESC").Limit(300).Find(&posts).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "历史作品读取失败")
		return
	}
	for _, post := range posts {
		if post.Platform != "bilibili" {
			continue
		}
		day := post.PublishedAt.In(time.FixedZone("Beijing", 8*3600)).Format("2006-01-02")
		for i := range views {
			if views[i].Kind == "channel" && (views[i].Title == "B站运营" ||
				(views[i].SeedKey != nil && *views[i].SeedKey == "channel:bilibili")) {
				if views[i].LastCompletedOn == nil || *views[i].LastCompletedOn < day {
					views[i].LastCompletedOn = &day
				}
			}
		}
		break
	}
	var updates []model.OperationsProgressUpdate
	if err := h.db.WithContext(c.Request.Context()).Order("id DESC").Limit(15).Find(&updates).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "运营进展读取失败")
		return
	}
	writeAPI(c, http.StatusOK, "运营进展", gin.H{"items": views, "updates": updates, "snapshots": snapshots, "posts": posts, "canManage": canManage})
}

func (h *OperationsProgressHandler) Create(c *gin.Context) {
	if !h.requireEditor(c) {
		return
	}
	var input operationsProgressInput
	if c.ShouldBindJSON(&input) != nil || !validateOperationsProgress(&input) {
		writeAPIError(c, http.StatusBadRequest, "请检查事项名称、负责人和跟进安排")
		return
	}
	item := model.OperationsProgressItem{
		Title: input.Title, Kind: input.Kind, Stage: input.Stage, Owner: input.Owner, IntervalDays: input.IntervalDays,
		NextAction: input.NextAction, NextCheckAt: input.NextCheckAt, Status: input.Status,
	}
	if err := h.db.WithContext(c.Request.Context()).Create(&item).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "创建事项失败")
		return
	}
	writeAPI(c, http.StatusCreated, "事项已创建", item)
}

func (h *OperationsProgressHandler) Update(c *gin.Context) {
	if !h.requireEditor(c) {
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		writeAPIError(c, http.StatusBadRequest, "事项编号不正确")
		return
	}
	var input operationsProgressInput
	if c.ShouldBindJSON(&input) != nil || !validateOperationsProgress(&input) {
		writeAPIError(c, http.StatusBadRequest, "请检查事项名称、负责人和跟进安排")
		return
	}
	var existing model.OperationsProgressItem
	if err := h.db.WithContext(c.Request.Context()).First(&existing, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			writeAPIError(c, http.StatusNotFound, "事项不存在")
		} else {
			writeAPIError(c, http.StatusInternalServerError, "读取事项失败")
		}
		return
	}
	if existing.Stage != input.Stage {
		writeAPIError(c, http.StatusConflict, "请直接点击进度条更新阶段")
		return
	}
	result := h.db.WithContext(c.Request.Context()).Model(&model.OperationsProgressItem{}).Where("id = ?", id).
		Updates(map[string]any{"title": input.Title, "kind": input.Kind, "stage": input.Stage, "owner": input.Owner,
			"interval_days": input.IntervalDays, "next_action": input.NextAction,
			"next_check_at": input.NextCheckAt, "status": input.Status})
	if result.Error != nil {
		writeAPIError(c, http.StatusInternalServerError, "保存事项失败")
		return
	}
	if result.RowsAffected == 0 {
		var exists int64
		if err := h.db.WithContext(c.Request.Context()).Model(&model.OperationsProgressItem{}).Where("id = ?", id).Count(&exists).Error; err != nil {
			writeAPIError(c, http.StatusInternalServerError, "核对事项失败")
			return
		}
		if exists == 0 {
			writeAPIError(c, http.StatusNotFound, "事项不存在")
			return
		}
	}
	writeAPI(c, http.StatusOK, "事项已保存", gin.H{"id": id})
}

func (h *OperationsProgressHandler) AddUpdate(c *gin.Context) {
	if !h.requireEditor(c) {
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		writeAPIError(c, http.StatusBadRequest, "事项编号不正确")
		return
	}
	var input operationsUpdateInput
	if c.ShouldBindJSON(&input) != nil || !validateOperationsUpdate(&input) {
		writeAPIError(c, http.StatusBadRequest, "请填写进展内容并检查链接")
		return
	}
	var item model.OperationsProgressItem
	if err := h.db.WithContext(c.Request.Context()).First(&item, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			writeAPIError(c, http.StatusNotFound, "事项不存在")
		} else {
			writeAPIError(c, http.StatusInternalServerError, "读取事项失败")
		}
		return
	}
	if item.Status == "done" {
		writeAPIError(c, http.StatusConflict, "已结束的事项不能追加进展")
		return
	}
	if input.Kind == "completed" && item.IntervalDays == 0 && item.Kind != "channel" {
		writeAPIError(c, http.StatusBadRequest, "此事项只能记录进展")
		return
	}
	user, _ := middleware.CurrentSessionUser(c)
	entry := model.OperationsProgressUpdate{ItemID: id, AuthorID: user.ID,
		Content: input.Content, Kind: input.Kind, Link: input.Link, PublishedOn: input.PublishedOn}
	if err := h.db.WithContext(c.Request.Context()).Create(&entry).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "记录进展失败")
		return
	}
	writeAPI(c, http.StatusCreated, "进展已记录", entry)
}

func (h *OperationsProgressHandler) History(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		writeAPIError(c, http.StatusBadRequest, "事项编号不正确")
		return
	}
	var item model.OperationsProgressItem
	if err := h.db.WithContext(c.Request.Context()).First(&item, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			writeAPIError(c, http.StatusNotFound, "事项不存在")
		} else {
			writeAPIError(c, http.StatusInternalServerError, "读取事项失败")
		}
		return
	}
	var updates []model.OperationsProgressUpdate
	if err := h.db.WithContext(c.Request.Context()).Where("item_id = ?", id).Order("id DESC").Limit(100).Find(&updates).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "历史进展读取失败")
		return
	}
	writeAPI(c, http.StatusOK, "历史进展", updates)
}
