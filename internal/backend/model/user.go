package model

import "time"

const (
	// These values are retained to read and replay historical scope migrations.
	// They are not used to grant or constrain current system permissions.
	AdminScopeNone   = "none"
	AdminScopeGlobal = "global"
	AdminScopeGroup  = "group"
)

const (
	UserStatusDisabled uint8 = 0
	UserStatusEnabled  uint8 = 1
)

type User struct {
	// Derived by the session query; never persisted or used as another identity source.
	WorkbenchAccess bool   `json:"-" gorm:"-"`
	ID              uint64 `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	RoleID          uint64 `json:"roleId" gorm:"column:role_id;type:bigint unsigned;not null;index:idx_role_id"`
	// Legacy scope columns remain mapped for database compatibility only. Runtime
	// authorization uses the system role and active group membership.
	AdminScope        string  `json:"-" gorm:"column:admin_scope;type:varchar(20);not null;default:'none';index:idx_admin_scope"`
	ManagementGroupID *uint64 `json:"-" gorm:"column:management_group_id;type:bigint unsigned;default:null;index:idx_management_group_id"`
	// Name is inert legacy storage retained to preserve historical account data.
	Name               string            `json:"-" gorm:"column:name;size:100;not null;default:''"`
	Email              string            `json:"email" gorm:"size:255;not null;uniqueIndex:uk_email"`
	FeishuOpenID       *string           `json:"-" gorm:"column:feishu_open_id;size:100;uniqueIndex:uk_feishu_open_id;default:null"`
	PasswordHash       *string           `json:"passwordHash,omitempty" gorm:"column:password_hash;size:255;default:null"`
	PasswordResetAt    *time.Time        `json:"-" gorm:"column:password_reset_at;type:datetime;default:null"`
	GitHubID           *string           `json:"githubId,omitempty" gorm:"column:github_id;size:100;uniqueIndex:uk_github_id"`
	GitHubUsername     *string           `json:"githubUsername,omitempty" gorm:"column:github_username;size:100;default:null"`
	AvatarURL          *string           `json:"avatarUrl,omitempty" gorm:"column:avatar_url;size:500;default:null"`
	Phone              *string           `json:"phone,omitempty" gorm:"size:20;default:null;index:idx_phone"`
	RealName           *string           `json:"realName,omitempty" gorm:"column:real_name;size:100;default:null"`
	TeamIdentityStatus string            `json:"-" gorm:"column:team_identity_status;size:32;not null;default:'community_member';index:idx_team_identity_status"`
	IsStudent          *bool             `json:"-" gorm:"column:is_student;type:tinyint(1);default:null"`
	College            string            `json:"-" gorm:"size:100;not null;default:''"`
	Grade              string            `json:"-" gorm:"size:40;not null;default:''"`
	StudentID          string            `json:"-" gorm:"size:40;not null;default:''"`
	Campus             string            `json:"-" gorm:"size:40;not null;default:''"`
	Gender             uint8             `json:"gender" gorm:"type:tinyint;not null;default:0"`
	Birthday           *time.Time        `json:"birthday,omitempty" gorm:"type:date;default:null"`
	Status             uint8             `json:"status" gorm:"type:tinyint;not null;default:1;index:idx_status"`
	LastLoginAt        *time.Time        `json:"lastLoginAt,omitempty" gorm:"column:last_login_at;type:datetime;default:null"`
	CreatedAt          time.Time         `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	UpdatedAt          time.Time         `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
	Role               Role              `json:"role,omitempty" gorm:"foreignKey:RoleID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;"`
	GroupMembers       []UserGroupMember `json:"groupMembers,omitempty" gorm:"foreignKey:UserID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}
