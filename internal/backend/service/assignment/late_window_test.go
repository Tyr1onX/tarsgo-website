package assignment

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"tarsgo-backend/model"
)

func TestFirstSubmissionAfterDeadlineRequiresMemberWindow(t *testing.T) {
	now := time.Date(2026, 11, 16, 14, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		name   string
		window *time.Time
		want   int
	}{
		{name: "no window", want: http.StatusConflict},
		{name: "expired window", window: timePointer(now.Add(-time.Minute)), want: http.StatusConflict},
		{name: "active window", window: timePointer(now.Add(time.Hour)), want: http.StatusBadRequest},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db, mock := newAssignmentMockGorm(t)
			expectAssignmentGroupIDs(mock, 22, 41)
			mock.ExpectBegin()
			mock.ExpectQuery("SELECT \\* FROM `assignments` WHERE id = \\? AND group_id IN .*").
				WithArgs(uint64(91), uint64(41), model.AssignmentPublicationPublished, 1).
				WillReturnRows(sqlmock.NewRows([]string{"id", "group_id", "due_at", "is_group_wide", "publication_status"}).
					AddRow(91, 41, storeUTCWall(now.Add(-time.Hour)), true, model.AssignmentPublicationPublished))
			expectAssignmentGroupIDs(mock, 22, 41)
			rows := sqlmock.NewRows([]string{"assignment_id", "user_id", "due_at"})
			if tc.window != nil {
				rows.AddRow(91, 22, storeUTCWall(*tc.window))
			}
			mock.ExpectQuery("SELECT \\* FROM `assignment_late_windows` WHERE assignment_id = \\? AND user_id = \\?").
				WithArgs(uint64(91), uint64(22), 1).WillReturnRows(rows)
			mock.ExpectRollback()
			_, err := (&Service{db: db, now: func() time.Time { return now }}).
				Submit(context.Background(), Actor{ID: 22, RoleName: model.RoleNameUser}, 91, nil)
			assertAssignmentStatus(t, err, tc.want)
		})
	}
}

func TestLateWindowRequiresAuthorizedAssignmentGroup(t *testing.T) {
	db, mock := newAssignmentMockGorm(t)
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT \\* FROM `assignments` WHERE `assignments`\\.`id` = \\?").
		WithArgs(uint64(91), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "group_id", "publication_status"}).
			AddRow(91, 42, model.AssignmentPublicationPublished))
	expectAssignmentGroupIDs(mock, 8, 41)
	mock.ExpectRollback()
	_, err := (&Service{db: db, now: time.Now}).SetLateWindow(
		context.Background(), Actor{ID: 8, RoleName: model.RoleNameAdmin}, 91, []uint64{22}, time.Now().Add(time.Hour))
	assertAssignmentStatus(t, err, http.StatusForbidden)
}

func TestLateWindowCannotBeGrantedByMember(t *testing.T) {
	_, err := (&Service{}).SetLateWindow(context.Background(), Actor{ID: 22, RoleName: model.RoleNameUser}, 91, []uint64{22}, time.Now().Add(time.Hour))
	assertAssignmentStatus(t, err, http.StatusForbidden)
}

func TestMemberStatusUsesExtensionWithoutChangingOriginalLateFlag(t *testing.T) {
	now := time.Date(2026, 11, 16, 14, 0, 0, 0, time.UTC)
	original := now.Add(-time.Hour)
	extended := now.Add(time.Hour)
	item := model.Assignment{DueAt: storeUTCWall(original)}
	view := memberAssignmentView(item, "机械组", nil, now, &extended)
	if view.Status != "pending" || view.LateDueAt == nil || !view.LateDueAt.Equal(extended) {
		t.Fatalf("unexpected extended assignment: %#v", view)
	}
	view = memberAssignmentView(item, "机械组", []SubmissionView{{Status: "submitted", IsLate: true}}, now, &extended)
	if !view.IsLate || view.Status != "submitted" || view.LatestSubmission == nil || !view.LatestSubmission.IsLate {
		t.Fatalf("original late flag was lost: %#v", view)
	}
}

func timePointer(value time.Time) *time.Time { return &value }
