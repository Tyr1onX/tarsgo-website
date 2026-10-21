package handler

import (
	"testing"
	"time"
)

func TestParseAssignmentDueAtUsesBeijingWallClockForLocalInput(t *testing.T) {
	beijing := time.FixedZone("Asia/Shanghai", 8*60*60)
	localInput, err := parseAssignmentDueAt("2026-10-22T23:59")
	if err != nil {
		t.Fatalf("parse Beijing datetime-local value: %v", err)
	}
	want := time.Date(2026, 10, 22, 23, 59, 0, 0, beijing)
	if !localInput.Equal(want) || localInput.Location().String() != "Asia/Shanghai" {
		t.Fatalf("local input parsed as %s, want %s", localInput, want)
	}

	isoInput, err := parseAssignmentDueAt("2026-10-22T15:59:00Z")
	if err != nil || !isoInput.Equal(want) {
		t.Fatalf("UTC-converted browser input parsed as %s, %v; want %s", isoInput, err, want)
	}
}
