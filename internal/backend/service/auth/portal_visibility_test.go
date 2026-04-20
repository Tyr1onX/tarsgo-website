package auth

import "testing"

func TestShouldShowRecruitmentEntryVisibility(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name                     string
		hasPublishedForm         bool
		inActiveDefaultGroup     bool
		hasSubmittedRegistration bool
		want                     bool
	}{
		{
			name:                 "published form and eligible default-group user can see entry before submitting",
			hasPublishedForm:     true,
			inActiveDefaultGroup: true,
			want:                 true,
		},
		{
			name:                     "submitted user removed from default group still sees entry",
			hasPublishedForm:         true,
			hasSubmittedRegistration: true,
			want:                     true,
		},
		{
			name:                     "reviewed user still sees entry through submitted registration",
			hasPublishedForm:         true,
			hasSubmittedRegistration: true,
			want:                     true,
		},
		{
			name:             "user outside default group without current recruitment registration cannot see entry",
			hasPublishedForm: true,
			want:             false,
		},
		{
			name:                     "no published form always hides entry",
			inActiveDefaultGroup:     true,
			hasSubmittedRegistration: true,
			want:                     false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := shouldShowRecruitmentEntryVisibility(
				tc.hasPublishedForm,
				tc.inActiveDefaultGroup,
				tc.hasSubmittedRegistration,
			)
			if got != tc.want {
				t.Fatalf("expected %v, got %v", tc.want, got)
			}
		})
	}
}
