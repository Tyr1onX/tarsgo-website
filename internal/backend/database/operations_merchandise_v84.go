package database

import (
	"errors"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

// Every merchandise item has one independent long-running six-step workflow.
// Keep existing works and progress untouched when the migration is rerun.
func migrateOperationsMerchandiseItemsV84(db *gorm.DB) error {
	return db.Transaction(func(tx *gorm.DB) error {
		for _, title := range []string{
			"小灯泡", "指尖陀螺", "鼠标垫", "帆布袋", "尺子",
			"小口袋", "卡通人物立牌", "钥匙扣", "光栅卡", "机器人拼接积木",
		} {
			var existing model.OperationsProgressItem
			err := tx.Where("title = ? AND kind = ?", title, "merchandise").Take(&existing).Error
			if err == nil {
				continue
			}
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			item := model.OperationsProgressItem{
				Title: title, Kind: "merchandise", Owner: "运营组",
				Status: "active", Stage: "unconfirmed",
			}
			if err := tx.Create(&item).Error; err != nil {
				return err
			}
			for position, preset := range model.OperationsStepPresets("merchandise") {
				if err := tx.Create(&model.OperationsProgressStep{
					ItemID: item.ID, Key: preset.Key, Title: preset.Title,
					Position: position, Status: "pending",
				}).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
}
