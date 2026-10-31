package model

import "time"

type CoBuilderContribution struct {
	ID          uint64     `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	UserID      uint64     `json:"userId" gorm:"column:user_id;type:bigint unsigned;not null;index:idx_co_builder_user_created,priority:1"`
	Description string     `json:"description" gorm:"type:varchar(500);not null"`
	GrantedByID uint64     `json:"grantedById" gorm:"column:granted_by_id;type:bigint unsigned;not null;index:idx_co_builder_granted_by"`
	CreatedAt   time.Time  `json:"createdAt" gorm:"column:created_at;type:datetime;not null;index:idx_co_builder_user_created,priority:2"`
	RevokedAt   *time.Time `json:"revokedAt,omitempty" gorm:"column:revoked_at;type:datetime;default:null"`
	RevokedByID *uint64    `json:"revokedById,omitempty" gorm:"column:revoked_by_id;type:bigint unsigned;default:null"`
}

func (CoBuilderContribution) TableName() string { return "co_builder_contributions" }
