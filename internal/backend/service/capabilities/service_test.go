package capabilities

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

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

func floatPointer(value float64) *float64 { return &value }
