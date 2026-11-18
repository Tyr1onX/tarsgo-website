package model

import "time"

// JoinInterest records an account's year-round interest, independently of
// registration forms, screening decisions and training group membership.
type JoinInterest struct {
	ID               uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	UserID           uint64    `json:"userId" gorm:"column:user_id;type:bigint unsigned;not null;uniqueIndex:uk_join_interest_user"`
	PreferredGroupID *uint64   `json:"preferredGroupId" gorm:"column:preferred_group_id;type:bigint unsigned;index"`
	QQ               string    `json:"qq" gorm:"size:20;not null"`
	Motivation       string    `json:"motivation" gorm:"size:500;not null;default:''"`
	Background       string    `json:"background" gorm:"size:500;not null;default:''"`
	Source           string    `json:"source" gorm:"size:60;not null;default:''"`
	Status           string    `json:"status" gorm:"size:20;not null;default:'pending';index"`
	CreatedAt        time.Time `json:"createdAt" gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP"`
	UpdatedAt        time.Time `json:"updatedAt" gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
}
