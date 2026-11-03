package aisalon

import (
	"context"
	"errors"
	"net/url"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"tarsgo-backend/model"
	"tarsgo-backend/service/leave"
)

const Registered = "registered"
const Waitlisted = "waitlisted"
const Cancelled = "cancelled"

type Error struct {
	Status  int
	Message string
}

func (e *Error) Error() string              { return e.Message }
func fail(status int, message string) error { return &Error{status, message} }

type Service struct {
	db  *gorm.DB
	now func() time.Time
}

func NewService(db *gorm.DB) *Service { return &Service{db, time.Now} }

type PublicEvent struct {
	ID               uint64    `json:"id"`
	Title            string    `json:"title"`
	Summary          string    `json:"summary"`
	PosterURL        string    `json:"posterUrl"`
	StartAt          time.Time `json:"startAt"`
	EndAt            time.Time `json:"endAt"`
	Location         string    `json:"location"`
	Deadline         time.Time `json:"deadline"`
	RegistrationOpen bool      `json:"registrationOpen"`
	ServerNow        time.Time `json:"serverNow"`
}

func public(e model.AISalonEvent, now time.Time) PublicEvent {
	return PublicEvent{e.ID, e.Title, e.Summary, e.PosterURL, e.StartAt, e.EndAt, e.Location, e.Deadline, open(e, now), now}
}
func open(e model.AISalonEvent, now time.Time) bool {
	return e.Published && !e.RegistrationClosed && now.Before(e.Deadline)
}
func (s *Service) List(ctx context.Context) ([]PublicEvent, error) {
	rows := []model.AISalonEvent{}
	if err := s.db.WithContext(ctx).Where("published = ?", true).Order("start_at ASC, id ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make([]PublicEvent, 0, len(rows))
	now := s.now().UTC()
	for _, e := range rows {
		result = append(result, public(e, now))
	}
	return result, nil
}
func (s *Service) Get(ctx context.Context, id uint64) (*PublicEvent, error) {
	var e model.AISalonEvent
	if err := s.db.WithContext(ctx).Where("id = ? AND published = ?", id, true).Take(&e).Error; err != nil {
		return nil, err
	}
	result := public(e, s.now().UTC())
	return &result, nil
}
func validateProfile(p model.AcademicInfo) (model.AcademicInfo, error) {
	fields := []*string{&p.RealName, &p.College, &p.Grade, &p.StudentID, &p.Campus}
	limits := []int{100, 100, 40, 40, 40}
	for i, f := range fields {
		*f = strings.TrimSpace(*f)
		if *f == "" || utf8.RuneCountInString(*f) > limits[i] || strings.IndexFunc(*f, unicode.IsControl) >= 0 {
			return p, fail(400, "请完整填写真实姓名、学院、年级、学号和校区")
		}
	}
	// Normalize the identifier before both validation and uniqueness checks.
	p.StudentID = strings.ToUpper(p.StudentID)
	for _, r := range p.StudentID {
		if !(r >= '0' && r <= '9' || r >= 'A' && r <= 'Z') {
			return p, fail(400, "学号仅支持字母和数字")
		}
	}
	if p.Gender != 1 && p.Gender != 2 {
		return p, fail(400, "请选择性别")
	}
	return p, nil
}
func (s *Service) Profile(ctx context.Context, userID uint64) (model.AcademicInfo, error) {
	var u model.User
	if err := s.db.WithContext(ctx).First(&u, userID).Error; err != nil {
		return model.AcademicInfo{}, err
	}
	p := model.AcademicInfo{College: u.College, Grade: u.Grade, StudentID: u.StudentID, Campus: u.Campus, Gender: u.Gender}
	if u.RealName != nil {
		p.RealName = *u.RealName
	}
	// Reuse existing academic information without granting any internal access or
	// overwriting identity-locked leave documents.
	var old model.LeaveProfile
	err := s.db.WithContext(ctx).Where("user_id = ?", userID).Take(&old).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return p, err
	}
	if err == nil {
		if p.RealName == "" {
			p.RealName = old.Name
		}
		if p.StudentID == "" {
			p.StudentID = old.StudentID
		}
		if p.College == "" {
			p.College = old.CollegeCode
			for _, c := range leave.NewService(s.db).Colleges() {
				if c.Code == old.CollegeCode {
					p.College = c.Name
					break
				}
			}
		}
	}
	return p, nil
}
func saveProfile(tx *gorm.DB, userID uint64, p model.AcademicInfo) error {
	return tx.Model(&model.User{}).Where("id = ?", userID).Updates(map[string]any{"real_name": p.RealName, "college": p.College, "grade": p.Grade, "student_id": p.StudentID, "campus": p.Campus, "gender": p.Gender}).Error
}
func (s *Service) SaveProfile(ctx context.Context, userID uint64, p model.AcademicInfo) (model.AcademicInfo, error) {
	p, err := validateProfile(p)
	if err != nil {
		return p, err
	}
	err = saveProfile(s.db.WithContext(ctx), userID, p)
	return p, err
}
func lockedEvent(tx *gorm.DB, id uint64) (model.AISalonEvent, error) {
	var e model.AISalonEvent
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&e, id).Error
	return e, err
}

