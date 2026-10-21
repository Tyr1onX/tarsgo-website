package model

import "time"

const (
	AssignmentReviewPassed    = "passed"
	AssignmentReviewNeedsRedo = "needs_redo"
)

type Assignment struct {
	ID                     uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	PublishRequestID       *string   `json:"-" gorm:"column:publish_request_id;size:36;uniqueIndex:uk_assignment_publish_request"`
	PublishRequestHash     *string   `json:"-" gorm:"column:publish_request_hash;size:64"`
	GroupID                uint64    `json:"groupId" gorm:"column:group_id;type:bigint unsigned;not null;index:idx_assignment_group_due,priority:1"`
	CreatorID              uint64    `json:"creatorId" gorm:"column:creator_id;type:bigint unsigned;not null;index:idx_assignment_creator"`
	Title                  string    `json:"title" gorm:"size:120;not null"`
	Description            string    `json:"description" gorm:"type:text;not null"`
	DueAt                  time.Time `json:"dueAt" gorm:"column:due_at;type:datetime;not null;index:idx_assignment_group_due,priority:2"`
	AttachmentRequirements string    `json:"attachmentRequirements" gorm:"column:attachment_requirements;type:text;not null"`
	IsGroupWide            bool      `json:"isGroupWide" gorm:"column:is_group_wide;type:tinyint(1);not null;default:1"`
	CreatedAt              time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	UpdatedAt              time.Time `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
}

type AssignmentTarget struct {
	ID           uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	AssignmentID uint64    `json:"assignmentId" gorm:"column:assignment_id;type:bigint unsigned;not null;uniqueIndex:uk_assignment_target,priority:1;index:idx_assignment_target_user,priority:1"`
	UserID       uint64    `json:"userId" gorm:"column:user_id;type:bigint unsigned;not null;uniqueIndex:uk_assignment_target,priority:2;index:idx_assignment_target_user,priority:2"`
	CreatedAt    time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
}

type AssignmentSubmission struct {
	ID           uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	AssignmentID uint64    `json:"assignmentId" gorm:"column:assignment_id;type:bigint unsigned;not null;uniqueIndex:uk_assignment_attempt,priority:1;index:idx_assignment_submission_user,priority:1"`
	UserID       uint64    `json:"userId" gorm:"column:user_id;type:bigint unsigned;not null;uniqueIndex:uk_assignment_attempt,priority:2;index:idx_assignment_submission_user,priority:2"`
	Attempt      uint      `json:"attempt" gorm:"type:int unsigned;not null;uniqueIndex:uk_assignment_attempt,priority:3"`
	SubmittedAt  time.Time `json:"submittedAt" gorm:"column:submitted_at;type:datetime;not null;index:idx_assignment_submitted_at"`
	IsLate       bool      `json:"isLate" gorm:"column:is_late;type:tinyint(1);not null;default:0"`
	CreatedAt    time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
}

type AssignmentSubmissionFile struct {
	ID           uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	SubmissionID uint64    `json:"submissionId" gorm:"column:submission_id;type:bigint unsigned;not null;index:idx_assignment_file_submission"`
	FileName     string    `json:"fileName" gorm:"column:file_name;size:255;not null"`
	StoragePath  string    `json:"-" gorm:"column:storage_path;size:500;not null;uniqueIndex:uk_assignment_file_path"`
	ContentType  string    `json:"contentType" gorm:"column:content_type;size:100;not null"`
	Size         int64     `json:"size" gorm:"type:bigint;not null"`
	CreatedAt    time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
}

type AssignmentMaterialFile struct {
	ID           uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	AssignmentID uint64    `json:"assignmentId" gorm:"column:assignment_id;type:bigint unsigned;not null;index:idx_assignment_material_assignment"`
	UploaderID   uint64    `json:"uploaderId" gorm:"column:uploader_id;type:bigint unsigned;not null;index:idx_assignment_material_uploader"`
	FileName     string    `json:"fileName" gorm:"column:file_name;size:255;not null"`
	StoragePath  string    `json:"-" gorm:"column:storage_path;size:500;not null;uniqueIndex:uk_assignment_material_path"`
	ContentType  string    `json:"contentType" gorm:"column:content_type;size:100;not null"`
	Size         int64     `json:"size" gorm:"type:bigint;not null"`
	CreatedAt    time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
}

func (AssignmentMaterialFile) TableName() string { return "assignment_material_files" }

type AssignmentReview struct {
	ID           uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	SubmissionID uint64    `json:"submissionId" gorm:"column:submission_id;type:bigint unsigned;not null;index:idx_assignment_review_submission"`
	ReviewerID   uint64    `json:"reviewerId" gorm:"column:reviewer_id;type:bigint unsigned;not null;index:idx_assignment_review_reviewer"`
	Score        uint8     `json:"score" gorm:"type:tinyint unsigned;not null"`
	Decision     string    `json:"decision" gorm:"size:20;not null"`
	Comment      string    `json:"comment" gorm:"type:text;not null"`
	CreatedAt    time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
}
