package model

import "time"

// OperationsProgressItem is a long-running operations workstream, not a weekly task.
type OperationsProgressItem struct {
	ID           uint64     `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	Title        string     `json:"title" gorm:"size:120;not null"`
	Kind         string     `json:"kind" gorm:"size:16;not null;default:'workstream'"`
	Platforms    string     `json:"platforms" gorm:"size:80;not null;default:''"`
	Stage        string     `json:"stage" gorm:"size:24;not null;default:''"`
	SeedKey      *string    `json:"-" gorm:"size:40;uniqueIndex:uk_operations_seed_key;default:null"`
	Owner        string     `json:"owner" gorm:"size:80;not null;default:''"`
	IntervalDays int        `json:"intervalDays" gorm:"not null;default:0"`
	NextAction   string     `json:"nextAction" gorm:"size:300;not null;default:''"`
	NextCheckAt  *time.Time `json:"nextCheckAt" gorm:"type:datetime;default:null"`
	Status       string     `json:"status" gorm:"size:16;not null;default:'active';index:idx_operations_progress_status"`
	CreatedAt    time.Time  `json:"createdAt" gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP"`
	UpdatedAt    time.Time  `json:"updatedAt" gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
}

// OperationsProgressStep is the independent source of truth for a deliverable's workflow.
type OperationsProgressStep struct {
	ID          uint64     `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	ItemID      uint64     `json:"itemId" gorm:"type:bigint unsigned;not null;index:idx_operations_step_item"`
	Key         string     `json:"key" gorm:"size:24;not null;default:''"`
	Title       string     `json:"title" gorm:"size:80;not null"`
	Position    int        `json:"position" gorm:"not null"`
	AssigneeID  *uint64    `json:"assigneeId" gorm:"type:bigint unsigned;default:null;index:idx_operations_step_assignee"`
	Status      string     `json:"status" gorm:"size:16;not null;default:'pending'"`
	BlockReason string     `json:"blockReason" gorm:"size:300;not null;default:''"`
	CompletedAt *time.Time `json:"completedAt" gorm:"type:datetime;default:null"`
	UpdatedAt   time.Time  `json:"updatedAt" gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
}

type OperationsStepPreset struct{ Key, Title string }

func OperationsStepPresets(kind string) []OperationsStepPreset {
	switch kind {
	case "video":
		return []OperationsStepPreset{
			{"planning", "选题文案"}, {"materials", "素材拍摄"}, {"editing", "剪辑制作"},
			{"review", "审核确认"}, {"published", "发布"},
		}
	case "merchandise":
		return []OperationsStepPreset{
			{"planning", "需求确定"}, {"design", "设计制作"}, {"approval", "设计定稿"},
			{"sample", "打样确认"}, {"production", "批量生产"}, {"delivered", "完成发放"},
		}
	}
	return nil
}

type OperationsProgressUpdate struct {
	ID          uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	ItemID      uint64    `json:"itemId" gorm:"type:bigint unsigned;not null;index:idx_operations_update_item_id"`
	AuthorID    uint64    `json:"authorId" gorm:"type:bigint unsigned;not null"`
	Content     string    `json:"content" gorm:"size:1000;not null"`
	Kind        string    `json:"kind" gorm:"size:16;not null;default:'progress'"`
	FromStage   string    `json:"fromStage" gorm:"size:24;not null;default:''"`
	ToStage     string    `json:"toStage" gorm:"size:24;not null;default:''"`
	Link        string    `json:"link" gorm:"size:500;not null;default:''"`
	PublishedOn *string   `json:"publishedOn" gorm:"size:10;default:null"`
	CreatedAt   time.Time `json:"createdAt" gorm:"type:datetime;not null;default:CURRENT_TIMESTAMP"`
}