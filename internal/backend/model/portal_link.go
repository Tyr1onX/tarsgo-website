package model

import (
	"time"

	"gorm.io/gorm"
)

type PortalLink struct {
	ID              uint64                  `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	Name            string                  `json:"name" gorm:"size:120;not null"`
	URL             string                  `json:"url" gorm:"size:1000;not null"`
	IconKey         string                  `json:"iconKey" gorm:"column:icon_key;size:32;not null"`
	SortOrder       int                     `json:"sortOrder" gorm:"column:sort_order;not null;default:0;index:idx_portal_link_sort"`
	IsEnabled       bool                    `json:"isEnabled" gorm:"column:is_enabled;type:tinyint(1);not null;default:1;index:idx_portal_link_enabled"`
	OpenInNewWindow bool                    `json:"openInNewWindow" gorm:"column:open_in_new_window;type:tinyint(1);not null;default:0"`
	AudienceType    string                  `json:"audienceType" gorm:"column:audience_type;size:16;not null;default:'all';index:idx_portal_link_audience"`
	CreatorID       uint64                  `json:"creatorId" gorm:"column:creator_id;type:bigint unsigned;not null;index:idx_portal_link_creator"`
	UpdatedByID     uint64                  `json:"updatedById" gorm:"column:updated_by_id;type:bigint unsigned;not null;index:idx_portal_link_updater"`
	CreatedAt       time.Time               `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	UpdatedAt       time.Time               `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
	DeletedAt       gorm.DeletedAt          `json:"-" gorm:"column:deleted_at;type:datetime;index"`
	TargetGroups    []PortalLinkTargetGroup `json:"targetGroups,omitempty" gorm:"foreignKey:LinkID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}

type PortalLinkTargetGroup struct {
	ID        uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	LinkID    uint64    `json:"linkId" gorm:"column:link_id;type:bigint unsigned;not null;uniqueIndex:uk_portal_link_group"`
	GroupID   uint64    `json:"groupId" gorm:"column:group_id;type:bigint unsigned;not null;uniqueIndex:uk_portal_link_group;index:idx_portal_link_target_group"`
	CreatedAt time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	Group     UserGroup `json:"group,omitempty" gorm:"foreignKey:GroupID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}
