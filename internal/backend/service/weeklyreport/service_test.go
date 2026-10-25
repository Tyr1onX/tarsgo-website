package weeklyreport

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"testing"
	"time"

	"tarsgo-backend/model"
)

type memoryRepository struct {
	groups    map[uint64][]GroupOption
	allGroups []GroupOption
	members   map[uint64][]model.UserGroupMember
	reports   map[uint64]model.WeeklyReport
	nextID    uint64
	now       time.Time
}

func newMemoryRepository() *memoryRepository {
	return &memoryRepository{
		groups:  map[uint64][]GroupOption{},
		members: map[uint64][]model.UserGroupMember{},
		reports: map[uint64]model.WeeklyReport{},
		nextID:  1,
		now:     time.Date(2026, 10, 20, 12, 0, 0, 0, time.FixedZone("Asia/Shanghai", 8*60*60)),
	}
}

func (r *memoryRepository) ListUserGroups(_ context.Context, userID uint64) ([]GroupOption, error) {
	return append([]GroupOption(nil), r.groups[userID]...), nil
}

func (r *memoryRepository) ListTeamGroups(_ context.Context, userID uint64, role string) ([]GroupOption, error) {
	if role == model.RoleNameSuperAdmin {
		return append([]GroupOption(nil), r.allGroups...), nil
	}
	if role == model.RoleNameAdmin {
		return append([]GroupOption(nil), r.groups[userID]...), nil
	}
	return []GroupOption{}, nil
}

func (r *memoryRepository) ListMine(_ context.Context, userID uint64) ([]model.WeeklyReport, error) {
	var result []model.WeeklyReport
	for _, report := range r.reports {
		if report.UserID == userID {
			result = append(result, report)
		}
	}
	return result, nil
}

func (r *memoryRepository) UpsertCurrent(_ context.Context, report *model.WeeklyReport) error {
	for id, existing := range r.reports {
		if existing.UserID == report.UserID && existing.WeekStart == report.WeekStart {
			report.ID = id
			report.GroupID = existing.GroupID
			report.CreatedAt = existing.CreatedAt
			report.UpdatedAt = r.now
			r.reports[id] = *report
			return nil
		}
	}
	report.ID = r.nextID
	r.nextID++
	report.CreatedAt = r.now
	report.UpdatedAt = r.now
	r.reports[report.ID] = *report
	return nil
}

func (r *memoryRepository) FindByWeek(_ context.Context, userID uint64, weekStart string) (*model.WeeklyReport, error) {
	for _, report := range r.reports {
		if report.UserID == userID && string(report.WeekStart) == weekStart {
			copy := report
			return &copy, nil
		}
	}
	return nil, nil
}

func (r *memoryRepository) FindOwnedReport(_ context.Context, userID, reportID uint64) (*model.WeeklyReport, error) {
	report, ok := r.reports[reportID]
	if !ok || report.UserID != userID {
		return nil, nil
	}
	copy := report
	return &copy, nil
}

func (r *memoryRepository) UpdateOwnedReport(_ context.Context, userID, reportID uint64, completed, gains, blockers, nextPlan string) error {
	report, ok := r.reports[reportID]
	if !ok || report.UserID != userID {
		return nil
	}
	report.Completed = completed
	report.Gains = gains
	report.Blockers = blockers
	report.NextPlan = nextPlan
	report.UpdatedAt = r.now
	r.reports[reportID] = report
	return nil
}

func (r *memoryRepository) ListActiveMembers(_ context.Context, groupID uint64, activitySince time.Time) ([]model.UserGroupMember, error) {
	var result []model.UserGroupMember
	for _, memberships := range r.members {
		for _, member := range memberships {
			if member.GroupID == groupID && member.User.Status == model.UserStatusEnabled && member.User.LastLoginAt != nil && !member.User.LastLoginAt.Before(activitySince) {
				result = append(result, member)
			}
		}
	}
	return result, nil
}

func (r *memoryRepository) ListReportWeeks(_ context.Context, groupID uint64) ([]string, error) {
	seen := make(map[string]struct{})
	var weeks []string
	for _, report := range r.reports {
		if report.GroupID == nil || *report.GroupID != groupID {
			continue
		}
		week := string(report.WeekStart)
		if _, ok := seen[week]; ok {
			continue
		}
		seen[week] = struct{}{}
		weeks = append(weeks, week)
	}
	sort.Sort(sort.Reverse(sort.StringSlice(weeks)))
	return weeks, nil
}

func (r *memoryRepository) ListReportsForWeek(_ context.Context, groupID uint64, weekStart string) ([]model.WeeklyReport, error) {
	var result []model.WeeklyReport
	for _, report := range r.reports {
		if report.GroupID != nil && *report.GroupID == groupID && string(report.WeekStart) == weekStart {
			result = append(result, report)
		}
	}
	return result, nil
}

