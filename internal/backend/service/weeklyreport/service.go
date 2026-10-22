package weeklyreport

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"tarsgo-backend/model"
)

const (
	OperationsGroupName = "运营组"
	maxSectionRunes     = 5000
)

var shanghaiLocation = time.FixedZone("Asia/Shanghai", 8*60*60)

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

type ReportInput struct {
	Completed string `json:"completed"`
	Blockers  string `json:"blockers"`
	NextPlan  string `json:"nextPlan"`
}

type Report struct {
	ID        uint64    `json:"id"`
	WeekStart string    `json:"weekStart"`
	Completed string    `json:"completed"`
	Blockers  string    `json:"blockers"`
	NextPlan  string    `json:"nextPlan"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Dashboard struct {
	GroupName        string   `json:"groupName"`
	CurrentWeekStart string   `json:"currentWeekStart"`
	CanViewTeam      bool     `json:"canViewTeam"`
	Reports          []Report `json:"reports"`
}

type TeamMemberReport struct {
	UserID    uint64  `json:"userId"`
	Name      string  `json:"name"`
	Submitted bool    `json:"submitted"`
	Report    *Report `json:"report"`
}

type TeamWeek struct {
	WeekStart      string             `json:"weekStart"`
	SubmittedCount int                `json:"submittedCount"`
	TotalCount     int                `json:"totalCount"`
	Members        []TeamMemberReport `json:"members"`
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo, now: time.Now}
}

func (s *Service) GetDashboard(ctx context.Context, userID uint64, systemRole string) (*Dashboard, error) {
	member, err := s.operationsMembership(ctx, userID)
	if err != nil {
		return nil, err
	}
	reports, err := s.repo.ListMine(ctx, member.GroupID, userID)
	if err != nil {
		return nil, internalError("读取周报历史失败", err)
	}
	result := &Dashboard{
		GroupName:        OperationsGroupName,
		CurrentWeekStart: currentWeekStart(s.now()),
		CanViewTeam:      canViewTeam(systemRole),
		Reports:          make([]Report, 0, len(reports)),
	}
	for _, report := range reports {
		result.Reports = append(result.Reports, toReport(report))
	}
	return result, nil
}

func (s *Service) SaveCurrentReport(ctx context.Context, userID uint64, input ReportInput) (*Report, error) {
	input, err := validateInput(input)
	if err != nil {
		return nil, err
	}
	member, err := s.operationsMembership(ctx, userID)
	if err != nil {
		return nil, err
	}
	weekStart := currentWeekStart(s.now())
	report := &model.WeeklyReport{
		GroupID:   member.GroupID,
		UserID:    userID,
		WeekStart: model.WeeklyReportWeekStart(weekStart),
		Completed: input.Completed,
		Blockers:  input.Blockers,
		NextPlan:  input.NextPlan,
	}
	if err := s.repo.UpsertCurrent(ctx, report); err != nil {
		return nil, internalError("保存周报失败", err)
	}
	saved, err := s.repo.FindByWeek(ctx, member.GroupID, userID, weekStart)
	if err != nil {
		return nil, internalError("读取已保存周报失败", err)
	}
	if saved == nil {
		return nil, internalError("读取已保存周报失败", fmt.Errorf("saved report was not found"))
	}
	result := toReport(*saved)
	return &result, nil
}

func (s *Service) UpdateReport(ctx context.Context, userID, reportID uint64, input ReportInput) (*Report, error) {
	input, err := validateInput(input)
	if err != nil {
		return nil, err
	}
	member, err := s.operationsMembership(ctx, userID)
	if err != nil {
		return nil, err
	}
	existing, err := s.repo.FindOwnedReport(ctx, member.GroupID, userID, reportID)
	if err != nil {
		return nil, internalError("读取周报失败", err)
	}
	if existing == nil {
		return nil, serviceError(http.StatusNotFound, "周报不存在或无权编辑", nil)
	}
	if err := s.repo.UpdateOwnedReport(ctx, member.GroupID, userID, reportID, input.Completed, input.Blockers, input.NextPlan); err != nil {
		return nil, internalError("更新周报失败", err)
	}
	updatedReport, err := s.repo.FindOwnedReport(ctx, member.GroupID, userID, reportID)
	if err != nil {
		return nil, internalError("读取已更新周报失败", err)
	}
	if updatedReport == nil {
		return nil, serviceError(http.StatusNotFound, "周报不存在或无权编辑", nil)
	}
	result := toReport(*updatedReport)
	return &result, nil
}

func (s *Service) GetTeamWeek(ctx context.Context, userID uint64, systemRole, requestedWeekStart string) (*TeamWeek, error) {
	if userID == 0 {
		return nil, serviceError(http.StatusUnauthorized, "请先登录", nil)
	}
	if !canViewTeam(systemRole) {
		return nil, serviceError(http.StatusForbidden, "只有运营组系统管理员可以查看组内周报", nil)
	}
	member, err := s.operationsMembership(ctx, userID)
	if err != nil {
		return nil, err
	}
	weekStart, err := normalizedWeekStart(requestedWeekStart, s.now())
	if err != nil {
		return nil, err
	}
	members, err := s.repo.ListActiveMembers(ctx, member.GroupID)
	if err != nil {
		return nil, internalError("读取运营组成员失败", err)
	}
	reports, err := s.repo.ListReportsForWeek(ctx, member.GroupID, weekStart)
	if err != nil {
		return nil, internalError("读取组内周报失败", err)
	}
	reportByUser := make(map[uint64]Report, len(reports))
	for _, report := range reports {
		reportByUser[report.UserID] = toReport(report)
	}
	result := &TeamWeek{WeekStart: weekStart, TotalCount: len(members), Members: make([]TeamMemberReport, 0, len(members))}
	for _, member := range members {
		entry := TeamMemberReport{UserID: member.UserID, Name: memberDisplayName(member.User)}
		if report, ok := reportByUser[member.UserID]; ok {
			entry.Submitted = true
			entry.Report = &report
			result.SubmittedCount++
		}
		result.Members = append(result.Members, entry)
	}
	return result, nil
}

func (s *Service) operationsMembership(ctx context.Context, userID uint64) (*model.UserGroupMember, error) {
	if userID == 0 {
		return nil, serviceError(http.StatusUnauthorized, "请先登录", nil)
	}
	member, err := s.repo.FindOperationsMembership(ctx, userID)
	if err != nil {
		return nil, internalError("读取运营组权限失败", err)
	}
	if member == nil {
		return nil, serviceError(http.StatusForbidden, "当前账号不在运营组，无权访问工作周报", nil)
	}
	return member, nil
}

func canViewTeam(systemRole string) bool {
	return systemRole == model.RoleNameAdmin
}

func currentWeekStart(now time.Time) string {
	local := now.In(shanghaiLocation)
	weekday := int(local.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	monday := time.Date(local.Year(), local.Month(), local.Day()-weekday+1, 0, 0, 0, 0, shanghaiLocation)
	return monday.Format(time.DateOnly)
}

func normalizedWeekStart(requested string, now time.Time) (string, error) {
	if strings.TrimSpace(requested) == "" {
		return currentWeekStart(now), nil
	}
	parsed, err := time.ParseInLocation(time.DateOnly, requested, shanghaiLocation)
	if err != nil || parsed.Format(time.DateOnly) != requested || parsed.Weekday() != time.Monday {
		return "", serviceError(http.StatusBadRequest, "周次无效，请选择周一", nil)
	}
	weekStart := parsed.Format(time.DateOnly)
	if weekStart > currentWeekStart(now) {
		return "", serviceError(http.StatusBadRequest, "不能查看尚未开始的周次", nil)
	}
	return weekStart, nil
}

func validateInput(input ReportInput) (ReportInput, error) {
	input.Completed = strings.TrimSpace(input.Completed)
	input.Blockers = strings.TrimSpace(input.Blockers)
	input.NextPlan = strings.TrimSpace(input.NextPlan)
	sections := []struct {
		name  string
		value string
	}{
		{name: "本周完成", value: input.Completed},
		{name: "问题与阻塞", value: input.Blockers},
		{name: "下周计划", value: input.NextPlan},
	}
	for _, section := range sections {
		if section.value == "" {
			return ReportInput{}, serviceError(http.StatusBadRequest, section.name+"不能为空；如无内容请填写“无”", nil)
		}
		if utf8.RuneCountInString(section.value) > maxSectionRunes {
			return ReportInput{}, serviceError(http.StatusBadRequest, section.name+"不能超过 5000 个字符", nil)
		}
	}
	return input, nil
}

func memberDisplayName(user model.User) string {
	for _, value := range []*string{user.RealName, user.Nickname} {
		if value != nil && strings.TrimSpace(*value) != "" {
			return strings.TrimSpace(*value)
		}
	}
	if strings.TrimSpace(user.Name) != "" {
		return strings.TrimSpace(user.Name)
	}
	return user.Email
}

func toReport(report model.WeeklyReport) Report {
	return Report{
		ID:        report.ID,
		WeekStart: string(report.WeekStart),
		Completed: report.Completed,
		Blockers:  report.Blockers,
		NextPlan:  report.NextPlan,
		UpdatedAt: report.UpdatedAt,
	}
}

func serviceError(status int, message string, err error) *ServiceError {
	return &ServiceError{Status: status, Message: message, Err: err}
}

func internalError(message string, err error) *ServiceError {
	return serviceError(http.StatusInternalServerError, message, err)
}
