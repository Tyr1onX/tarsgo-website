package model

import "time"

// OperationsAccountSnapshot is a dated observation, never an interpolated value.
type OperationsAccountSnapshot struct {
	ID         uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	Platform   string    `json:"platform" gorm:"size:16;not null;uniqueIndex:uk_operations_platform_day"`
	ObservedOn string    `json:"observedOn" gorm:"size:10;not null;uniqueIndex:uk_operations_platform_day"`
	Followers  int64     `json:"followers" gorm:"not null"`
	Source     string    `json:"source" gorm:"size:24;not null"`
	CreatedAt  time.Time `json:"createdAt" gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP"`
}

// OperationsPlatformPost tracks public posts independently from internal workflow notes.
type OperationsPlatformPost struct {
	ID          uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	Platform    string    `json:"platform" gorm:"size:16;not null;uniqueIndex:uk_operations_platform_post"`
	ExternalID  string    `json:"externalId" gorm:"size:80;not null;uniqueIndex:uk_operations_platform_post"`
	Title       string    `json:"title" gorm:"size:250;not null"`
	URL         string    `json:"url" gorm:"size:500;not null"`
	PublishedAt time.Time `json:"publishedAt" gorm:"type:datetime;not null;index:idx_operations_platform_post_published"`
	ViewCount   int64     `json:"viewCount" gorm:"not null;default:0"`
	SyncedAt    time.Time `json:"syncedAt" gorm:"type:datetime;not null"`
}