func newTestService() (*Service, *memoryRepository) {
	repo := newMemoryRepository()
	service := NewService(repo)
	service.now = func() time.Time { return repo.now }
	return service, repo
}

func addMember(repo *memoryRepository, userID, groupID uint64, role uint8, name string, groupName ...string) {
	resolvedGroupName := OperationsGroupName
	if len(groupName) > 0 {
		resolvedGroupName = groupName[0]
	}
	realName := name
	group := GroupOption{GroupID: groupID, Name: resolvedGroupName}
	lastLoginAt := repo.now
	if !containsGroup(repo.allGroups, groupID) {
		repo.allGroups = append(repo.allGroups, group)
	}
	if !containsGroup(repo.groups[userID], groupID) {
		repo.groups[userID] = append(repo.groups[userID], group)
	}
	repo.members[userID] = append(repo.members[userID], model.UserGroupMember{
		UserID:  userID,
		GroupID: groupID,
		Role:    role,
		Group:   model.UserGroup{ID: groupID, Name: resolvedGroupName, Status: model.UserGroupStatusActive},
		User:    model.User{ID: userID, RealName: &realName, Email: fmt.Sprintf("%d@example.test", userID), Status: model.UserStatusEnabled, LastLoginAt: &lastLoginAt},
	})
}

func containsGroup(groups []GroupOption, groupID uint64) bool {
	for _, group := range groups {
		if group.GroupID == groupID {
			return true
		}
	}
	return false
}

func validInput() ReportInput {
	return ReportInput{Completed: "本周进展", Gains: "本周收获", Blockers: "暂无帮助需求", NextPlan: "下周安排"}
}

func expectStatus(t *testing.T, err error, status int) {
	t.Helper()
	serviceErr, ok := err.(*ServiceError)
	if !ok || serviceErr.Status != status {
		t.Fatalf("error = %#v, want status %d", err, status)
	}
}

func TestCurrentWeekStartUsesShanghaiMondayAtCalendarBoundaries(t *testing.T) {
	tests := []struct {
		name string
		now  time.Time
		want string
	}{
		{name: "Sunday before Shanghai midnight", now: time.Date(2026, 10, 11, 15, 59, 59, 0, time.UTC), want: "2026-10-05"},
		{name: "Monday begins in Shanghai", now: time.Date(2026, 10, 11, 16, 0, 0, 0, time.UTC), want: "2026-10-12"},
		{name: "Sunday after midnight", now: time.Date(2026, 10, 18, 3, 0, 0, 0, time.UTC), want: "2026-10-12"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := currentWeekStart(test.now); got != test.want {
				t.Fatalf("currentWeekStart() = %q, want %q", got, test.want)
			}
		})
	}
}

func TestEveryEnabledMemberCanCreateAndReadOwnWeeklyReport(t *testing.T) {
	service, repo := newTestService()
	addMember(repo, 2, 77, model.UserGroupMemberRoleMember, "机械成员", "机械组")
	addMember(repo, 3, 88, model.UserGroupMemberRoleMember, "电控成员", "电控组")
	addMember(repo, 4, 99, model.UserGroupMemberRoleLeader, "运营负责人", OperationsGroupName)
	repo.groups[5] = nil // A valid account with no confirmed group can still report.

	for _, userID := range []uint64{2, 3, 4, 5} {
		dashboard, err := service.GetDashboard(context.Background(), userID, model.RoleNameUser)
		if err != nil || dashboard.CanViewTeam {
			t.Fatalf("member %d dashboard = %#v, error=%v", userID, dashboard, err)
		}
		if _, err := service.SaveCurrentReport(context.Background(), userID, validInput()); err != nil {
			t.Fatalf("member %d could not submit: %v", userID, err)
		}
		mine, err := service.GetDashboard(context.Background(), userID, model.RoleNameUser)
		if err != nil || len(mine.Reports) != 1 {
			t.Fatalf("member %d own report was not available: %#v, error=%v", userID, mine, err)
		}
	}
	if repo.reports[3].GroupID == nil || *repo.reports[3].GroupID != 99 || repo.reports[4].GroupID != nil {
		t.Fatalf("expected group attribution for assigned members and nullable scope for unassigned member: %#v %#v", repo.reports[3].GroupID, repo.reports[4].GroupID)
	}
}

