package weeklyreport

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"tarsgo-backend/model"
)

type memoryRepository struct {
	members map[uint64]model.UserGroupMember
	reports map[uint64]model.WeeklyReport
	nextID  uint64
	now     time.Time
}

func newMemoryRepository() *memoryRepository {
	return &memoryRepository{
		members: map[uint64]model.UserGroupMember{},
		reports: map[uint64]model.WeeklyReport{},
		nextID:  1,
		now:     time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC),
	}
}

func (r *memoryRepository) FindOperationsMembership(_ context.Context, userID uint64) (*model.UserGroupMember, error) {
	member, ok := r.members[userID]
	if !ok {
		return nil, nil
	}
	copy := member
	return &copy, nil
}

func (r *memoryRepository) ListMine(_ context.Context, groupID, userID uint64) ([]model.WeeklyReport, error) {
	var result []model.WeeklyReport
	for _, report := range r.reports {
		if report.GroupID == groupID && report.UserID == userID {
			result = append(result, report)
		}
	}
	return result, nil
}

func (r *memoryRepository) UpsertCurrent(_ context.Context, report *model.WeeklyReport) error {
	for id, existing := range r.reports {
		if existing.GroupID == report.GroupID && existing.UserID == report.UserID && existing.WeekStart == report.WeekStart {
			report.ID = id
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

func (r *memoryRepository) FindByWeek(_ context.Context, groupID, userID uint64, weekStart string) (*model.WeeklyReport, error) {
	for _, report := range r.reports {
		if report.GroupID == groupID && report.UserID == userID && string(report.WeekStart) == weekStart {
			copy := report
			return &copy, nil
		}
	}
	return nil, nil
}

func (r *memoryRepository) FindOwnedReport(_ context.Context, groupID, userID, reportID uint64) (*model.WeeklyReport, error) {
	report, ok := r.reports[reportID]
	if !ok || report.GroupID != groupID || report.UserID != userID {
		return nil, nil
	}
	copy := report
	return &copy, nil
}

func (r *memoryRepository) UpdateOwnedReport(_ context.Context, groupID, userID, reportID uint64, completed, blockers, nextPlan string) error {
	report, ok := r.reports[reportID]
	if !ok || report.GroupID != groupID || report.UserID != userID {
		return nil
	}
	report.Completed = completed
	report.Blockers = blockers
	report.NextPlan = nextPlan
	report.UpdatedAt = r.now
	r.reports[reportID] = report
	return nil
}

func (r *memoryRepository) ListActiveMembers(_ context.Context, groupID uint64) ([]model.UserGroupMember, error) {
	var result []model.UserGroupMember
	for _, member := range r.members {
		if member.GroupID == groupID {
			result = append(result, member)
		}
	}
	return result, nil
}

func (r *memoryRepository) ListReportsForWeek(_ context.Context, groupID uint64, weekStart string) ([]model.WeeklyReport, error) {
	var result []model.WeeklyReport
	for _, report := range r.reports {
		if report.GroupID == groupID && string(report.WeekStart) == weekStart {
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

func addMember(repo *memoryRepository, userID, groupID uint64, role uint8, name string) {
	realName := name
	repo.members[userID] = model.UserGroupMember{
		UserID:  userID,
		GroupID: groupID,
		Role:    role,
		User:    model.User{ID: userID, RealName: &realName, Email: fmt.Sprintf("%d@example.test", userID)},
	}
}

func validInput() ReportInput {
	return ReportInput{Completed: "完成内容", Blockers: "暂无", NextPlan: "下周安排"}
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

func TestDashboardAndSubmissionAreRestrictedToOperationsMembers(t *testing.T) {
	service, repo := newTestService()
	if _, err := service.GetDashboard(context.Background(), 1); err == nil {
		t.Fatal("expected a user outside the operations group to be denied")
	} else if serviceErr, ok := err.(*ServiceError); !ok || serviceErr.Status != http.StatusForbidden {
		t.Fatalf("error = %#v, want forbidden ServiceError", err)
	}
	if _, err := service.SaveCurrentReport(context.Background(), 1, validInput()); err == nil {
		t.Fatal("expected a user outside the operations group to be denied submission")
	}

	addMember(repo, 2, 77, model.UserGroupMemberRoleMember, "成员")
	dashboard, err := service.GetDashboard(context.Background(), 2)
	if err != nil {
		t.Fatal(err)
	}
	if dashboard.GroupName != OperationsGroupName || dashboard.CanViewTeam {
		t.Fatalf("unexpected member dashboard: %#v", dashboard)
	}
	if _, err := service.SaveCurrentReport(context.Background(), 2, validInput()); err != nil {
		t.Fatalf("operations member could not submit: %v", err)
	}
}

func TestSaveCurrentReportUpsertsOneAutomaticallyDeterminedWeek(t *testing.T) {
	service, repo := newTestService()
	addMember(repo, 2, 77, model.UserGroupMemberRoleMember, "成员")

	first, err := service.SaveCurrentReport(context.Background(), 2, ReportInput{
		Completed: "  本周内容  ", Blockers: " 无 ", NextPlan: " 下周内容 ",
	})
	if err != nil {
		t.Fatal(err)
	}
	if first.WeekStart != "2026-10-12" || first.Completed != "本周内容" || first.Blockers != "无" {
		t.Fatalf("unexpected first report: %#v", first)
	}

	second, err := service.SaveCurrentReport(context.Background(), 2, ReportInput{Completed: "更新", Blockers: "无", NextPlan: "继续"})
	if err != nil {
		t.Fatal(err)
	}
	if second.ID != first.ID || second.WeekStart != first.WeekStart || second.Completed != "更新" || len(repo.reports) != 1 {
		t.Fatalf("weekly submission created a duplicate instead of updating: first=%#v second=%#v count=%d", first, second, len(repo.reports))
	}
}

func TestHistoricalReportCanOnlyBeEditedByItsOwner(t *testing.T) {
	service, repo := newTestService()
	addMember(repo, 2, 77, model.UserGroupMemberRoleMember, "成员")
	addMember(repo, 3, 77, model.UserGroupMemberRoleLeader, "负责人")
	repo.reports[90] = model.WeeklyReport{
		ID: 90, GroupID: 77, UserID: 2, WeekStart: "2026-10-05", Completed: "旧内容", Blockers: "无", NextPlan: "旧计划",
	}

	if _, err := service.UpdateReport(context.Background(), 3, 90, validInput()); err == nil {
		t.Fatal("team leader must not edit another member's report")
	} else if serviceErr, ok := err.(*ServiceError); !ok || serviceErr.Status != http.StatusNotFound {
		t.Fatalf("cross-account edit error = %#v, want not found", err)
	}
	updated, err := service.UpdateReport(context.Background(), 2, 90, ReportInput{Completed: "  新内容 ", Blockers: "无", NextPlan: "新计划"})
	if err != nil {
		t.Fatal(err)
	}
	if updated.WeekStart != "2026-10-05" || updated.Completed != "新内容" {
		t.Fatalf("historical report was not updated: %#v", updated)
	}
}

func TestTeamWeekShowsSubmissionStatusAndReportOnlyToGroupLeaders(t *testing.T) {
	service, repo := newTestService()
	addMember(repo, 1, 77, model.UserGroupMemberRoleLeader, "负责人")
	addMember(repo, 2, 77, model.UserGroupMemberRoleMember, "已提交成员")
	addMember(repo, 3, 77, model.UserGroupMemberRoleMember, "未提交成员")
	addMember(repo, 4, 77, model.UserGroupMemberRoleMember, "超过活跃期的成员")
	oldLogin := time.Date(2025, time.January, 1, 0, 0, 0, 0, time.UTC)
	staleMember := repo.members[4]
	staleMember.User.LastLoginAt = &oldLogin
	repo.members[4] = staleMember
	repo.reports[5] = model.WeeklyReport{ID: 5, GroupID: 77, UserID: 2, WeekStart: "2026-10-12", Completed: "完成", Blockers: "无", NextPlan: "计划"}

	teamWeek, err := service.GetTeamWeek(context.Background(), 1, "")
	if err != nil {
		t.Fatal(err)
	}
	if teamWeek.WeekStart != "2026-10-12" || teamWeek.SubmittedCount != 1 || teamWeek.TotalCount != 4 || len(teamWeek.Members) != 4 {
		t.Fatalf("unexpected team submission status: %#v", teamWeek)
	}
	memberReports := map[uint64]TeamMemberReport{}
	for _, member := range teamWeek.Members {
		memberReports[member.UserID] = member
	}
	if !memberReports[2].Submitted || memberReports[2].Report == nil || memberReports[3].Submitted || memberReports[4].Submitted || memberReports[4].Name != "超过活跃期的成员" {
		t.Fatalf("team report content or submission state is missing: %#v", teamWeek.Members)
	}
	if _, err := service.GetTeamWeek(context.Background(), 2, ""); err == nil {
		t.Fatal("ordinary member must not read team reports")
	} else if serviceErr, ok := err.(*ServiceError); !ok || serviceErr.Status != http.StatusForbidden {
		t.Fatalf("member error = %#v, want forbidden", err)
	}
}

func TestTeamWeekRequiresMondayAndRejectsFutureWeeks(t *testing.T) {
	service, repo := newTestService()
	addMember(repo, 1, 77, model.UserGroupMemberRoleLeader, "负责人")
	for _, requested := range []string{"2026-10-14", "2026-10-19", "not-a-date"} {
		if _, err := service.GetTeamWeek(context.Background(), 1, requested); err == nil {
			t.Fatalf("week %q should have been rejected", requested)
		} else if serviceErr, ok := err.(*ServiceError); !ok || serviceErr.Status != http.StatusBadRequest {
			t.Fatalf("week %q error = %#v, want bad request", requested, err)
		}
	}
}

func TestGroupAdminDoesNotInheritTeamReportAccess(t *testing.T) {
	service, repo := newTestService()
	addMember(repo, 4, 77, model.UserGroupMemberRoleGroupAdmin, "组管理员")
	if _, err := service.GetTeamWeek(context.Background(), 4, ""); err == nil {
		t.Fatal("group administrator must not inherit group leader report access")
	} else if serviceErr, ok := err.(*ServiceError); !ok || serviceErr.Status != http.StatusForbidden {
		t.Fatalf("group admin error = %#v, want forbidden", err)
	}
}

func TestReportSectionsAreRequiredAndLengthLimitedByCharacters(t *testing.T) {
	if _, err := validateInput(ReportInput{Completed: "done", Blockers: "", NextPlan: "next"}); err == nil {
		t.Fatal("empty report section must be rejected")
	}
	tooLong := strings.Repeat("字", maxSectionRunes+1)
	if _, err := validateInput(ReportInput{Completed: tooLong, Blockers: "无", NextPlan: "下周"}); err == nil {
		t.Fatal("report section over the character limit must be rejected")
	}
	if _, err := validateInput(ReportInput{Completed: strings.Repeat("字", maxSectionRunes), Blockers: "无", NextPlan: "下周"}); err != nil {
		t.Fatalf("5000 characters should be accepted: %v", err)
	}
}