// All roster mutations take the same event row lock first. Current reads under
// InnoDB's default REPEATABLE READ see the latest committed roster after waiting.
func activeRows(tx *gorm.DB, eventID uint64) ([]model.AISalonRegistration, error) {
	rows := []model.AISalonRegistration{}
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("event_id = ? AND status IN ?", eventID, []string{Registered, Waitlisted}).Order("submitted_at ASC, id ASC").Find(&rows).Error
	return rows, err
}
func promote(tx *gorm.DB, e model.AISalonEvent) error {
	rows, err := activeRows(tx, e.ID)
	if err != nil {
		return err
	}
	count := 0
	for _, r := range rows {
		if r.Status == Registered {
			count++
		}
	}
	for _, r := range rows {
		if count >= e.Capacity {
			break
		}
		if r.Status == Waitlisted {
			if err := tx.Model(&r).Update("status", Registered).Error; err != nil {
				return err
			}
			count++
		}
	}
	return nil
}
func (s *Service) Register(ctx context.Context, eventID, userID uint64, p model.AcademicInfo) (*model.AISalonRegistration, error) {
	p, err := validateProfile(p)
	if err != nil {
		return nil, err
	}
	var result model.AISalonRegistration
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		e, err := lockedEvent(tx, eventID)
		if err != nil {
			return err
		}
		now := s.now().UTC()
		if !open(e, now) {
			return fail(409, "报名已关闭")
		}
		rows, err := activeRows(tx, eventID)
		if err != nil {
			return err
		}
		count := 0
		for _, r := range rows {
			if r.UserID == userID {
				return fail(409, "你已提交报名")
			}
			if r.StudentID == p.StudentID {
				return fail(409, "该学号已报名本场活动")
			}
			if r.Status == Registered {
				count++
			}
		}
		var u model.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&u, userID).Error; err != nil {
			return err
		}
		if u.Status != model.UserStatusEnabled {
			return fail(403, "账号已停用")
		}
		status := Registered
		if count >= e.Capacity {
			status = Waitlisted
		}
		// Each new attempt appends to the queue and retains cancelled snapshots.
		result = model.AISalonRegistration{EventID: eventID, UserID: userID, ActiveUserID: &userID, AcademicInfo: p, Email: u.Email, ActiveStudentID: &p.StudentID, Status: status, SubmittedAt: now}
		if err := tx.Omit("Event").Create(&result).Error; err != nil {
			return err
		}
		return saveProfile(tx, userID, p)
	})
	return &result, err
}
func (s *Service) Cancel(ctx context.Context, eventID, userID uint64) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		e, err := lockedEvent(tx, eventID)
		if err != nil {
			return err
		}
		if !e.Published || !s.now().UTC().Before(e.Deadline) {
			return fail(409, "报名已截止，无法取消")
		}
		result := tx.Model(&model.AISalonRegistration{}).Where("event_id = ? AND user_id = ? AND status IN ?", eventID, userID, []string{Registered, Waitlisted}).Updates(map[string]any{"status": Cancelled, "active_student_id": nil, "active_user_id": nil})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return fail(409, "没有有效报名")
		}
		return promote(tx, e)
	})
}
func (s *Service) CheckIn(ctx context.Context, eventID, userID uint64) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		e, err := lockedEvent(tx, eventID)
		if err != nil {
			return err
		}
		now := s.now().UTC()
		if !e.Published || now.Before(e.StartAt) || !now.Before(e.EndAt) {
			return fail(409, "当前不在签到时间内")
		}
		result := tx.Model(&model.AISalonRegistration{}).Where("event_id = ? AND user_id = ? AND status = ? AND checked_in_at IS NULL", eventID, userID, Registered).Update("checked_in_at", now)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return fail(409, "仅已报名且未签到的用户可以签到")
		}
		return nil
	})
}

