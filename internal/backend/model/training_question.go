package model

import "time"

const (
	TrainingQuestionPublic   = "public"
	TrainingQuestionPrivate  = "private"
	TrainingQuestionAnswer   = "answer"
	TrainingQuestionFollowUp = "follow_up"
	TrainingQuestionComment  = "comment"

	CommunityCategoryTechnology = "technology"
	CommunityCategoryProject    = "project"
	CommunityCategoryExperience = "experience"
	CommunityCategoryTeam       = "team"

	TrainingQuestionGrowthSolved = "solved"
	TrainingQuestionGrowthFAQ    = "faq"
)

type TrainingQuestion struct {
	ID                 uint64     `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	GroupID            *uint64    `json:"groupId,omitempty" gorm:"column:group_id;type:bigint unsigned;default:null;index:idx_training_question_group_state,priority:1;index:idx_training_question_group_created,priority:1"`
	AskerID            uint64     `json:"askerId" gorm:"column:asker_id;type:bigint unsigned;not null;index:idx_training_question_asker"`
	Title              string     `json:"title" gorm:"size:160;not null"`
	Body               string     `json:"body" gorm:"type:text;not null"`
	Category           string     `json:"category" gorm:"size:20;not null;default:technology;index:idx_training_question_community_category"`
	Visibility         string     `json:"visibility" gorm:"size:12;not null;default:public;index:idx_training_question_visibility"`
	IsPinned           bool       `json:"isPinned" gorm:"column:is_pinned;type:tinyint(1);not null;default:0"`
	IsFeatured         bool       `json:"isFeatured" gorm:"column:is_featured;type:tinyint(1);not null;default:0"`
	IsHidden           bool       `json:"isHidden" gorm:"column:is_hidden;type:tinyint(1);not null;default:0"`
	DeletedAt          *time.Time `json:"deletedAt,omitempty" gorm:"column:deleted_at;type:datetime;default:null;index:idx_training_question_deleted"`
	EditedAt           *time.Time `json:"editedAt,omitempty" gorm:"column:edited_at;type:datetime;default:null"`
	IsSolved           bool       `json:"isSolved" gorm:"column:is_solved;type:tinyint(1);not null;default:0;index:idx_training_question_group_state,priority:2"`
	SolvedBy           *uint64    `json:"solvedBy,omitempty" gorm:"column:solved_by;type:bigint unsigned;default:null"`
	SolvedAt           *time.Time `json:"solvedAt,omitempty" gorm:"column:solved_at;type:datetime;default:null"`
	AcceptedSolutionID *uint64    `json:"acceptedSolutionId,omitempty" gorm:"column:accepted_solution_id;type:bigint unsigned;default:null;index:idx_training_question_accepted_solution"`
	IsFAQ              bool       `json:"isFaq" gorm:"column:is_faq;type:tinyint(1);not null;default:0;index:idx_training_question_faq"`
	FAQBy              *uint64    `json:"faqBy,omitempty" gorm:"column:faq_by;type:bigint unsigned;default:null"`
	FAQAt              *time.Time `json:"faqAt,omitempty" gorm:"column:faq_at;type:datetime;default:null"`
	LastReplyAt        *time.Time `json:"lastReplyAt,omitempty" gorm:"column:last_reply_at;type:datetime;default:null;index:idx_training_question_group_created,priority:2"`
	CreatedAt          time.Time  `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP;index:idx_training_question_group_created,priority:3"`
	UpdatedAt          time.Time  `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
}

func (TrainingQuestion) TableName() string { return "training_questions" }

type TrainingQuestionPost struct {
	ID           uint64     `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	QuestionID   uint64     `json:"questionId" gorm:"column:question_id;type:bigint unsigned;not null;index:idx_training_question_post_order,priority:1"`
	ParentPostID *uint64    `json:"parentPostId,omitempty" gorm:"column:parent_post_id;type:bigint unsigned;default:null;index:idx_training_question_post_parent"`
	AuthorID     uint64     `json:"authorId" gorm:"column:author_id;type:bigint unsigned;not null;index:idx_training_question_post_author"`
	Kind         string     `json:"kind" gorm:"size:12;not null"`
	Body         string     `json:"body" gorm:"type:text;not null"`
	IsFeatured   bool       `json:"isFeatured" gorm:"column:is_featured;type:tinyint(1);not null;default:0"`
	EditedAt     *time.Time `json:"editedAt,omitempty" gorm:"column:edited_at;type:datetime;default:null"`
	DeletedAt    *time.Time `json:"deletedAt,omitempty" gorm:"column:deleted_at;type:datetime;default:null;index:idx_training_question_post_deleted"`
	CreatedAt    time.Time  `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP;index:idx_training_question_post_order,priority:2"`
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

// CommunityPostReaction stores one like or bookmark per member and post.
// The composite primary key prevents duplicate interactions under concurrency.
type CommunityPostReaction struct {
	QuestionID uint64    `json:"questionId" gorm:"column:question_id;type:bigint unsigned;primaryKey;autoIncrement:false"`
	UserID     uint64    `json:"userId" gorm:"column:user_id;type:bigint unsigned;primaryKey;autoIncrement:false"`
	Kind       string    `json:"kind" gorm:"size:12;primaryKey;autoIncrement:false"`
	CreatedAt  time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
}

func (CommunityPostReaction) TableName() string { return "community_post_reactions" }

// CommunityPostViewRecord stores one view per signed-in member and topic.
// The composite primary key makes page refreshes idempotent.
type CommunityPostViewRecord struct {
	QuestionID uint64    `json:"questionId" gorm:"column:question_id;type:bigint unsigned;primaryKey;autoIncrement:false"`
	UserID     uint64    `json:"userId" gorm:"column:user_id;type:bigint unsigned;primaryKey;autoIncrement:false"`
	ViewedAt   time.Time `json:"viewedAt" gorm:"column:viewed_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
}

func (CommunityPostViewRecord) TableName() string { return "community_post_views" }

// CommunityCommentReaction stores one like per member and comment.
type CommunityCommentReaction struct {
	CommentID uint64    `json:"commentId" gorm:"column:comment_id;type:bigint unsigned;primaryKey;autoIncrement:false"`
	UserID    uint64    `json:"userId" gorm:"column:user_id;type:bigint unsigned;primaryKey;autoIncrement:false"`
	CreatedAt time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
}

func (CommunityCommentReaction) TableName() string { return "community_comment_reactions" }

// CommunityCheckIn stores the authoritative Beijing calendar-day check-in and streak.
type CommunityCheckIn struct {
	ID         uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	UserID     uint64    `json:"userId" gorm:"column:user_id;type:bigint unsigned;not null;uniqueIndex:uk_community_checkin_day,priority:1;index:idx_community_checkin_user_day,priority:1"`
	Day        string    `json:"day" gorm:"column:day;size:10;not null;uniqueIndex:uk_community_checkin_day,priority:2;index:idx_community_checkin_user_day,priority:2"`
	StreakDays int       `json:"streakDays" gorm:"column:streak_days;not null"`
	AwardedXP  int       `json:"awardedXp" gorm:"column:awarded_xp;not null"`
	CreatedAt  time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
}

func (CommunityCheckIn) TableName() string { return "community_check_ins" }

// CommunityExperienceEvent is an idempotent, auditable source for earned XP.
// Revoked events remain in the ledger so replaying a like or acceptance cannot
// grant the same source reward again.
type CommunityExperienceEvent struct {
	ID         uint64     `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	UserID     uint64     `json:"userId" gorm:"column:user_id;type:bigint unsigned;not null;index:idx_community_xp_user_time,priority:1;index:idx_community_xp_user_active,priority:1"`
	ActorID    *uint64    `json:"actorId,omitempty" gorm:"column:actor_id;type:bigint unsigned;default:null"`
	SourceType string     `json:"sourceType" gorm:"column:source_type;size:24;not null;index:idx_community_xp_source_type_id,priority:1"`
	SourceID   uint64     `json:"sourceId" gorm:"column:source_id;type:bigint unsigned;not null;index:idx_community_xp_source_type_id,priority:2"`
	RelatedID  uint64     `json:"relatedId" gorm:"column:related_id;type:bigint unsigned;not null;default:0;index:idx_community_xp_related"`
	SourceKey  string     `json:"sourceKey" gorm:"column:source_key;size:191;not null;uniqueIndex:uk_community_xp_source"`
	Points     int        `json:"points" gorm:"column:points;not null"`
	CreatedAt  time.Time  `json:"createdAt" gorm:"column:created_at;type:datetime;not null;index:idx_community_xp_user_time,priority:2"`
	RevokedAt  *time.Time `json:"revokedAt,omitempty" gorm:"column:revoked_at;type:datetime;default:null;index:idx_community_xp_user_active,priority:2"`
}

func (CommunityExperienceEvent) TableName() string { return "community_experience_events" }
