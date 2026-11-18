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

func (h *OperationsProgressHandler) ListMembers(c *gin.Context) {
	if !h.requireEditor(c) {
		return
	}
	members, err := h.members(c.Request.Context())
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "读取成员失败")
		return
	}
	writeAPI(c, http.StatusOK, "可分配成员", members)
}

func (h *OperationsProgressHandler) CreateEpisode(c *gin.Context) {
	if !h.requireEditor(c) {
		return
	}
	channelID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	var input struct {
		Title      string `json:"title"`
		SeriesName string `json:"seriesName"`
	}
	if err != nil || channelID == 0 || c.ShouldBindJSON(&input) != nil || len([]rune(strings.TrimSpace(input.Title))) > 120 || len([]rune(strings.TrimSpace(input.SeriesName))) > 80 {
		writeAPIError(c, http.StatusBadRequest, "请填写有效选题")
		return
	}
	var episode *model.OperationsProgressItem
	err = h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		var err error
		episode, err = operationsworkflow.CreateEpisode(tx, channelID, input.Title, input.SeriesName)
		if err != nil {
			return err
		}
		return ensureEpisodeTargets(tx, episode)
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		writeAPIError(c, http.StatusNotFound, "运营平台不存在")
	} else if err != nil {
		writeAPIError(c, http.StatusBadRequest, "创建制作任务失败")
	} else {
		writeAPI(c, http.StatusCreated, "制作任务已创建", episode)
	}
}

// ConfigureWork is the only administrative editor for work arrangements.
// It updates the one work and its platform targets without creating platform copies.
func (h *OperationsProgressHandler) SetupEpisode(c *gin.Context) {
	if !h.requireEditor(c) {
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	var input struct {
		Title      string   `json:"title"`
		SeriesName string   `json:"seriesName"`
		Platforms  []string `json:"platforms"`
		Owners     []struct {
			StepID     uint64 `json:"stepId"`
			AssigneeID uint64 `json:"assigneeId"`
		} `json:"owners"`
	}
	if err != nil || id == 0 || c.ShouldBindJSON(&input) != nil {
		writeAPIError(c, http.StatusBadRequest, "作品参数无效")
		return
	}
	input.Title = strings.TrimSpace(input.Title)
	input.SeriesName = strings.TrimSpace(input.SeriesName)
	if input.Title == "" || len([]rune(input.Title)) > 120 || len([]rune(input.SeriesName)) > 80 {
		writeAPIError(c, http.StatusBadRequest, "请检查作品名称和系列")
		return
	}
	members, err := h.members(c.Request.Context())
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "读取成员失败")
		return
	}
	names := make(map[uint64]string, len(members))
	for _, member := range members {
		names[member.ID] = member.Name
	}
	owners := make(map[uint64]uint64, len(input.Owners))
	for _, entry := range input.Owners {
		if entry.StepID == 0 || entry.AssigneeID != 0 && names[entry.AssigneeID] == "" {
			writeAPIError(c, http.StatusBadRequest, "负责人无效")
			return
		}
		if _, ok := owners[entry.StepID]; ok {
			writeAPIError(c, http.StatusBadRequest, "环节重复")
			return
		}
		owners[entry.StepID] = entry.AssigneeID
	}
	actor, _ := middleware.CurrentSessionUser(c)
	var validationErr error
	err = h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		var item model.OperationsProgressItem
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&item, id).Error; err != nil {
			return err
		}
		if item.Kind != "video" && item.Kind != "article" && item.Kind != "merchandise" {
			validationErr = errors.New("该事务不属于内容制作")
			return nil
		}
		var steps []model.OperationsProgressStep
		if err := tx.Where("item_id = ?", item.ID).Order("position").Find(&steps).Error; err != nil {
			return err
		}
		validSteps := map[uint64]bool{}
		for _, step := range steps {
			validSteps[step.ID] = true
		}
		for stepID := range owners {
			if !validSteps[stepID] {
				validationErr = errors.New("环节不属于此作品")
				return nil
			}
		}
		var previous []model.OperationsPublication
		if err := tx.Where("item_id = ?", item.ID).Find(&previous).Error; err != nil {
			return err
		}
		requested := input.Platforms
		if len(requested) == 0 {
			for _, target := range previous {
				requested = append(requested, target.Platform)
			}
		}
		targets := []string{}
		if item.Kind != "merchandise" {
			var bad error
			targets, bad = parseOperationsPlatforms(requested, item.Kind)
			if bad != nil {
				validationErr = bad
				return nil
			}
		}
		expected := make(map[string]bool, len(targets))
		for _, platform := range targets {
			expected[platform] = true
		}
		existing := make(map[string]model.OperationsPublication, len(previous))
		for _, target := range previous {
			existing[target.Platform] = target
		}
		changedTargets := len(previous) != len(targets)
		for _, platform := range targets {
			if _, ok := existing[platform]; !ok {
				changedTargets = true
			}
		}
		if changedTargets {
			for _, target := range previous {
				if target.Status == "done" {
					validationErr = errors.New("已有平台发布，不能改变发布平台")
					return nil
				}
			}
		}
		values := map[string]any{}
		if item.Title != input.Title {
			values["title"] = input.Title
		}
		if item.SeriesName != input.SeriesName {
			values["series_name"] = input.SeriesName
		}
		if len(values) > 0 {
			if err := tx.Model(&item).Updates(values).Error; err != nil {
				return err
			}
			if err := tx.Create(&model.OperationsProgressUpdate{
				ItemID: item.ID, AuthorID: actor.ID, Kind: "progress", Content: "已更新作品信息",
			}).Error; err != nil {
				return err
			}
		}
		for _, target := range previous {
			if !expected[target.Platform] {
				if err := tx.Delete(&target).Error; err != nil {
					return err
				}
			}
		}
		for _, platform := range targets {
			if _, ok := existing[platform]; !ok {
				if err := tx.Create(&model.OperationsPublication{
					ItemID: item.ID, Platform: platform, Status: "pending",
				}).Error; err != nil {
					return err
				}
			}
		}
		if changedTargets {
			if err := tx.Create(&model.OperationsProgressUpdate{
				ItemID: item.ID, AuthorID: actor.ID, Kind: "progress", Content: "已调整发布平台",
			}).Error; err != nil {
				return err
			}
		}
		for _, step := range steps {
			wanted, supplied := owners[step.ID]
			if !supplied || step.AssigneeID == nil && wanted == 0 ||
				step.AssigneeID != nil && *step.AssigneeID == wanted {
				continue
			}
			var value any
			label := "待分配"
			if wanted != 0 {
				value = wanted
				label = names[wanted]
			}
			if err := tx.Model(&step).Update("assignee_id", value).Error; err != nil {
				return err
			}
			key := step.ID
			if err := tx.Create(&model.OperationsProgressUpdate{
				ItemID: item.ID, StepID: &key, AuthorID: actor.ID, Kind: "progress",
				Content: fmt.Sprintf("%s · 负责人：%s", step.Title, label),
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if validationErr != nil {
		writeAPIError(c, http.StatusConflict, validationErr.Error())
	} else if errors.Is(err, gorm.ErrRecordNotFound) {
		writeAPIError(c, http.StatusNotFound, "作品不存在")
	} else if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "保存作品失败")
	} else {
		writeAPI(c, http.StatusOK, "作品安排已保存", gin.H{"id": id})
	}
}

