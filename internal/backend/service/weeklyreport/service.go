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
	OperationsGroupName = "运营组" // Retained for reading historical test fixtures and reports.
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
	Completed string  `json:"completed"`
	Gains     string  `json:"gains"`
	Blockers  string  `json:"blockers"`
	NextPlan  string  `json:"nextPlan"`
	GroupID   *uint64 `json:"groupId,omitempty"`
}

type Report struct {
	ID        uint64    `json:"id"`
	GroupID   *uint64   `json:"groupId,omitempty"`
	GroupName string    `json:"groupName,omitempty"`
	WeekStart string    `json:"weekStart"`
	Completed string    `json:"completed"`
	Gains     string    `json:"gains"`
	Blockers  string    `json:"blockers"`
	NextPlan  string    `json:"nextPlan"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type GroupOption struct {
	GroupID uint64 `json:"groupId" gorm:"column:group_id"`
	Name    string `json:"name"`
}

type Dashboard struct {
	GroupName        string        `json:"groupName,omitempty"`
	Groups           []GroupOption `json:"groups"`
	TeamGroups       []GroupOption `json:"teamGroups"`
	CurrentWeekStart string        `json:"currentWeekStart"`
	CanViewTeam      bool          `json:"canViewTeam"`
	Reports          []Report      `json:"reports"`
}

type TeamMemberReport struct {
	UserID    uint64  `json:"userId"`
	Name      string  `json:"name"`
	Submitted bool    `json:"submitted"`
	Report    *Report `json:"report"`
}

type TeamWeek struct {
	GroupID        uint64             `json:"groupId"`
	GroupName      string             `json:"groupName"`
	WeekStart      string             `json:"weekStart"`
	SubmittedCount int                `json:"submittedCount"`
	TotalCount     int                `json:"totalCount"`
	Members        []TeamMemberReport `json:"members"`
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo, now: time.Now}
}

func (s *Service) GetDashboard(ctx context.Context, userID uint64, systemRole string) (*Dashboard, error) {
	if userID == 0 {
		return nil, serviceError(http.StatusUnauthorized, "请先登录", nil)
	}
	groups, err := s.repo.ListUserGroups(ctx, userID)
	if err != nil {
		return nil, internalError("读取所属组别失败", err)
	}
	teamGroups := []GroupOption{}
	if canViewTeam(systemRole) {
		teamGroups, err = s.repo.ListTeamGroups(ctx, userID, systemRole)
		if err != nil {
			return nil, internalError("读取可管理组别失败", err)
		}
	}
	reports, err := s.repo.ListMine(ctx, userID)
	if err != nil {
		return nil, internalError("读取周报历史失败", err)
	}
	result := &Dashboard{
		Groups:           groups,
		TeamGroups:       teamGroups,
		CurrentWeekStart: currentWeekStart(s.now()),
		CanViewTeam:      canViewTeam(systemRole),
		Reports:          make([]Report, 0, len(reports)),
	}
	if len(groups) == 1 {
		result.GroupName = groups[0].Name
	}
	for _, report := range reports {
		result.Reports = append(result.Reports, toReport(report))
	}
	return result, nil
}

func (s *Service) SaveCurrentReport(ctx context.Context, userID uint64, input ReportInput) (*Report, error) {
	if userID == 0 {
		return nil, serviceError(http.StatusUnauthorized, "请先登录", nil)
	}
	weekStart := currentWeekStart(s.now())
	existing, err := s.repo.FindByWeek(ctx, userID, weekStart)
	if err != nil {
		return nil, internalError("读取本周周报失败", err)
	}
	// Reports written before v28 have no separately recorded gains. Keep those
	// history entries editable without inventing a value for that new field.
	input, err = validateInput(input, existing != nil && existing.Gains == "")
	if err != nil {
		return nil, err
	}
	var groupID *uint64
	if existing != nil {
		// Preserve the group snapshot recorded when this week's report was first
		// created, even if the member has since changed groups.
		groupID = existing.GroupID
	} else {
		groups, err := s.repo.ListUserGroups(ctx, userID)
		if err != nil {
			return nil, internalError("读取所属组别失败", err)
		}
		groupID, err = resolveReportGroup(groups, input.GroupID)
		if err != nil {
			return nil, err
		}
	}
	report := &model.WeeklyReport{
		GroupID:   groupID,
		UserID:    userID,
		WeekStart: model.WeeklyReportWeekStart(weekStart),
		Completed: input.Completed,
		Gains:     input.Gains,
		Blockers:  input.Blockers,
		NextPlan:  input.NextPlan,
	}
	if err := s.repo.UpsertCurrent(ctx, report); err != nil {
		return nil, internalError("保存周报失败", err)
	}
	saved, err := s.repo.FindByWeek(ctx, userID, weekStart)
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
	if userID == 0 {
		return nil, serviceError(http.StatusUnauthorized, "请先登录", nil)
	}
	existing, err := s.repo.FindOwnedReport(ctx, userID, reportID)
	if err != nil {
		return nil, internalError("读取周报失败", err)
	}
	if existing == nil {
		return nil, serviceError(http.StatusNotFound, "周报不存在或无权编辑", nil)
	}
	// Reports written before v28 have no separately recorded gains. Keep those
	// history entries editable without inventing a value for that new field.
	input, err = validateInput(input, existing.Gains == "")
	if err != nil {
		return nil, err
	}
	if err := s.repo.UpdateOwnedReport(ctx, userID, reportID, input.Completed, input.Gains, input.Blockers, input.NextPlan); err != nil {
		return nil, internalError("更新周报失败", err)
	}
	updatedReport, err := s.repo.FindOwnedReport(ctx, userID, reportID)
	if err != nil {
		return nil, internalError("读取已更新周报失败", err)
	}
	if updatedReport == nil {
		return nil, serviceError(http.StatusNotFound, "周报不存在或无权编辑", nil)
	}
	result := toReport(*updatedReport)
	return &result, nil
}

func (s *Service) GetTeamWeek(ctx context.Context, userID uint64, systemRole string, requestedGroupID uint64, requestedWeekStart string) (*TeamWeek, error) {
	if userID == 0 {
		return nil, serviceError(http.StatusUnauthorized, "请先登录", nil)
	}
	if !canViewTeam(systemRole) {
		return nil, serviceError(http.StatusForbidden, "当前账号无权查看成员周报", nil)
	}
	groups, err := s.repo.ListTeamGroups(ctx, userID, systemRole)
	if err != nil {
		return nil, internalError("读取可管理组别失败", err)
	}
	group, err := selectTeamGroup(groups, requestedGroupID)
	if err != nil {
		return nil, err
	}
	weekStart, err := normalizedWeekStart(requestedWeekStart, s.now())
	if err != nil {
		return nil, err
	}
	members, err := s.repo.ListActiveMembers(ctx, group.GroupID)
	if err != nil {
		return nil, internalError("读取组内成员失败", err)
	}
	reports, err := s.repo.ListReportsForWeek(ctx, group.GroupID, weekStart)
	if err != nil {
		return nil, internalError("读取组内周报失败", err)
	}
	reportByUser := make(map[uint64]Report, len(reports))
	for _, report := range reports {
		reportByUser[report.UserID] = toReport(report)
	}
	result := &TeamWeek{GroupID: group.GroupID, GroupName: group.Name, WeekStart: weekStart, TotalCount: len(members), Members: make([]TeamMemberReport, 0, len(members))}
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

func resolveReportGroup(groups []GroupOption, requested *uint64) (*uint64, error) {
	if len(groups) == 0 {
		if requested != nil {
			return nil, serviceError(http.StatusForbidden, "只能选择账号当前所属的有效组别", nil)
		}
		return nil, nil
	}
	if requested != nil {
		for _, group := range groups {
			if group.GroupID == *requested {
				id := group.GroupID
				return &id, nil
			}
		}
		return nil, serviceError(http.StatusForbidden, "只能选择账号当前所属的有效组别", nil)
	}
	if len(groups) == 1 {
		id := groups[0].GroupID
		return &id, nil
	}
	return nil, serviceError(http.StatusBadRequest, "请选择本周周报归属的组别", nil)
}

func selectTeamGroup(groups []GroupOption, requestedGroupID uint64) (GroupOption, error) {
	if len(groups) == 0 {
		return GroupOption{}, serviceError(http.StatusForbidden, "当前账号没有可查看的组别周报", nil)
	}
	if requestedGroupID == 0 {
		if len(groups) == 1 {
			return groups[0], nil
		}
		return GroupOption{}, serviceError(http.StatusBadRequest, "请选择要查看的组别", nil)
	}
	for _, group := range groups {
		if group.GroupID == requestedGroupID {
			return group, nil
		}
	}
	return GroupOption{}, serviceError(http.StatusForbidden, "当前账号无权查看该组别周报", nil)
}

func canViewTeam(systemRole string) bool {
	return systemRole == model.RoleNameAdmin || systemRole == model.RoleNameSuperAdmin
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

func validateInput(input ReportInput, allowEmptyLegacyGains bool) (ReportInput, error) {
	input.Completed = strings.TrimSpace(input.Completed)
	input.Gains = strings.TrimSpace(input.Gains)
	input.Blockers = strings.TrimSpace(input.Blockers)
	input.NextPlan = strings.TrimSpace(input.NextPlan)
	sections := []struct {
		name  string
		value string
	}{
		{name: "本周进展", value: input.Completed},
		{name: "本周收获", value: input.Gains},
		{name: "需要帮助", value: input.Blockers},
		{name: "下周计划", value: input.NextPlan},
	}
	for _, section := range sections {
		if section.name == "本周收获" && allowEmptyLegacyGains && section.value == "" {
			continue
		}
		if section.value == "" {
			return ReportInput{}, serviceError(http.StatusBadRequest, section.name+"不能为空；如暂无内容请填写“无”", nil)
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
	groupName := report.Group.Name
	return Report{
		ID:        report.ID,
		GroupID:   report.GroupID,
		GroupName: groupName,
		WeekStart: string(report.WeekStart),
		Completed: report.Completed,
		Gains:     report.Gains,
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
