package operationsworkflow

import (
	"fmt"
	"strings"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
)

func ProductionKind(platform string) string {
	switch platform {
	case "douyin", "bilibili", "wechat_video":
		return "video"
	case "wechat":
		return "article"
	}
	return ""
}

// Both manual creation and automatic replenishment serialize on the channel row.
func CreateEpisode(tx *gorm.DB, channelID uint64, title string, series ...string) (*model.OperationsProgressItem, error) {
	channel, err := lockChannel(tx, channelID)
	if err != nil {
		return nil, err
	}
	return createEpisode(tx, channel, title, seriesName(series))
}

func EnsureUpcoming(tx *gorm.DB, channelID uint64, series ...string) (*model.OperationsProgressItem, error) {
	channel, err := lockChannel(tx, channelID)
	if err != nil {
		return nil, err
	}
	var episodes []model.OperationsProgressItem
	name := seriesName(series)
	if err := tx.Where("channel_id = ? AND series_name = ?", channelID, name).Order("episode_no DESC").Find(&episodes).Error; err != nil {
		return nil, err
	}
	if len(episodes) > 0 {
		ids := make([]uint64, len(episodes))
		for i, item := range episodes {
			ids[i] = item.ID
		}
		var started []uint64
		if err := tx.Model(&model.OperationsProgressStep{}).Distinct("item_id").
			Where("item_id IN ? AND status <> ?", ids, "pending").Pluck("item_id", &started).Error; err != nil {
			return nil, err
		}
		used := make(map[uint64]bool, len(started))
		for _, id := range started {
			used[id] = true
		}
		for i := range episodes {
			if !used[episodes[i].ID] {
				return &episodes[i], nil
			}
		}
	}
	return createEpisode(tx, channel, "", name)
}

func seriesName(series []string) string {
	if len(series) == 0 {
		return ""
	}
	return strings.TrimSpace(series[0])
}

func lockChannel(tx *gorm.DB, id uint64) (*model.OperationsProgressItem, error) {
	var channel model.OperationsProgressItem
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND kind = ?", id, "channel").Take(&channel).Error; err != nil {
		return nil, err
	}
	if ProductionKind(channel.Platforms) == "" {
		return nil, fmt.Errorf("unsupported operations platform: %s", channel.Platforms)
	}
	return &channel, nil
}

func createEpisode(tx *gorm.DB, channel *model.OperationsProgressItem, title, series string) (*model.OperationsProgressItem, error) {
	var previous model.OperationsProgressItem
	if err := tx.Where("channel_id = ? AND series_name = ?", channel.ID, series).
		Order("episode_no DESC").First(&previous).Error; err != nil && err != gorm.ErrRecordNotFound {
		return nil, err
	}
	var latest model.OperationsProgressItem
	if err := tx.Where("channel_id = ?", channel.ID).Order("episode_no DESC").First(&latest).Error; err != nil && err != gorm.ErrRecordNotFound {
		return nil, err
	}
	next := latest.EpisodeNo + 1
	title = strings.TrimSpace(title)
	if title == "" {
		title = "下一期 · 选题待定"
	}
	if len([]rune(title)) > 120 || len([]rune(series)) > 80 {
		return nil, fmt.Errorf("episode title too long")
	}
	channelID := channel.ID
	episode := model.OperationsProgressItem{
		Title: title, Kind: ProductionKind(channel.Platforms), Platforms: channel.Platforms,
		ChannelID: &channelID, EpisodeNo: next, SeriesName: series, Stage: "unconfirmed", Status: "active",
	}
	if err := tx.Create(&episode).Error; err != nil {
		return nil, err
	}
	owners := map[string]*uint64{}
	if previous.ID != 0 {
		var steps []model.OperationsProgressStep
		if err := tx.Where("item_id = ?", previous.ID).Find(&steps).Error; err != nil {
			return nil, err
		}
		ids := make([]uint64, 0, len(steps))
		for _, step := range steps {
			if step.AssigneeID != nil {
				ids = append(ids, *step.AssigneeID)
			}
		}
		valid := map[uint64]bool{}
		if len(ids) > 0 {
			var active []uint64
			if err := tx.Model(&model.User{}).Where("id IN ? AND status = ?", ids, model.UserStatusEnabled).Pluck("id", &active).Error; err != nil {
				return nil, err
			}
			for _, id := range active {
				valid[id] = true
			}
		}
		for _, step := range steps {
			if step.AssigneeID != nil && valid[*step.AssigneeID] {
				owners[step.Key] = step.AssigneeID
			}
		}
	}
	presets := model.OperationsStepPresets(episode.Kind)
	steps := make([]model.OperationsProgressStep, 0, len(presets))
	for i, preset := range presets {
		steps = append(steps, model.OperationsProgressStep{ItemID: episode.ID, Key: preset.Key, Title: preset.Title, Position: i, AssigneeID: owners[preset.Key], Status: "pending"})
	}
	if err := tx.Create(&steps).Error; err != nil {
		return nil, err
	}
	return &episode, nil
}
