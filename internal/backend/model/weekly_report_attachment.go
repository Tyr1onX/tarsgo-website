package model

import "time"

type WeeklyReportAttachment struct {
	ID          uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	ReportID    uint64    `json:"reportId" gorm:"column:report_id;type:bigint unsigned;not null;uniqueIndex:uk_weekly_report_attachment_hash,priority:1;index:idx_weekly_report_attachment_report"`
	FileName    string    `json:"fileName" gorm:"size:255;not null"`
	StoragePath string    `json:"-" gorm:"column:storage_path;size:500;not null;uniqueIndex:uk_weekly_report_attachment_path"`
	ContentType string    `json:"contentType" gorm:"column:content_type;size:100;not null"`
	ContentHash string    `json:"-" gorm:"column:content_hash;size:64;not null;uniqueIndex:uk_weekly_report_attachment_hash,priority:2"`
	Size        int64     `json:"size" gorm:"type:bigint;not null"`
	CreatedAt   time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
}

func (WeeklyReportAttachment) TableName() string { return "weekly_report_attachments" }
