package leave

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"tarsgo-backend/model"
)

const (
	SchoolLeaveReason = "吉甲大师双创基地机器人战队创新实践活动"
	DailyLeaveVersion = "daily-leave-v2"
)

var (
	shanghai, _      = time.LoadLocation("Asia/Shanghai")
	studentIDPattern = regexp.MustCompile(`^[0-9]{8}$`)
	collegeCodes     = map[string]string{
		"philosophy-sociology": "哲学社会学院", "literature-journalism": "文学院（含新闻与传播学院）", "archaeology": "考古学院", "art": "艺术学院", "physical-education": "体育学院", "foreign-languages-culture": "外国语言文化学院", "business-management": "商学与管理学院", "law": "法学院", "public-diplomacy": "公共外交学院", "marxism": "马克思主义学院", "public-administration": "行政学院", "economics": "经济学院", "chemistry": "化学学院", "life-sciences": "生命科学学院", "mathematics": "数学学院", "physics": "物理学院", "mechanical-aerospace": "机械与航空航天工程学院", "transport": "交通学院", "automotive": "汽车工程学院", "bio-agricultural-engineering": "生物与农业工程学院", "materials-science-engineering": "材料科学与工程学院", "electronic-science-engineering": "电子科学与工程学院", "integrated-circuits": "集成电路学院", "communications-engineering": "通信工程学院", "computer-science-technology": "计算机科学与技术学院", "software": "软件学院", "earth-sciences": "地球科学学院", "earth-exploration": "地球探测科学与技术学院", "construction-engineering": "建设工程学院", "new-energy-environment": "新能源与环境学院", "instrumentation-electrical": "仪器科学与电气工程学院", "public-health": "公共卫生学院", "bethune-first-clinical-medicine": "白求恩第一临床医学院", "basic-medical-sciences": "基础医学院", "bethune-stomatology": "白求恩口腔医学院", "pharmacy": "药学院", "nursing": "护理学院", "veterinary-medicine": "动物医学学院", "plant-sciences": "植物科学学院", "animal-sciences": "动物科学学院", "food-science-engineering": "食品科学与工程学院", "artificial-intelligence": "人工智能学院", "history-culture": "历史文化学院", "northeast-asia": "东北亚学院", "bionic-science-engineering": "仿生科学与工程学院",
	}
)

type Service struct {
	db  *gorm.DB
	now func() time.Time
}

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

func NewService(db *gorm.DB) *Service { return &Service{db: db, now: time.Now} }

type CollegeOption struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

type ProfileInput struct {
	Name            string `json:"name"`
	StudentID       string `json:"studentId"`
	CollegeCode     string `json:"collegeCode"`
	ParticipantType string `json:"participantType"`
}

type RequestInput struct {
	StartAt string `json:"startAt"`
	EndAt   string `json:"endAt"`
}

type LeaveGroupMember struct {
	UserID    uint64 `json:"userId"`
	Name      string `json:"name"`
	StudentID string `json:"studentId"`
}

type LeaveGroup struct {
	Index    int                  `json:"index"`
	StartAt  time.Time            `json:"startAt"`
	EndAt    time.Time            `json:"endAt"`
	TimeText string               `json:"timeText"`
	Count    int                  `json:"count"`
	Members  []LeaveGroupMember   `json:"members"`
	Result   LeaveGroupResultView `json:"result"`
}

type LeaveGroupResultView struct {
	Available bool       `json:"available"`
	Filename  string     `json:"filename,omitempty"`
	ExpiresAt *time.Time `json:"expiresAt,omitempty"`
}

type SchoolLeaveRunView struct {
	model.SchoolLeaveRun
	RequestCount  int          `json:"requestCount"`
	MemberCount   int          `json:"memberCount"`
	Groups        []LeaveGroup `json:"groups"`
	DocumentReady bool         `json:"documentReady"`
}

type SchoolLeaveSummary struct {
	PendingCount        int64  `json:"pendingCount"`
	AwaitingReturnCount int64  `json:"awaitingReturnCount"`
	TodoCount           int64  `json:"todoCount"`
	UnreadCount         int64  `json:"unreadCount"`
	ContactPhoneReady   bool   `json:"contactPhoneReady"`
	DailyCutoff         string `json:"dailyCutoff"`
}

type DailyEntryView struct {
	model.DailyLeaveEntry
	DocumentRequests []model.DailyLeaveDocumentRequest `json:"documentRequests"`
	IsUnread         bool                              `json:"isUnread,omitempty"`
}

type AdminSchoolLeaveRequestView struct {
	model.SchoolLeaveRequest
	IsUnread bool `json:"isUnread"`
}

