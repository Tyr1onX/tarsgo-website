package model

import "time"

const (
	UserGroupMemberRoleMember      uint8 = 0
	UserGroupMemberRoleLegacyAdmin uint8 = 1
	UserGroupMemberRoleLeader      uint8 = 2
)

type UserGroupMember struct {
	ID      uint64 `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	GroupID uint64 `json:"groupId" gorm:"column:group_id;type:bigint unsigned;not null;uniqueIndex:uk_group_user;index:idx_group_id"`
	UserID  uint64 `json:"userId" gorm:"column:user_id;type:bigint unsigned;not null;uniqueIndex:uk_group_user;index:idx_user_id"`
	// Role describes the member's organizational identity inside this group only.
	// It must not grant or revoke the user's system-level admin role.
	Role     uint8     `json:"role" gorm:"type:tinyint;not null;default:0;index:idx_role"`
	JoinedAt time.Time `json:"joinedAt" gorm:"column:joined_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	Group    UserGroup `json:"group,omitempty" gorm:"foreignKey:GroupID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	User     User      `json:"user,omitempty" gorm:"foreignKey:UserID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}
