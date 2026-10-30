package capabilities

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/model"
)

func newCapabilityMock(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
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

func TestAverageScoreUsesOnlyEvaluatedObservationsAndKeepsZero(t *testing.T) {
	if got := averageScore(nil); got != nil {
		t.Fatalf("average with no evaluations = %v, want nil", got)
	}
	zero := averageScore([]ratedObservation{{Score: 0}})
	if zero == nil || *zero != 0 {
		t.Fatalf("zero score average = %v, want 0", zero)
	}
	got := averageScore([]ratedObservation{{Score: 80}, {Score: 91}, {Score: 0}})
	if got == nil || *got != 57 {
		t.Fatalf("average = %v, want 57", got)
	}
	rounded := averageScore([]ratedObservation{{Score: 84}, {Score: 85}})
	if rounded == nil || *rounded != 84.5 {
		t.Fatalf("rounded average = %v, want 84.5", rounded)
	}
}

func TestMemberDimensionHistoryDoesNotExposeSourceScoresOrReviewComments(t *testing.T) {
	dimension := DimensionResult{
		ID: 1, Name: "动手能力", Score: floatPointer(76), EvaluationCount: 2,
		History: []GrowthEvent{{ID: 9, SourceType: "assignment", SourceTitle: "装配作业", EvaluatedAt: time.Date(2026, 10, 29, 1, 0, 0, 0, time.UTC)}},
	}
	data, err := json.Marshal(dimension)
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	if strings.Contains(text, "\"sources\"") || strings.Contains(text, "\"comment\"") || strings.Contains(text, "\"reviewerName\"") {
		t.Fatalf("member dimension response exposed internal source details: %s", text)
	}
}

func TestNormalizeDimensionRejectsDuplicateOrUnsupportedSources(t *testing.T) {
	base := DimensionInput{Name: "机械设计", Sources: []SourceRef{{Type: "assignment", ID: 4}}}
	if _, err := normalizeDimensionInput(base); err != nil {
		t.Fatalf("valid dimension rejected: %v", err)
	}
	duplicate := base
	duplicate.Sources = []SourceRef{{Type: "assignment", ID: 4}, {Type: "assignment", ID: 4}}
	if _, err := normalizeDimensionInput(duplicate); err == nil {
		t.Fatal("duplicate source was accepted")
	}
	unsupported := base
	unsupported.Sources = []SourceRef{{Type: "interview", ID: 4}}
	if _, err := normalizeDimensionInput(unsupported); err == nil {
		t.Fatal("unsupported source type was accepted")
	}
}

func TestMemberCapabilityHistoryFiltersWithdrawnAssignmentScores(t *testing.T) {
	db, mock := newCapabilityMock(t)
	mock.ExpectQuery("(?s)SELECT \\* FROM `capability_dimension_sources` WHERE group_id = \\? AND dimension_id IN \\(\\?\\) ORDER BY id ASC").
		WithArgs(uint64(41), uint64(5)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "group_id", "dimension_id", "source_type", "source_id", "created_at"}).
			AddRow(11, 41, 5, model.CapabilitySourceAssignment, 71, time.Now()))
	mock.ExpectQuery("(?s)SELECT id, title FROM `assignments` WHERE group_id = \\? AND id IN \\(\\?\\)").
		WithArgs(uint64(41), uint64(71)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "title"}).AddRow(71, "撤回作业"))
	mock.ExpectQuery("(?s)SELECT .* FROM `assignment_reviews` JOIN assignment_submissions ON.*JOIN assignments ON.*WHERE .*assignments\\.group_id = \\? AND assignments\\.id IN \\(\\?\\) AND assignment_submissions\\.user_id IN \\(\\?\\) AND assignment_reviews\\.decision IN \\(\\?,\\?\\).*assignments\\.publication_status = \\?.*ORDER BY").
		WithArgs(uint64(41), uint64(71), uint64(22), model.AssignmentReviewPassed, model.AssignmentReviewNeedsRedo, model.AssignmentPublicationPublished).
		WillReturnRows(sqlmock.NewRows([]string{"review_id", "assignment_id", "user_id", "attempt", "score", "decision", "comment", "reviewer_id", "evaluated_at", "reviewer_name"}))
	mock.ExpectQuery("(?s)SELECT \\* FROM `capability_manual_reviews` WHERE group_id = \\? AND dimension_id IN \\(\\?\\) AND user_id IN \\(\\?\\) ORDER BY created_at ASC, id ASC").
		WithArgs(uint64(41), uint64(5), uint64(22)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "group_id", "dimension_id", "user_id", "score", "actor_id", "actor_name", "comment", "created_at"}))

	result, err := NewService(db).calculate(context.Background(), 41, []uint64{22}, []model.CapabilityDimension{{ID: 5, Name: "动手能力", Active: true}}, false, true)
	if err != nil {
		t.Fatalf("calculate member capability history: %v", err)
	}
	if len(result[22]) != 1 || len(result[22][0].History) != 0 || result[22][0].Score != nil {
		t.Fatalf("withdrawn assignment remained in member capability results: %#v", result[22])
	}
}

func floatPointer(value float64) *float64 { return &value }
