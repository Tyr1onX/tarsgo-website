package timetable

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"tarsgo-backend/model"
)

type Course struct {
	Code         string `json:"code,omitempty"`
	Name         string `json:"name"`
	Weekday      int    `json:"weekday"`
	StartSection int    `json:"startSection"`
	EndSection   int    `json:"endSection"`
	Weeks        []int  `json:"weeks"`
	Parity       string `json:"parity"`
	Location     string `json:"location,omitempty"`
}
type Note struct {
	Name   string `json:"name"`
	Reason string `json:"reason"`
}
type Semester struct {
	Semester  string    `json:"semester"`
	Courses   []Course  `json:"courses"`
	Notes     []Note    `json:"notes"`
	MaxWeek   int       `json:"maxWeek"`
	UpdatedAt time.Time `json:"updatedAt"`
}
type Service struct{ db *gorm.DB }

func NewService(db *gorm.DB) *Service { return &Service{db: db} }

type Error struct {
	Status  int
	Message string
	Err     error
}

func (e *Error) Error() string { return e.Message }
func (e *Error) Unwrap() error { return e.Err }

func (s *Service) List(ctx context.Context, userID uint64) ([]Semester, error) {
	if userID == 0 {
		return nil, &Error{Status: http.StatusUnauthorized, Message: "请先登录"}
	}
	var rows []model.Timetable
	if err := s.db.WithContext(ctx).Where("user_id = ?", userID).Order("updated_at DESC").Find(&rows).Error; err != nil {
		return nil, &Error{Status: 500, Message: "读取个人课表失败", Err: err}
	}
	result := make([]Semester, 0, len(rows))
	for _, row := range rows {
		var courses []Course
		var notes []Note
		if err := json.Unmarshal([]byte(row.CoursesJSON), &courses); err != nil {
			return nil, &Error{Status: 500, Message: "课表数据格式错误", Err: err}
		}
		if err := json.Unmarshal([]byte(row.NotesJSON), &notes); err != nil {
			return nil, &Error{Status: 500, Message: "课表数据格式错误", Err: err}
		}
		result = append(result, Semester{Semester: row.Semester, Courses: courses, Notes: notes, MaxWeek: maxWeek(courses), UpdatedAt: row.UpdatedAt})
	}
	return result, nil
}

func (s *Service) Import(ctx context.Context, userID uint64, semester, filename string, contents []byte) (*Semester, error) {
	if userID == 0 {
		return nil, &Error{Status: 401, Message: "请先登录"}
	}
	semester = strings.TrimSpace(semester)
	if !utf8.ValidString(semester) || utf8.RuneCountInString(semester) > 40 || strings.ContainsAny(semester, "\r\n\t") {
		return nil, &Error{Status: 400, Message: "请输入有效学期名称（不超过40字）"}
	}
	if !strings.HasSuffix(strings.ToLower(filename), ".xlsx") || len(contents) == 0 || len(contents) > 5<<20 {
		return nil, &Error{Status: 400, Message: "请选择不超过5 MB的 .xlsx 课表"}
	}
	courses, notes, err := ParseXLSX(contents)
	if err != nil {
		return nil, &Error{Status: 400, Message: err.Error()}
	}
	if detected := DetectSemester(contents); detected != "" {
		if semester != "" && semester != detected {
			return nil, &Error{Status: 400, Message: "填写的学期与 Excel 中的学期不一致，旧课表未更改"}
		}
		semester = detected
	}
	if semester == "" {
		return nil, &Error{Status: 400, Message: "无法从 Excel 识别学期，请手动填写学期名称"}
	}
	coursesJSON, _ := json.Marshal(courses)
	notesJSON, _ := json.Marshal(notes)
	now := time.Now().UTC()
	record := model.Timetable{UserID: userID, Semester: semester, CoursesJSON: string(coursesJSON), NotesJSON: string(notesJSON), UpdatedAt: now}
	if err := s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}, {Name: "semester"}},
		DoUpdates: clause.AssignmentColumns([]string{"courses_json", "notes_json", "updated_at"}),
	}).Create(&record).Error; err != nil {
		return nil, &Error{Status: 500, Message: "保存课表失败，旧数据未修改", Err: err}
	}
	return &Semester{Semester: semester, Courses: courses, Notes: notes, MaxWeek: maxWeek(courses), UpdatedAt: now}, nil
}
func maxWeek(courses []Course) int {
	max := 0
	for _, c := range courses {
		for _, w := range c.Weeks {
			if w > max {
				max = w
			}
		}
	}
	return max
}
func (c Course) Active(week int) bool {
	if week < 1 {
		return false
	}
	for _, w := range c.Weeks {
		if w != week {
			continue
		}
		switch c.Parity {
		case "odd":
			return week%2 == 1
		case "even":
			return week%2 == 0
		default:
			return true
		}
	}
	return false
}
