package model

import "time"

// AuthSession stores only a one-way digest of the opaque browser session token.
// The raw value is sent once in an HttpOnly cookie and is never persisted.
type AuthSession struct {
	ID        uint64     `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	UserID    uint64     `json:"userId" gorm:"column:user_id;type:bigint unsigned;not null;index:idx_auth_sessions_user_id"`
	TokenHash string     `json:"-" gorm:"column:token_hash;size:64;not null;uniqueIndex:uk_auth_sessions_token_hash"`
	ExpiresAt time.Time  `json:"expiresAt" gorm:"column:expires_at;type:datetime;not null;index:idx_auth_sessions_expires_at"`
	RevokedAt *time.Time `json:"-" gorm:"column:revoked_at;type:datetime;default:null"`
	CreatedAt time.Time  `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	UpdatedAt time.Time  `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
}

func (AuthSession) TableName() string { return "auth_sessions" }

// AccountVault is scoped to one browser's account-switching cookie. SecretHash
// is a SHA-256 digest; the cookie itself is HttpOnly and never exposed to JS.
type AccountVault struct {
	ID         uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	SecretHash string    `json:"-" gorm:"column:secret_hash;size:64;not null;uniqueIndex:uk_account_vaults_secret_hash"`
	ExpiresAt  time.Time `json:"expiresAt" gorm:"column:expires_at;type:datetime;not null;index:idx_account_vaults_expires_at"`
	CreatedAt  time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	UpdatedAt  time.Time `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
}

func (AccountVault) TableName() string { return "account_vaults" }

// AccountVaultEntry binds one account slot to a current server-side session.
// A vault cannot contain the same user twice or more than five entries.
type AccountVaultEntry struct {
	ID        uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	VaultID   uint64    `json:"vaultId" gorm:"column:vault_id;type:bigint unsigned;not null;uniqueIndex:uk_account_vault_entries_vault_user,priority:1;index:idx_account_vault_entries_vault_id"`
	UserID    uint64    `json:"userId" gorm:"column:user_id;type:bigint unsigned;not null;uniqueIndex:uk_account_vault_entries_vault_user,priority:2"`
	SessionID uint64    `json:"sessionId" gorm:"column:session_id;type:bigint unsigned;not null;uniqueIndex:uk_account_vault_entries_session_id"`
	CreatedAt time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
}

func (AccountVaultEntry) TableName() string { return "account_vault_entries" }
