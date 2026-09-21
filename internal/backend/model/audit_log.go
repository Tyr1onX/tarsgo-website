package model

import "time"

// AuditLog records security-sensitive administrative actions and their outcome.
type AuditLog struct {
	ID        uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	ActorID   *uint64   `json:"actorId,omitempty" gorm:"column:actor_id;type:bigint unsigned;default:null;index:idx_audit_actor"`
	Action    string    `json:"action" gorm:"size:100;not null;index:idx_audit_action"`
	Method    string    `json:"method" gorm:"size:10;not null"`
	Path      string    `json:"path" gorm:"size:500;not null"`
	Status    int       `json:"status" gorm:"not null"`
	IPAddress string    `json:"ipAddress" gorm:"column:ip_address;size:64;default:''"`
	Metadata  string    `json:"metadata" gorm:"type:json;default:null"`
	CreatedAt time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP;index:idx_audit_created_at"`
}

func (AuditLog) TableName() string { return "audit_logs" }
