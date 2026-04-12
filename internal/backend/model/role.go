package model

import "time"

const (
	RoleNameSuperAdmin = "super_admin"
	RoleNameAdmin      = "admin"
	RoleNameUser       = "user"
)

type Role struct {
	ID          uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	Name        string    `json:"name" gorm:"size:50;not null;uniqueIndex"`
	DisplayName string    `json:"displayName" gorm:"column:display_name;size:100;not null"`
	Description *string   `json:"description,omitempty" gorm:"size:255;default:null"`
	SortOrder   int       `json:"sortOrder" gorm:"column:sort_order;type:int;not null;default:0"`
	CreatedAt   time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	UpdatedAt   time.Time `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
}