func (s *Service) nowShanghai() time.Time { return s.now().In(shanghai).Truncate(time.Minute) }

func parseShanghaiDateTime(value string) (time.Time, error) {
	value = strings.TrimSpace(value)
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02T15:04:05", "2006-01-02T15:04", "2006-01-02 15:04:05", "2006-01-02 15:04"} {
		if parsed, err := time.ParseInLocation(layout, value, shanghai); err == nil {
			return parsed.In(shanghai).Truncate(time.Minute), nil
		}
	}
	return time.Time{}, fmt.Errorf("时间格式不正确")
}

func parseShanghaiDate(value string) (time.Time, error) {
	return time.ParseInLocation("2006-01-02", strings.TrimSpace(value), shanghai)
}

func validateRange(startAt, endAt time.Time, fiveMinuteGranularity bool) error {
	if !startAt.Before(endAt) {
		return fmt.Errorf("结束时间必须晚于开始时间")
	}
	if fiveMinuteGranularity && (startAt.Minute()%5 != 0 || endAt.Minute()%5 != 0) {
		return fmt.Errorf("请假时间请按 5 分钟粒度填写")
	}
	return nil
}

func validateProfile(input ProfileInput) (ProfileInput, error) {
	input.Name = strings.TrimSpace(input.Name)
	input.StudentID = strings.TrimSpace(input.StudentID)
	input.CollegeCode = strings.TrimSpace(input.CollegeCode)
	input.ParticipantType = strings.TrimSpace(input.ParticipantType)
	if len([]rune(input.Name)) < 2 || len([]rune(input.Name)) > 50 {
		return input, fmt.Errorf("姓名须为 2 至 50 个字符")
	}
	if !studentIDPattern.MatchString(input.StudentID) {
		return input, fmt.Errorf("学号必须是 8 位数字")
	}
	if _, ok := collegeCodes[input.CollegeCode]; !ok {
		return input, fmt.Errorf("请选择有效学院")
	}
	if input.ParticipantType == "" {
		input.ParticipantType = "other"
	}
	if input.ParticipantType != "formal" && input.ParticipantType != "reserve" && input.ParticipantType != "other" {
		return input, fmt.Errorf("队内身份无效")
	}
	return input, nil
}

func (s *Service) Colleges() []CollegeOption {
	items := make([]CollegeOption, 0, len(collegeCodes))
	for code, name := range collegeCodes {
		items = append(items, CollegeOption{Code: code, Name: name})
	}
	sortColleges(items)
	return items
}

func sortColleges(items []CollegeOption) {
	sort.Slice(items, func(i, j int) bool { return items[i].Name < items[j].Name })
}

func (s *Service) GetProfile(ctx context.Context, userID uint64) (*model.LeaveProfile, error) {
	var profile model.LeaveProfile
	err := s.db.WithContext(ctx).Where("user_id = ?", userID).First(&profile).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, internalError("读取请假资料失败", err)
	}
	return &profile, nil
}

func (s *Service) SaveProfile(ctx context.Context, userID uint64, input ProfileInput) (*model.LeaveProfile, error) {
	input, err := validateProfile(input)
	if err != nil {
		return nil, badRequest(err.Error())
	}
	var profile model.LeaveProfile
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		lookup := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", userID).First(&profile)
		if errors.Is(lookup.Error, gorm.ErrRecordNotFound) {
			profile = model.LeaveProfile{UserID: userID, Name: input.Name, StudentID: input.StudentID, CollegeCode: input.CollegeCode, ParticipantType: input.ParticipantType}
			return tx.Create(&profile).Error
		}
		if lookup.Error != nil {
			return lookup.Error
		}
		if profile.IdentityLocked && (profile.Name != input.Name || profile.StudentID != input.StudentID) {
			return conflict("已有请假记录，姓名和学号不能修改")
		}
		profile.Name = input.Name
		profile.StudentID = input.StudentID
		profile.CollegeCode = input.CollegeCode
		profile.ParticipantType = input.ParticipantType
		return tx.Save(&profile).Error
	})
	if err != nil {
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		if isDuplicate(err) {
			return nil, conflict("该学号已绑定其他账号")
		}
		return nil, internalError("保存请假资料失败", err)
	}
	return &profile, nil
}

func (s *Service) requireProfile(tx *gorm.DB, userID uint64) (*model.LeaveProfile, error) {
	var profile model.LeaveProfile
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", userID).First(&profile).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, conflict("请先完善姓名、学号和学院")
		}
		return nil, internalError("读取请假资料失败", err)
	}
	return &profile, nil
}

