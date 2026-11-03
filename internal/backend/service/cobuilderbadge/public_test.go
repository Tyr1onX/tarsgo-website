package cobuilderbadge

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"tarsgo-backend/model"
)

func TestPublicBadgeUsesEffectiveTierAndOmitsManagementHistory(t *testing.T) {
	base := time.Date(2026, time.January, 1, 8, 0, 0, 0, time.UTC)
	revokedAt := base.AddDate(0, 0, 11)
	revokedBy := uint64(9001)
	records := make([]model.CoBuilderContribution, 10)
	for index := range records {
		records[index] = model.CoBuilderContribution{
			ID: uint64(index + 1), UserID: 17, Description: "社区贡献记录",
			GrantedByID: 8001, CreatedAt: base.AddDate(0, 0, index),
		}
	}
	records[0].RevokedAt = &revokedAt
	records[0].RevokedByID = &revokedBy

	badge := PublicBadgeFromContributions(records)
	if badge == nil {
		t.Fatal("expected a public badge projection")
	}
	if badge.LevelCode != "silver" || badge.LevelLabel != "白银 II" || !badge.IsEarned {
		t.Fatalf("current tier = %s %q earned=%v, want silver", badge.LevelCode, badge.LevelLabel, badge.IsEarned)
	}
	if badge.EarnedAt == nil || !badge.EarnedAt.Equal(base.AddDate(0, 0, 2)) {
		t.Fatalf("current tier earned at = %v, want %v", badge.EarnedAt, base.AddDate(0, 0, 2))
	}

	encoded, err := json.Marshal(badge)
	if err != nil {
		t.Fatalf("marshal public badge: %v", err)
	}
	serialized := string(encoded)
	for _, privateField := range []string{"grantedById", "revokedById", "8001", "9001", "contributions", "tierHistory", "revokedAt", "condition"} {
		if strings.Contains(serialized, privateField) {
			t.Errorf("public badge leaked administrative field %q: %s", privateField, serialized)
		}
	}
}

func TestPublicBadgeIsEmptyUntilAContributionIsGranted(t *testing.T) {
	if badge := PublicBadgeFromContributions(nil); badge != nil {
		t.Fatalf("empty contribution history returned a badge: %#v", badge)
	}
}

func TestPublicBadgeDisappearsWhenAllContributionsAreRevoked(t *testing.T) {
	created := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	revoked := created.Add(time.Hour)
	if badge := PublicBadgeFromContributions([]model.CoBuilderContribution{{ID: 1, CreatedAt: created, RevokedAt: &revoked}}); badge != nil {
		t.Fatalf("historical grant kept a revoked badge visible: %#v", badge)
	}
	regained := revoked.Add(time.Hour)
	badge := PublicBadgeFromContributions([]model.CoBuilderContribution{{ID: 1, CreatedAt: created, RevokedAt: &revoked}, {ID: 2, CreatedAt: regained}})
	if badge == nil || badge.LevelCode != "bronze" || badge.EarnedAt == nil || !badge.EarnedAt.Equal(regained) {
		t.Fatalf("regained badge did not use its new earned date: %#v", badge)
	}
}
