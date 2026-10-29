package model

import "time"

const (
	CapabilitySourceAssignment = "assignment"
	CapabilitySourcePractice   = "practice_project"
)

// CapabilityDimension is a numeric assessment dimension owned by one group.
// Inactive dimensions are retained so historical manual reviews remain auditable.
type CapabilityDimension struct {
	ID          uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	GroupID     uint64    `json:"groupId" gorm:"column:group_id;type:bigint unsigned;not null;index:idx_capability_dimension_group"`
	Name        string    `json:"name" gorm:"size:100;not null"`
	Description string    `json:"description" gorm:"type:text;not null"`
	SortOrder   uint      `json:"sortOrder" gorm:"column:sort_order;type:int unsigned;not null;default:0"`
	Active      bool      `json:"active" gorm:"type:tinyint(1);not null;default:1;index:idx_capability_dimension_group,priority:2"`
	CreatedBy   uint64    `json:"createdBy" gorm:"column:created_by;type:bigint unsigned;not null"`
	CreatedAt   time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	UpdatedAt   time.Time `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
}

func (CapabilityDimension) TableName() string { return "capability_dimensions" }

// CapabilityDimensionSource maps an existing assignment or practice project
// to a dimension. Scores remain in their source tables and are read at request
// time, so regrading automatically changes the derived capability result.
type CapabilityDimensionSource struct {
	ID          uint64 `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	GroupID     uint64 `json:"groupId" gorm:"column:group_id;type:bigint unsigned;not null;index:idx_capability_source_group"`
	DimensionID uint64 `json:"dimensionId" gorm:"column:dimension_id;type:bigint unsigned;not null;uniqueIndex:uk_capability_source,priority:1;index:idx_capability_source_group,priority:2"`
	SourceType  string `json:"sourceType" gorm:"column:source_type;size:30;not null;uniqueIndex:uk_capability_source,priority:2"`
	SourceID    uint64 `json:"sourceId" gorm:"column:source_id;type:bigint unsigned;not null;uniqueIndex:uk_capability_source,priority:3"`
}

func (CapabilityDimensionSource) TableName() string { return "capability_dimension_sources" }

// CapabilityManualReview is append-only. Its dimension name snapshot and
// reviewer identity preserve the context of the evaluation over time.
type CapabilityManualReview struct {
	ID            uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	GroupID       uint64    `json:"groupId" gorm:"column:group_id;type:bigint unsigned;not null;index:idx_capability_review_scope,priority:1"`
	DimensionID   uint64    `json:"dimensionId" gorm:"column:dimension_id;type:bigint unsigned;not null;index:idx_capability_review_scope,priority:2"`
	DimensionName string    `json:"dimensionName" gorm:"column:dimension_name;size:100;not null"`
	UserID        uint64    `json:"userId" gorm:"column:user_id;type:bigint unsigned;not null;index:idx_capability_review_scope,priority:3"`
	Score         uint8     `json:"score" gorm:"type:tinyint unsigned;not null"`
	Comment       string    `json:"comment" gorm:"type:text;not null"`
	ActorID       uint64    `json:"actorId" gorm:"column:actor_id;type:bigint unsigned;not null"`
	ActorName     string    `json:"actorName" gorm:"column:actor_name;size:100;not null"`
	CreatedAt     time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP;index:idx_capability_review_created"`
}

func (CapabilityManualReview) TableName() string { return "capability_manual_reviews" }
