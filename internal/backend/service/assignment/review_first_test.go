package assignment

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"tarsgo-backend/model"
)

func TestReviewFirstRejectsOrdinaryMembers(t *testing.T) {
	_, err := (&Service{}).ReviewFirst(context.Background(), Actor{ID: 9, RoleName: model.RoleNameUser}, 81,
		ReviewInput{Score: 80, Decision: model.AssignmentReviewPassed})
	assertAssignmentStatus(t, err, http.StatusForbidden)
}

func TestReviewFirstDoesNotAppendSecondReview(t *testing.T) {
	db, mock := newAssignmentMockGorm(t)
	now := time.Date(2026, 11, 6, 10, 0, 0, 0, time.UTC)
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT \\* FROM `assignment_submissions` WHERE `assignment_submissions`\\.`id` = \\? ORDER BY `assignment_submissions`\\.`id` LIMIT \\?").
		WithArgs(uint64(81), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "assignment_id", "user_id", "attempt", "submitted_at"}).
			AddRow(81, 91, 22, 1, now))
	mock.ExpectQuery("SELECT \\* FROM `assignments` WHERE `assignments`\\.`id` = \\? ORDER BY `assignments`\\.`id` LIMIT \\? FOR UPDATE").
		WithArgs(uint64(91), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "group_id", "title", "publication_status"}).
			AddRow(91, 41, "作业", "published"))
	expectAssignmentGroupIDs(mock, 8, 41)
	mock.ExpectQuery("SELECT \\* FROM `assignment_submissions` WHERE assignment_id = \\? AND user_id = \\? ORDER BY attempt DESC").
		WithArgs(uint64(91), uint64(22), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "assignment_id", "user_id", "attempt", "submitted_at"}).
			AddRow(81, 91, 22, 1, now))
	mock.ExpectQuery("SELECT count\\(\\*\\) FROM `assignment_reviews` WHERE submission_id = \\?").
		WithArgs(uint64(81)).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	mock.ExpectRollback()
	_, err := (&Service{db: db}).ReviewFirst(context.Background(), Actor{ID: 8, RoleName: model.RoleNameAdmin}, 81,
		ReviewInput{Score: 85, Decision: model.AssignmentReviewPassed})
	assertAssignmentStatus(t, err, http.StatusConflict)
}
