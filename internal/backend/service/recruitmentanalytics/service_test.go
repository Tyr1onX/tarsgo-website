package recruitmentanalytics

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"reflect"
	"strings"
	"testing"
	"time"
)

type fakeRepository struct {
	forms         []cohortRow
	registrations []registrationAggregate
	groups        []groupAggregate
	members       []memberAggregate
	err           error
	formCalls     int
	statsCalls    int
}

func (r *fakeRepository) ListCohorts(context.Context) ([]cohortRow, error) {
	r.formCalls++
	return r.forms, r.err
}

func (r *fakeRepository) RegistrationAggregates(context.Context, []uint64) ([]registrationAggregate, error) {
	r.statsCalls++
	return r.registrations, r.err
}

func (r *fakeRepository) GroupAggregates(context.Context, []uint64) ([]groupAggregate, error) {
	return r.groups, r.err
}

func (r *fakeRepository) MatchedFormalMembers(context.Context, []uint64) ([]memberAggregate, error) {
	return r.members, r.err
}

func TestGetReportRequiresSuperAdminBeforeReadingData(t *testing.T) {
	repo := &fakeRepository{}
	service := newService(repo)
	for _, role := range []string{"user", "admin", ""} {
		_, err := service.GetReport(context.Background(), role)
		var serviceErr *ServiceError
		if !errors.As(err, &serviceErr) || serviceErr.Status != http.StatusForbidden {
			t.Fatalf("role %q should be forbidden, got %v", role, err)
		}
	}
	if repo.formCalls != 0 || repo.statsCalls != 0 {
		t.Fatalf("unauthorized access queried analytics data: forms=%d stats=%d", repo.formCalls, repo.statsCalls)
	}
}

func TestGetReportAggregatesIndependentFormsAndKeepsStatusMeaning(t *testing.T) {
	created1 := time.Date(2024, 9, 1, 0, 0, 0, 0, time.UTC)
	created2 := time.Date(2026, 4, 18, 0, 0, 0, 0, time.UTC)
	repo := &fakeRepository{
		forms: []cohortRow{
			{ID: 10, Title: "2024 夏季招新", CreatedAt: created1},
			{ID: 11, Title: "2026 赛季纳新", CreatedAt: created2},
		},
		registrations: []registrationAggregate{
			{FormID: 10, Total: 4, Admitted: 1, Rejected: 1, Withdrawn: 1, Pending: 1},
			{FormID: 11, Total: 3, Admitted: 0, Rejected: 1, Withdrawn: 0, Pending: 1},
		},
		groups: []groupAggregate{
			{FormID: 10, Name: "机械组", Count: 3},
			{FormID: 10, Name: "视觉组", Count: 2},
			{FormID: 11, Name: "运营组", Count: 1},
		},
		members: []memberAggregate{{FormID: 10, Count: 1}},
	}
	service := newService(repo)
	service.now = func() time.Time { return time.Date(2026, 10, 14, 2, 0, 0, 0, time.FixedZone("CST", 8*60*60)) }

	report, err := service.GetReport(context.Background(), RoleNameSuperAdmin)
	if err != nil {
		t.Fatalf("GetReport returned error: %v", err)
	}
	if report.CohortCount != 2 || !report.HasCohorts || !report.HasRecords || report.TotalRegistrations != 7 || report.TotalAdmitted != 1 {
		t.Fatalf("unexpected overview totals: %#v", report)
	}
	if !report.GeneratedAt.Equal(time.Date(2026, 10, 13, 18, 0, 0, 0, time.UTC)) {
		t.Fatalf("generatedAt should be UTC-normalized, got %s", report.GeneratedAt)
	}
	if len(report.Cohorts) != 2 || report.Cohorts[0].FormID != 10 || report.Cohorts[1].FormID != 11 {
		t.Fatalf("cohorts must stay independent and ordered: %#v", report.Cohorts)
	}
	first := report.Cohorts[0]
	if first.RegistrationCount != 4 || first.AdmittedCount != 1 || first.RejectedCount != 1 || first.WithdrawnCount != 1 || first.PendingCount != 1 || first.OtherStatusCount != 0 {
		t.Fatalf("unexpected first-form metrics: %#v", first)
	}
	if first.AdmissionRate == nil || *first.AdmissionRate != 25 || first.MatchedFormalMemberCount != 1 {
		t.Fatalf("admission and membership metrics should remain distinct: %#v", first)
	}
	if !reflect.DeepEqual(first.Groups, []GroupInterest{{Name: "机械组", RegistrationCount: 3}, {Name: "视觉组", RegistrationCount: 2}}) {
		t.Fatalf("group intentions should be sorted by count: %#v", first.Groups)
	}
	second := report.Cohorts[1]
	if second.AdmissionRate == nil || *second.AdmissionRate != 0 || second.MatchedFormalMemberCount != 0 {
		t.Fatalf("zero admission and no matched membership should remain explicit: %#v", second)
	}
	if report.CoverageStart == nil || !report.CoverageStart.Equal(created1) || report.CoverageEnd == nil || !report.CoverageEnd.Equal(created2) {
		t.Fatalf("unexpected actual form coverage: %#v – %#v", report.CoverageStart, report.CoverageEnd)
	}
	encoded, err := json.Marshal(report)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"contactName", "contactEmail", "contactPhone", "formData", "userId", "email", "phone"} {
		if strings.Contains(string(encoded), forbidden) {
			t.Fatalf("analytics response exposes personal-data field %q: %s", forbidden, encoded)
		}
	}
}

