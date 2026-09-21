package model

import (
	"time"

	"gorm.io/gorm"
)

const (
	AnnouncementStatusDraft     = "draft"
	AnnouncementStatusPublished = "published"
	AnnouncementStatusArchived  = "archived"

	PortalAudienceAll    = "all"
	PortalAudienceGroups = "groups"
)

type Announcement struct {
	ID           uint64                    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	Title        string                    `json:"title" gorm:"size:200;not null"`
	Summary      *string                   `json:"summary,omitempty" gorm:"size:500;default:null"`
	Content      string                    `json:"content" gorm:"type:text;not null"`
	Category     string                    `json:"category" gorm:"size:32;not null;index:idx_announcement_category"`
	Status       string                    `json:"status" gorm:"size:20;not null;index:idx_announcement_status"`
	IsPinned     bool                      `json:"isPinned" gorm:"column:is_pinned;type:tinyint(1);not null;default:0;index:idx_announcement_pinned"`
	PublishAt    *time.Time                `json:"publishAt,omitempty" gorm:"column:publish_at;type:datetime;default:null;index:idx_announcement_publish_at"`
	ExpireAt     *time.Time                `json:"expireAt,omitempty" gorm:"column:expire_at;type:datetime;default:null;index:idx_announcement_expire_at"`
	AudienceType string                    `json:"audienceType" gorm:"column:audience_type;size:16;not null;default:'all';index:idx_announcement_audience"`
	CreatorID    uint64                    `json:"creatorId" gorm:"column:creator_id;type:bigint unsigned;not null;index:idx_announcement_creator"`
	UpdatedByID  uint64                    `json:"updatedById" gorm:"column:updated_by_id;type:bigint unsigned;not null;index:idx_announcement_updater"`
	CreatedAt    time.Time                 `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	UpdatedAt    time.Time                 `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
	DeletedAt    gorm.DeletedAt            `json:"-" gorm:"column:deleted_at;type:datetime;index"`
	TargetGroups []AnnouncementTargetGroup `json:"targetGroups,omitempty" gorm:"foreignKey:AnnouncementID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}

type AnnouncementTargetGroup struct {
	ID             uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	AnnouncementID uint64    `json:"announcementId" gorm:"column:announcement_id;type:bigint unsigned;not null;uniqueIndex:uk_announcement_group"`
	GroupID        uint64    `json:"groupId" gorm:"column:group_id;type:bigint unsigned;not null;uniqueIndex:uk_announcement_group;index:idx_announcement_target_group"`
	CreatedAt      time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	Group          UserGroup `json:"group,omitempty" gorm:"foreignKey:GroupID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}
