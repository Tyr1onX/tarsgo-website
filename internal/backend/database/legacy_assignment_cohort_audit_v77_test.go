package database

import (
	"testing"

	"tarsgo-backend/model"
)

func TestCohortMismatchCategories(t *testing.T) {
	const latest = uint64(12)
	cases := []struct {
		eligible bool
		records  []model.Registration
	}{
		{true, nil},
		{false, []model.Registration{{FormID: latest, RecruitmentStatus: model.RecruitmentStatusAdmitted}}},
		{false, []model.Registration{{FormID: latest, RecruitmentStatus: model.RecruitmentStatusPendingScreening}}},
		{false, []model.Registration{{FormID: 11, RecruitmentStatus: model.RecruitmentStatusAdmitted}}},
		{false, []model.Registration{{FormID: 11, RecruitmentStatus: model.RecruitmentStatusRejected}}},
		{false, nil},
	}
	var counts cohortMismatchCounts
	for _, c := range cases {
		counts.add(c.eligible, c.records, latest)
	}
	if counts.Matched != 1 || counts.LatestAdmittedIneligible != 1 ||
		counts.LatestNotAdmitted != 1 || counts.AdmittedOther != 1 ||
		counts.RegisteredOther != 1 || counts.NoRegistration != 1 {
		t.Fatalf("cohort mismatch classification = %#v", counts)
	}
}