package model

import "time"

const (
	RegistrationStatusPending   uint8 = 0
	RegistrationStatusApproved  uint8 = 1
	RegistrationStatusRejected  uint8 = 2
	RegistrationStatusCancelled uint8 = 3
)

const (
	RegistrationFinalStatusPending  uint8 = 0
	RegistrationFinalStatusAdmitted uint8 = 1
	RegistrationFinalStatusRejected uint8 = 2
	RegistrationInterviewPending    uint8 = 0
	RegistrationInterviewPassed     uint8 = 1
	RegistrationInterviewFailed     uint8 = 2
)

// Canonical recruitment workflow states. Legacy group_1/group_2 review fields,
// final_status, and registration_interviews remain in the schema only to
// preserve historical records and are not the source of truth for new flows.
const (
	RecruitmentStatusPendingScreening = "pending_screening"
	RecruitmentStatusPendingInterview = "pending_interview"
	RecruitmentStatusAdmitted         = "admitted"
	RecruitmentStatusRejected         = "rejected"
	RecruitmentStatusWithdrawn        = "withdrawn"

	RecruitmentRejectedStageScreening = "screening"
	RecruitmentRejectedStageInterview = "interview"
)

type Registration struct {
	ID                uint64         `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	FormID            uint64         `json:"formId" gorm:"column:form_id;type:bigint unsigned;not null;uniqueIndex:uk_form_user;index:idx_form_id"`
	UserID            uint64         `json:"userId" gorm:"column:user_id;type:bigint unsigned;not null;uniqueIndex:uk_form_user;index:idx_user_id"`
	FormData          map[string]any `json:"formData" gorm:"column:form_data;type:json;serializer:json;not null"`
	ContactName       *string        `json:"contactName,omitempty" gorm:"column:contact_name;size:100;default:null;index:idx_contact_name"`
	ContactPhone      *string        `json:"contactPhone,omitempty" gorm:"column:contact_phone;size:20;default:null;index:idx_contact_phone"`
	ContactEmail      *string        `json:"contactEmail,omitempty" gorm:"column:contact_email;size:255;default:null;index:idx_contact_email"`
	PreferredGroupID  *uint64        `json:"preferredGroupId,omitempty" gorm:"column:preferred_group_id;type:bigint unsigned;default:null;index:idx_preferred_group_id"`
	RecruitmentStatus string         `json:"recruitmentStatus" gorm:"column:recruitment_status;size:32;not null;default:'pending_screening';index:idx_recruitment_status"`
	RejectedStage     *string        `json:"rejectedStage,omitempty" gorm:"column:rejected_stage;size:16;default:null"`
	ScreenedBy        *uint64        `json:"screenedBy,omitempty" gorm:"column:screened_by;type:bigint unsigned;default:null"`
	ScreenedAt        *time.Time     `json:"screenedAt,omitempty" gorm:"column:screened_at;type:datetime;default:null"`
	ScreeningRemark   *string        `json:"screeningRemark,omitempty" gorm:"column:screening_remark;size:500;default:null"`
	InterviewerID     *uint64        `json:"interviewerId,omitempty" gorm:"column:interviewer_id;type:bigint unsigned;default:null"`
	InterviewedAt     *time.Time     `json:"interviewedAt,omitempty" gorm:"column:interviewed_at;type:datetime(3);default:null"`
	InterviewRemark   *string        `json:"interviewRemark,omitempty" gorm:"column:interview_remark;size:500;default:null"`

	// Legacy dual-intent workflow fields. Keep for historical/archive
	// compatibility; new recruitment business logic must not depend on them.
	Group1ID       *uint64                 `json:"group1Id,omitempty" gorm:"column:group_1;type:bigint unsigned;default:null;index:idx_group_1"`
	Group1Status   uint8                   `json:"group1Status" gorm:"column:group_1_status;type:tinyint;not null;default:0;index:idx_group_1_status"`
	Group2ID       *uint64                 `json:"group2Id,omitempty" gorm:"column:group_2;type:bigint unsigned;default:null;index:idx_group_2"`
	Group2Status   uint8                   `json:"group2Status" gorm:"column:group_2_status;type:tinyint;not null;default:0;index:idx_group_2_status"`
	Status         uint8                   `json:"status" gorm:"type:tinyint;not null;default:0;index:idx_status"`
	ReviewerID1    *uint64                 `json:"reviewerId1,omitempty" gorm:"column:reviewer_id_1;type:bigint unsigned;default:null"`
	ReviewedAt1    *time.Time              `json:"reviewedAt1,omitempty" gorm:"column:reviewed_at_1;type:datetime;default:null"`
	ReviewRemark1  *string                 `json:"reviewRemark1,omitempty" gorm:"column:review_remark_1;size:500;default:null"`
	ReviewerID2    *uint64                 `json:"reviewerId2,omitempty" gorm:"column:reviewer_id_2;type:bigint unsigned;default:null"`
	ReviewedAt2    *time.Time              `json:"reviewedAt2,omitempty" gorm:"column:reviewed_at_2;type:datetime;default:null"`
	ReviewRemark2  *string                 `json:"reviewRemark2,omitempty" gorm:"column:review_remark_2;size:500;default:null"`
	FinalGroupID   *uint64                 `json:"finalGroupId,omitempty" gorm:"column:final_group_id;type:bigint unsigned;default:null;index:idx_final_group_id"`
	FinalStatus    uint8                   `json:"finalStatus" gorm:"column:final_status;type:tinyint;not null;default:0;index:idx_final_status"`
	FinalizedAt    *time.Time              `json:"finalizedAt,omitempty" gorm:"column:finalized_at;type:datetime;default:null"`
	FinalizedBy    *uint64                 `json:"finalizedBy,omitempty" gorm:"column:finalized_by;type:bigint unsigned;default:null"`
	SubmittedAt    time.Time               `json:"submittedAt" gorm:"column:submitted_at;type:datetime;not null;default:CURRENT_TIMESTAMP;index:idx_submitted_at"`
	UpdatedAt      time.Time               `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
	Form           RegistrationForm        `json:"form,omitempty" gorm:"foreignKey:FormID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;"`
	User           User                    `json:"user,omitempty" gorm:"foreignKey:UserID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;"`
	PreferredGroup *UserGroup              `json:"preferredGroup,omitempty" gorm:"foreignKey:PreferredGroupID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
	Screener       *User                   `json:"screener,omitempty" gorm:"foreignKey:ScreenedBy;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
	Interviewer    *User                   `json:"interviewer,omitempty" gorm:"foreignKey:InterviewerID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
	Group1         *UserGroup              `json:"group1,omitempty" gorm:"foreignKey:Group1ID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
	Group2         *UserGroup              `json:"group2,omitempty" gorm:"foreignKey:Group2ID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
	Reviewer1      *User                   `json:"reviewer1,omitempty" gorm:"foreignKey:ReviewerID1;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
	Reviewer2      *User                   `json:"reviewer2,omitempty" gorm:"foreignKey:ReviewerID2;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
	FinalGroup     *UserGroup              `json:"finalGroup,omitempty" gorm:"foreignKey:FinalGroupID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
	Finalizer      *User                   `json:"finalizer,omitempty" gorm:"foreignKey:FinalizedBy;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
	Interviews     []RegistrationInterview `json:"interviews,omitempty" gorm:"foreignKey:RegistrationID;references:ID;constraint:OnDelete:CASCADE;"`
}

type RegistrationInterview struct {
	ID             uint64       `json:"id" gorm:"primaryKey;autoIncrement"`
	RegistrationID uint64       `json:"registrationId" gorm:"column:registration_id;not null;uniqueIndex:uk_registration_interview;index"`
	GroupID        uint64       `json:"groupId" gorm:"column:group_id;not null;uniqueIndex:uk_registration_interview;index"`
	Status         uint8        `json:"status" gorm:"not null;default:0"`
	Remark         *string      `json:"remark,omitempty" gorm:"size:500;default:null"`
	InterviewerID  *uint64      `json:"interviewerId,omitempty" gorm:"column:interviewer_id;default:null"`
	InterviewedAt  *time.Time   `json:"interviewedAt,omitempty" gorm:"column:interviewed_at;default:null"`
	Registration   Registration `json:"-" gorm:"foreignKey:RegistrationID;references:ID"`
	Group          *UserGroup   `json:"group,omitempty" gorm:"foreignKey:GroupID;references:ID"`
	Interviewer    *User        `json:"interviewer,omitempty" gorm:"foreignKey:InterviewerID;references:ID"`
}
