package cultivation

import (
	"testing"

	"tarsgo-backend/model"
	"tarsgo-backend/service/capabilities"
)

func TestCompositeScoreAveragesOnlyRatedActiveDimensions(t *testing.T) {
	if score, count := compositeScore([]capabilities.DimensionResult{{ID: 1, Active: true}}); score != nil || count != 0 {
		t.Fatalf("no evaluations should not become zero: score=%v count=%d", score, count)
	}
	one, two := 80.0, 91.0
	score, count := compositeScore([]capabilities.DimensionResult{
		{ID: 1, Active: true, Score: &one},
		{ID: 2, Active: true, Score: &two},
		{ID: 3, Active: true, Score: nil},
		{ID: 4, Active: false, Score: floatValue(0)},
	})
	if score == nil || *score != 85.5 || count != 2 {
		t.Fatalf("composite score = %v with %d dimensions, want 85.5 across 2", score, count)
	}
}

func TestGroupRoleUsesOnlyStoredGroupIdentity(t *testing.T) {
	if got := groupRole(model.UserGroupMemberRoleLeader); got != "组长" {
		t.Fatalf("leader role = %q", got)
	}
	for _, legacyOrMemberRole := range []uint8{model.UserGroupMemberRoleMember, model.UserGroupMemberRoleLegacyAdmin, 3} {
		if got := groupRole(legacyOrMemberRole); got != "成员" {
			t.Fatalf("role %d was inflated into an unsupported org level: %q", legacyOrMemberRole, got)
		}
	}
}

func floatValue(value float64) *float64 { return &value }
