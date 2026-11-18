package handler

import (
	"errors"
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

var errOperationsCopySource = errors.New("invalid operations copy source")

func NewOperationsProgressHandler(db *gorm.DB) *OperationsProgressHandler {
	return &OperationsProgressHandler{db: db}
}

type operationsProgressInput struct {
	Title        string     `json:"title"`
	Kind         string     `json:"kind"`
	Platforms    string     `json:"platforms"`
	CopyFromID   uint64     `json:"copyFromItemId"`
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
	LastUpdate      *model.OperationsProgressUpdate `json:"lastUpdate"`
	LastCompletedOn *string                         `json:"lastCompletedOn"`
	Steps           []operationsStepView            `json:"steps"`
}

func validateOperationsProgress(input *operationsProgressInput) bool {
	input.Title = strings.TrimSpace(input.Title)
	input.NextAction = strings.TrimSpace(input.NextAction)
	input.Platforms = strings.TrimSpace(input.Platforms)
	if input.Platforms != "" {
		seen := map[string]bool{}
		for _, platform := range strings.Split(input.Platforms, ",") {
			if (platform != "douyin" && platform != "bilibili" && platform != "wechat") || seen[platform] {
				return false
			}
			seen[platform] = true
		}
	}
	if input.Title == "" || len([]rune(input.Title)) > 120 ||
		len([]rune(input.NextAction)) > 300 || input.IntervalDays < 0 || input.IntervalDays > 365 {
		return false
	}
	if input.Status != "active" && input.Status != "blocked" && input.Status != "done" {
		return false
	}
	if input.Kind != "workstream" && input.Kind != "channel" && input.Kind != "video" && input.Kind != "merchandise" {
		return false
	}
	if input.CopyFromID != 0 && input.Kind != "video" && input.Kind != "merchandise" {
		return false
	}
	if input.Kind != "workstream" && input.IntervalDays != 0 {
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
		views[i] = operationsProgressView{OperationsProgressItem: item, Steps: []operationsStepView{}}
		byID[item.ID] = i
	}

	// Load every workflow step once; derive parent state instead of storing a second copy.
	var steps []model.OperationsProgressStep
	if err := h.db.WithContext(c.Request.Context()).Order("item_id, position, id").Find(&steps).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "运营环节读取失败")
		return
	}
	needsMembers := canManage
	for _, step := range steps {
		if step.AssigneeID != nil {
			needsMembers = true
			break
		}
	}
	var members []operationsMember
	if needsMembers {
		members, err = h.members(c.Request.Context())
		if err != nil {
			writeAPIError(c, http.StatusInternalServerError, "运营成员读取失败")
			return
		}
	}
	names := make(map[uint64]string, len(members))
	for _, member := range members {
		names[member.ID] = member.Name
	}
	for _, step := range steps {
		if at, exists := byID[step.ItemID]; exists {
			name := ""
			if step.AssigneeID != nil {
				name = names[*step.AssigneeID]
				if name == "" {
					name = "成员 #" + strconv.FormatUint(*step.AssigneeID, 10)
				}
			}
			views[at].Steps = append(views[at].Steps, operationsStepView{OperationsProgressStep: step, AssigneeName: name})
		}
	}
	for i := range views {
		if status, stage := operationsStepState(views[i].Steps); status != "" {
			views[i].Status, views[i].Stage = status, stage
		}
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
	channelNames := map[string]string{"bilibili": "B站运营", "wechat": "公众号运营", "douyin": "抖音运营"}
	seenPlatforms := map[string]bool{}
	for _, post := range posts {
		channelName, supported := channelNames[post.Platform]
		if !supported || seenPlatforms[post.Platform] {
			continue
		}
		seenPlatforms[post.Platform] = true
		day := post.PublishedAt.In(time.FixedZone("Beijing", 8*3600)).Format("2006-01-02")
		for i := range views {
			if views[i].Kind == "channel" && (views[i].Title == channelName ||
				(views[i].SeedKey != nil && *views[i].SeedKey == "channel:"+post.Platform)) {
				if views[i].LastCompletedOn == nil || *views[i].LastCompletedOn < day {
					views[i].LastCompletedOn = &day
				}
			}
		}
	}
	var updates []model.OperationsProgressUpdate
	if err := h.db.WithContext(c.Request.Context()).Order("id DESC").Limit(15).Find(&updates).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "运营进展读取失败")
		return
	}
	user, _ := middleware.CurrentSessionUser(c)
	var viewerID uint64
	if user != nil {
		viewerID = user.ID
	}
	if !canManage {
		members = nil
	}
	writeAPI(c, http.StatusOK, "运营进展", gin.H{"items": views, "updates": updates, "snapshots": snapshots,
		"posts": posts, "canManage": canManage, "viewerId": viewerID, "members": members})
}

