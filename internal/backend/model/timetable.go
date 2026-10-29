package model

import "time"

type Timetable struct {
	ID          uint64    `gorm:"primaryKey;autoIncrement"`
	UserID      uint64    `gorm:"not null;uniqueIndex:uk_timetable_owner_term,priority:1"`
	Semester    string    `gorm:"size:40;not null;uniqueIndex:uk_timetable_owner_term,priority:2"`
	CoursesJSON string    `gorm:"column:courses_json;type:longtext;not null"`
	NotesJSON   string    `gorm:"column:notes_json;type:longtext;not null"`
	UpdatedAt   time.Time `gorm:"not null"`
}

func (Timetable) TableName() string { return "personal_timetables" }
