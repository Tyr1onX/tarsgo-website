package trainingqa

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

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