func (h *OperationsProgressHandler) Create(c *gin.Context) {
	if !h.requireEditor(c) {
		return
	}
	var input operationsProgressInput
	if c.ShouldBindJSON(&input) != nil || !validateOperationsProgress(&input) {
		writeAPIError(c, http.StatusBadRequest, "请检查事项名称和跟进安排")
		return
	}
	item := model.OperationsProgressItem{
		Title: input.Title, Kind: input.Kind, Platforms: input.Platforms,
		IntervalDays: input.IntervalDays, NextAction: input.NextAction,
		NextCheckAt: input.NextCheckAt, Status: input.Status,
	}
	if len(model.OperationsStepPresets(input.Kind)) > 0 {
		item.Stage = "unconfirmed" // Archived legacy field; step rows own live progress.
	}
	err := h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&item).Error; err != nil {
			return err
		}
		presets := model.OperationsStepPresets(item.Kind)
		if len(presets) == 0 {
			return nil
		}
		previous := map[string]*uint64{}
		if input.CopyFromID != 0 {
			var source model.OperationsProgressItem
			if err := tx.First(&source, input.CopyFromID).Error; err != nil || source.Kind != item.Kind {
				return errOperationsCopySource
			}
			var sourceSteps []model.OperationsProgressStep
			if err := tx.Where("item_id = ?", source.ID).Find(&sourceSteps).Error; err != nil {
				return err
			}
			for _, step := range sourceSteps {
				previous[step.Key] = step.AssigneeID
			}
		}
		steps := make([]model.OperationsProgressStep, 0, len(presets))
		for i, preset := range presets {
			steps = append(steps, model.OperationsProgressStep{
				ItemID: item.ID, Key: preset.Key, Title: preset.Title, Position: i,
				Status: "pending", AssigneeID: previous[preset.Key],
			})
		}
		return tx.Create(&steps).Error
	})
	if errors.Is(err, errOperationsCopySource) {
		writeAPIError(c, http.StatusBadRequest, "请选择同类型的已有事项复制分工")
		return
	}
	if err != nil {
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
		writeAPIError(c, http.StatusBadRequest, "请检查事项名称和跟进安排")
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
	if existing.Kind != input.Kind {
		writeAPIError(c, http.StatusConflict, "创建后不能变更事项类型")
		return
	}
	var stepCount int64
	if err := h.db.WithContext(c.Request.Context()).Model(&model.OperationsProgressStep{}).
		Where("item_id = ?", id).Count(&stepCount).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "读取环节失败")
		return
	}
	values := map[string]any{"title": input.Title, "platforms": input.Platforms,
		"interval_days": input.IntervalDays, "next_action": input.NextAction,
		"next_check_at": input.NextCheckAt}
	if stepCount == 0 {
		values["status"] = input.Status
	}
	result := h.db.WithContext(c.Request.Context()).Model(&model.OperationsProgressItem{}).
		Where("id = ?", id).Updates(values)
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
	var counts struct{ Total, Open int64 }
	if err := h.db.WithContext(c.Request.Context()).Model(&model.OperationsProgressStep{}).
		Select("COUNT(*) AS total, COALESCE(SUM(CASE WHEN status != 'done' THEN 1 ELSE 0 END), 0) AS open").
		Where("item_id = ?", id).Scan(&counts).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "读取环节状态失败")
		return
	}
	if counts.Total > 0 && counts.Open == 0 {
		writeAPIError(c, http.StatusConflict, "已完成的事项不能追加进展")
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
