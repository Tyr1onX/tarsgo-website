package model

import "time"

// CommunityMemberProfile contains only member-authored public community
// identity fields. Account and academic information remains in its existing
// private profile storage.
type CommunityMemberProfile struct {
	UserID           uint64    `json:"userId" gorm:"column:user_id;type:bigint unsigned;primaryKey;autoIncrement:false"`
	Bio              string    `json:"bio" gorm:"type:varchar(640);not null;default:''"`
	FeaturedBadgeKey string    `json:"featuredBadgeKey" gorm:"column:featured_badge_key;size:64;not null;default:''"`
	UpdatedAt        time.Time `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
}

func (CommunityMemberProfile) TableName() string { return "community_member_profiles" }