func TestCurrentReportUpsertKeepsOneReportAndOriginalGroupSnapshot(t *testing.T) {
	service, repo := newTestService()
	addMember(repo, 2, 77, model.UserGroupMemberRoleMember, "成员", "机械组")
	first, err := service.SaveCurrentReport(context.Background(), 2, validInput())
	if err != nil {
		t.Fatal(err)
	}
	// The account later changes groups. Editing this week's record must not
	// silently reclassify it under the new group's administrators.
	repo.groups[2] = []GroupOption{{GroupID: 88, Name: "视觉组"}}
	secondInput := validInput()
	secondInput.Completed = "更新后的进展"
	second, err := service.SaveCurrentReport(context.Background(), 2, secondInput)
	if err != nil {
		t.Fatal(err)
	}
	if first.ID != second.ID || second.Completed != "更新后的进展" || second.GroupID == nil || *second.GroupID != 77 || len(repo.reports) != 1 {
		t.Fatalf("report was duplicated or moved to a different group: first=%#v second=%#v rows=%d", first, second, len(repo.reports))
	}
}

func TestMultiGroupMemberMustAttributeNewReportToOneCurrentGroup(t *testing.T) {
	service, repo := newTestService()
	addMember(repo, 2, 77, model.UserGroupMemberRoleMember, "成员", "机械组")
	addMember(repo, 2, 88, model.UserGroupMemberRoleMember, "成员", "AI组")
	if _, err := service.SaveCurrentReport(context.Background(), 2, validInput()); err == nil {
		t.Fatal("new report with ambiguous group attribution should require a group")
	} else {
		expectStatus(t, err, http.StatusBadRequest)
	}
	input := validInput()
	groupID := uint64(88)
	input.GroupID = &groupID
	report, err := service.SaveCurrentReport(context.Background(), 2, input)
	if err != nil || report.GroupID == nil || *report.GroupID != groupID {
		t.Fatalf("valid group attribution failed: %#v, error=%v", report, err)
	}
	addMember(repo, 6, 77, model.UserGroupMemberRoleMember, "另一成员", "机械组")
	addMember(repo, 6, 88, model.UserGroupMemberRoleMember, "另一成员", "AI组")
	foreign := uint64(99)
	input = validInput()
	input.GroupID = &foreign
	if _, err := service.SaveCurrentReport(context.Background(), 6, input); err == nil {
		t.Fatal("member must not attribute a report to a group they do not belong to")
	} else {
		expectStatus(t, err, http.StatusForbidden)
	}
}

func TestHistoricalReportCanOnlyBeEditedByItsOwnerAfterGroupChanges(t *testing.T) {
	service, repo := newTestService()
	addMember(repo, 2, 77, model.UserGroupMemberRoleMember, "成员", "机械组")
	repo.reports[90] = model.WeeklyReport{ID: 90, GroupID: ptrUint64(77), UserID: 2, WeekStart: "2026-10-05", Completed: "旧进展", Gains: "旧收获", Blockers: "无", NextPlan: "旧计划"}
	repo.groups[2] = nil
	addMember(repo, 3, 77, model.UserGroupMemberRoleLeader, "负责人", "机械组")
	if _, err := service.UpdateReport(context.Background(), 3, 90, validInput()); err == nil {
		t.Fatal("another member must not edit the report")
	} else {
		expectStatus(t, err, http.StatusNotFound)
	}
	updated, err := service.UpdateReport(context.Background(), 2, 90, ReportInput{Completed: "新进展", Gains: "新收获", Blockers: "无", NextPlan: "新计划"})
	if err != nil || updated.WeekStart != "2026-10-05" || updated.Completed != "新进展" || updated.GroupID == nil || *updated.GroupID != 77 {
		t.Fatalf("owner could not edit preserved historical report: %#v, error=%v", updated, err)
	}
}

func TestGroupAdminSeesOnlyAuthorizedGroupAndSuperAdminCanChooseAllGroups(t *testing.T) {
	service, repo := newTestService()
	addMember(repo, 1, 77, model.UserGroupMemberRoleLeader, "组长头衔管理员", "机械组")
	addMember(repo, 2, 77, model.UserGroupMemberRoleMember, "机械成员", "机械组")
	addMember(repo, 3, 88, model.UserGroupMemberRoleMember, "AI成员", "AI组")
	input := validInput()
	input.GroupID = ptrUint64(77)
	if _, err := service.SaveCurrentReport(context.Background(), 2, input); err != nil {
		t.Fatal(err)
	}
	input.GroupID = ptrUint64(88)
	if _, err := service.SaveCurrentReport(context.Background(), 3, input); err != nil {
		t.Fatal(err)
	}
	// The ordinary admin is authorized through their active group membership;
	// organizational leader title does not decide the system permission.
	team, err := service.GetTeamWeek(context.Background(), 1, model.RoleNameAdmin, 77, "")
	if err != nil || team.GroupName != "机械组" || team.TotalCount != 2 || team.SubmittedCount != 1 {
		t.Fatalf("authorized team report mismatch: %#v, error=%v", team, err)
	}
	if _, err := service.GetTeamWeek(context.Background(), 1, model.RoleNameAdmin, 88, ""); err == nil {
		t.Fatal("ordinary admin must not read another group's weekly reports")
	} else {
		expectStatus(t, err, http.StatusForbidden)
	}
	if _, err := service.GetTeamWeek(context.Background(), 2, model.RoleNameUser, 77, ""); err == nil {
		t.Fatal("group leader organization identity must not grant team-report access")
	} else {
		expectStatus(t, err, http.StatusForbidden)
	}
	addMember(repo, 4, 99, model.UserGroupMemberRoleMember, "超管账号", "默认分组")
	team, err = service.GetTeamWeek(context.Background(), 4, model.RoleNameSuperAdmin, 88, "")
	if err != nil || team.GroupName != "AI组" {
		t.Fatalf("super admin must select a team outside their own group: %#v, error=%v", team, err)
	}
}

