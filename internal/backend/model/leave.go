package model

import "time"

const (
	LeaveStatusPending   = "pending"
	LeaveStatusIncluded  = "included"
	LeaveStatusWithdrawn = "withdrawn"

	LeaveAccessPending  = "pending"
	LeaveAccessApproved = "approved"
	LeaveAccessRejected = "rejected"

	LeaveRunReady          = "ready"
	LeaveRunAwaitingReturn = "awaiting_return"
	LeaveRunCompleted      = "completed"
	LeaveRunCancelled      = "cancelled"
)

// LeaveAccessRequest stores a member's request to use the authenticated leave
// workbench. Missing rows mean access has not been requested or granted.
type LeaveAccessRequest struct {
	ID          uint64     `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	UserID      uint64     `json:"userId" gorm:"column:user_id;type:bigint unsigned;not null;uniqueIndex:uk_leave_access_request_user"`
	Status      string     `json:"status" gorm:"size:20;not null;index:idx_leave_access_request_status_requested,priority:1"`
	RequestedAt time.Time  `json:"requestedAt" gorm:"column:requested_at;type:datetime;not null;index:idx_leave_access_request_status_requested,priority:2"`
	ReviewedAt  *time.Time `json:"reviewedAt,omitempty" gorm:"column:reviewed_at;type:datetime"`
	ReviewedBy  *uint64    `json:"reviewedBy,omitempty" gorm:"column:reviewed_by;type:bigint unsigned"`
}

// LeaveProfile stores the school identity required by leave documents without
// changing the website's login or account model.
type LeaveProfile struct {
	ID              uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	UserID          uint64    `json:"-" gorm:"column:user_id;type:bigint unsigned;not null;uniqueIndex:uk_leave_profile_user"`
	Name            string    `json:"name" gorm:"size:100;not null"`
	StudentID       string    `json:"studentId" gorm:"column:student_id;size:8;not null;uniqueIndex:uk_leave_profile_student"`
	CollegeCode     string    `json:"collegeCode" gorm:"column:college_code;size:64;not null"`
	ParticipantType string    `json:"participantType" gorm:"column:participant_type;size:20;not null;default:'other'"`
	IdentityLocked  bool      `json:"identityLocked" gorm:"column:identity_locked;not null;default:false"`
	CreatedAt       time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	UpdatedAt       time.Time `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
}

