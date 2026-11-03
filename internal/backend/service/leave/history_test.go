package leave

import (
	"context"
	"fmt"
	"reflect"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"tarsgo-backend/model"
)

func TestLeaveHistoryBatchesRetainOrderWithoutBlobReads(t *testing.T) {
	for _, count := range []int{0, 1, 101} {
		t.Run(fmt.Sprint(count), func(t *testing.T) {
			db, mock := newLeaveAccessMockGorm(t)
			rows := sqlmock.NewRows([]string{"id", "status"})
			for i := count; i > 0; i-- {
				rows.AddRow(i, model.LeaveRunReady)
			}
			mock.ExpectQuery("SELECT \\* FROM `school_leave_runs` ORDER BY collected_at DESC, id DESC").WillReturnRows(rows)
			for start := 0; start < count; start += 100 {
				mock.ExpectQuery("SELECT \\* FROM `school_leave_requests` WHERE run_id IN").WillReturnRows(sqlmock.NewRows([]string{"id"}))
				mock.ExpectQuery("SELECT `run_id`,`group_index`,`original_filename`,`expires_at` FROM `school_leave_group_results` WHERE run_id IN").WillReturnRows(sqlmock.NewRows([]string{"run_id"}))
			}
			views, err := NewService(db).ListRuns(context.Background())
			if err != nil || len(views) != count {
				t.Fatalf("len=%d err=%v", len(views), err)
			}
			for i, view := range views {
				if view.ID != uint64(count-i) || view.Groups == nil || view.RequestCount != 0 {
					t.Fatalf("invalid history: %#v", view)
				}
			}
		})
	}
}

func TestSchoolRunGroupingAndMaterialAssociation(t *testing.T) {
	now := time.Date(2026, 11, 3, 0, 0, 0, 0, time.UTC)
	requests := []model.SchoolLeaveRequest{
		{UserID: 2, StartAt: now.Add(time.Hour), EndAt: now.Add(2 * time.Hour), NameSnapshot: "乙"},
		{UserID: 1, StartAt: now, EndAt: now.Add(time.Hour), NameSnapshot: "甲", StudentIDSnapshot: "12345678"},
		{UserID: 3, StartAt: now, EndAt: now.Add(time.Hour), NameSnapshot: "丙", StudentIDSnapshot: "12345679"},
	}
	expires := now.Add(24 * time.Hour)
	view := schoolRunView(model.SchoolLeaveRun{ID: 1, Status: model.LeaveRunCompleted}, requests, []model.SchoolLeaveGroupResult{{GroupIndex: 2, OriginalFilename: "second.pdf", ExpiresAt: expires}, {GroupIndex: 99, OriginalFilename: "invalid.pdf"}})
	if view.RequestCount != 3 || view.MemberCount != 3 || len(view.Groups) != 2 || view.Groups[0].Count != 2 || view.Groups[0].Result.Available || !view.Groups[1].Result.Available || view.Groups[1].Result.Filename != "second.pdf" {
		t.Fatalf("invalid grouped view: %#v", view)
	}
	if !reflect.DeepEqual([]uint64{view.Groups[0].Members[0].UserID, view.Groups[0].Members[1].UserID}, []uint64{1, 3}) {
		t.Fatal("member order changed")
	}
}
