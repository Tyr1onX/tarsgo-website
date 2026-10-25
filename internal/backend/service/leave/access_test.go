package leave

import (
	"context"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"tarsgo-backend/model"
)

func newLeaveAccessMockGorm(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
	t.Helper()
	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true})
	if err != nil {
		_ = sqlDB.Close()
		t.Fatalf("open GORM over SQL mock: %v", err)
	}
	t.Cleanup(func() {
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("unmet SQL expectations: %v", err)
		}
		_ = sqlDB.Close()
	})
	return db, mock
}

func TestHasLeaveAccessRequiresAnApprovedRequest(t *testing.T) {
	db, mock := newLeaveAccessMockGorm(t)
	pattern := regexp.QuoteMeta("SELECT count(*) FROM `leave_access_requests` WHERE user_id = ? AND status = ?")
	mock.ExpectQuery(pattern).WithArgs(uint64(22), model.LeaveAccessApproved).
		WillReturnRows(sqlmock.NewRows([]string{"count(*)"}).AddRow(0))
	mock.ExpectQuery(pattern).WithArgs(uint64(23), model.LeaveAccessApproved).
		WillReturnRows(sqlmock.NewRows([]string{"count(*)"}).AddRow(1))

	service := NewService(db)
	allowed, err := service.HasLeaveAccess(context.Background(), 22)
	if err != nil || allowed {
		t.Fatalf("unapproved member access = %v, error=%v; want false", allowed, err)
	}
	allowed, err = service.HasLeaveAccess(context.Background(), 23)
	if err != nil || !allowed {
		t.Fatalf("approved member access = %v, error=%v; want true", allowed, err)
	}
}

func TestLeaveAccessStateDefaultsToNotRequested(t *testing.T) {
	db, mock := newLeaveAccessMockGorm(t)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `leave_access_requests` WHERE user_id = ? ORDER BY `leave_access_requests`.`id` LIMIT ?")).
		WithArgs(uint64(22), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "status", "requested_at", "reviewed_at", "reviewed_by"}))

	state, err := NewService(db).LeaveAccessState(context.Background(), 22)
	if err != nil || state == nil || state.Status != LeaveAccessNotRequested {
		t.Fatalf("missing access request state = %#v, error=%v", state, err)
	}
}

func TestRequestLeaveAccessCreatesPendingRequest(t *testing.T) {
	db, mock := newLeaveAccessMockGorm(t)
	now := time.Date(2026, 10, 19, 2, 0, 0, 0, time.UTC).In(shanghai)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `leave_access_requests` WHERE user_id = ? ORDER BY `leave_access_requests`.`id` LIMIT ?")).
		WithArgs(uint64(22), 1).WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "status", "requested_at", "reviewed_at", "reviewed_by"}))
	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO `leave_access_requests`").
		WithArgs(uint64(22), model.LeaveAccessPending, now, nil, nil).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	service := NewService(db)
	service.now = func() time.Time { return now }
	state, err := service.RequestLeaveAccess(context.Background(), 22)
	if err != nil || state == nil || state.Status != model.LeaveAccessPending || state.RequestedAt == nil || !state.RequestedAt.Equal(now) {
		t.Fatalf("new access request = %#v, error=%v", state, err)
	}
}

func TestReviewLeaveAccessRequestRecordsAdminAndApproval(t *testing.T) {
	db, mock := newLeaveAccessMockGorm(t)
	requestedAt := time.Date(2026, 10, 18, 10, 0, 0, 0, time.UTC)
	reviewedAt := time.Date(2026, 10, 19, 2, 5, 0, 0, time.UTC).In(shanghai)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `leave_access_requests` WHERE id = ? ORDER BY `leave_access_requests`.`id` LIMIT ?")).
		WithArgs(uint64(8), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "status", "requested_at", "reviewed_at", "reviewed_by"}).
			AddRow(8, 22, model.LeaveAccessPending, requestedAt, nil, nil))
	mock.ExpectBegin()
	mock.ExpectExec("UPDATE `leave_access_requests` SET .* WHERE id = \\? AND status = \\?").
		WithArgs(reviewedAt, uint64(5), model.LeaveAccessApproved, uint64(8), model.LeaveAccessPending).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	service := NewService(db)
	service.now = func() time.Time { return reviewedAt }
	state, err := service.ReviewLeaveAccessRequest(context.Background(), 8, 5, model.LeaveAccessApproved)
	if err != nil || state == nil || state.Status != model.LeaveAccessApproved || state.ReviewedAt == nil || !state.ReviewedAt.Equal(reviewedAt) {
		t.Fatalf("reviewed access request = %#v, error=%v", state, err)
	}
}

func TestListPendingLeaveAccessRequestsIncludesOnlyReviewIdentity(t *testing.T) {
	db, mock := newLeaveAccessMockGorm(t)
	mock.ExpectQuery("SELECT requests\\.id, requests\\.user_id, users\\.name AS user_name, users\\.email, requests\\.status, requests\\.requested_at FROM leave_access_requests AS requests JOIN users ON users\\.id = requests\\.user_id WHERE requests\\.status = \\? ORDER BY requests\\.requested_at ASC, requests\\.id ASC").
		WithArgs(model.LeaveAccessPending).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "user_name", "email", "status", "requested_at"}).
			AddRow(8, 22, "成员甲", "member@example.com", model.LeaveAccessPending, time.Date(2026, 10, 18, 10, 0, 0, 0, time.UTC)))

	rows, err := NewService(db).ListPendingLeaveAccessRequests(context.Background())
	if err != nil || len(rows) != 1 || rows[0].UserName != "成员甲" || rows[0].Email != "member@example.com" {
		t.Fatalf("pending requests = %#v, error=%v", rows, err)
	}
}

func TestSchoolSummarySeparatesActionableAndUnreadCounts(t *testing.T) {
	for _, canReview := range []bool{false, true} {
		db, mock := newLeaveAccessMockGorm(t)
		if canReview {
			mock.ExpectQuery(regexp.QuoteMeta("SELECT count(*) FROM `leave_access_requests` WHERE status = ?")).
				WithArgs(model.LeaveAccessPending).WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(3))
		}
		mock.ExpectQuery(regexp.QuoteMeta("SELECT count(*) FROM `school_leave_requests` WHERE status = ?")).
			WithArgs(model.LeaveStatusPending).WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(4))
		mock.ExpectQuery(regexp.QuoteMeta("SELECT count(*) FROM `school_leave_runs` WHERE status = ?")).
			WithArgs(model.LeaveRunAwaitingReturn).WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))
		mock.ExpectQuery("SELECT count\\(\\*\\) FROM `school_leave_requests` WHERE NOT EXISTS").
			WithArgs(uint64(80)).WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(8))
		mock.ExpectQuery("SELECT count\\(\\*\\) FROM `daily_leave_entries` WHERE NOT EXISTS").
			WithArgs(uint64(80)).WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(5))
		service := NewService(db)
		summary, err := service.Summary(context.Background(), 80, canReview)
		if err != nil {
			t.Fatalf("Summary(canReview=%t): %v", canReview, err)
		}
		wantApproval := int64(0)
		if canReview {
			wantApproval = 3
		}
		if summary.PendingApprovalCount != wantApproval || summary.TodoCount != 6 || summary.ActionableCount != wantApproval+6 || summary.UnreadCount != 13 {
			t.Fatalf("summary(canReview=%t) = %#v", canReview, summary)
		}
	}
}
