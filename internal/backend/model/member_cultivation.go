package model

import "time"

// MemberCultivationRecord stores the current internal focus marker and note
// for one member in one group. It is visible only through admin APIs.
type MemberCultivationRecord struct {
	ID            uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	GroupID       uint64    `json:"groupId" gorm:"column:group_id;type:bigint unsigned;not null;uniqueIndex:uk_member_cultivation,priority:1"`
	UserID        uint64    `json:"userId" gorm:"column:user_id;type:bigint unsigned;not null;uniqueIndex:uk_member_cultivation,priority:2"`
	Focused       bool      `json:"focused" gorm:"type:tinyint(1);not null;default:0"`
	InternalNote  string    `json:"internalNote" gorm:"column:internal_note;type:text;not null"`
	UpdatedBy     uint64    `json:"updatedBy" gorm:"column:updated_by;type:bigint unsigned;not null"`
	UpdatedByName string    `json:"updatedByName" gorm:"column:updated_by_name;size:100;not null"`
	UpdatedAt     time.Time `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
}

func (MemberCultivationRecord) TableName() string { return "member_cultivation_records" }
