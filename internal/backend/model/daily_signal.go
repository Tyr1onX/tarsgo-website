package model

import (
	"database/sql/driver"
	"fmt"
	"time"
)

// DailySignalDate keeps a MySQL DATE as a calendar key instead of allowing the
// driver to turn it into a timestamp string with a timezone suffix.
type DailySignalDate string

func (date *DailySignalDate) Scan(value any) error {
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
		return fmt.Errorf("cannot scan %T into DailySignalDate", value)
	}
	parsed, err := time.Parse(time.DateOnly, raw)
	if err != nil || parsed.Format(time.DateOnly) != raw {
		return fmt.Errorf("invalid daily signal date %q", raw)
	}
	*date = DailySignalDate(raw)
	return nil
}

func (date DailySignalDate) Value() (driver.Value, error) {
	parsed, err := time.Parse(time.DateOnly, string(date))
	if err != nil || parsed.Format(time.DateOnly) != string(date) {
		return nil, fmt.Errorf("invalid daily signal date %q", date)
	}
	return string(date), nil
}

// DailySignal stores one private, voluntary signal per user and Beijing date.
// The date is stored independently from the server/database timezone.
type DailySignal struct {
	ID         uint64          `json:"-" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	UserID     uint64          `json:"-" gorm:"column:user_id;type:bigint unsigned;not null;uniqueIndex:uk_daily_signal_user_date,priority:1"`
	SignalDate DailySignalDate `json:"-" gorm:"column:signal_date;type:date;not null;uniqueIndex:uk_daily_signal_user_date,priority:2"`
	Mood       *string         `json:"-" gorm:"column:mood;type:varchar(32);default:null"`
	CreatedAt  time.Time       `json:"-" gorm:"column:created_at;not null"`
	UpdatedAt  time.Time       `json:"-" gorm:"column:updated_at;not null"`
	User       User            `json:"-" gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
}

func (DailySignal) TableName() string { return "daily_signals" }
