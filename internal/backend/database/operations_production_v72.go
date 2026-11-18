package database

import (
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
	"tarsgo-backend/service/operationsworkflow"
)

// V72 introduces platform-owned production episodes and optional step deliverables.
// Historical posts and tasks remain untouched; a new blank episode is explicitly
// not a historical publication or a promise to publish by any deadline.
func migrateOperationsProductionV72(db *gorm.DB) error {
	if err := db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
		&model.OperationsProgressItem{}, &model.OperationsProgressUpdate{}, &model.OperationsStepAttachment{},
	); err != nil {
		return err
	}
	var channels []model.OperationsProgressItem
	if err := db.Where("kind = ?", "channel").Find(&channels).Error; err != nil {
		return err
	}
	for _, channel := range channels {
		if operationsworkflow.ProductionKind(channel.Platforms) == "" {
			continue
		}
		if err := db.Transaction(func(tx *gorm.DB) error {
			var locked model.OperationsProgressItem
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&locked, channel.ID).Error; err != nil {
				return err
			}
			if locked.Kind != "channel" || locked.Platforms != channel.Platforms {
				return errors.New("operations channel changed during migration")
			}
			var count int64
			if err := tx.Model(&model.OperationsProgressItem{}).Where("channel_id = ?", channel.ID).Count(&count).Error; err != nil {
				return err
			}
			if count != 0 {
				return nil
			}
			_, err := operationsworkflow.CreateEpisode(tx, channel.ID, "")
			return err
		}); err != nil {
			return err
		}
	}
	return nil
}