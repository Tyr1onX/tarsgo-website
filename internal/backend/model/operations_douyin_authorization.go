package model

import "time"

// OperationsDouyinAuthorization holds one encrypted OAuth grant for the team's account.
type OperationsDouyinAuthorization struct {
	ID               uint8     `gorm:"primaryKey"`
	OpenID           string    `gorm:"size:128;not null"`
	EncryptedTokens  string    `gorm:"type:text;not null"`
	AccessExpiresAt  time.Time `gorm:"not null"`
	RefreshExpiresAt time.Time `gorm:"not null"`
	RenewalCount     int       `gorm:"not null;default:0"`
	UpdatedAt        time.Time
}
