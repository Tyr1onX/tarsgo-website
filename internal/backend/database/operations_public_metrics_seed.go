package database

import (
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
)

// v61 preserves only verified figures from the team's dated weekly reports
// and public account pages. Missing dates are intentionally not filled.
func migrateOperationsPublicMetricsV61(db *gorm.DB) error {
	if err := db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").
		AutoMigrate(&model.OperationsAccountSnapshot{}, &model.OperationsPlatformPost{}); err != nil {
		return err
	}
	snapshots := []model.OperationsAccountSnapshot{
		{Platform: "douyin", ObservedOn: "2026-10-14", Followers: 635, Source: "weekly_report"},
		{Platform: "bilibili", ObservedOn: "2026-10-14", Followers: 2536, Source: "weekly_report"},
		{Platform: "douyin", ObservedOn: "2026-10-24", Followers: 678, Source: "weekly_report"},
		{Platform: "bilibili", ObservedOn: "2026-10-24", Followers: 2559, Source: "weekly_report"},
		{Platform: "douyin", ObservedOn: "2026-11-01", Followers: 695, Source: "weekly_report"},
		{Platform: "bilibili", ObservedOn: "2026-11-01", Followers: 2627, Source: "weekly_report"},
		{Platform: "douyin", ObservedOn: "2026-11-08", Followers: 777, Source: "weekly_report"},
		{Platform: "bilibili", ObservedOn: "2026-11-08", Followers: 2757, Source: "weekly_report"},
		{Platform: "douyin", ObservedOn: "2026-11-13", Followers: 787, Source: "public_page"},
		{Platform: "bilibili", ObservedOn: "2026-11-13", Followers: 2805, Source: "public_page"},
	}
	if err := db.Clauses(clause.OnConflict{DoNothing: true}).Create(&snapshots).Error; err != nil {
		return err
	}
	if err := db.Migrator().AutoMigrate(&model.OperationsProgressUpdate{}); err != nil {
		return err
	}
	return db.Model(&model.OperationsProgressItem{}).
		Where("title = ? AND kind = ? AND stage = ?", "周边制作", "workstream", "").
		Updates(map[string]any{"kind": "merchandise", "stage": "unconfirmed"}).Error
}
