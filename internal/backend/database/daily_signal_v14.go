package database

import (
	"time"

	"tarsgo-backend/model"
)

// dailySignalV14 exists solely to replay the historical v14 table creation.
// Migration 79 permanently removes this retired table and all its records.
type dailySignalV14 struct {
	ID         uint64     `gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	UserID     uint64     `gorm:"column:user_id;type:bigint unsigned;not null;uniqueIndex:uk_daily_signal_user_date,priority:1"`
	SignalDate string     `gorm:"column:signal_date;type:date;not null;uniqueIndex:uk_daily_signal_user_date,priority:2"`
	Mood       *string    `gorm:"column:mood;type:varchar(32);default:null"`
	CreatedAt  time.Time  `gorm:"column:created_at;not null"`
	UpdatedAt  time.Time  `gorm:"column:updated_at;not null"`
	User       model.User `gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
}

func (dailySignalV14) TableName() string { return "daily_signals" }
