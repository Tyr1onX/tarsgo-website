package assignment

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"tarsgo-backend/model"
)

func TestMemberListQueriesAreBoundedByBatchAndPreserveOrder(t *testing.T) {
	for _, count := range []int{1, 100, 201} {
		t.Run(fmt.Sprint(count), func(t *testing.T) {
			db, mock := newAssignmentMockGorm(t)
			now := time.Date(2026, 11, 3, 0, 0, 0, 0, time.UTC)
			items := make([]model.Assignment, count)
			for i := range items {
				items[i] = model.Assignment{ID: uint64(i + 1), GroupID: 41, DueAt: now.Add(time.Hour)}
			}
			for start := 0; start < count; start += assignmentListBatchSize {
				mock.ExpectQuery("SELECT .* FROM `user_groups` WHERE id IN").WillReturnRows(sqlmock.NewRows([]string{"id", "name"}).AddRow(41, "机械组"))
				mock.ExpectQuery("SELECT s.\\* FROM assignment_submissions AS s WHERE").WillReturnRows(sqlmock.NewRows([]string{"id"}))
			}
			views, err := (&Service{db: db, now: func() time.Time { return now }}).memberListViews(context.Background(), 22, items)
			if err != nil || len(views) != count {
				t.Fatalf("list length=%d error=%v", len(views), err)
			}
			for i, view := range views {
				if view.ID != items[i].ID || view.Status != "pending" || view.GroupName != "机械组" {
					t.Fatalf("invalid view: %#v", view)
				}
			}
		})
	}
}

func TestAdminListBatchesStatsAndProtectsReferencedAssignments(t *testing.T) {
	db, mock := newAssignmentMockGorm(t)
	items := []model.Assignment{
		{ID: 1, GroupID: 41, PublicationStatus: model.AssignmentPublicationWithdrawn},
		{ID: 2, GroupID: 41, PublicationStatus: model.AssignmentPublicationWithdrawn},
		{ID: 3, GroupID: 41, PublicationStatus: model.AssignmentPublicationPublished},
	}
	mock.ExpectQuery("SELECT .* FROM `user_groups` WHERE id IN").WillReturnRows(sqlmock.NewRows([]string{"id", "name"}).AddRow(41, "机械组"))
	mock.ExpectQuery("(?s)SELECT t.assignment_id, COUNT.*FROM assignment_targets").WillReturnRows(sqlmock.NewRows([]string{"assignment_id", "target_count", "submitted_count", "reviewed_count", "passed_count"}).AddRow(2, 10, 5, 4, 3))
	mock.ExpectQuery("(?s)SELECT a.id FROM assignments a.*skill_node_assignments.*skill_review_events.*capability_dimension_sources").WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(1))
	views, err := (&Service{db: db}).adminListViews(context.Background(), items)
	if err != nil {
		t.Fatal(err)
	}
	if len(views) != 3 || !views[0].CanDelete || views[1].CanDelete || views[2].CanDelete || views[1].TargetCount != 10 || views[1].SubmittedCount != 5 || views[1].ReviewedCount != 4 || views[1].PassedCount != 3 {
		t.Fatalf("invalid summary: %#v", views)
	}
}