type SchoolLeaveRequest struct {
	ID                uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	UserID            uint64    `json:"-" gorm:"column:user_id;type:bigint unsigned;not null;index:idx_school_leave_user_created,priority:1"`
	StartAt           time.Time `json:"startAt" gorm:"column:start_at;type:datetime;not null;index:idx_school_leave_time,priority:1"`
	EndAt             time.Time `json:"endAt" gorm:"column:end_at;type:datetime;not null;index:idx_school_leave_time,priority:2"`
	NameSnapshot      string    `json:"name" gorm:"column:name_snapshot;size:100;not null"`
	StudentIDSnapshot string    `json:"studentId" gorm:"column:student_id_snapshot;size:8;not null;index:idx_school_leave_student"`
	Status            string    `json:"status" gorm:"size:20;not null;default:'pending';index:idx_school_leave_status_created,priority:1"`
	RunID             *uint64   `json:"runId,omitempty" gorm:"column:run_id;type:bigint unsigned;index:idx_school_leave_run"`
	CreatedAt         time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP;index:idx_school_leave_user_created,priority:2"`
	UpdatedAt         time.Time `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
}

type SchoolLeaveRun struct {
	ID           uint64     `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	CollectedAt  time.Time  `json:"collectedAt" gorm:"column:collected_at;type:datetime;not null;index:idx_school_leave_runs_status_time,priority:2"`
	CreatedBy    *uint64    `json:"-" gorm:"column:created_by;type:bigint unsigned"`
	Reason       string     `json:"reason" gorm:"type:varchar(500);not null"`
	Status       string     `json:"status" gorm:"size:20;not null;default:'ready';index:idx_school_leave_runs_status_time,priority:1"`
	DownloadedAt *time.Time `json:"downloadedAt,omitempty" gorm:"column:downloaded_at;type:datetime"`
	DownloadedBy *uint64    `json:"-" gorm:"column:downloaded_by;type:bigint unsigned"`
	CreatedAt    time.Time  `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
}

type SchoolLeaveGroupResult struct {
	ID               uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	RunID            uint64    `json:"runId" gorm:"column:run_id;type:bigint unsigned;not null;uniqueIndex:uk_school_leave_result_group,priority:1"`
	GroupIndex       int       `json:"groupIndex" gorm:"column:group_index;not null;uniqueIndex:uk_school_leave_result_group,priority:2"`
	OriginalFilename string    `json:"originalFilename" gorm:"column:original_filename;size:255;not null"`
	MimeType         string    `json:"mimeType" gorm:"column:mime_type;size:100;not null"`
	SizeBytes        int64     `json:"sizeBytes" gorm:"column:size_bytes;not null"`
	Content          []byte    `json:"-" gorm:"column:content;type:longblob;not null"`
	UploadedBy       *uint64   `json:"uploadedBy,omitempty" gorm:"column:uploaded_by;type:bigint unsigned"`
	UploadedAt       time.Time `json:"uploadedAt" gorm:"column:uploaded_at;type:datetime;not null"`
	ExpiresAt        time.Time `json:"expiresAt" gorm:"column:expires_at;type:datetime;not null;index:idx_school_leave_result_expiry"`
}

type LeaveAdminRead struct {
	ID         uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	RecordType string    `json:"recordType" gorm:"column:record_type;size:40;not null;uniqueIndex:uk_leave_admin_read,priority:1"`
	RecordID   uint64    `json:"recordId" gorm:"column:record_id;type:bigint unsigned;not null;uniqueIndex:uk_leave_admin_read,priority:2"`
	UserID     uint64    `json:"-" gorm:"column:user_id;type:bigint unsigned;not null;uniqueIndex:uk_leave_admin_read,priority:3;index:idx_leave_admin_read_user"`
	ReadAt     time.Time `json:"readAt" gorm:"column:read_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
}

type DailyLeaveWindow struct {
	ID            uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	Title         string    `json:"title" gorm:"size:100;not null"`
	StartAt       time.Time `json:"startAt" gorm:"column:start_at;type:datetime;not null"`
	EndAt         time.Time `json:"endAt" gorm:"column:end_at;type:datetime;not null"`
	OpenUntil     time.Time `json:"openUntil" gorm:"column:open_until;type:datetime;not null;index:idx_daily_leave_window_status_until,priority:2"`
	TeamOpen      bool      `json:"teamOpen" gorm:"column:team_open;not null;default:true"`
	PublicEnabled bool      `json:"publicEnabled" gorm:"column:public_enabled;not null;default:false"`
	PublicToken   *string   `json:"-" gorm:"column:public_token;size:64;uniqueIndex:uk_daily_leave_public_token"`
	Status        string    `json:"status" gorm:"size:20;not null;default:'open';index:idx_daily_leave_window_status_until,priority:1"`
	CreatedBy     uint64    `json:"-" gorm:"column:created_by;type:bigint unsigned;not null"`
	CreatedAt     time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
}

