package handler

import (
	"context"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/service/weeklyreport"
)

type weeklyReportServiceStub struct {
	dashboardFn func(context.Context, uint64, string) (*weeklyreport.Dashboard, error)
	saveFn      func(context.Context, uint64, weeklyreport.ReportInput) (*weeklyreport.Report, error)
	updateFn    func(context.Context, uint64, uint64, weeklyreport.ReportInput) (*weeklyreport.Report, error)
	teamFn      func(context.Context, uint64, string, uint64, string) (*weeklyreport.TeamWeek, error)
}

func (s weeklyReportServiceStub) GetDashboard(ctx context.Context, userID uint64, roleName string) (*weeklyreport.Dashboard, error) {
	return s.dashboardFn(ctx, userID, roleName)
}

func (s weeklyReportServiceStub) SaveCurrentReport(ctx context.Context, userID uint64, input weeklyreport.ReportInput) (*weeklyreport.Report, error) {
	return s.saveFn(ctx, userID, input)
}

func (s weeklyReportServiceStub) UpdateReport(ctx context.Context, userID, reportID uint64, input weeklyreport.ReportInput) (*weeklyreport.Report, error) {
	return s.updateFn(ctx, userID, reportID, input)
}

func (s weeklyReportServiceStub) GetTeamWeek(ctx context.Context, userID uint64, roleName string, groupID uint64, weekStart string) (*weeklyreport.TeamWeek, error) {
	return s.teamFn(ctx, userID, roleName, groupID, weekStart)
}

func TestWeeklyReportHandlerSaveCurrentUsesAuthenticatedUserAndSections(t *testing.T) {
	handler := NewWeeklyReportHandler(weeklyReportServiceStub{
		saveFn: func(_ context.Context, userID uint64, input weeklyreport.ReportInput) (*weeklyreport.Report, error) {
			if userID != 1 || input.Completed != "完成" || input.Gains != "收获" || input.Blockers != "无" || input.NextPlan != "计划" {
				t.Fatalf("unexpected save request: user=%d input=%#v", userID, input)
			}
			return &weeklyreport.Report{ID: 7, WeekStart: "2026-10-12"}, nil
		},
	})
	recorder, ctx := newJSONContext(t, http.MethodPut, "/api/weekly-reports/current", map[string]any{
		"completed": "完成", "gains": "收获", "blockers": "无", "nextPlan": "计划",
	})
	setAdminSessionUser(ctx)

	handler.SaveCurrent(ctx)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestWeeklyReportHandlerTeamPassesSelectedWeek(t *testing.T) {
	handler := NewWeeklyReportHandler(weeklyReportServiceStub{
		teamFn: func(_ context.Context, userID uint64, roleName string, groupID uint64, weekStart string) (*weeklyreport.TeamWeek, error) {
			if userID != 1 || roleName != "admin" || groupID != 7 || weekStart != "2026-10-12" {
				t.Fatalf("unexpected team query: user=%d role=%q group=%d week=%q", userID, roleName, groupID, weekStart)
			}
			return &weeklyreport.TeamWeek{WeekStart: weekStart, SubmittedCount: 1, TotalCount: 2}, nil
		},
	})
	recorder, ctx := newPlainContext(http.MethodGet, "/api/weekly-reports/team?groupId=7&weekStart=2026-10-12")
	setAdminSessionUser(ctx)

	handler.GetTeamWeek(ctx)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestWeeklyReportHandlerRejectsInvalidReportIDs(t *testing.T) {
	called := false
	handler := NewWeeklyReportHandler(weeklyReportServiceStub{
		updateFn: func(context.Context, uint64, uint64, weeklyreport.ReportInput) (*weeklyreport.Report, error) {
			called = true
			return nil, nil
		},
	})
	recorder, ctx := newJSONContext(t, http.MethodPut, "/api/weekly-reports/invalid", map[string]any{
		"completed": "完成", "blockers": "无", "nextPlan": "计划",
	})
	ctx.Params = gin.Params{{Key: "id", Value: "invalid"}}
	setAdminSessionUser(ctx)

	handler.Update(ctx)
	if recorder.Code != http.StatusBadRequest || called {
		t.Fatalf("invalid report id status=%d called=%t body=%s", recorder.Code, called, recorder.Body.String())
	}
}
