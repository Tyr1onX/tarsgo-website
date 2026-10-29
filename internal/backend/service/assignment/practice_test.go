package assignment

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"tarsgo-backend/model"
)

func TestPracticeInputRejectsInvalidCapacityDeadlineAndDescription(t *testing.T) {
	now := time.Date(2026, 10, 29, 0, 0, 0, 0, time.UTC)
	good := PracticeInput{GroupID: 1, Title: "导航探索", Description: "实践任务", Capacity: 3, DueAt: now.Add(48 * time.Hour)}
	for _, edit := range []func(*PracticeInput){
		func(i *PracticeInput) { i.GroupID = 0 },
		func(i *PracticeInput) { i.Capacity = 0 },
		func(i *PracticeInput) { i.Capacity = 501 },
		func(i *PracticeInput) { i.DueAt = now },
		func(i *PracticeInput) { i.Title = "" },
		func(i *PracticeInput) { i.Description = "" },
	} {
		bad := good
		edit(&bad)
		var e *ServiceError
		if err := validPractice(bad, now); !errors.As(err, &e) || e.Status != http.StatusBadRequest {
			t.Fatalf("bad input allowed: %+v, err %v", bad, err)
		}
	}
	if err := validPractice(good, now); err != nil {
		t.Fatal(err)
	}
}
func TestPracticeValidationReportsInvalidField(t *testing.T) {
	now := time.Date(2026, 10, 29, 14, 4, 0, 0, time.UTC)
	good := PracticeInput{GroupID: 1, Title: "测试", Description: "说明", Capacity: 5, DueAt: now.Add(time.Hour)}
	cases := []struct {
		name string
		message string
		change func(*PracticeInput)
	}{
		{"group", "请选择有效的所属组别", func(in *PracticeInput) { in.GroupID = 0 }},
		{"title", "项目名称不能为空且不能超过 120 字", func(in *PracticeInput) { in.Title = " " }},
		{"description", "任务说明不能为空且不能超过 10000 字", func(in *PracticeInput) { in.Description = "" }},
		{"capacity", "人数上限必须为 1 至 500 人", func(in *PracticeInput) { in.Capacity = 501 }},
		{"deadline", "截止时间必须晚于当前北京时间", func(in *PracticeInput) { in.DueAt = now }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			input := good
			tc.change(&input)
			var serviceErr *ServiceError
			if err := validPractice(input, now); !errors.As(err, &serviceErr) || serviceErr.Status != 400 || serviceErr.Message != tc.message {
				t.Fatalf("validation returned %v, want %q", err, tc.message)
			}
		})
	}
}

