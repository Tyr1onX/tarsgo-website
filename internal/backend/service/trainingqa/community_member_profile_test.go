package trainingqa

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"tarsgo-backend/model"
	"tarsgo-backend/service/cobuilderbadge"
)

func TestCommunityFeaturedBadgeDefaultsToCurrentHighestAndTracksRevocation(t *testing.T) {
	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	revokedAt := base.AddDate(0, 0, 20)
	records := make([]model.CoBuilderContribution, 10)
	for index := range records {
		records[index] = model.CoBuilderContribution{
			ID: uint64(index + 1), UserID: 7, Description: "有效社区贡献",
			GrantedByID: 9, CreatedAt: base.AddDate(0, 0, index),
		}
	}
	records[0].RevokedAt = &revokedAt
	current := cobuilderbadge.PublicBadgeFromContributions(records)
	if current == nil || !current.IsEarned {
		t.Fatal("expected the remaining contributions to keep a badge earned")
	}

	defaultBadge, selectedKey := resolveCommunityFeaturedBadge(current, "")
	if defaultBadge == nil || defaultBadge.LevelCode != current.LevelCode || selectedKey != "" {
		t.Fatalf("automatic selection = %#v, selected key %q; want the current highest tier with no custom key", defaultBadge, selectedKey)
	}
	selectedBadge, selectedKey := resolveCommunityFeaturedBadge(current, "co_builder")
	if selectedBadge == nil || selectedBadge.LevelCode != current.LevelCode || selectedKey != "co_builder" {
		t.Fatalf("explicit selection = %#v, selected key %q; want the earned badge", selectedBadge, selectedKey)
	}

	for index := range records {
		revoked := base.AddDate(0, 1, index+1)
		records[index].RevokedAt = &revoked
	}
	revokedBadge := cobuilderbadge.PublicBadgeFromContributions(records)
	featured, selectedKey := resolveCommunityFeaturedBadge(revokedBadge, "co_builder")
	if featured != nil || selectedKey != "" {
		t.Fatalf("revoked badge remained visible: badge=%#v selected key=%q", featured, selectedKey)
	}
}

func TestCommunityAuthorPositionsUsesCurrentOrganizationAssignments(t *testing.T) {
	positions := communityAuthorPositions([]uint64{323, 323, 0})[323]
	if len(positions) != 1 || positions[0].CategoryTitle != "核心管理层" || positions[0].Title != "运营经理" {
		t.Fatalf("community author positions = %#v, want the current operations manager assignment once", positions)
	}
}

func TestCommunityMemberProfileValidatesAccessAndRequestBeforeDatabaseReads(t *testing.T) {
	service := &Service{}
	if _, err := service.GetCommunityMemberProfile(context.Background(), Actor{}, 7, CommunityMemberTabOverview, 1); err == nil {
		t.Fatal("anonymous actor could read a member profile")
	} else {
		assertQuestionStatus(t, err, http.StatusForbidden)
	}
	for _, input := range []struct {
		memberID uint64
		tab      CommunityMemberProfileTab
		page     int
	}{
		{memberID: 0, tab: CommunityMemberTabOverview, page: 1},
		{memberID: 7, tab: "private", page: 1},
		{memberID: 7, tab: CommunityMemberTabOverview, page: 10001},
	} {
		if _, err := service.GetCommunityMemberProfile(context.Background(), Actor{ID: 5}, input.memberID, input.tab, input.page); err == nil {
			t.Fatalf("invalid member profile request was accepted: %#v", input)
		} else {
			assertQuestionStatus(t, err, http.StatusBadRequest)
		}
	}
}

func TestUpdateCommunityMemberProfileRejectsInvalidPublicFields(t *testing.T) {
	service := &Service{}
	longBio := strings.Repeat("吉", communityMemberProfileMaxBioRunes+1)
	unknownBadge := "future_badge"
	for _, input := range []CommunityMemberProfileInput{
		{},
		{Bio: &longBio},
		{FeaturedBadgeKey: &unknownBadge},
	} {
		if _, err := service.UpdateMyCommunityMemberProfile(context.Background(), Actor{ID: 5}, input); err == nil {
			t.Fatalf("invalid public profile update was accepted: %#v", input)
		} else {
			assertQuestionStatus(t, err, http.StatusBadRequest)
		}
	}
}
