package assignment

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"

	"tarsgo-backend/model"
)

func TestReviewScoresAreOmittedFromMemberResponses(t *testing.T) {
	for _, tc := range []struct {
		name          string
		includeScores bool
		wantScore     bool
	}{
		{name: "member", includeScores: false, wantScore: false},
		{name: "administrator including zero score", includeScores: true, wantScore: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db, mock := newAssignmentMockGorm(t)
			now := time.Date(2026, 10, 29, 8, 0, 0, 0, time.UTC)
			mock.ExpectQuery("SELECT \\* FROM `assignment_submissions` WHERE assignment_id = \\? AND user_id IN \\(\\?\\) ORDER BY user_id ASC, attempt ASC").
				WithArgs(uint64(10), uint64(42)).
				WillReturnRows(sqlmock.NewRows([]string{"id", "assignment_id", "user_id", "attempt", "submitted_at", "is_late", "created_at"}).
					AddRow(6, 10, 42, 1, now, false, now))
			mock.ExpectQuery("SELECT \\* FROM `assignment_submission_files` WHERE submission_id IN \\(\\?\\) ORDER BY id ASC").
				WithArgs(uint64(6)).
				WillReturnRows(sqlmock.NewRows([]string{"id", "submission_id", "file_name", "storage_path", "content_type", "size", "created_at"}))
			mock.ExpectQuery("SELECT \\* FROM `assignment_reviews` WHERE submission_id IN \\(\\?\\) ORDER BY id ASC").
				WithArgs(uint64(6)).
				WillReturnRows(sqlmock.NewRows([]string{"id", "submission_id", "reviewer_id", "score", "decision", "comment", "created_at"}).
					AddRow(7, 6, 9, 0, model.AssignmentReviewPassed, "批改意见", now))

			histories, err := (&Service{db: db}).loadSubmissionHistories(context.Background(), 10, []uint64{42}, tc.includeScores)
			if err != nil || len(histories[42]) != 1 || len(histories[42][0].Reviews) != 1 {
				t.Fatalf("load review history: history=%#v err=%v", histories[42], err)
			}
			review := histories[42][0].Reviews[0]
			if review.Comment != "批改意见" || review.Decision != model.AssignmentReviewPassed {
				t.Fatalf("review feedback lost: %#v", review)
			}
			payload, err := json.Marshal(histories[42][0])
			if err != nil {
				t.Fatalf("marshal review response: %v", err)
			}
			var decoded struct {
				Reviews []map[string]any `json:"reviews"`
			}
			if err := json.Unmarshal(payload, &decoded); err != nil {
				t.Fatalf("decode review response: %v", err)
			}
			score, present := decoded.Reviews[0]["score"]
			if present != tc.wantScore {
				t.Fatalf("score field present=%v, want %v: %s", present, tc.wantScore, payload)
			}
			if tc.wantScore && score != float64(0) {
				t.Fatalf("administrator zero score = %v, want 0", score)
			}
		})
	}
}
