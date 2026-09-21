package registration

import (
	"testing"

	"tarsgo-backend/model"
)

func TestValidateRegistrationFieldValue(t *testing.T) {
	field := model.FormField{Key: "name", Label: "姓名", Type: "text", Validation: map[string]any{"max_length": 3, "pattern": `^[A-Z]+$`}}
	if err := validateRegistrationFieldValue(field, "ABCD"); err == nil {
		t.Fatal("expected max length validation error")
	}
	if err := validateRegistrationFieldValue(field, "abc"); err == nil {
		t.Fatal("expected pattern validation error")
	}
	if err := validateRegistrationFieldValue(field, "ABC"); err != nil {
		t.Fatalf("unexpected validation error: %v", err)
	}

	number := model.FormField{Key: "score", Label: "分数", Type: "number", Validation: map[string]any{"min": 1, "max": 10}}
	if err := validateRegistrationFieldValue(number, int64(11)); err == nil {
		t.Fatal("expected max validation error")
	}
	date := model.FormField{Key: "date", Label: "日期", Type: "date", Validation: map[string]any{"min_date": "2026-01-01", "max_date": "2026-12-31"}}
	if err := validateRegistrationFieldValue(date, "2025-12-31"); err == nil {
		t.Fatal("expected date range validation error")
	}
}
