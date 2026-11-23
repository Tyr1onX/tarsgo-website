package model

import "time"

// PixelHome belongs to exactly one existing website account.
// Layout stores a small, validated furniture array; invitation secrets are hashed.
type PixelHome struct {
	UserID     uint64    `json:"-" gorm:"column:user_id;type:bigint unsigned;primaryKey;autoIncrement:false"`
	Layout     string    `json:"-" gorm:"column:layout;type:longtext;not null"`
	InviteHash string    `json:"-" gorm:"column:invite_hash;size:64;not null;default:'';index:idx_pixel_home_invite_hash"`
	UpdatedAt  time.Time `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null"`
}

func (PixelHome) TableName() string { return "pixel_homes" }
