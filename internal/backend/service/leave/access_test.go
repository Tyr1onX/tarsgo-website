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

func TestHasLeaveAccessRequiresManualGrantOrDatedApproval(t *testing.T) {
	db, mock := newLeaveAccessMockGorm(t)
	pattern := regexp.QuoteMeta("SELECT count(*) FROM `leave_access_requests` WHERE user_id = ? AND (status = ? OR (status IN (?,?) AND start_at IS NOT NULL AND end_at IS NOT NULL))")
	for _, tc := range []struct {
		user    uint64
		count   int64
		allowed bool
	}{{22, 0, false}, {23, 1, true}} {
		mock.ExpectQuery(pattern).WithArgs(tc.user, model.LeaveAccessGranted, model.LeaveAccessPending, model.LeaveAccessApproved).
			WillReturnRows(sqlmock.NewRows([]string{"count(*)"}).AddRow(tc.count))
		allowed, err := NewService(db).HasLeaveAccess(context.Background(), tc.user)
		if err != nil || allowed != tc.allowed {
			t.Fatalf("user %d access=%v error=%v", tc.user, allowed, err)
		}
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

func TestRequestLeaveAccessRequiresGrantedStatusAndLocksTimeRange(t *testing.T) {
	db, mock := newLeaveAccessMockGorm(t)
	now := time.Date(2026, 10, 19, 2, 0, 0, 0, time.UTC).In(shanghai)
	start, end := now, now.Add(time.Hour)
	mock.ExpectBegin()
	mock.ExpectExec("UPDATE `leave_access_requests` SET .* WHERE user_id = \\? AND status = \\?").
		WithArgs(end, now, nil, nil, start, model.LeaveAccessPending, uint64(22), model.LeaveAccessGranted).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `leave_access_requests` WHERE user_id = ? ORDER BY `leave_access_requests`.`id` LIMIT ?")).
		WithArgs(uint64(22), 1).WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "status", "start_at", "end_at", "requested_at"}).
		AddRow(9, 22, model.LeaveAccessPending, start, end, now))
	service := NewService(db)
	service.now = func() time.Time { return now }
	state, err := service.RequestLeaveAccess(context.Background(), 22, RequestInput{StartAt: "2026-10-19T10:00", EndAt: "2026-10-19T11:00"})
	if err != nil || state == nil || state.Status != model.LeaveAccessPending || state.StartAt == nil || !state.StartAt.Equal(start) {
		t.Fatalf("new leave request = %#v, error=%v", state, err)
	}
}

func TestReviewLeaveAccessRequestRecordsAdminAndApproval(t *testing.T) {
	db, mock := newLeaveAccessMockGorm(t)
	requestedAt := time.Date(2026, 10, 18, 10, 0, 0, 0, time.UTC)
	reviewedAt := time.Date(2026, 10, 19, 2, 5, 0, 0, time.UTC).In(shanghai)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `leave_access_requests` WHERE id = ? ORDER BY `leave_access_requests`.`id` LIMIT ?")).
		WithArgs(uint64(8), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "status", "start_at", "end_at", "requested_at", "reviewed_at", "reviewed_by"}).
			AddRow(8, 22, model.LeaveAccessPending, requestedAt, requestedAt.Add(time.Hour), requestedAt, nil, nil))
	mock.ExpectBegin()
	mock.ExpectExec("UPDATE `leave_access_requests` SET .* WHERE id = \\? AND status = \\? AND start_at IS NOT NULL AND end_at IS NOT NULL").
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
	mock.ExpectQuery("SELECT requests\\.id, requests\\.user_id, COALESCE\\(NULLIF\\(TRIM\\(users\\.real_name\\), ''\\), '姓名待核实'\\) AS user_name, users\\.email, requests\\.status, requests\\.start_at, requests\\.end_at, requests\\.requested_at FROM leave_access_requests AS requests JOIN users ON users\\.id = requests\\.user_id WHERE requests\\.status = \\? AND requests\\.start_at IS NOT NULL AND requests\\.end_at IS NOT NULL ORDER BY requests\\.requested_at ASC, requests\\.id ASC").
		WithArgs(model.LeaveAccessPending).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "user_name", "email", "status", "requested_at"}).
			AddRow(8, 22, "成员甲", "member@example.com", model.LeaveAccessPending, time.Date(2026, 10, 18, 10, 0, 0, 0, time.UTC)))

	rows, err := NewService(db).ListPendingLeaveAccessRequests(context.Background())
	if err != nil || len(rows) != 1 || rows[0].UserName != "成员甲" || rows[0].Email != "member@example.com" {
		t.Fatalf("pending requests = %#v, error=%v", rows, err)
	}
}

