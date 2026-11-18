package assignment

import (
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"

	"tarsgo-backend/model"
)

func expectCohortOptions(mock sqlmock.Sqlmock, groupID uint64) {
	rows := sqlmock.NewRows([]string{"form_id", "title", "user_id", "real_name"}).
		AddRow(12, "2026 秋季", 16, "成员B").
		AddRow(12, "2026 秋季", 18, "成员C").
		AddRow(11, "2025 秋季", 15, "成员A").
		AddRow(11, "2025 秋季", 16, "成员B")
	mock.ExpectQuery("(?s)SELECT r.form_id, f.title, u.id AS user_id, u.real_name FROM registrations AS r.*u.team_identity_status <> \\?.*ORDER BY").
		WithArgs(groupID, model.RecruitmentStatusAdmitted, model.UserGroupStatusActive, model.UserStatusEnabled, model.RoleNameUser, model.TeamIdentityFormerMember).
		WillReturnRows(rows)
}

func TestResolveCohortTargetsDeduplicatesOverlappingCohorts(t *testing.T) {
	db, mock := newAssignmentMockGorm(t)
	expectCohortOptions(mock, 42)
	service := &Service{db: db}
	ids, err := service.resolveCohortTargetsWithDB(db, 42, []uint64{11, 12})
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 3 || ids[0] != 15 || ids[1] != 16 || ids[2] != 18 {
		t.Fatalf("deduplicated cohort recipients = %v; want [15 16 18]", ids)
	}
}

func TestResolveCohortTargetsRejectsUnknownForm(t *testing.T) {
	db, mock := newAssignmentMockGorm(t)
	expectCohortOptions(mock, 42)
	service := &Service{db: db}
	_, err := service.resolveCohortTargetsWithDB(db, 42, []uint64{11, 999})
	assertAssignmentStatus(t, err, 400)
}

func TestNormalizeCohortCreateInput(t *testing.T) {
	now := time.Date(2026, 11, 18, 10, 0, 0, 0, time.UTC)
	input := CreateInput{
		GroupID: 42, Title: "零件设计", Description: "提交图纸",
		DueAt: now.Add(time.Hour), CohortFormIDs: []uint64{12, 11, 12},
	}
	got, err := normalizeCreateInput(input, now)
	if err != nil || len(got.CohortFormIDs) != 2 || got.CohortFormIDs[0] != 11 || got.CohortFormIDs[1] != 12 {
		t.Fatalf("normalized cohorts = %v, err=%v", got.CohortFormIDs, err)
	}

	input.IsGroupWide = true
	if _, err := normalizeCreateInput(input, now); err == nil {
		t.Fatal("cohort publication must not use dynamic group-wide eligibility")
	}
	input.IsGroupWide = false
	input.TargetUserIDs = []uint64{15}
	if _, err := normalizeCreateInput(input, now); err == nil {
		t.Fatal("cohort publication must not mix manual targets")
	}
}