package model

import "time"

const (
	TrainingQuestionPublic   = "public"
	TrainingQuestionPrivate  = "private"
	TrainingQuestionAnswer   = "answer"
	TrainingQuestionFollowUp = "follow_up"

	TrainingQuestionGrowthSolved = "solved"
	TrainingQuestionGrowthFAQ    = "faq"
)

type TrainingQuestion struct {
	ID          uint64     `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	GroupID     uint64     `json:"groupId" gorm:"column:group_id;type:bigint unsigned;not null;index:idx_training_question_group_state,priority:1;index:idx_training_question_group_created,priority:1"`
	AskerID     uint64     `json:"askerId" gorm:"column:asker_id;type:bigint unsigned;not null;index:idx_training_question_asker"`
	Title       string     `json:"title" gorm:"size:160;not null"`
	Body        string     `json:"body" gorm:"type:text;not null"`
	Visibility  string     `json:"visibility" gorm:"size:12;not null;default:public;index:idx_training_question_visibility"`
	IsSolved    bool       `json:"isSolved" gorm:"column:is_solved;type:tinyint(1);not null;default:0;index:idx_training_question_group_state,priority:2"`
	SolvedBy    *uint64    `json:"solvedBy,omitempty" gorm:"column:solved_by;type:bigint unsigned;default:null"`
	SolvedAt    *time.Time `json:"solvedAt,omitempty" gorm:"column:solved_at;type:datetime;default:null"`
	IsFAQ       bool       `json:"isFaq" gorm:"column:is_faq;type:tinyint(1);not null;default:0;index:idx_training_question_faq"`
	FAQBy       *uint64    `json:"faqBy,omitempty" gorm:"column:faq_by;type:bigint unsigned;default:null"`
	FAQAt       *time.Time `json:"faqAt,omitempty" gorm:"column:faq_at;type:datetime;default:null"`
	LastReplyAt *time.Time `json:"lastReplyAt,omitempty" gorm:"column:last_reply_at;type:datetime;default:null;index:idx_training_question_group_created,priority:2"`
	CreatedAt   time.Time  `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP;index:idx_training_question_group_created,priority:3"`
	UpdatedAt   time.Time  `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
}

func (TrainingQuestion) TableName() string { return "training_questions" }

type TrainingQuestionPost struct {
	ID         uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	QuestionID uint64    `json:"questionId" gorm:"column:question_id;type:bigint unsigned;not null;index:idx_training_question_post_order,priority:1"`
	AuthorID   uint64    `json:"authorId" gorm:"column:author_id;type:bigint unsigned;not null;index:idx_training_question_post_author"`
	Kind       string    `json:"kind" gorm:"size:12;not null"`
	Body       string    `json:"body" gorm:"type:text;not null"`
	CreatedAt  time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP;index:idx_training_question_post_order,priority:2"`
}

func (TrainingQuestionPost) TableName() string { return "training_question_posts" }

type TrainingQuestionAttachment struct {
	ID          uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	QuestionID  uint64    `json:"questionId" gorm:"column:question_id;type:bigint unsigned;not null;index:idx_training_question_attachment_question"`
	PostID      *uint64   `json:"postId,omitempty" gorm:"column:post_id;type:bigint unsigned;default:null;index:idx_training_question_attachment_post"`
	UploaderID  uint64    `json:"uploaderId" gorm:"column:uploader_id;type:bigint unsigned;not null;index:idx_training_question_attachment_uploader"`
	FileName    string    `json:"fileName" gorm:"column:file_name;size:255;not null"`
	StoragePath string    `json:"-" gorm:"column:storage_path;size:500;not null;uniqueIndex:uk_training_question_file_path"`
	ContentType string    `json:"contentType" gorm:"column:content_type;size:100;not null"`
	Size        int64     `json:"size" gorm:"type:bigint;not null"`
	CreatedAt   time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
}

func (TrainingQuestionAttachment) TableName() string { return "training_question_attachments" }

// TrainingQuestionGrowthEvent preserves resolved and FAQ milestones when the
// mutable question status is later reopened or removed from the FAQ.
type TrainingQuestionGrowthEvent struct {
	ID         uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	QuestionID uint64    `json:"questionId" gorm:"column:question_id;type:bigint unsigned;not null;index:idx_training_growth_event_question"`
	Kind       string    `json:"kind" gorm:"size:20;not null;index:idx_training_growth_event_kind"`
	OccurredAt time.Time `json:"occurredAt" gorm:"column:occurred_at;type:datetime;not null;index:idx_training_growth_event_time"`
}

func (TrainingQuestionGrowthEvent) TableName() string { return "training_question_growth_events" }