type PersonalRecord struct {
	model.AISalonRegistration
	Title   string    `json:"title"`
	StartAt time.Time `json:"startAt"`
}

func (s *Service) Mine(ctx context.Context, userID uint64) ([]PersonalRecord, error) {
	rows := []PersonalRecord{}
	err := s.db.WithContext(ctx).Table("ai_salon_registrations AS r").Select("r.*, e.title, e.start_at").Joins("JOIN ai_salon_events AS e ON e.id = r.event_id").Where("r.user_id = ?", userID).Order("r.submitted_at DESC, r.id DESC").Scan(&rows).Error
	return rows, err
}
func validateEvent(e *model.AISalonEvent) error {
	e.Title = strings.TrimSpace(e.Title)
	e.Summary = strings.TrimSpace(e.Summary)
	e.Location = strings.TrimSpace(e.Location)
	e.PosterURL = strings.TrimSpace(e.PosterURL)
	if e.Title == "" || utf8.RuneCountInString(e.Title) > 200 || e.Summary == "" || utf8.RuneCountInString(e.Summary) > 10000 || e.Location == "" || utf8.RuneCountInString(e.Location) > 300 || e.Capacity < 1 || e.Capacity > 100000 {
		return fail(400, "请填写标题、简介、地点及有效人数上限（1—100000）")
	}
	if e.StartAt.IsZero() || e.EndAt.IsZero() || e.Deadline.IsZero() || !e.EndAt.After(e.StartAt) || e.Deadline.After(e.StartAt) {
		return fail(400, "结束时间须晚于开始时间，报名截止时间不能晚于开始时间")
	}
	if e.PosterURL != "" {
		u, err := url.Parse(e.PosterURL)
		if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || len(e.PosterURL) > 1000 {
			return fail(400, "海报须为有效的 HTTPS 图片地址")
		}
	}
	return nil
}
func (s *Service) SaveEvent(ctx context.Context, id uint64, e model.AISalonEvent) (*model.AISalonEvent, error) {
	if err := validateEvent(&e); err != nil {
		return nil, err
	}
	e.ID = id
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if id == 0 {
			return tx.Create(&e).Error
		}
		old, err := lockedEvent(tx, id)
		if err != nil {
			return err
		}
		rows, err := activeRows(tx, id)
		if err != nil {
			return err
		}
		count := 0
		for _, r := range rows {
			if r.Status == Registered {
				count++
			}
		}
		if e.Capacity < count {
			return fail(409, "人数上限不能少于已报名人数")
		}
		e.CreatedAt = old.CreatedAt
		if err := tx.Save(&e).Error; err != nil {
			return err
		}
		return promote(tx, e)
	})
	return &e, err
}
func (s *Service) Delete(ctx context.Context, id uint64) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if _, err := lockedEvent(tx, id); err != nil {
			return err
		}
		if err := tx.Where("event_id = ?", id).Delete(&model.AISalonRegistration{}).Error; err != nil {
			return err
		}
		return tx.Delete(&model.AISalonEvent{}, id).Error
	})
}
func (s *Service) AdminList(ctx context.Context) ([]model.AISalonEvent, error) {
	rows := []model.AISalonEvent{}
	err := s.db.WithContext(ctx).Order("start_at DESC, id DESC").Find(&rows).Error
	return rows, err
}

type Roster struct {
	Items      []model.AISalonRegistration `json:"items"`
	Registered int                         `json:"registered"`
	Waitlisted int                         `json:"waitlisted"`
	CheckedIn  int                         `json:"checkedIn"`
}

func (s *Service) Roster(ctx context.Context, id uint64) (Roster, error) {
	result := Roster{Items: []model.AISalonRegistration{}}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if _, err := lockedEvent(tx, id); err != nil {
			return err
		}
		if err := tx.Where("event_id = ?", id).Order("submitted_at ASC, id ASC").Find(&result.Items).Error; err != nil {
			return err
		}
		for _, r := range result.Items {
			if r.Status == Registered {
				result.Registered++
			}
			if r.Status == Waitlisted {
				result.Waitlisted++
			}
			if r.CheckedInAt != nil {
				result.CheckedIn++
			}
		}
		return nil
	})
	return result, err
}
