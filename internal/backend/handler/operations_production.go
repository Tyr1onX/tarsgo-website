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
		Title string `json:"title"`
	}
	if err != nil || channelID == 0 || c.ShouldBindJSON(&input) != nil || len([]rune(strings.TrimSpace(input.Title))) > 120 {
		writeAPIError(c, http.StatusBadRequest, "请填写有效选题")
		return
	}
	var episode *model.OperationsProgressItem
	err = h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		var err error
		episode, err = operationsworkflow.CreateEpisode(tx, channelID, input.Title)
		return err
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		writeAPIError(c, http.StatusNotFound, "运营平台不存在")
	} else if err != nil {
		writeAPIError(c, http.StatusBadRequest, "创建制作任务失败")
	} else {
		writeAPI(c, http.StatusCreated, "制作任务已创建", episode)
	}
}

func (h *OperationsProgressHandler) SetupEpisode(c *gin.Context) {
	if !h.requireEditor(c) {
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	var input struct {
		Title  string `json:"title"`
		Owners []struct {
			StepID     uint64 `json:"stepId"`
			AssigneeID uint64 `json:"assigneeId"`
		} `json:"owners"`
	}
	if err != nil || id == 0 || c.ShouldBindJSON(&input) != nil {
		writeAPIError(c, http.StatusBadRequest, "任务参数无效")
		return
	}
	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" || len([]rune(input.Title)) > 120 {
		writeAPIError(c, http.StatusBadRequest, "请填写不超过120字的选题")
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
	for _, owner := range input.Owners {
		if owner.StepID == 0 || (owner.AssigneeID != 0 && names[owner.AssigneeID] == "") {
			writeAPIError(c, http.StatusBadRequest, "请选择有效的环节负责人")
			return
		}
		if _, exists := owners[owner.StepID]; exists {
			writeAPIError(c, http.StatusBadRequest, "环节重复")
			return
		}
		owners[owner.StepID] = owner.AssigneeID
	}
	actor, _ := middleware.CurrentSessionUser(c)
	err = h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		var item model.OperationsProgressItem
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&item, id).Error; err != nil {
			return err
		}
		if item.ChannelID == nil {
			return errors.New("not a production episode")
		}
		var steps []model.OperationsProgressStep
		if err := tx.Where("item_id = ?", item.ID).Order("position").Find(&steps).Error; err != nil {
			return err
		}
		for _, stepID := range input.Owners {
			found := false
			for _, step := range steps {
				if step.ID == stepID.StepID {
					found = true
					break
				}
			}
			if !found {
				return errors.New("step does not belong to episode")
			}
		}
		if item.Title != input.Title {
			if err := tx.Model(&item).Update("title", input.Title).Error; err != nil {
				return err
			}
			if err := tx.Create(&model.OperationsProgressUpdate{
				ItemID: item.ID, AuthorID: actor.ID, Kind: "progress", Content: "选题更新为：" + input.Title,
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
			var value any = nil
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
	if errors.Is(err, gorm.ErrRecordNotFound) {
		writeAPIError(c, http.StatusNotFound, "制作任务不存在")
	} else if err != nil {
		writeAPIError(c, http.StatusBadRequest, "保存制作安排失败")
	} else {
		writeAPI(c, http.StatusOK, "制作安排已保存", gin.H{"id": id})
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
	if platform != "" && platform != "douyin" && platform != "bilibili" && platform != "wechat" {
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