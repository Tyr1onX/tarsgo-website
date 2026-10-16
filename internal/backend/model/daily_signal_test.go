package model

import (
	"testing"
	"time"
)

func TestDailySignalDateScansMySQLDateWithoutTimestampSuffix(t *testing.T) {
	beijing := time.FixedZone("Asia/Shanghai", 8*60*60)
	for _, value := range []any{
		[]byte("2026-10-16"),
		"2026-10-16",
		time.Date(2026, time.October, 16, 0, 0, 0, 0, beijing),
	} {
		var got DailySignalDate
		if err := got.Scan(value); err != nil {
			t.Fatalf("Scan(%T) error = %v", value, err)
		}
		if got != "2026-10-16" {
			t.Errorf("Scan(%T) = %q, want YYYY-MM-DD calendar key", value, got)
		}
	}
}

func TestDailySignalDateRejectsInvalidValuesAndWritesDateOnly(t *testing.T) {
	var date DailySignalDate
	if err := date.Scan([]byte("2026-02-30")); err == nil {
		t.Fatal("Scan should reject an impossible date")
	}
	if err := date.Scan(int64(20261016)); err == nil {
		t.Fatal("Scan should reject an unsupported database value")
	}

	date = "2026-10-16"
	value, err := date.Value()
	if err != nil || value != "2026-10-16" {
		t.Fatalf("Value() = %v, %v; want exact date string", value, err)
	}
	date = "2026-02-30"
	if _, err := date.Value(); err == nil {
		t.Fatal("Value should reject an impossible date")
	}
}
