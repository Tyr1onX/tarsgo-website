package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/middleware"
	"tarsgo-backend/model"
	"tarsgo-backend/service/operationsworkflow"
)

var operationsPlatforms = map[string]string{
	"douyin": "抖音", "bilibili": "B站", "wechat": "公众号", "wechat_video": "视频号",
}

func parseOperationsPlatforms(values []string, kind string) ([]string, error) {
	if len(values) == 0 || len(values) > 4 {
		return nil, errors.New("请选择发布平台")
	}
	seen := map[string]bool{}
	result := make([]string, 0, len(values))
	for _, platform := range values {
		if _, ok := operationsPlatforms[platform]; !ok || seen[platform] {
			return nil, errors.New("发布平台无效或重复")
		}
		if kind == "article" && platform != "wechat" || kind == "video" && platform == "wechat" {
			return nil, errors.New("作品类型与发布平台不匹配")
		}
		seen[platform] = true
		result = append(result, platform)
	}
	return result, nil
}

// Called only after the relevant channel row was locked by CreateEpisode/EnsureUpcoming.
// An episode always has one workflow, regardless of how many platforms it targets.
func ensureEpisodeTargets(tx *gorm.DB, episode *model.OperationsProgressItem) error {
	var count int64
	if err := tx.Model(&model.OperationsPublication{}).Where("item_id = ?", episode.ID).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	platforms := []string{}
	if episode.ChannelID != nil && episode.EpisodeNo > 1 {
		var previous model.OperationsProgressItem
		if err := tx.Where("channel_id = ? AND series_name = ? AND episode_no < ?", *episode.ChannelID, episode.SeriesName, episode.EpisodeNo).Order("episode_no DESC").
			First(&previous).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		} else if err == nil {
			var targets []model.OperationsPublication
			if err := tx.Where("item_id = ?", previous.ID).Find(&targets).Error; err != nil {
				return err
			}
			for _, target := range targets {
				platforms = append(platforms, target.Platform)
			}
		}
	}
	if len(platforms) == 0 {
		platforms = []string{episode.Platforms}
	}
	for _, platform := range platforms {
		if operationsPlatforms[platform] == "" {
			continue
		}
		if err := tx.Create(&model.OperationsPublication{ItemID: episode.ID, Platform: platform, Status: "pending"}).Error; err != nil {
			return err
		}
	}
	return nil
}

