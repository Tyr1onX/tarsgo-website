package model

import "time"

// Version is part of the identity: a changed course cannot silently inherit completion.
type RMUCLessonProgress struct {
	UserID    uint64    `gorm:"primaryKey;autoIncrement:false" json:"-"`
	CourseID  string    `gorm:"primaryKey;size:32" json:"courseId"`
	Version   uint16    `gorm:"primaryKey;autoIncrement:false" json:"version"`
	Completed bool      `gorm:"not null" json:"completed"`
	Position  uint16    `gorm:"not null" json:"position"`
	UpdatedAt time.Time `json:"updatedAt"`
}
