package model

import "time"

const (
	OAuthProviderGitHub = "github"
	OAuthProviderGoogle = "google"
)

type OAuthAccount struct {
	ID             uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	UserID         uint64    `json:"userId" gorm:"column:user_id;type:bigint unsigned;not null;uniqueIndex:uk_user_provider,priority:1;index:idx_user_id"`
	Provider       string    `json:"provider" gorm:"size:50;not null;uniqueIndex:uk_provider_user,priority:1;uniqueIndex:uk_user_provider,priority:2;index:idx_provider"`
	ProviderUserID string    `json:"providerUserId" gorm:"column:provider_user_id;size:191;not null;uniqueIndex:uk_provider_user,priority:2"`
	ProviderLogin  *string   `json:"providerLogin,omitempty" gorm:"column:provider_login;size:255;default:null"`
	ProviderEmail  *string   `json:"providerEmail,omitempty" gorm:"column:provider_email;size:255;default:null"`
	AvatarURL      *string   `json:"avatarUrl,omitempty" gorm:"column:avatar_url;size:500;default:null"`
	CreatedAt      time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	UpdatedAt      time.Time `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
	User           User      `json:"user,omitempty" gorm:"foreignKey:UserID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}
