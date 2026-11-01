package cobuilderbadge

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"tarsgo-backend/model"
)

func TestPublicBadgeKeepsTierHistoryAndOmitsAdministrativeIdentities(t *testing.T) {
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
	if len(badge.TierHistory) != 3 {
		t.Fatalf("tier history has %d entries, want bronze, silver, gold", len(badge.TierHistory))
	}
	if badge.TierHistory[2].LevelCode != "gold" || badge.TierHistory[2].RevokedAt == nil || !badge.TierHistory[2].RevokedAt.Equal(revokedAt) {
		t.Fatalf("gold tier history did not retain its revocation: %#v", badge.TierHistory[2])
	}

	encoded, err := json.Marshal(badge)
	if err != nil {
		t.Fatalf("marshal public badge: %v", err)
	}
	serialized := string(encoded)
	for _, privateField := range []string{"grantedById", "revokedById", "8001", "9001"} {
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
