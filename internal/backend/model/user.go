package model

import "time"

const (
	AdminScopeNone   = "none"
	AdminScopeGlobal = "global"
	AdminScopeGroup  = "group"
)

const (
	UserStatusDisabled uint8 = 0
	UserStatusEnabled  uint8 = 1
)

type User struct {
	ID                uint64            `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	RoleID            uint64            `json:"roleId" gorm:"column:role_id;type:bigint unsigned;not null;index:idx_role_id"`
	AdminScope        string            `json:"adminScope" gorm:"column:admin_scope;type:varchar(20);not null;default:'none';index:idx_admin_scope"`
	ManagementGroupID *uint64           `json:"managementGroupId,omitempty" gorm:"column:management_group_id;type:bigint unsigned;default:null;index:idx_management_group_id"`
	Name              string            `json:"name,omitempty" gorm:"size:100;not null;default:''"`
	Email             string            `json:"email" gorm:"size:255;not null;uniqueIndex:uk_email"`
	PasswordHash      *string           `json:"passwordHash,omitempty" gorm:"column:password_hash;size:255;default:null"`
	GitHubID          *string           `json:"githubId,omitempty" gorm:"column:github_id;size:100;uniqueIndex:uk_github_id"`
	GitHubUsername    *string           `json:"githubUsername,omitempty" gorm:"column:github_username;size:100;default:null"`
	Nickname          *string           `json:"nickname,omitempty" gorm:"size:100;default:null"`
	AvatarURL         *string           `json:"avatarUrl,omitempty" gorm:"column:avatar_url;size:500;default:null"`
	Phone             *string           `json:"phone,omitempty" gorm:"size:20;default:null;index:idx_phone"`
	RealName          *string           `json:"realName,omitempty" gorm:"column:real_name;size:100;default:null"`
	Gender            uint8             `json:"gender" gorm:"type:tinyint;not null;default:0"`
	Birthday          *time.Time        `json:"birthday,omitempty" gorm:"type:date;default:null"`
	Status            uint8             `json:"status" gorm:"type:tinyint;not null;default:1;index:idx_status"`
	LastLoginAt       *time.Time        `json:"lastLoginAt,omitempty" gorm:"column:last_login_at;type:datetime;default:null"`
	CreatedAt         time.Time         `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	UpdatedAt         time.Time         `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
	Role              Role              `json:"role,omitempty" gorm:"foreignKey:RoleID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;"`
	GroupMembers      []UserGroupMember `json:"groupMembers,omitempty" gorm:"foreignKey:UserID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}
