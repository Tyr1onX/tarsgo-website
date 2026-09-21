package database

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

type migration struct {
	version uint64
	apply   func(db *gorm.DB) error
}

func migrationRegistry(appEnv string) []migration {
	return []migration{
		{version: 1, apply: func(db *gorm.DB) error { return AutoMigrate(db, appEnv) }},
		{version: 2, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.Announcement{},
				&model.AnnouncementTargetGroup{},
			)
		}},
		{version: 3, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.TeamEvent{},
				&model.TeamEventTargetGroup{},
			)
		}},
		{version: 4, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.PortalLink{},
				&model.PortalLinkTargetGroup{},
			)
		}},
		{version: 5, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.ActivityEvent{})
		}},
	}
}

// RunMigrations applies every unapplied migration in order. Each version has
// its own transaction and is recorded only after its schema change succeeds.
func RunMigrations(ctx context.Context, db *gorm.DB, appEnv string) error {
	if db == nil {
		return fmt.Errorf("database is nil")
	}
	if err := db.WithContext(ctx).Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version BIGINT UNSIGNED PRIMARY KEY, applied_at DATETIME NOT NULL) ENGINE=InnoDB`).Error; err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	for _, item := range migrationRegistry(appEnv) {
		var count int64
		if err := db.WithContext(ctx).Table("schema_migrations").Where("version = ?", item.version).Count(&count).Error; err != nil {
			return fmt.Errorf("check migration %d: %w", item.version, err)
		}
		if count > 0 {
			continue
		}
		if err := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			if err := item.apply(tx); err != nil {
				return err
			}
			return tx.Table("schema_migrations").Create(map[string]any{
				"version": item.version, "applied_at": time.Now(),
			}).Error
		}); err != nil {
			return fmt.Errorf("apply migration %d: %w", item.version, err)
		}
	}

	if err := seedDevelopmentMockData(db.WithContext(ctx), appEnv); err != nil {
		return fmt.Errorf("seed development data: %w", err)
	}
	return nil
}
