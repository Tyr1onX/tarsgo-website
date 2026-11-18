package database

import (
	"errors"
	"strings"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

// V75 keeps every existing work and progress record. The publication table is
// the only writable source of platform-specific status for new production.
func migrateOperationsContentV75(db *gorm.DB) error {
	if err := db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").
		AutoMigrate(&model.OperationsProgressItem{}, &model.OperationsPublication{}); err != nil {
		return err
	}

	// Video Channels are a platform, not a new copy of the production workflow.
	key := "channel:wechat_video"
	var channel model.OperationsProgressItem
	err := db.Where("seed_key = ?", key).First(&channel).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		channel = model.OperationsProgressItem{Title: "视频号运营", Kind: "channel", Platforms: "wechat_video",
			SeedKey: &key, Status: "active"}
		if err := db.Create(&channel).Error; err != nil {
			return err
		}
	} else if err != nil {
		return err
	}

	var works []model.OperationsProgressItem
	if err := db.Where("kind IN ?", []string{"video", "article"}).Find(&works).Error; err != nil {
		return err
	}
	var channels []model.OperationsProgressItem
	if err := db.Where("kind = ?", "channel").Find(&channels).Error; err != nil {
		return err
	}
	accountPlatform := map[uint64]string{}
	for _, item := range channels {
		accountPlatform[item.ID] = item.Platforms
	}
	for _, item := range works {
		if item.SeedKey != nil && *item.SeedKey == "video:rmer" && item.SeriesName == "" {
			if err := db.Model(&item).Update("series_name", "RMer").Error; err != nil {
				return err
			}
		}
		source := item.Platforms
		if source == "" && item.ChannelID != nil {
			source = accountPlatform[*item.ChannelID]
		}
		var published model.OperationsProgressStep
		err := db.Where("item_id = ? AND `key` = ?", item.ID, "published").First(&published).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		for _, raw := range strings.Split(source, ",") {
			platform := strings.TrimSpace(raw)
			if platform != "douyin" && platform != "bilibili" && platform != "wechat" && platform != "wechat_video" {
				continue
			}
			record := model.OperationsPublication{ItemID: item.ID, Platform: platform, Status: "pending"}
			if published.ID != 0 && published.Status == "done" {
				record.Status = "done"
				record.CompletedAt = published.CompletedAt
				if !strings.Contains(source, ",") {
					record.URL = item.PublicationURL
				}
			}
			if err := db.Where("item_id = ? AND platform = ?", item.ID, platform).
				FirstOrCreate(&record).Error; err != nil {
				return err
			}
		}
	}
	return nil
}