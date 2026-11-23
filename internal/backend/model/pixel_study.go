package model

import "time"

// PixelStudy stores one private room layout per existing website account.
type PixelStudy struct {
 UserID uint64 `json:"-" gorm:"column:user_id;type:bigint unsigned;primaryKey"`
 Furniture string `json:"-" gorm:"column:furniture;type:longtext;not null"`
 Revision uint64 `json:"revision" gorm:"column:revision;type:bigint unsigned;not null;default:1"`
 InviteHash *string `json:"-" gorm:"column:invite_hash;size:64;uniqueIndex:uk_pixel_study_invite;default:null"`
 UpdatedAt time.Time `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null"`
}
func (PixelStudy) TableName() string { return "pixel_studies" }