func TestGetReportMarksEmptyFormsAsNoDataAndDoesNotInventCounts(t *testing.T) {
	created := time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)
	repo := &fakeRepository{forms: []cohortRow{{ID: 8, Title: "2026 空届", CreatedAt: created}}}
	report, err := newService(repo).GetReport(context.Background(), RoleNameSuperAdmin)
	if err != nil {
		t.Fatalf("GetReport returned error: %v", err)
	}
	if !report.HasCohorts || report.CohortCount != 1 || report.HasRecords || report.TotalRegistrations != 0 || report.TotalAdmitted != 0 {
		t.Fatalf("unexpected empty report state: %#v", report)
	}
	cohort := report.Cohorts[0]
	if cohort.HasData || cohort.RegistrationCount != 0 || cohort.AdmissionRate != nil || cohort.Groups == nil || len(cohort.Groups) != 0 {
		t.Fatalf("empty cohort must be distinguishable from observed zero rates: %#v", cohort)
	}
}

func TestGetReportWithNoCohortsReturnsAnEmptySnapshot(t *testing.T) {
	repo := &fakeRepository{}
	report, err := newService(repo).GetReport(context.Background(), RoleNameSuperAdmin)
	if err != nil {
		t.Fatalf("GetReport returned error: %v", err)
	}
	if report.HasCohorts || report.HasRecords || report.CohortCount != 0 || len(report.Cohorts) != 0 || repo.statsCalls != 0 {
		t.Fatalf("empty database should not invent cohorts or issue unnecessary queries: %#v calls=%d", report, repo.statsCalls)
	}
}

func TestGetReportDoesNotTreatUnknownHistoricalStateAsPending(t *testing.T) {
	repo := &fakeRepository{
		forms:         []cohortRow{{ID: 9, Title: "旧届"}},
		registrations: []registrationAggregate{{FormID: 9, Total: 3, Admitted: 1, Rejected: 1, Pending: 0}},
	}
	report, err := newService(repo).GetReport(context.Background(), RoleNameSuperAdmin)
	if err != nil {
		t.Fatalf("GetReport returned error: %v", err)
	}
	if report.Cohorts[0].OtherStatusCount != 1 || report.Cohorts[0].PendingCount != 0 {
		t.Fatalf("unrecognized historical state must not be reported as pending: %#v", report.Cohorts[0])
	}
}
