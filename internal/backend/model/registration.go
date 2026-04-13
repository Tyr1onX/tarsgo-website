package model

import "time"

const (
	RegistrationStatusPending   uint8 = 0
	RegistrationStatusApproved  uint8 = 1
	RegistrationStatusRejected  uint8 = 2
	RegistrationStatusCancelled uint8 = 3
)

type Registration struct {
	ID            uint64           `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	FormID        uint64           `json:"formId" gorm:"column:form_id;type:bigint unsigned;not null;uniqueIndex:uk_form_user;index:idx_form_id"`
	UserID        uint64           `json:"userId" gorm:"column:user_id;type:bigint unsigned;not null;uniqueIndex:uk_form_user;index:idx_user_id"`
	FormData      map[string]any   `json:"formData" gorm:"column:form_data;type:json;serializer:json;not null"`
	ContactName   *string          `json:"contactName,omitempty" gorm:"column:contact_name;size:100;default:null;index:idx_contact_name"`
	ContactPhone  *string          `json:"contactPhone,omitempty" gorm:"column:contact_phone;size:20;default:null;index:idx_contact_phone"`
	ContactEmail  *string          `json:"contactEmail,omitempty" gorm:"column:contact_email;size:255;default:null;index:idx_contact_email"`
	Group1ID      *uint64          `json:"group1Id,omitempty" gorm:"column:group_1;type:bigint unsigned;default:null;index:idx_group_1"`
	Group1Status  uint8            `json:"group1Status" gorm:"column:group_1_status;type:tinyint;not null;default:0;index:idx_group_1_status"`
	Group2ID      *uint64          `json:"group2Id,omitempty" gorm:"column:group_2;type:bigint unsigned;default:null;index:idx_group_2"`
	Group2Status  uint8            `json:"group2Status" gorm:"column:group_2_status;type:tinyint;not null;default:0;index:idx_group_2_status"`
	Status        uint8            `json:"status" gorm:"type:tinyint;not null;default:0;index:idx_status"`
	ReviewerID1   *uint64          `json:"reviewerId1,omitempty" gorm:"column:reviewer_id_1;type:bigint unsigned;default:null"`
	ReviewedAt1   *time.Time       `json:"reviewedAt1,omitempty" gorm:"column:reviewed_at_1;type:datetime;default:null"`
	ReviewRemark1 *string          `json:"reviewRemark1,omitempty" gorm:"column:review_remark_1;size:500;default:null"`
	ReviewerID2   *uint64          `json:"reviewerId2,omitempty" gorm:"column:reviewer_id_2;type:bigint unsigned;default:null"`
	ReviewedAt2   *time.Time       `json:"reviewedAt2,omitempty" gorm:"column:reviewed_at_2;type:datetime;default:null"`
	ReviewRemark2 *string          `json:"reviewRemark2,omitempty" gorm:"column:review_remark_2;size:500;default:null"`
	SubmittedAt   time.Time        `json:"submittedAt" gorm:"column:submitted_at;type:datetime;not null;default:CURRENT_TIMESTAMP;index:idx_submitted_at"`
	UpdatedAt     time.Time        `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
	Form          RegistrationForm `json:"form,omitempty" gorm:"foreignKey:FormID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;"`
	User          User             `json:"user,omitempty" gorm:"foreignKey:UserID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;"`
	Group1        *UserGroup       `json:"group1,omitempty" gorm:"foreignKey:Group1ID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
	Group2        *UserGroup       `json:"group2,omitempty" gorm:"foreignKey:Group2ID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
	Reviewer1     *User            `json:"reviewer1,omitempty" gorm:"foreignKey:ReviewerID1;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
	Reviewer2     *User            `json:"reviewer2,omitempty" gorm:"foreignKey:ReviewerID2;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
}
