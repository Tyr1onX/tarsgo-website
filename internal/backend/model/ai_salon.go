package model

import "time"

// AcademicInfo is stored on the account and copied into each registration.
type AcademicInfo struct {
	RealName  string `json:"realName" gorm:"size:100;not null;default:''"`
	College   string `json:"college" gorm:"size:100;not null;default:''"`
	Grade     string `json:"grade" gorm:"size:40;not null;default:''"`
	StudentID string `json:"studentId" gorm:"size:40;not null;default:''"`
	Campus    string `json:"campus" gorm:"size:40;not null;default:''"`
	Gender    uint8  `json:"gender" gorm:"type:tinyint unsigned;not null;default:0"`
}

type AISalonEvent struct {
	RegistrationClicks uint64    `json:"registrationClicks" gorm:"type:bigint unsigned;not null;default:0"`
	Online             bool      `json:"online" gorm:"not null;default:false"`
	MeetingURL         string    `json:"meetingUrl" gorm:"size:1000;not null;default:''"`
	ID                 uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	Title              string    `json:"title" gorm:"size:200;not null"`
	Summary            string    `json:"summary" gorm:"type:text;not null"`
	PosterURL          string    `json:"posterUrl" gorm:"size:1000;not null;default:''"`
	StartAt            time.Time `json:"startAt" gorm:"type:datetime(6);not null;index"`
	EndAt              time.Time `json:"endAt" gorm:"type:datetime(6);not null"`
	Location           string    `json:"location" gorm:"size:300;not null"`
	Deadline           time.Time `json:"deadline" gorm:"type:datetime(6);not null"`
	Capacity           int       `json:"capacity" gorm:"not null"`
	Published          bool      `json:"published" gorm:"not null;default:false"`
	RegistrationClosed bool      `json:"registrationClosed" gorm:"not null;default:false"`
	CreatedAt          time.Time `json:"createdAt" gorm:"type:datetime(6);not null"`
	UpdatedAt          time.Time `json:"updatedAt" gorm:"type:datetime(6);not null"`
}

func (AISalonEvent) TableName() string { return "ai_salon_events" }

type AISalonRegistration struct {
	ID      uint64 `json:"-" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	EventID uint64 `json:"eventId" gorm:"type:bigint unsigned;not null;uniqueIndex:uk_salon_user,priority:1;uniqueIndex:uk_salon_student,priority:1;index:idx_salon_queue,priority:1"`
	UserID  uint64 `json:"-" gorm:"type:bigint unsigned;not null;index"`
	// NULL on cancellation preserves past attempts while releasing the account slot.
	ActiveUserID *uint64 `json:"-" gorm:"type:bigint unsigned;uniqueIndex:uk_salon_user,priority:2"`
	AcademicInfo `gorm:"embedded"`
	IsStudent    *bool  `json:"isStudent" gorm:"type:tinyint(1);default:null"`
	Email        string `json:"email" gorm:"size:255;not null"`
	// NULL on cancellation releases the student number without losing the snapshot.
	ActiveStudentID *string      `json:"-" gorm:"size:40;uniqueIndex:uk_salon_student,priority:2"`
	Status          string       `json:"status" gorm:"size:20;not null;index:idx_salon_queue,priority:2"`
	SubmittedAt     time.Time    `json:"submittedAt" gorm:"type:datetime(6);not null;index:idx_salon_queue,priority:3"`
	CheckedInAt     *time.Time   `json:"checkedInAt" gorm:"type:datetime(6)"`
	Event           AISalonEvent `json:"-" gorm:"foreignKey:EventID;constraint:OnDelete:CASCADE"`
}

func (AISalonRegistration) TableName() string { return "ai_salon_registrations" }