func TestTeamWeekListsOnlyPersistedWeeksAndRejectsArbitraryWeeks(t *testing.T) {
	service, repo := newTestService()
	addMember(repo, 1, 77, model.UserGroupMemberRoleMember, "管理员", "机械组")
	repo.reports[90] = model.WeeklyReport{ID: 90, GroupID: ptrUint64(77), UserID: 1, WeekStart: "2026-10-12", Completed: "历史周报", Gains: "收获", Blockers: "无", NextPlan: "计划"}

	current, err := service.GetTeamWeek(context.Background(), 1, model.RoleNameAdmin, 77, "")
	if err != nil || current.WeekStart != currentWeekStart(repo.now) || len(current.AvailableWeeks) != 2 || current.AvailableWeeks[0] != currentWeekStart(repo.now) || current.AvailableWeeks[1] != "2026-10-12" {
		t.Fatalf("team weeks should include current and only persisted history: %#v, error=%v", current, err)
	}
	history, err := service.GetTeamWeek(context.Background(), 1, model.RoleNameAdmin, 77, "2026-10-12")
	if err != nil || history.WeekStart != "2026-10-12" {
		t.Fatalf("persisted historical week should remain selectable: %#v, error=%v", history, err)
	}
	if _, err := service.GetTeamWeek(context.Background(), 1, model.RoleNameAdmin, 77, "2026-10-05"); err == nil {
		t.Fatal("week without group reports must not be selectable")
	} else {
		expectStatus(t, err, http.StatusBadRequest)
	}
}

func TestReportInputRequiresAllFourSections(t *testing.T) {
	valid := validInput()
	valid.Gains = ""
	if _, err := validateInput(valid, false); err == nil {
		t.Fatal("empty gains section must be rejected")
	}
	tooLong := strings.Repeat("字", maxSectionRunes+1)
	if _, err := validateInput(ReportInput{Completed: "done", Gains: "gains", Blockers: "none", NextPlan: tooLong}, false); err == nil {
		t.Fatal("section over the character limit must be rejected")
	}
	if _, err := validateInput(validInput(), false); err != nil {
		t.Fatalf("valid four-section report should be accepted: %v", err)
	}
	if _, err := validateInput(valid, true); err != nil {
		t.Fatalf("legacy report without a gains field should remain editable: %v", err)
	}
}

func TestLegacyCurrentReportCanBeEditedWithoutInventingGains(t *testing.T) {
	service, repo := newTestService()
	addMember(repo, 2, 77, model.UserGroupMemberRoleMember, "成员", "机械组")
	week := currentWeekStart(repo.now)
	repo.reports[90] = model.WeeklyReport{ID: 90, GroupID: ptrUint64(77), UserID: 2, WeekStart: model.WeeklyReportWeekStart(week), Completed: "旧进展", Blockers: "无", NextPlan: "旧计划"}
	updated, err := service.SaveCurrentReport(context.Background(), 2, ReportInput{Completed: "修订进展", Blockers: "无", NextPlan: "新计划"})
	if err != nil || updated.ID != 90 || updated.Gains != "" || updated.Completed != "修订进展" {
		t.Fatalf("legacy current report should remain editable and keep its blank gains: %#v, error=%v", updated, err)
	}
}

func TestLegacyHistoryCanBeEditedWithoutInventingGains(t *testing.T) {
	service, repo := newTestService()
	repo.reports[90] = model.WeeklyReport{ID: 90, GroupID: ptrUint64(77), UserID: 2, WeekStart: "2026-10-05", Completed: "旧进展", Blockers: "无", NextPlan: "旧计划"}
	updated, err := service.UpdateReport(context.Background(), 2, 90, ReportInput{Completed: "修订进展", Blockers: "无", NextPlan: "新计划"})
	if err != nil || updated.ID != 90 || updated.Gains != "" || updated.Completed != "修订进展" {
		t.Fatalf("legacy historical report should remain editable and keep its blank gains: %#v, error=%v", updated, err)
	}
}

func ptrUint64(value uint64) *uint64 { return &value }
