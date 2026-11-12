package handler

import "testing"

func testScore(v uint8) *uint8 { return &v }

func TestNormalizeTrainingRowsPreservesMissingAndZeroScores(t *testing.T) {
	rows, ok := normalizeTrainingRows([]trainingGradeRow{
		{Name: " 甲 ", Score: testScore(0)},
		{Name: "乙", Note: "打不开"},
		{Name: "丙", Score: testScore(100)},
	})
	if !ok || len(rows) != 3 {
		t.Fatalf("expected three rows, got %v, %v", rows, ok)
	}
	if rows[0].Name != "甲" || rows[0].Score == nil || *rows[0].Score != 0 {
		t.Fatalf("explicit 0 must be kept: %#v", rows[0])
	}
	if rows[1].Score != nil || rows[1].Note != "打不开" {
		t.Fatalf("ungraded row must stay ungraded: %#v", rows[1])
	}
}

func TestNormalizeTrainingRowsRejectsDuplicateAndOutOfRange(t *testing.T) {
	for _, rows := range [][]trainingGradeRow{
		{{Name: "甲", Score: testScore(101)}},
		{{Name: "甲"}, {Name: " 甲 "}},
		{{Name: ""}},
		{},
	} {
		if _, ok := normalizeTrainingRows(rows); ok {
			t.Fatalf("invalid grade rows accepted: %#v", rows)
		}
	}
}
