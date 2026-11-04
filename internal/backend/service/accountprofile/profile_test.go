package accountprofile

import (
	"testing"
	"time"
)

func TestGradeRecognitionAndManualFallback(t *testing.T) {
	now := time.Date(2026, 11, 4, 0, 0, 0, 0, time.UTC)
	for id, want := range map[string]string{"20241421": "2024 级", "35230317": "2023 级", "20261421": "2026 级", "20271421": "", "2024142101": "", "99241421": "", "AB241421": "", "20240000": "", "12345678": ""} {
		if got := InferGrade(id, now); got != want {
			t.Fatalf("%s: %q, want %q", id, got, want)
		}
	}
	yes, no := true, false
	for _, tc := range []struct {
		in    Input
		ok    bool
		grade string
	}{
		{Input{IsStudent: &no}, true, ""}, {Input{}, false, ""},
		{Input{IsStudent: &yes, StudentID: "20241421", College: "机械学院", Grade: "2020"}, true, "2024 级"},
		{Input{IsStudent: &yes, StudentID: "OTHER123", College: "外校学院", Grade: "2023级"}, true, "2023 级"},
		{Input{IsStudent: &yes, StudentID: "OTHER123", College: "外校学院"}, false, ""},
		{Input{IsStudent: &yes, StudentID: "OTHER123", Grade: "2023"}, false, ""},
		{Input{IsStudent: &yes, StudentID: "20279999", College: "学院", Grade: "2027"}, false, ""},
	} {
		p, err := Normalize(tc.in, now)
		if (err == nil) != tc.ok || tc.ok && p.Grade != tc.grade {
			t.Fatalf("%+v => %+v %v", tc.in, p, err)
		}
	}
}
