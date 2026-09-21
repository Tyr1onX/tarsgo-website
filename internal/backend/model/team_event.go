package model

import (
	"time"

	"gorm.io/gorm"
)

const (
	TeamEventStatusDraft     = "draft"
	TeamEventStatusPublished = "published"
	TeamEventStatusCancelled = "cancelled"
)

type TeamEvent struct {
	ID           uint64                 `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	Title        string                 `json:"title" gorm:"size:200;not null"`
	Description  *string                `json:"description,omitempty" gorm:"size:2000;default:null"`
	Location     *string                `json:"location,omitempty" gorm:"size:300;default:null"`
	StartsAt     time.Time              `json:"startsAt" gorm:"column:starts_at;type:datetime;not null;index:idx_team_event_starts_at"`
	EndsAt       time.Time              `json:"endsAt" gorm:"column:ends_at;type:datetime;not null;index:idx_team_event_ends_at"`
	Status       string                 `json:"status" gorm:"size:20;not null;index:idx_team_event_status"`
	AudienceType string                 `json:"audienceType" gorm:"column:audience_type;size:16;not null;default:'all';index:idx_team_event_audience"`
	CreatorID    uint64                 `json:"creatorId" gorm:"column:creator_id;type:bigint unsigned;not null;index:idx_team_event_creator"`
	UpdatedByID  uint64                 `json:"updatedById" gorm:"column:updated_by_id;type:bigint unsigned;not null;index:idx_team_event_updater"`
	CreatedAt    time.Time              `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	UpdatedAt    time.Time              `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
	DeletedAt    gorm.DeletedAt         `json:"-" gorm:"column:deleted_at;type:datetime;index"`
	TargetGroups []TeamEventTargetGroup `json:"targetGroups,omitempty" gorm:"foreignKey:EventID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}

type TeamEventTargetGroup struct {
	ID        uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	EventID   uint64    `json:"eventId" gorm:"column:event_id;type:bigint unsigned;not null;uniqueIndex:uk_team_event_group"`
	GroupID   uint64    `json:"groupId" gorm:"column:group_id;type:bigint unsigned;not null;uniqueIndex:uk_team_event_group;index:idx_team_event_target_group"`
	CreatedAt time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	Group     UserGroup `json:"group,omitempty" gorm:"foreignKey:GroupID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}
