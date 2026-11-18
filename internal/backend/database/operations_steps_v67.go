package database

import (
	"errors"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

// Existing stage positions are carried over without inventing completion times.
func migrateOperationsStepsV67(db *gorm.DB) error {
	if err := db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").
		AutoMigrate(&model.OperationsProgressItem{}, &model.OperationsProgressStep{}); err != nil {
		return err
	}
	for _, channel := range []struct{ key, platform string }{
		{"channel:douyin", "douyin"}, {"channel:bilibili", "bilibili"}, {"channel:wechat", "wechat"},
	} {
		if err := db.Model(&model.OperationsProgressItem{}).
			Where("seed_key = ? AND platforms = ?", channel.key, "").
			Update("platforms", channel.platform).Error; err != nil {
			return err
		}
	}
	var items []model.OperationsProgressItem
	if err := db.Where("kind IN ?", []string{"video", "merchandise"}).Find(&items).Error; err != nil {
		return err
	}
	for _, item := range items {
		var count int64
		if err := db.Model(&model.OperationsProgressStep{}).Where("item_id = ?", item.ID).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			continue
		}
		presets := model.OperationsStepPresets(item.Kind)
		position := -1
		for i, preset := range presets {
			if preset.Key == item.Stage {
				position = i
			}
		}
		steps := make([]model.OperationsProgressStep, 0, len(presets))
		for i, preset := range presets {
			status := "pending"
			if item.Status == "done" || (position >= 0 && i < position) {
				status = "done"
			} else if position == i {
				status = "active"
			}
			if item.Status == "blocked" && (position == i || position < 0 && i == 0) {
				status = "blocked"
			}
			steps = append(steps, model.OperationsProgressStep{
				ItemID: item.ID, Key: preset.Key, Title: preset.Title,
				Position: i, Status: status,
			})
		}
		if len(steps) == 0 {
			return errors.New("missing operations step preset")
		}
		if err := db.Create(&steps).Error; err != nil {
			return err
		}
	}
	return nil
}