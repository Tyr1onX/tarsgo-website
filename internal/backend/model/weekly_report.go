package model

import (
	"database/sql/driver"
	"fmt"
	"time"
)

// WeeklyReportWeekStart stores a calendar date without converting it through
// the database or server timezone.
type WeeklyReportWeekStart string

func (date *WeeklyReportWeekStart) Scan(value any) error {
	var raw string
	switch typed := value.(type) {
	case time.Time:
		raw = typed.Format(time.DateOnly)
	case []byte:
		raw = string(typed)
	case string:
		raw = typed
	case nil:
		*date = ""
		return nil
	default:
		return fmt.Errorf("cannot scan %T into WeeklyReportWeekStart", value)
	}
	parsed, err := time.Parse(time.DateOnly, raw)
	if err != nil || parsed.Format(time.DateOnly) != raw {
		return fmt.Errorf("invalid weekly report week start %q", raw)
	}
	*date = WeeklyReportWeekStart(raw)
	return nil
}

func (date WeeklyReportWeekStart) Value() (driver.Value, error) {
	parsed, err := time.Parse(time.DateOnly, string(date))
	if err != nil || parsed.Format(time.DateOnly) != string(date) {
		return nil, fmt.Errorf("invalid weekly report week start %q", date)
	}
	return string(date), nil
}

type WeeklyReport struct {
	ID        uint64                `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	GroupID   *uint64               `json:"groupId,omitempty" gorm:"column:group_id;type:bigint unsigned;default:null;uniqueIndex:uk_weekly_report_member_week,priority:1;index:idx_weekly_report_group_week,priority:1"`
	UserID    uint64                `json:"-" gorm:"column:user_id;type:bigint unsigned;not null;uniqueIndex:uk_weekly_report_member_week,priority:2;index:idx_weekly_report_user_week,priority:1"`
	WeekStart WeeklyReportWeekStart `json:"weekStart" gorm:"column:week_start;type:date;not null;uniqueIndex:uk_weekly_report_member_week,priority:3;index:idx_weekly_report_group_week,priority:2;index:idx_weekly_report_user_week,priority:2"`
	Completed string                `json:"completed" gorm:"type:text;not null"`
	Gains     string                `json:"gains" gorm:"type:text;not null"`
	Blockers  string                `json:"blockers" gorm:"type:text;not null"`
	NextPlan  string                `json:"nextPlan" gorm:"column:next_plan;type:text;not null"`
	CreatedAt time.Time             `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP"`
	UpdatedAt time.Time             `json:"updatedAt" gorm:"column:updated_at;type:datetime;not null;default:CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"`
	User      User                  `json:"-" gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
	Group     UserGroup             `json:"-" gorm:"foreignKey:GroupID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
}

func (WeeklyReport) TableName() string { return "weekly_reports" }