func TestPracticeServiceBlocksUnauthorizedGroupBeforeSensitiveReads(t *testing.T) {
	db, mock := newAssignmentMockGorm(t)
	mock.ExpectQuery("(?s)SELECT count\\(\\*\\) FROM \\x60user_group_members\\x60 JOIN user_groups ON .* JOIN users ON .* WHERE user_group_members.group_id = \\? AND user_group_members.user_id = \\?").
		WithArgs(model.UserGroupStatusActive, model.UserStatusEnabled, uint64(15), uint64(8)).
		WillReturnRows(sqlmock.NewRows([]string{"count(*)"}).AddRow(0))
	s := &PracticeService{db: db}
	err := s.allowed(db.WithContext(context.Background()), Actor{ID: 8, RoleName: model.RoleNameAdmin}, 15, true)
	var e *ServiceError
	if !errors.As(err, &e) || e.Status != 403 {
		t.Fatalf("cross-group access granted: %v", err)
	}
	err = s.allowed(db, Actor{ID: 8, RoleName: model.RoleNameUser}, 15, true)
	if !errors.As(err, &e) || e.Status != 403 {
		t.Fatalf("member management granted: %v", err)
	}
}
func TestPracticeMemberViewNeverExposesInternalScores(t *testing.T) {
	db, mock := newAssignmentMockGorm(t)
	now := time.Date(2026, 10, 29, 0, 0, 0, 0, time.UTC)
	p := model.PracticeProject{ID: 21, GroupID: 4, Title: "测试", Description: "说明", Capacity: 2, DueAt: now, Status: model.PracticeProjectOpen}
	mock.ExpectQuery("(?s)SELECT \\* FROM \\x60practice_entries\\x60 WHERE project_id = \\? ORDER BY id").WithArgs(uint64(21)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "project_id", "user_id", "status", "joined_at"}).AddRow(1, 21, 7, model.PracticeEntryActive, now))
	mock.ExpectQuery("(?s)SELECT \\* FROM \\x60practice_submissions\\x60 WHERE project_id = \\? AND user_id = \\? ORDER BY attempt DESC").
		WithArgs(uint64(21), uint64(7)).WillReturnRows(sqlmock.NewRows([]string{"id", "project_id", "user_id", "attempt", "progress", "reflection", "decision", "comment", "score", "created_at"}).AddRow(9, 21, 7, 1, "完成", "心得", model.PracticeReviewPassed, "通过", 95, now))
	mock.ExpectQuery("(?s)SELECT \\* FROM \\x60practice_files\\x60 WHERE submission_id = \\? ORDER BY id").WithArgs(uint64(9)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "submission_id", "file_name", "storage_path", "content_type", "size"}))
	v, err := (&PracticeService{db: db}).view(context.Background(), Actor{ID: 7, RoleName: model.RoleNameUser}, p, false)
	if err != nil {
		t.Fatal(err)
	}
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	var raw map[string]any
	if err := json.Unmarshal(b, &raw); err != nil {
		t.Fatal(err)
	}
	members := raw["members"].([]any)
	sub := members[0].(map[string]any)["submissions"].([]any)[0].(map[string]any)
	if _, exists := sub["score"]; exists {
		t.Fatalf("member response exposed score: %s", b)
	}
	if sub["decision"] != model.PracticeReviewPassed || sub["comment"] != "通过" {
		t.Fatalf("member feedback missing: %s", b)
	}
}
func TestPracticeFileDownloadRejectsAnotherOrdinaryMember(t *testing.T) {
	db, mock := newAssignmentMockGorm(t)
	now := time.Date(2026, 10, 29, 0, 0, 0, 0, time.UTC)
	mock.ExpectQuery("(?s)SELECT \\* FROM \\x60practice_files\\x60 WHERE \\x60practice_files\\x60.\\x60id\\x60 = \\? ORDER BY .* LIMIT \\?").
		WithArgs(uint64(99), 1).WillReturnRows(sqlmock.NewRows([]string{"id", "submission_id", "file_name", "storage_path", "content_type", "size"}).AddRow(99, 10, "private.png", "other/file.png", "image/png", 100))
	mock.ExpectQuery("(?s)SELECT \\* FROM \\x60practice_submissions\\x60 WHERE \\x60practice_submissions\\x60.\\x60id\\x60 = \\? ORDER BY .* LIMIT \\?").
		WithArgs(uint64(10), 1).WillReturnRows(sqlmock.NewRows([]string{"id", "project_id", "user_id", "attempt", "progress", "reflection", "decision", "comment", "created_at"}).AddRow(10, 2, 42, 1, "进展", "心得", "pending", "", now))
	mock.ExpectQuery("(?s)SELECT \\* FROM \\x60practice_projects\\x60 WHERE \\x60practice_projects\\x60.\\x60id\\x60 = \\? ORDER BY .* LIMIT \\?").
		WithArgs(uint64(2), 1).WillReturnRows(sqlmock.NewRows([]string{"id", "group_id", "title", "description", "capacity", "due_at", "status", "created_at"}).AddRow(2, 4, "组内项目", "说明", 3, now, "open", now))
	svc := &PracticeService{db: db}
	_, err := svc.OpenFile(context.Background(), Actor{ID: 7, RoleName: model.RoleNameUser}, 99)
	var e *ServiceError
	if !errors.As(err, &e) || e.Status != 403 {
		t.Fatalf("download granted to another member: %v", err)
	}
}