func lockProfile(tx *gorm.DB, userID uint64) error {
	return tx.Model(&model.LeaveProfile{}).Where("user_id = ?", userID).Update("identity_locked", true).Error
}

func newToken() (string, error) {
	var value [32]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value[:]), nil
}

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func badRequest(message string) *ServiceError {
	return &ServiceError{Status: http.StatusBadRequest, Message: message}
}
func notFound(message string) *ServiceError {
	return &ServiceError{Status: http.StatusNotFound, Message: message}
}
func conflict(message string) *ServiceError {
	return &ServiceError{Status: http.StatusConflict, Message: message}
}
func internalError(message string, err error) *ServiceError {
	return &ServiceError{Status: http.StatusInternalServerError, Message: message, Err: err}
}

func isDuplicate(err error) bool {
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "duplicate") || strings.Contains(message, "unique constraint")
}

func formatSchoolLeaveTime(startAt, endAt time.Time) string {
	if startAt.Year() == endAt.Year() && startAt.YearDay() == endAt.YearDay() {
		return fmt.Sprintf("%d年%d月%d日 %s 至 %s", startAt.Year(), startAt.Month(), startAt.Day(), startAt.Format("15:04"), endAt.Format("15:04"))
	}
	return fmt.Sprintf("%d年%d月%d日 %s 至 %d年%d月%d日 %s", startAt.Year(), startAt.Month(), startAt.Day(), startAt.Format("15:04"), endAt.Year(), endAt.Month(), endAt.Day(), endAt.Format("15:04"))
}

func coursePeriod(startAt, endAt time.Time) string {
	if startAt.Year() != endAt.Year() || startAt.YearDay() != endAt.YearDay() {
		return "当日对应课程"
	}
	type period struct {
		start, end time.Duration
		label      string
	}
	periods := []period{
		{8 * time.Hour, 9*time.Hour + 50*time.Minute, "第一大节"},
		{10 * time.Hour, 11*time.Hour + 50*time.Minute, "第二大节"},
		{13*time.Hour + 30*time.Minute, 15*time.Hour + 20*time.Minute, "第三大节"},
		{15*time.Hour + 40*time.Minute, 17*time.Hour + 30*time.Minute, "第四大节"},
		{18 * time.Hour, 19*time.Hour + 50*time.Minute, "第五大节"},
		{20 * time.Hour, 21*time.Hour + 50*time.Minute, "第六大节"},
	}
	start := time.Duration(startAt.Hour())*time.Hour + time.Duration(startAt.Minute())*time.Minute
	end := time.Duration(endAt.Hour())*time.Hour + time.Duration(endAt.Minute())*time.Minute
	var matched []string
	for _, item := range periods {
		if start < item.end && end > item.start {
			matched = append(matched, item.label)
		}
	}
	if len(matched) == 1 {
		return matched[0] + "课程"
	}
	return "当日对应课程"
}

func groupRequests(requests []model.SchoolLeaveRequest) []LeaveGroup {
	sort.Slice(requests, func(i, j int) bool {
		if requests[i].StartAt.Equal(requests[j].StartAt) {
			if requests[i].EndAt.Equal(requests[j].EndAt) {
				if requests[i].StudentIDSnapshot == requests[j].StudentIDSnapshot {
					return requests[i].NameSnapshot < requests[j].NameSnapshot
				}
				return requests[i].StudentIDSnapshot < requests[j].StudentIDSnapshot
			}
			return requests[i].EndAt.Before(requests[j].EndAt)
		}
		return requests[i].StartAt.Before(requests[j].StartAt)
	})
	groups := make([]LeaveGroup, 0)
	for _, request := range requests {
		index := -1
		for i := range groups {
			if groups[i].StartAt.Equal(request.StartAt) && groups[i].EndAt.Equal(request.EndAt) {
				index = i
				break
			}
		}
		if index < 0 {
			groups = append(groups, LeaveGroup{Index: len(groups) + 1, StartAt: request.StartAt, EndAt: request.EndAt, TimeText: formatSchoolLeaveTime(request.StartAt, request.EndAt)})
			index = len(groups) - 1
		}
		groups[index].Members = append(groups[index].Members, LeaveGroupMember{UserID: request.UserID, Name: request.NameSnapshot, StudentID: request.StudentIDSnapshot})
		groups[index].Count++
	}
	return groups
}

func (s *Service) MarkIdentityLocked(ctx context.Context, userID uint64) error {
	return s.db.WithContext(ctx).Model(&model.LeaveProfile{}).Where("user_id = ?", userID).Update("identity_locked", true).Error
}