type operationsArchive struct {
	ID             uint64     `json:"id"`
	Title          string     `json:"title"`
	Platforms      string     `json:"platform"`
	ChannelID      uint64     `json:"channelId"`
	EpisodeNo      uint64     `json:"episodeNo"`
	PublicationURL string     `json:"publicationUrl"`
	CompletedAt    *time.Time `json:"completedAt"`
}

// Works shows externally observed posts and internal completed production records separately;
// it never guesses that a public post belongs to an internal episode by title.
func (h *OperationsProgressHandler) Works(c *gin.Context) {
	platform := c.Query("platform")
	if platform != "" && platform != "douyin" && platform != "bilibili" && platform != "wechat" && platform != "wechat_video" {
		writeAPIError(c, http.StatusBadRequest, "平台不正确")
		return
	}
	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	if err != nil || page < 1 || page > 10000 {
		writeAPIError(c, http.StatusBadRequest, "页码不正确")
		return
	}
	const size = 18
	external := h.db.WithContext(c.Request.Context()).Model(&model.OperationsPlatformPost{})
	if platform != "" {
		external = external.Where("platform = ?", platform)
	}
	var total int64
	if err := external.Count(&total).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "读取作品数量失败")
		return
	}
	posts := make([]model.OperationsPlatformPost, 0)
	if err := external.Order("published_at DESC, id DESC").Limit(size).Offset((page - 1) * size).Find(&posts).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "读取作品失败")
		return
	}
	// Distinct published workflow records; historic public posts are never inferred from titles.
	itemsTable := h.db.NamingStrategy.TableName("OperationsProgressItem")
	stepsTable := h.db.NamingStrategy.TableName("OperationsProgressStep")
	archives := h.db.WithContext(c.Request.Context()).Table(itemsTable+" AS i").
		Select("i.id, i.title, i.platforms, i.channel_id, i.episode_no, i.publication_url, s.completed_at").
		Joins("JOIN "+stepsTable+" AS s ON s.item_id = i.id AND s.key = ? AND s.status = ?", "published", "done").
		Where("i.channel_id IS NOT NULL")
	if platform != "" {
		archives = archives.Where("i.platforms = ?", platform)
	}
	var archiveTotal int64
	if err := archives.Count(&archiveTotal).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "读取制作归档失败")
		return
	}
	completed := make([]operationsArchive, 0)
	if err := archives.Order("s.completed_at DESC, i.id DESC").Limit(size).Offset((page - 1) * size).
		Scan(&completed).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "读取制作归档失败")
		return
	}
	writeAPI(c, http.StatusOK, "作品库", gin.H{"posts": posts, "total": total, "archives": completed, "archiveTotal": archiveTotal, "page": page, "pageSize": size})
}
