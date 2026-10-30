package timetable

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

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

const lifecycleLockName = "tarsgo_personal_timetables_lifecycle"

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
	if err := s.db.WithContext(ctx).Where("user_id = ? AND semester = ?", userID, CurrentSemester).Order("updated_at DESC").Find(&rows).Error; err != nil {
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

func (s *Service) Import(ctx context.Context, userID uint64, filename string, contents []byte) (*Semester, error) {
	if userID == 0 {
		return nil, &Error{Status: 401, Message: "请先登录"}
	}
	if !strings.HasSuffix(strings.ToLower(filename), ".xlsx") || len(contents) == 0 || len(contents) > 5<<20 {
		return nil, &Error{Status: 400, Message: "请选择不超过5 MB的 .xlsx 课表"}
	}
	courses, notes, err := ParseXLSX(contents)
	if err != nil {
		return nil, &Error{Status: 400, Message: err.Error()}
	}
	if detected := DetectSemester(contents); detected != "" {
		if detected != CurrentSemester {
			return nil, &Error{Status: 400, Message: "Excel 学期与当前学期配置不一致，旧课表未更改"}
		}
	}
	coursesJSON, _ := json.Marshal(courses)
	notesJSON, _ := json.Marshal(notes)
	now := time.Now().UTC()
	record := model.Timetable{UserID: userID, Semester: CurrentSemester, CoursesJSON: string(coursesJSON), NotesJSON: string(notesJSON), UpdatedAt: now}
	if err := s.withLifecycleLock(ctx, func(tx *gorm.DB) error {
		return tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "user_id"}, {Name: "semester"}},
			DoUpdates: clause.AssignmentColumns([]string{"courses_json", "notes_json", "updated_at"}),
		}).Create(&record).Error
	}); err != nil {
		return nil, &Error{Status: 500, Message: "保存课表失败，旧数据未修改", Err: err}
	}
	return &Semester{Semester: CurrentSemester, Courses: courses, Notes: notes, MaxWeek: maxWeek(courses), UpdatedAt: now}, nil
}

type ClearResult struct {
	DeletedCount int `json:"deletedCount"`
}

func (s *Service) CountAll(ctx context.Context, userID uint64, role string) (int64, error) {
	if userID == 0 {
		return 0, &Error{Status: http.StatusUnauthorized, Message: "请先登录"}
	}
	if role != model.RoleNameSuperAdmin {
		return 0, &Error{Status: http.StatusForbidden, Message: "仅超级管理员可清空课表"}
	}
	var count int64
	if err := s.db.WithContext(ctx).Model(&model.Timetable{}).Count(&count).Error; err != nil {
		return 0, &Error{Status: http.StatusInternalServerError, Message: "读取课表数量失败", Err: err}
	}
	return count, nil
}

func (s *Service) ClearAll(ctx context.Context, userID uint64, role string, expectedCount int64) (*ClearResult, error) {
	if userID == 0 {
		return nil, &Error{Status: http.StatusUnauthorized, Message: "请先登录"}
	}
	if role != model.RoleNameSuperAdmin {
		return nil, &Error{Status: http.StatusForbidden, Message: "仅超级管理员可清空课表"}
	}
	if expectedCount < 0 {
		return nil, &Error{Status: http.StatusBadRequest, Message: "课表数量无效"}
	}
	result := &ClearResult{}
	err := s.withLifecycleLock(ctx, func(tx *gorm.DB) error {
		var currentCount int64
		if err := tx.Model(&model.Timetable{}).Count(&currentCount).Error; err != nil {
			return err
		}
		if currentCount != expectedCount {
			return &Error{Status: http.StatusConflict, Message: "课表数量已变化，请重新确认"}
		}
		deleted := currentCount
		if deleted > 0 {
			deleteResult := tx.Exec("DELETE FROM `personal_timetables`")
			if deleteResult.Error != nil {
				return deleteResult.Error
			}
			if deleteResult.RowsAffected != deleted {
				return fmt.Errorf("deleted timetable count changed during cleanup")
			}
		}
		metadata, err := json.Marshal(struct {
			DeletedCount int64 `json:"deletedCount"`
		}{DeletedCount: deleted})
		if err != nil {
			return err
		}
		actorID := userID
		if err := tx.Create(&model.AuditLog{
			ActorID:   &actorID,
			Action:    "personal_timetables_cleared",
			Method:    http.MethodPost,
			Path:      "/api/admin/timetable-availability/cleanup",
			Status:    http.StatusOK,
			Metadata:  string(metadata),
			CreatedAt: time.Now().UTC(),
		}).Error; err != nil {
			return err
		}
		result.DeletedCount = int(deleted)
		return nil
	})
	if err != nil {
		var serviceErr *Error
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, &Error{Status: http.StatusInternalServerError, Message: "清空课表失败，数据未更改", Err: err}
	}
	return result, nil
}

func (s *Service) withLifecycleLock(ctx context.Context, fn func(*gorm.DB) error) error {
	return s.db.WithContext(ctx).Connection(func(conn *gorm.DB) error {
		var acquired int
		if err := conn.Raw("SELECT GET_LOCK(?, 30)", lifecycleLockName).Scan(&acquired).Error; err != nil {
			return err
		}
		if acquired != 1 {
			return fmt.Errorf("could not acquire timetable lifecycle lock")
		}
		defer func() {
			var released int
			_ = conn.Session(&gorm.Session{NewDB: true}).WithContext(context.Background()).
				Raw("SELECT RELEASE_LOCK(?)", lifecycleLockName).Scan(&released).Error
		}()
		return conn.Transaction(fn)
	})
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
