package organization

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestPreviewDataHasConfirmedMemberAssociations(t *testing.T) {
	preview := PreviewData()
	positions := append([]Position{preview.Leader}, preview.Categories[0].Positions...)
	for _, category := range preview.Categories[1:] {
		positions = append(positions, category.Positions...)
	}

	expected := []struct {
		name   string
		userID *uint64
	}{
		{"镇沈晖", uint64Pointer(643)},
		{"吉荣昌", uint64Pointer(641)},
		{"孙煦朝", nil},
		{"高畅", uint64Pointer(694)},
		{"童逸创", uint64Pointer(323)},
		{"姜昊阳", uint64Pointer(647)},
		{"张育宁", uint64Pointer(5)},
		{"沈桂清", uint64Pointer(655)},
		{"白航铭", uint64Pointer(670)},
		{"待确认", nil},
		{"张坤杰", uint64Pointer(24)},
		{"雷韶冉", uint64Pointer(644)},
		{"曲佳响", uint64Pointer(10)},
		{"陆广鹏", uint64Pointer(631)},
		{"王彬赫", uint64Pointer(22)},
		{"左文添", uint64Pointer(630)},
	}
	if len(positions) != len(expected) {
		t.Fatalf("positions = %d, want %d", len(positions), len(expected))
	}
	for index, want := range expected {
		got := positions[index]
		if got.Name != want.name {
			t.Errorf("position %d name = %q, want %q", index, got.Name, want.name)
		}
		if !sameUserID(got.UserID, want.userID) {
			t.Errorf("position %q userId = %v, want %v", got.Name, pointerValue(got.UserID), pointerValue(want.userID))
		}
	}
}

func TestMemberPositionsReturnsOnlyTheCurrentMemberTitles(t *testing.T) {
	positions := MemberPositions(643)
	if len(positions) != 1 {
		t.Fatalf("captain positions = %#v, want one position", positions)
	}
	if positions[0].Title != "队长" || positions[0].CategoryTitle != "核心管理层" {
		t.Fatalf("captain position = %#v", positions[0])
	}
	if got := MemberPositions(999); len(got) != 0 {
		t.Fatalf("unassociated member positions = %#v, want empty", got)
	}
}

func TestPreviewJSONKeepsUnregisteredPositionsExplicitlyUnlinked(t *testing.T) {
	payload, err := json.Marshal(PreviewData())
	if err != nil {
		t.Fatalf("marshal organization preview: %v", err)
	}
	value := string(payload)
	if !strings.Contains(value, `"id":"project-management","title":"项目管理","name":"孙煦朝","userId":null`) {
		t.Fatalf("project management userId is not explicitly null: %s", value)
	}
	if !strings.Contains(value, `"id":"electrical-lead","title":"电控组长","name":"待确认","userId":null`) {
		t.Fatalf("vacant electrical position is not explicitly unlinked: %s", value)
	}
}

func TestPreviewDataReturnsAnIndependentCopy(t *testing.T) {
	first := PreviewData()
	first.Leader.Name = "changed"
	*first.Leader.UserID = 0
	first.Categories[0].Positions[0].Name = "changed"
	*first.Categories[0].Positions[0].UserID = 0

	second := PreviewData()
	if second.Leader.Name != "镇沈晖" || pointerValue(second.Leader.UserID) != uint64(643) ||
		second.Categories[0].Positions[0].Name != "吉荣昌" || pointerValue(second.Categories[0].Positions[0].UserID) != uint64(641) {
		t.Fatalf("request mutation leaked into static data: %#v", second)
	}
}

func uint64Pointer(value uint64) *uint64 { return &value }

func sameUserID(left, right *uint64) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func pointerValue(value *uint64) any {
	if value == nil {
		return nil
	}
	return *value
}
