package model

import "time"

// TrainingGrade stores historical/offline scores independently of file-submission reviews.
// Nil score means ungraded; 0 is a valid explicit score.
type TrainingGrade struct {
	ID             uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	GroupID        uint64    `json:"groupId" gorm:"column:group_id;type:bigint unsigned;not null;uniqueIndex:uk_training_grade,priority:1"`
	AssessmentName string    `json:"assessmentName" gorm:"column:assessment_name;size:120;not null;uniqueIndex:uk_training_grade,priority:2"`
	UserID         uint64    `json:"userId" gorm:"column:user_id;type:bigint unsigned;not null;uniqueIndex:uk_training_grade,priority:3"`
	Score          *uint8    `json:"score" gorm:"type:tinyint unsigned;default:null"`
	Note           string    `json:"note" gorm:"size:500;not null;default:''"`
	UpdatedBy      uint64    `json:"-" gorm:"column:updated_by;type:bigint unsigned;not null"`
	UpdatedAt      time.Time `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null"`
}

func (TrainingGrade) TableName() string { return "training_grades" }

// CapabilityDimension names a competency criterion within a technical group.
type CapabilityDimension struct {
	ID        uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	GroupID   uint64    `json:"groupId" gorm:"column:group_id;type:bigint unsigned;not null;uniqueIndex:uk_group_capability_name,priority:1"`
	Name      string    `json:"name" gorm:"size:100;not null;uniqueIndex:uk_group_capability_name,priority:2"`
	CreatedAt time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null"`
}

func (CapabilityDimension) TableName() string { return "group_capability_dimensions" }

// CapabilityRating records an explicit evaluator judgment (0–5).
// There is no automatic inference from a training assignment's overall score.
type CapabilityRating struct {
	ID          uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	DimensionID uint64    `json:"dimensionId" gorm:"column:dimension_id;type:bigint unsigned;not null;uniqueIndex:uk_capability_rating,priority:1"`
	UserID      uint64    `json:"userId" gorm:"column:user_id;type:bigint unsigned;not null;uniqueIndex:uk_capability_rating,priority:2"`
	Score       uint8     `json:"score" gorm:"type:tinyint unsigned;not null"`
	Note        string    `json:"note" gorm:"size:500;not null;default:''"`
	UpdatedBy   uint64    `json:"-" gorm:"column:updated_by;type:bigint unsigned;not null"`
	UpdatedAt   time.Time `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null"`
}

func (CapabilityRating) TableName() string { return "group_capability_ratings" }
