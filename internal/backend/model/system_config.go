package model

import "time"

type SystemConfig struct {
	ID          uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	ConfigKey   string    `json:"configKey" gorm:"column:config_key;size:100;not null;uniqueIndex:uk_config_key"`
	ConfigValue string    `json:"configValue" gorm:"column:config_value;type:longtext;not null"`
	CreatedAt   time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	UpdatedAt   time.Time `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
}

func (SystemConfig) TableName() string {
	return "system_config"
}