func TestOneTimeLeaveGenerationConsumesApprovalOnce(t *testing.T) {
	db, mock := newLeaveAccessMockGorm(t)
	now := time.Date(2026, 11, 14, 10, 0, 0, 0, time.UTC).In(shanghai)
	end := now.Add(time.Hour)
	service := NewService(db)
	service.now = func() time.Time { return now }

	mock.ExpectBegin()
	mock.ExpectExec("UPDATE `leave_access_requests` SET `status`=\\? WHERE user_id = \\? AND status = \\? AND start_at = \\? AND end_at = \\?").
		WithArgs(model.LeaveAccessUsed, uint64(22), model.LeaveAccessApproved, now, end).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO `daily_leave_document_requests`").
		WithArgs(uint64(45), uint64(22), "download", "first_generation", DailyLeaveVersion, false, now).
		WillReturnResult(sqlmock.NewResult(100, 1))
	mock.ExpectCommit()

	if err := service.consumeApprovedLeave(context.Background(), 22, 45, now, end, false); err != nil {
		t.Fatalf("first approved download: %v", err)
	}

	mock.ExpectBegin()
	mock.ExpectExec("UPDATE `leave_access_requests` SET `status`=\\? WHERE user_id = \\? AND status = \\? AND start_at = \\? AND end_at = \\?").
		WithArgs(model.LeaveAccessUsed, uint64(22), model.LeaveAccessApproved, now, end).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectRollback()

	if err := service.consumeApprovedLeave(context.Background(), 22, 45, now, end, false); err == nil {
		t.Fatal("second generation must be rejected without another audit record")
	}
}

func TestSchoolSummarySeparatesActionableAndUnreadCounts(t *testing.T) {
	for _, canReview := range []bool{false, true} {
		db, mock := newLeaveAccessMockGorm(t)
		if canReview {
			mock.ExpectQuery(regexp.QuoteMeta("SELECT count(*) FROM `leave_access_requests` WHERE status = ? AND start_at IS NOT NULL AND end_at IS NOT NULL")).
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

// The status endpoint must never transfer the potentially 15 MiB signed file.
func TestRunViewLoadsMetadataWithoutSignedFileContent(t *testing.T) {
	db, mock := newLeaveAccessMockGorm(t)
	now := time.Date(2026, 11, 3, 2, 0, 0, 0, time.UTC).In(shanghai)
	expires := now.Add(time.Hour)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `school_leave_requests` WHERE run_id = ? AND status = ? ORDER BY start_at, end_at, student_id_snapshot, id")).
		WithArgs(uint64(8), model.LeaveStatusIncluded).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "start_at", "end_at", "name_snapshot", "student_id_snapshot"}).AddRow(1, 22, now, expires, "测试成员", "12345678"))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT `group_index`,`original_filename`,`expires_at` FROM `school_leave_group_results` WHERE run_id = ? AND expires_at > ?")).
		WithArgs(uint64(8), now).
		WillReturnRows(sqlmock.NewRows([]string{"group_index", "original_filename", "expires_at"}).AddRow(1, "signed.pdf", expires))
	service := NewService(db)
	service.now = func() time.Time { return now }
	view, err := service.runView(context.Background(), model.SchoolLeaveRun{ID: 8, Status: model.LeaveRunCompleted})
	if err != nil {
		t.Fatal(err)
	}
	if view.RequestCount != 1 || view.MemberCount != 1 || !view.DocumentReady || len(view.Groups) != 1 {
		t.Fatalf("run metadata changed: %#v", view)
	}
	result := view.Groups[0].Result
	if !result.Available || result.Filename != "signed.pdf" || result.ExpiresAt == nil || !result.ExpiresAt.Equal(expires) {
		t.Fatalf("result metadata changed: %#v", result)
	}
}

func TestLatestLeaveStatusIsOwnedBoundedAndMetadataOnly(t *testing.T) {
	db, mock := newLeaveAccessMockGorm(t)
	now := time.Date(2026, 11, 3, 0, 0, 0, 0, time.UTC)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT `status`,`created_at` FROM `school_leave_requests` WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?")).WithArgs(uint64(22), 1).
		WillReturnRows(sqlmock.NewRows([]string{"status", "created_at"}).AddRow(model.LeaveStatusPending, now))
	result, err := NewService(db).LatestRequestStatus(context.Background(), 22)
	if err != nil || result == nil || result.Status != model.LeaveStatusPending || !result.CreatedAt.Equal(now) {
		t.Fatalf("latest=%#v err=%v", result, err)
	}
}