type DailyLeaveEntry struct {
	ID                      uint64     `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	WindowID                *uint64    `json:"windowId,omitempty" gorm:"column:window_id;type:bigint unsigned;uniqueIndex:uk_daily_leave_window_student,priority:1;index:idx_daily_leave_window_college,priority:1"`
	UserID                  *uint64    `json:"-" gorm:"column:user_id;type:bigint unsigned;index:idx_daily_leave_user"`
	StartAt                 *time.Time `json:"startAt,omitempty" gorm:"column:start_at;type:datetime;index:idx_daily_leave_self_range,priority:2"`
	EndAt                   *time.Time `json:"endAt,omitempty" gorm:"column:end_at;type:datetime;index:idx_daily_leave_self_range,priority:3"`
	NameSnapshot            string     `json:"name" gorm:"column:name_snapshot;size:50;not null"`
	StudentIDSnapshot       string     `json:"studentId" gorm:"column:student_id_snapshot;size:8;not null;uniqueIndex:uk_daily_leave_window_student,priority:2"`
	CollegeSnapshot         string     `json:"collegeCode" gorm:"column:college_snapshot;size:64;not null;index:idx_daily_leave_window_college,priority:2"`
	ParticipantType         string     `json:"participantType" gorm:"column:participant_type;size:20;not null;default:'other'"`
	PublicDownloadTokenHash *string    `json:"-" gorm:"column:public_download_token_hash;size:64;uniqueIndex:uk_daily_leave_download_token"`
	PublicDownloadExpiresAt *time.Time `json:"-" gorm:"column:public_download_expires_at;type:datetime"`
	SubmittedAt             time.Time  `json:"submittedAt" gorm:"column:submitted_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
}

type DailyLeaveDocumentRequest struct {
	ID           uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	EntryID      uint64    `json:"entryId" gorm:"column:entry_id;type:bigint unsigned;not null;index:idx_daily_leave_document_request,priority:1"`
	UserID       *uint64   `json:"-" gorm:"column:user_id;type:bigint unsigned"`
	RequestStage string    `json:"requestStage" gorm:"column:request_stage;size:20;not null;index:idx_daily_leave_document_request,priority:2"`
	RequestType  string    `json:"requestType" gorm:"column:request_type;size:30;not null"`
	FileVersion  string    `json:"fileVersion" gorm:"column:file_version;size:50;not null"`
	Offline      bool      `json:"offline" gorm:"not null;default:false"`
	RequestedAt  time.Time `json:"requestedAt" gorm:"column:requested_at;type:datetime;not null;default:CURRENT_TIMESTAMP;index:idx_daily_leave_document_request,priority:3"`
}

type CampLeaveEvent struct {
	ID                 uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	Title              string    `json:"title" gorm:"size:100;not null"`
	Type               string    `json:"type" gorm:"size:20;not null"`
	StartDate          time.Time `json:"startDate" gorm:"column:start_date;type:date;not null"`
	EndDate            time.Time `json:"endDate" gorm:"column:end_date;type:date;not null"`
	CollectionDeadline time.Time `json:"collectionDeadline" gorm:"column:collection_deadline;type:datetime;not null;index:idx_camp_leave_status_deadline,priority:2"`
	Status             string    `json:"status" gorm:"size:20;not null;default:'collecting';index:idx_camp_leave_status_deadline,priority:1"`
	PublicToken        string    `json:"-" gorm:"column:public_token;size:64;not null;uniqueIndex:uk_camp_leave_public_token"`
	CreatedBy          uint64    `json:"-" gorm:"column:created_by;type:bigint unsigned;not null"`
	CreatedAt          time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
}

type CampLeaveParticipant struct {
	ID                uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	EventID           uint64    `json:"eventId" gorm:"column:event_id;type:bigint unsigned;not null;uniqueIndex:uk_camp_leave_event_student,priority:1;index:idx_camp_leave_event_college,priority:1"`
	UserID            *uint64   `json:"-" gorm:"column:user_id;type:bigint unsigned;index:idx_camp_leave_user"`
	NameSnapshot      string    `json:"name" gorm:"column:name_snapshot;size:50;not null"`
	StudentIDSnapshot string    `json:"studentId" gorm:"column:student_id_snapshot;size:8;not null;uniqueIndex:uk_camp_leave_event_student,priority:2"`
	CollegeSnapshot   string    `json:"collegeCode" gorm:"column:college_snapshot;size:64;not null;index:idx_camp_leave_event_college,priority:2"`
	ParticipantType   string    `json:"participantType" gorm:"column:participant_type;size:20;not null;default:'other'"`
	SubmittedAt       time.Time `json:"submittedAt" gorm:"column:submitted_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
}
