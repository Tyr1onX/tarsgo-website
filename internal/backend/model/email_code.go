package model

import "time"

const (
	EmailCodePurposeRegister = "register"
	EmailCodePurposeLogin    = "login"
)

type EmailCode struct {
	ID         uint64     `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	Email      string     `json:"email" gorm:"size:255;not null;uniqueIndex:uk_email_purpose"`
	Purpose    string     `json:"purpose" gorm:"size:50;not null;uniqueIndex:uk_email_purpose"`
	CodeHash   string     `json:"-" gorm:"column:code_hash;size:64;not null"`
	ExpiresAt  time.Time  `json:"expiresAt" gorm:"column:expires_at;type:datetime;not null;index:idx_expires_at"`
	LastSentAt time.Time  `json:"lastSentAt" gorm:"column:last_sent_at;type:datetime;not null"`
	ConsumedAt *time.Time `json:"consumedAt,omitempty" gorm:"column:consumed_at;type:datetime;default:null"`
	CreatedAt  time.Time  `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	UpdatedAt  time.Time  `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
}
