package model

import "time"

type CollectionOption struct {
	Label       string `json:"label"`
	Description string `json:"description,omitempty"`
	Value       string `json:"value"`
	Capacity    int    `json:"capacity,omitempty"`
	Remaining   *int   `json:"remaining,omitempty" gorm:"-"`
}

type CollectionField struct {
	Key      string             `json:"key"`
	Label    string             `json:"label"`
	Type     string             `json:"type"`
	Required bool               `json:"required"`
	Options  []CollectionOption `json:"options,omitempty"`
}

type CollectionForm struct {
	ID            uint64            `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	CreatorID     uint64            `json:"-" gorm:"type:bigint unsigned;not null;index"`
	Title         string            `json:"title" gorm:"size:120;not null"`
	Description   string            `json:"description" gorm:"type:text;not null"`
	Fields        []CollectionField `json:"fields" gorm:"type:json;serializer:json;not null"`
	Status        string            `json:"status" gorm:"size:12;not null;default:draft;index"`
	LoginRequired bool              `json:"loginRequired" gorm:"not null;default:false"`
	Capacity      int               `json:"capacity" gorm:"not null;default:0"`
	OpensAt       *time.Time        `json:"opensAt" gorm:"type:datetime(6)"`
	ClosesAt      *time.Time        `json:"closesAt" gorm:"type:datetime(6)"`
	CreatedAt     time.Time         `json:"createdAt"`
	UpdatedAt     time.Time         `json:"updatedAt"`
}

type CollectionSubmission struct {
	ID        uint64         `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	FormID    uint64         `json:"formId" gorm:"type:bigint unsigned;not null;uniqueIndex:uk_collection_user,priority:1;index"`
	UserID    *uint64        `json:"userId,omitempty" gorm:"type:bigint unsigned;uniqueIndex:uk_collection_user,priority:2"`
	Answers   map[string]any `json:"answers" gorm:"type:json;serializer:json;not null"`
	CreatedAt time.Time      `json:"createdAt" gorm:"type:datetime(6);not null;index"`
}
