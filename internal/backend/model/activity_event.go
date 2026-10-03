package model

import "time"

const (
	ActivityUserRegistered         = "user.registered"
	ActivityUserCreated            = "user.created"
	ActivityRegistrationSubmitted  = "registration.submitted"
	ActivityRegistrationApproved   = "registration.approved"
	ActivityRegistrationRejected   = "registration.rejected"
	ActivityRegistrationReviewUndo = "registration.review_undone"
	ActivityGroupMemberAdded       = "group.member_added"
	ActivityGroupMemberRemoved     = "group.member_removed"
	ActivityGroupMemberRoleChanged = "group.member_role_changed"
	ActivityAnnouncementPublished  = "announcement.published"
	ActivityAnnouncementArchived   = "announcement.archived"
	ActivityAnnouncementCreated    = "announcement.created"
	ActivityAnnouncementUpdated    = "announcement.updated"
	ActivityAnnouncementDeleted    = "announcement.deleted"
	ActivityEventPublished         = "event.published"
	ActivityEventCancelled         = "event.cancelled"
	ActivityEventCreated           = "event.created"
	ActivityEventUpdated           = "event.updated"
	ActivityEventDeleted           = "event.deleted"
	ActivityPortalLinkCreated      = "portal_link.created"
	ActivityPortalLinkUpdated      = "portal_link.updated"
	ActivityPortalLinkDeleted      = "portal_link.deleted"
)

type ActivityEvent struct {
	ID           uint64         `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	ActionKey    string         `json:"actionKey" gorm:"column:action_key;size:80;not null;index:idx_activity_action"`
	ActorID      *uint64        `json:"actorId,omitempty" gorm:"column:actor_id;type:bigint unsigned;index:idx_activity_actor"`
	TargetUserID *uint64        `json:"targetUserId,omitempty" gorm:"column:target_user_id;type:bigint unsigned;index:idx_activity_target_user"`
	EntityType   *string        `json:"entityType,omitempty" gorm:"column:entity_type;size:50;index:idx_activity_entity"`
	EntityID     *uint64        `json:"entityId,omitempty" gorm:"column:entity_id;type:bigint unsigned;index:idx_activity_entity"`
	GroupID      *uint64        `json:"groupId,omitempty" gorm:"column:group_id;type:bigint unsigned;index:idx_activity_group"`
	Metadata     map[string]any `json:"metadata,omitempty" gorm:"type:json;serializer:json"`
	CreatedAt    time.Time      `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP;index:idx_activity_created"`
	Actor        *User          `json:"-" gorm:"foreignKey:ActorID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
	TargetUser   *User          `json:"-" gorm:"foreignKey:TargetUserID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
	Group        *UserGroup     `json:"-" gorm:"foreignKey:GroupID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
}
