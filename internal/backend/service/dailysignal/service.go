package dailysignal

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"tarsgo-backend/database"
	"tarsgo-backend/model"
)

const (
	MoodGood     = "状态不错"
	MoodSteady   = "稳定运行"
	MoodTired    = "有点疲惫"
	MoodHighLoad = "高负载中"
	MoodDebug    = "正在调试"
)

var beijingLocation = time.FixedZone("Asia/Shanghai", 8*60*60)

type ServiceError struct {
	Status  int
	Message string
	Err     error
}

func (e *ServiceError) Error() string {
	if e.Err != nil {
		return e.Message + ": " + e.Err.Error()
	}
	return e.Message
}

func (e *ServiceError) Unwrap() error { return e.Err }

type Service struct {
	repo Repository
	now  func() time.Time
}

type MoodEntry struct {
	Date string `json:"date"`
	Mood string `json:"mood"`
}

type Archive struct {
	Year          int         `json:"year"`
	Today         string      `json:"today"`
	Authenticated bool        `json:"authenticated"`
	SignedToday   bool        `json:"signedToday"`
	TodayMood     *string     `json:"todayMood"`
	Days          []string    `json:"days"`
	Moods         []MoodEntry `json:"moods"`
}

type SendResult struct {
	Date    string  `json:"date"`
	Mood    *string `json:"mood"`
	Created bool    `json:"created"`
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo, now: time.Now}
}

func (s *Service) Today() string { return s.now().In(beijingLocation).Format(time.DateOnly) }

func (s *Service) GetArchive(ctx context.Context, userID *uint64, year int) (*Archive, error) {
	now := s.now().In(beijingLocation)
	today := now.Format(time.DateOnly)
	currentYear := now.Year()
	if year == 0 {
		year = currentYear
	}
	if year < 2000 || year > currentYear {
		return nil, serviceError(http.StatusBadRequest, "档案年份不合法", nil)
	}
	archive := &Archive{
		Year: year, Today: today, Authenticated: userID != nil,
		Days: []string{}, Moods: []MoodEntry{},
	}
	if userID == nil || *userID == 0 {
		archive.Authenticated = false
		return archive, nil
	}

	todayRecord, err := s.repo.Find(ctx, *userID, today)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return nil, serviceError(http.StatusInternalServerError, "读取今日信号失败", err)
	}
	if err == nil {
		archive.SignedToday = true
		archive.TodayMood = cloneString(todayRecord.Mood)
	}

	startDate := fmt.Sprintf("%04d-01-01", year)
	endDate := fmt.Sprintf("%04d-12-31", year)
	records, err := s.repo.ListYear(ctx, *userID, startDate, endDate)
	if err != nil {
		return nil, serviceError(http.StatusInternalServerError, "读取信号档案失败", err)
	}
	for _, record := range records {
		archive.Days = append(archive.Days, string(record.SignalDate))
		if record.Mood != nil && *record.Mood != "" {
			archive.Moods = append(archive.Moods, MoodEntry{Date: string(record.SignalDate), Mood: *record.Mood})
		}
	}
	return archive, nil
}

func (s *Service) SendToday(ctx context.Context, userID uint64, mood *string) (*SendResult, error) {
	if userID == 0 {
		return nil, serviceError(http.StatusUnauthorized, "请先登录", nil)
	}
	if err := validateMood(mood); err != nil {
		return nil, err
	}
	date := s.Today()
	existing, err := s.repo.Find(ctx, userID, date)
	if err == nil {
		return &SendResult{Date: date, Mood: cloneString(existing.Mood), Created: false}, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return nil, serviceError(http.StatusInternalServerError, "读取今日信号失败，请稍后重试", err)
	}

	record := &model.DailySignal{UserID: userID, SignalDate: model.DailySignalDate(date), Mood: cloneString(mood)}
	if err := s.repo.Create(ctx, record); err != nil {
		if database.IsDuplicateKeyError(err) {
			existing, readErr := s.repo.Find(ctx, userID, date)
			if readErr == nil {
				return &SendResult{Date: date, Mood: cloneString(existing.Mood), Created: false}, nil
			}
			err = errors.Join(err, readErr)
		}
		return nil, serviceError(http.StatusInternalServerError, "信号未能送达，请稍后重试", err)
	}
	return &SendResult{Date: date, Mood: cloneString(record.Mood), Created: true}, nil
}

func (s *Service) SetTodayMood(ctx context.Context, userID uint64, mood *string) (*SendResult, error) {
	if userID == 0 {
		return nil, serviceError(http.StatusUnauthorized, "请先登录", nil)
	}
	if err := validateMood(mood); err != nil {
		return nil, err
	}
	date := s.Today()
	if _, err := s.repo.Find(ctx, userID, date); errors.Is(err, ErrNotFound) {
		return nil, serviceError(http.StatusNotFound, "今天还没有发送信号", nil)
	} else if err != nil {
		return nil, serviceError(http.StatusInternalServerError, "读取今日信号失败", err)
	}
	if err := s.repo.SetMood(ctx, userID, date, cloneString(mood)); err != nil {
		return nil, serviceError(http.StatusInternalServerError, "今日状态暂时无法保存，请稍后重试", err)
	}
	updated, err := s.repo.Find(ctx, userID, date)
	if err != nil {
		return nil, serviceError(http.StatusInternalServerError, "读取今日信号失败", err)
	}
	return &SendResult{Date: date, Mood: cloneString(updated.Mood), Created: false}, nil
}

func validateMood(mood *string) error {
	if mood == nil {
		return nil
	}
	switch *mood {
	case MoodGood, MoodSteady, MoodTired, MoodHighLoad, MoodDebug:
		return nil
	default:
		return serviceError(http.StatusBadRequest, "请选择有效的今日状态", nil)
	}
}

func serviceError(status int, message string, err error) *ServiceError {
	return &ServiceError{Status: status, Message: message, Err: err}
}

func cloneString(value *string) *string {
	if value == nil {
		return nil
	}
	copyValue := *value
	return &copyValue
}
