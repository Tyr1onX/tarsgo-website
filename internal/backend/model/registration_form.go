package model

import "time"

const (
	RegistrationFormStatusDraft     uint8 = 0
	RegistrationFormStatusPublished uint8 = 1
	RegistrationFormStatusClosed    uint8 = 2
)

type FormFieldOption struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

type FormField struct {
	Key           string            `json:"key"`
	Label         string            `json:"label"`
	Type          string            `json:"type"`
	Required      bool              `json:"required"`
	Placeholder   string            `json:"placeholder,omitempty"`
	Description   string            `json:"description,omitempty"`
	DefaultValue  any               `json:"default_value,omitempty"`
	Validation    map[string]any    `json:"validation,omitempty"`
	Options       []FormFieldOption `json:"options,omitempty"`
	FileConfig    map[string]any    `json:"file_config,omitempty"`
	CascadeConfig map[string]any    `json:"cascade_config,omitempty"`
}

type RegistrationForm struct {
	ID               uint64      `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	CreatorID        uint64      `json:"creatorId" gorm:"column:creator_id;type:bigint unsigned;not null;index:idx_creator_id"`
	Title            string      `json:"title" gorm:"size:200;not null"`
	Description      *string     `json:"description,omitempty" gorm:"type:text;default:null"`
	CoverImageURL    *string     `json:"coverImageUrl,omitempty" gorm:"column:cover_image_url;size:500;default:null"`
	FieldsSchema     []FormField `json:"fieldsSchema" gorm:"column:fields_schema;type:json;serializer:json;not null"`
	MaxRegistrations *int        `json:"maxRegistrations,omitempty" gorm:"column:max_registrations;type:int;default:null"`
	StartTime        *time.Time  `json:"startTime,omitempty" gorm:"column:start_time;type:datetime;default:null;index:idx_start_time"`
	EndTime          *time.Time  `json:"endTime,omitempty" gorm:"column:end_time;type:datetime;default:null;index:idx_end_time"`
	Status           uint8       `json:"status" gorm:"type:tinyint;not null;default:0;index:idx_status"`
	CreatedAt        time.Time   `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	UpdatedAt        time.Time   `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
	Creator          User        `json:"creator,omitempty" gorm:"foreignKey:CreatorID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;"`
}
