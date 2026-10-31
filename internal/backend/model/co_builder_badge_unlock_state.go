package model

import "time"

type CoBuilderBadgeUnlockState struct {
	UserID         uint64     `gorm:"column:user_id;type:bigint unsigned;primaryKey"`
	HighestSeen    uint8      `gorm:"column:highest_seen;type:tinyint unsigned;not null;default:0"`
	ClaimedLevel   uint8      `gorm:"column:claimed_level;type:tinyint unsigned;not null;default:0"`
	ClaimToken     *string    `gorm:"column:claim_token;type:varchar(64);default:null"`
	ClaimExpiresAt *time.Time `gorm:"column:claim_expires_at;type:datetime;default:null"`
}

func (CoBuilderBadgeUnlockState) TableName() string { return "co_builder_badge_unlock_states" }
