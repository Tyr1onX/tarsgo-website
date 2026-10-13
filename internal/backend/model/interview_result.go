package model

import "time"

const (
	InterviewNotificationPending          = "pending"
	InterviewNotificationSending          = "sending"
	InterviewNotificationProviderAccepted = "provider_accepted"
	InterviewNotificationFailed           = "failed"
	InterviewNotificationNeedsReview      = "needs_review"
	InterviewNotificationLegacyUnknown    = "legacy_unknown"
)

// InterviewResultRevision is an append-only record of the effective interview
// decision. Corrections create another revision and never rewrite this row.
type InterviewResultRevision struct {
	ID             uint64                       `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	RegistrationID uint64                       `json:"registrationId" gorm:"column:registration_id;type:bigint unsigned;not null;uniqueIndex:uk_interview_result_revision,priority:1;index:idx_interview_result_registration"`
	Revision       uint                         `json:"revision" gorm:"not null;uniqueIndex:uk_interview_result_revision,priority:2"`
	PreviousStatus *string                      `json:"previousStatus,omitempty" gorm:"column:previous_status;size:32;default:null"`
	ResultStatus   string                       `json:"resultStatus" gorm:"column:result_status;size:32;not null"`
	ActorID        *uint64                      `json:"actorId,omitempty" gorm:"column:actor_id;type:bigint unsigned;default:null;index:idx_interview_result_actor"`
	Reason         *string                      `json:"reason,omitempty" gorm:"size:500;default:null"`
	CreatedAt      time.Time                    `json:"createdAt" gorm:"column:created_at;type:datetime(3);not null;index:idx_interview_result_created_at"`
	Actor          *User                        `json:"actor,omitempty" gorm:"foreignKey:ActorID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
	Notification   *InterviewResultNotification `json:"notification,omitempty" gorm:"foreignKey:RevisionID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}

func (InterviewResultRevision) TableName() string { return "interview_result_revisions" }

// InterviewResultNotification is a durable, versioned notification outbox row.
// Recipient and message content are snapshotted so retries are identical.
type InterviewResultNotification struct {
	ID                uint64                  `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	RegistrationID    uint64                  `json:"registrationId" gorm:"column:registration_id;type:bigint unsigned;not null;uniqueIndex:uk_interview_notification_revision,priority:1;index:idx_interview_notification_registration"`
	RevisionID        uint64                  `json:"revisionId" gorm:"column:revision_id;type:bigint unsigned;not null;uniqueIndex:uk_interview_notification_revision,priority:2"`
	Status            string                  `json:"status" gorm:"size:32;not null;index:idx_interview_notification_status"`
	Recipient         string                  `json:"recipient" gorm:"size:255;not null;default:''"`
	Subject           string                  `json:"subject" gorm:"size:255;not null"`
	Body              string                  `json:"body" gorm:"type:text;not null"`
	QRImageURL        *string                 `json:"qrImageUrl,omitempty" gorm:"column:qr_image_url;size:500;default:null"`
	ProviderMessageID *string                 `json:"providerMessageId,omitempty" gorm:"column:provider_message_id;size:255;default:null"`
	AttemptCount      uint                    `json:"attemptCount" gorm:"column:attempt_count;not null;default:0"`
	LastAttemptBy     *uint64                 `json:"lastAttemptBy,omitempty" gorm:"column:last_attempt_by;type:bigint unsigned;default:null"`
	LastAttemptAt     *time.Time              `json:"lastAttemptAt,omitempty" gorm:"column:last_attempt_at;type:datetime(3);default:null"`
	SendingStartedAt  *time.Time              `json:"sendingStartedAt,omitempty" gorm:"column:sending_started_at;type:datetime(3);default:null"`
	LastError         *string                 `json:"lastError,omitempty" gorm:"column:last_error;size:500;default:null"`
	CreatedAt         time.Time               `json:"createdAt" gorm:"column:created_at;type:datetime(3);not null"`
	UpdatedAt         time.Time               `json:"updatedAt" gorm:"column:updated_at;type:datetime(3);not null"`
	Revision          InterviewResultRevision `json:"-" gorm:"foreignKey:RevisionID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}

func (InterviewResultNotification) TableName() string { return "interview_result_notifications" }