// UpdatePublication is the single write path for platform publishing.
// It updates the derived "published" workflow step and replenishes one draft atomically.
func (h *OperationsProgressHandler) UpdatePublication(c *gin.Context) {
	itemID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	platform := c.Param("platform")
	if err != nil || itemID == 0 || operationsPlatforms[platform] == "" {
		writeAPIError(c, http.StatusBadRequest, "作品或平台无效")
		return
	}
	var input struct {
		Status      string `json:"status"`
		URL         string `json:"url"`
		VersionNote string `json:"versionNote"`
	}
	if c.ShouldBindJSON(&input) != nil || (input.Status != "pending" && input.Status != "done") {
		writeAPIError(c, http.StatusBadRequest, "发布状态无效")
		return
	}
	input.URL = strings.TrimSpace(input.URL)
	input.VersionNote = strings.TrimSpace(input.VersionNote)
	if !validOperationsEvidenceURL(input.URL) || len([]rune(input.VersionNote)) > 300 {
		writeAPIError(c, http.StatusBadRequest, "链接或版本说明不正确")
		return
	}
	actor, ok := middleware.CurrentSessionUser(c)
	if !ok || actor == nil {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	canManage, err := h.canManage(c)
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "读取权限失败")
		return
	}
	var denied, unfinished bool
	err = h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		var item model.OperationsProgressItem
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&item, itemID).Error; err != nil {
			return err
		}
		var step model.OperationsProgressStep
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("item_id = ? AND `key` = ?", itemID, "published").First(&step).Error; err != nil {
			return err
		}
		if !canManage && (step.AssigneeID == nil || *step.AssigneeID != actor.ID) {
			denied = true
			return nil
		}
		var target model.OperationsPublication
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("item_id = ? AND platform = ?", itemID, platform).First(&target).Error; err != nil {
			return err
		}
		if input.Status == "done" {
			var remaining int64
			if err := tx.Model(&model.OperationsProgressStep{}).
				Where("item_id = ? AND id <> ? AND status <> ?", itemID, step.ID, "done").Count(&remaining).Error; err != nil {
				return err
			}
			if remaining > 0 {
				unfinished = true
				return nil
			}
		}
		if target.Status == input.Status && target.URL == input.URL && target.VersionNote == input.VersionNote {
			return nil
		}
		previousStatus := target.Status
		now := time.Now().UTC()
		var completed any
		if input.Status == "done" {
			completed = now
		}
		if err := tx.Model(&target).Updates(map[string]any{
			"status": input.Status, "url": input.URL, "version_note": input.VersionNote,
			"updated_by": actor.ID, "completed_at": completed,
		}).Error; err != nil {
			return err
		}
		ref := step.ID
		label := "待发布"
		if input.Status == "done" {
			label = "已发布"
		}
		if err := tx.Create(&model.OperationsProgressUpdate{
			ItemID: itemID, StepID: &ref, AuthorID: actor.ID, Kind: "progress",
			Content: fmt.Sprintf("%s · %s", operationsPlatforms[platform], label),
			Link:    input.URL, FromStage: previousStatus, ToStage: input.Status,
		}).Error; err != nil {
			return err
		}
		var pending int64
		if err := tx.Model(&model.OperationsPublication{}).
			Where("item_id = ? AND status <> ?", itemID, "done").Count(&pending).Error; err != nil {
			return err
		}
		newStatus := "done"
		if pending > 0 {
			newStatus = "pending"
			var done int64
			if err := tx.Model(&model.OperationsPublication{}).
				Where("item_id = ? AND status = ?", itemID, "done").Count(&done).Error; err != nil {
				return err
			}
			if done > 0 {
				newStatus = "active"
			}
		}
		previousStepStatus := step.Status
		if newStatus != previousStepStatus {
			var completedAt any
			if newStatus == "done" {
				completedAt = now
			}
			if err := tx.Model(&step).Updates(map[string]any{"status": newStatus, "completed_at": completedAt}).Error; err != nil {
				return err
			}
		}
		if newStatus == "done" && previousStepStatus != "done" {
			if item.ChannelID == nil {
				return ensureIndependentSuccessor(tx, &item)
			}
			next, err := operationsworkflow.EnsureUpcoming(tx, *item.ChannelID, item.SeriesName)
			if err != nil {
				return err
			}
			return ensureEpisodeTargets(tx, next)
		}
		return nil
	})
	switch {
	case denied:
		writeAPIError(c, http.StatusForbidden, "只能更新自己负责的发布环节")
	case unfinished:
		writeAPIError(c, http.StatusConflict, "请先完成制作和审核环节")
	case errors.Is(err, gorm.ErrRecordNotFound):
		writeAPIError(c, http.StatusNotFound, "作品或发布平台不存在")
	case err != nil:
		writeAPIError(c, http.StatusInternalServerError, "保存发布状态失败")
	default:
		writeAPI(c, http.StatusOK, "发布记录已保存", gin.H{"itemId": itemID, "platform": platform})
	}
}

// A legacy standalone work has no channel queue. Its predecessor identity is
// sufficient to make a single follow-up idempotent without creating platform copies.
func ensureIndependentSuccessor(tx *gorm.DB, item *model.OperationsProgressItem) error {
	var count int64
	if err := tx.Model(&model.OperationsProgressItem{}).
		Where("predecessor_id = ?", item.ID).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	previousID := item.ID
	next := model.OperationsProgressItem{
		Title: "下一期 · 选题待定", Kind: item.Kind, Platforms: item.Platforms,
		SeriesName: item.SeriesName, PredecessorID: &previousID, EpisodeNo: item.EpisodeNo + 1,
		Stage: "unconfirmed", Status: "active",
	}
	if err := tx.Create(&next).Error; err != nil {
		return err
	}
	var previousSteps []model.OperationsProgressStep
	if err := tx.Where("item_id = ?", item.ID).Find(&previousSteps).Error; err != nil {
		return err
	}
	owners := map[string]*uint64{}
	for _, step := range previousSteps {
		if step.AssigneeID != nil {
			owners[step.Key] = step.AssigneeID
		}
	}
	for _, preset := range model.OperationsStepPresets(item.Kind) {
		var exists int64
		if err := tx.Model(&model.OperationsProgressStep{}).Where("item_id = ?", next.ID).Count(&exists).Error; err != nil {
			return err
		}
		step := model.OperationsProgressStep{ItemID: next.ID, Key: preset.Key, Title: preset.Title, Position: int(exists),
			AssigneeID: owners[preset.Key], Status: "pending"}
		if err := tx.Create(&step).Error; err != nil {
			return err
		}
	}
	var targets []model.OperationsPublication
	if err := tx.Where("item_id = ?", item.ID).Find(&targets).Error; err != nil {
		return err
	}
	for _, target := range targets {
		if err := tx.Create(&model.OperationsPublication{ItemID: next.ID, Platform: target.Platform, Status: "pending"}).Error; err != nil {
			return err
		}
	}
	return nil
}
