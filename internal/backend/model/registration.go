package model

import "time"

const (
	RegistrationStatusPending   uint8 = 0
	RegistrationStatusApproved  uint8 = 1
	RegistrationStatusRejected  uint8 = 2
	RegistrationStatusCancelled uint8 = 3
)

type Registration struct {
	ID           uint64           `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	FormID       uint64           `json:"formId" gorm:"column:form_id;type:bigint unsigned;not null;uniqueIndex:uk_form_user;index:idx_form_id"`
	UserID       uint64           `json:"userId" gorm:"column:user_id;type:bigint unsigned;not null;uniqueIndex:uk_form_user;index:idx_user_id"`
	FormData     map[string]any   `json:"formData" gorm:"column:form_data;type:json;serializer:json;not null"`
	ContactName  *string          `json:"contactName,omitempty" gorm:"column:contact_name;size:100;default:null;index:idx_contact_name"`
	ContactPhone *string          `json:"contactPhone,omitempty" gorm:"column:contact_phone;size:20;default:null;index:idx_contact_phone"`
	ContactEmail *string          `json:"contactEmail,omitempty" gorm:"column:contact_email;size:255;default:null;index:idx_contact_email"`
	Status       uint8            `json:"status" gorm:"type:tinyint;not null;default:0;index:idx_status"`
	ReviewerID   *uint64          `json:"reviewerId,omitempty" gorm:"column:reviewer_id;type:bigint unsigned;default:null"`
	ReviewedAt   *time.Time       `json:"reviewedAt,omitempty" gorm:"column:reviewed_at;type:datetime;default:null"`
	ReviewRemark *string          `json:"reviewRemark,omitempty" gorm:"column:review_remark;size:500;default:null"`
	SubmittedAt  time.Time        `json:"submittedAt" gorm:"column:submitted_at;type:datetime;not null;default:CURRENT_TIMESTAMP;index:idx_submitted_at"`
	UpdatedAt    time.Time        `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
	Form         RegistrationForm `json:"form,omitempty" gorm:"foreignKey:FormID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;"`
	User         User             `json:"user,omitempty" gorm:"foreignKey:UserID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;"`
	Reviewer     *User            `json:"reviewer,omitempty" gorm:"foreignKey:ReviewerID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
}
