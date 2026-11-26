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

// PixelAchievement is a deduplicated account souvenir, not a gameplay attribute.
type PixelAchievement struct {
	UserID    uint64    `json:"-" gorm:"column:user_id;type:bigint unsigned;primaryKey;autoIncrement:false"`
	Key       string    `json:"id" gorm:"column:achievement_key;size:48;primaryKey"`
	Displayed bool      `json:"displayed" gorm:"column:displayed;not null;default:false"`
	CreatedAt time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null"`
}

func (PixelAchievement) TableName() string { return "pixel_achievements" }

// A row also records discovery. Releasing the last fish leaves quantity at zero.
type PixelItem struct {
	UserID   uint64 `json:"-" gorm:"primaryKey;autoIncrement:false"`
	ItemID   string `json:"id" gorm:"size:48;primaryKey"`
	Quantity uint64 `json:"quantity" gorm:"not null"`
	Revision uint64 `json:"revision" gorm:"not null"`
}

// Each account has at most one current cast across tabs.
type PixelCast struct {
	UserID  uint64 `gorm:"primaryKey;autoIncrement:false"`
	Token   string `gorm:"size:32;not null"`
	Pond    int    `gorm:"not null"`
	ReadyAt int64  `gorm:"not null"`
	CatchID string `gorm:"size:48;not null"`
}

// PixelPet is private account state. Its position and animation are local scene state.
type PixelPet struct {
	UserID   uint64 `json:"-" gorm:"primaryKey;autoIncrement:false"`
	Species  string `json:"species" gorm:"size:12;not null"`
	Variant  string `json:"variant" gorm:"size:24;not null"`
	Name     string `json:"name" gorm:"size:64;not null"`
	Mode     string `json:"mode" gorm:"size:12;not null"`
	Revision uint64 `json:"revision" gorm:"not null"`
}

// PixelFoodUse is the existing receipt table for one consumed inventory revision (food, sowing or repair). Retries never
// charge a second unit and cannot redirect a completed use to another animal.
type PixelFoodUse struct {
	UserID   uint64 `gorm:"primaryKey;autoIncrement:false"`
	ItemID   string `gorm:"size:48;primaryKey"`
	Revision uint64 `gorm:"primaryKey;autoIncrement:false"`
	Species  string `gorm:"size:12;not null"`
	Target   string `gorm:"size:64;not null"`
}

// PixelPlant stores only private study plants. Public scene plants remain local.
type PixelPlant struct {
	UserID    uint64 `json:"-" gorm:"primaryKey;autoIncrement:false"`
	ID        string `json:"id" gorm:"size:64;primaryKey"`
	Seed      string `json:"seed" gorm:"size:48;not null"`
	X         int    `json:"x" gorm:"not null"`
	Y         int    `json:"y" gorm:"not null"`
	WateredAt int64  `json:"wateredAt" gorm:"not null"`
	Revision  uint64 `json:"revision" gorm:"not null"`
	Harvested bool   `json:"-" gorm:"not null;default:false"`
}

// PixelGather records the next availability of an account-scoped ground source.
// The actual position is authored in the shared catalog, not a second inventory.
type PixelGather struct {
	UserID uint64 `json:"-" gorm:"primaryKey;autoIncrement:false"`
	Source string `json:"source" gorm:"size:64;primaryKey"`
	NextAt int64  `json:"nextAt" gorm:"not null"`
}
