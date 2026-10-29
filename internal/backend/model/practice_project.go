package model

import "time"

const (
	PracticeProjectOpen      = "open"
	PracticeProjectClosed    = "closed"
	PracticeEntryActive      = "active"
	PracticeEntryExitPending = "exit_pending"
	PracticeEntryExited      = "exited"
	PracticeReviewPassed     = "passed"
	PracticeReviewRedo       = "needs_redo"
)

type PracticeProject struct {
	ID          uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	GroupID     uint64    `json:"groupId" gorm:"not null;index"`
	CreatorID   uint64    `json:"creatorId" gorm:"not null"`
	Title       string    `json:"title" gorm:"size:120;not null"`
	Description string    `json:"description" gorm:"type:text;not null"`
	Capacity    uint      `json:"capacity" gorm:"not null"`
	DueAt       time.Time `json:"dueAt" gorm:"not null"`
	Status      string    `json:"status" gorm:"size:20;not null;default:open"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}
type PracticeEntry struct {
	ID        uint64     `json:"id" gorm:"primaryKey;autoIncrement"`
	ProjectID uint64     `json:"projectId" gorm:"not null;uniqueIndex:uk_practice_entry,priority:1"`
	UserID    uint64     `json:"userId" gorm:"not null;uniqueIndex:uk_practice_entry,priority:2;index"`
	Status    string     `json:"status" gorm:"size:20;not null"`
	JoinedAt  time.Time  `json:"joinedAt"`
	ExitedAt  *time.Time `json:"exitedAt"`
}
type PracticeSubmission struct {
	ID         uint64     `json:"id" gorm:"primaryKey;autoIncrement"`
	ProjectID  uint64     `json:"projectId" gorm:"not null;index;uniqueIndex:uk_practice_attempt,priority:1"`
	UserID     uint64     `json:"userId" gorm:"not null;index;uniqueIndex:uk_practice_attempt,priority:2"`
	Attempt    uint       `json:"attempt" gorm:"not null;uniqueIndex:uk_practice_attempt,priority:3"`
	Progress   string     `json:"progress" gorm:"type:text;not null"`
	Reflection string     `json:"reflection" gorm:"type:text;not null"`
	Decision   string     `json:"decision" gorm:"size:20;not null;default:pending"`
	Comment    string     `json:"comment" gorm:"type:text;not null"`
	Score      *uint8     `json:"score,omitempty" gorm:"type:tinyint unsigned"`
	ReviewerID *uint64    `json:"reviewerId,omitempty"`
	ReviewedAt *time.Time `json:"reviewedAt,omitempty"`
	CreatedAt  time.Time  `json:"createdAt"`
}
type PracticeFile struct {
	ID           uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	SubmissionID uint64    `json:"submissionId" gorm:"not null;index"`
	FileName     string    `json:"fileName" gorm:"size:255;not null"`
	StoragePath  string    `json:"-" gorm:"size:500;not null;uniqueIndex"`
	ContentType  string    `json:"contentType" gorm:"size:100;not null"`
	Size         int64     `json:"size" gorm:"not null"`
	CreatedAt    time.Time `json:"createdAt"`
}
