package database

import (
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
)

func migrateDouyinOperationsV69(db *gorm.DB) error {
	if err := db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.OperationsDouyinAuthorization{}); err != nil {
		return err
	}
	return db.Clauses(clause.OnConflict{DoNothing: true}).Create(&model.OperationsAccountSnapshot{
		Platform: "douyin", ObservedOn: "2026-11-18", Followers: 802, Source: "admin_page",
	}).Error
}
