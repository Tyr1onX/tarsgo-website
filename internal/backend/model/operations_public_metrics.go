package model

import "time"

// OperationsAccountSnapshot is a dated observation, never an interpolated value.
type OperationsAccountSnapshot struct {
	ID           uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	Platform     string    `json:"platform" gorm:"size:16;not null;uniqueIndex:uk_operations_platform_day"`
	ObservedOn   string    `json:"observedOn" gorm:"size:10;not null;uniqueIndex:uk_operations_platform_day"`
	Followers    int64     `json:"followers" gorm:"not null"`
	NewFollowers *int64    `json:"newFollowers" gorm:"default:null"`
	Unfollows    *int64    `json:"unfollows" gorm:"default:null"`
	Source       string    `json:"source" gorm:"size:24;not null"`
	CreatedAt    time.Time `json:"createdAt" gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP"`
}

// OperationsPlatformPost tracks public posts independently from internal workflow notes.
type OperationsPlatformPost struct {
	ID             uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	Platform       string    `json:"platform" gorm:"size:16;not null;uniqueIndex:uk_operations_platform_post"`
	ExternalID     string    `json:"externalId" gorm:"size:80;not null;uniqueIndex:uk_operations_platform_post"`
	Title          string    `json:"title" gorm:"size:250;not null"`
	URL            string    `json:"url" gorm:"size:500;not null"`
	PublishedAt    time.Time `json:"publishedAt" gorm:"type:datetime;not null;index:idx_operations_platform_post_published"`
	ViewCount      int64     `json:"viewCount" gorm:"not null;default:0"`
	MediaType      string    `json:"mediaType" gorm:"size:16;not null;default:''"`
	LikeCount      int64     `json:"likeCount" gorm:"not null;default:0"`
	RecommendCount int64     `json:"recommendCount" gorm:"not null;default:0"`
	CommentCount   int64     `json:"commentCount" gorm:"not null;default:0"`
	ShareCount     int64     `json:"shareCount" gorm:"not null;default:0"`
	FavoriteCount  int64     `json:"favoriteCount" gorm:"not null;default:0"`
	ProfileVisits  *int64    `json:"profileVisits"`
	FollowerGain   *int64    `json:"followerGain"`
	SyncedAt       time.Time `json:"syncedAt" gorm:"type:datetime;not null"`
}
