package model

import "time"

const (
	UserGroupStatusDisabled uint8 = 0
	UserGroupStatusActive   uint8 = 1
)

type UserGroup struct {
	ID          uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	Name        string    `json:"name" gorm:"size:100;not null;uniqueIndex:uk_name"`
	Description  *string   `json:"description,omitempty" gorm:"size:500;default:null"`
	Tags        []string  `json:"tags,omitempty" gorm:"type:json;serializer:json"`
	IsDefault   bool      `json:"isDefault" gorm:"column:is_default;type:tinyint(1);not null;default:0"`
	Status      uint8     `json:"status" gorm:"type:tinyint;not null;default:1;index:idx_status"`
	CreatedAt   time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	UpdatedAt   time.Time `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
	Members     []UserGroupMember `json:"members,omitempty" gorm:"foreignKey:GroupID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}
