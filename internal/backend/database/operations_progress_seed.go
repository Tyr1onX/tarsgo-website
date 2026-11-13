package database

import (
	"errors"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

// v60 introduces publisher dates and video stages, then imports only identified
// ongoing workstreams. It does not guess channel posting dates or deadlines.
func migrateOperationsProgressV60(db *gorm.DB) error {
	if err := db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").
		AutoMigrate(&model.OperationsProgressItem{}, &model.OperationsProgressUpdate{}); err != nil {
		return err
	}

	seeds := []struct {
		key, title, kind, stage, owner, next string
	}{
		{"channel:douyin", "抖音运营", "channel", "", "马鹤铭", "核实最近一次视频发布时间，安排下一条内容"},
		{"channel:bilibili", "B站运营", "channel", "", "马鹤铭", "确认下一条视频的选题与制作安排"},
		{"channel:wechat", "公众号运营", "channel", "", "运营组", "核对最近一篇推文发布时间与下一篇选题"},
		{"merchandise", "周边制作", "workstream", "", "庄奥佳", "确认周边设计、打样与制作进度"},
		{"video:rmer", "RMer 人物系列 · 下一期", "video", "unconfirmed", "运营组", "核实本期采访对象与当前制作阶段"},
	}

	var biliItem model.OperationsProgressItem
	for _, seed := range seeds {
		var item model.OperationsProgressItem
		err := db.Where("seed_key = ? OR title = ?", seed.key, seed.title).First(&item).Error
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			item = model.OperationsProgressItem{
				Title: seed.title, Kind: seed.kind, Stage: seed.stage,
				SeedKey: &seed.key, Owner: seed.owner, NextAction: seed.next, Status: "active",
			}
			if err := db.Create(&item).Error; err != nil {
				return err
			}
		case err != nil:
			return err
		}
		if seed.key == "channel:bilibili" {
			biliItem = item
		}
	}
	// Account: 吉甲大师TARS-Go, Bilibili public videos. Day precision only:
	// a specific time of day cannot be inferred from the search results.
	for _, entry := range []struct{ day, title string }{
		{"2026-11-02", "《你》｜像素动画MV"},
		{"2026-11-05", "机器人电源系统培训会议"},
	} {
		var found model.OperationsProgressUpdate
		err := db.Where("item_id = ? AND kind = ? AND published_on = ?", biliItem.ID, "completed", entry.day).First(&found).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			update := model.OperationsProgressUpdate{
				ItemID: biliItem.ID, Kind: "completed", Content: entry.title, PublishedOn: &entry.day,
			}
			if err := db.Create(&update).Error; err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
	}
	return nil
}
