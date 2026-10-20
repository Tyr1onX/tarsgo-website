package database

import (
	"testing"
	"time"

	"tarsgo-backend/model"
)

func TestMigrationRegistryIsOrderedAndKeepsBaseVersion(t *testing.T) {
	items := migrationRegistry("test")
	if len(items) != 19 {
		t.Fatalf("expected 19 registered migrations, got %d", len(items))
	}
	wantVersions := []uint64{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19}
	for index, want := range wantVersions {
		if items[index].version != want {
			t.Fatalf("migration %d has version %d, want %d", index, items[index].version, want)
		}
	}
	if items[0].version != 1 {
		t.Fatalf("unexpected migration registry: %#v", items)
	}
	for index := 1; index < len(items); index++ {
		if items[index-1].version >= items[index].version {
			t.Fatalf("migrations must be strictly ordered at index %d", index)
		}
	}
}

func TestInterviewSchedulingMigrationBackfillOnlyTouchesNewColumns(t *testing.T) {
	updates := interviewSchedulingBackfillUpdates()
	if len(updates) != 2 {
		t.Fatalf("expected only interview scheduling defaults, got %#v", updates)
	}
	if got := updates["interview_attendance"]; got != model.InterviewAttendancePending {
		t.Fatalf("interview_attendance = %#v, want %q", got, model.InterviewAttendancePending)
	}
	if got, exists := updates["interview_session_id"]; !exists || got != nil {
		t.Fatalf("interview_session_id = %#v, want nil", got)
	}

	protectedColumns := []string{"preferred_group_id", "recruitment_status", "rejected_stage"}
	for _, column := range protectedColumns {
		if _, exists := updates[column]; exists {
			t.Fatalf("v10 migration must not rewrite canonical column %q", column)
		}
	}
}

func TestInterviewSchedulingMigrationDefaultsPreserve548HistoricalCanonicalResults(t *testing.T) {
	statuses := []string{
		model.RecruitmentStatusPendingScreening,
		model.RecruitmentStatusPendingInterview,
		model.RecruitmentStatusAdmitted,
		model.RecruitmentStatusRejected,
		model.RecruitmentStatusWithdrawn,
	}
	for index := 0; index < 548; index++ {
		groupID := uint64(100 + index%7)
		stage := ""
		if statuses[index%len(statuses)] == model.RecruitmentStatusRejected {
			if index%2 == 0 {
				stage = model.RecruitmentRejectedStageScreening
			} else {
				stage = model.RecruitmentRejectedStageInterview
			}
		}
		registration := model.Registration{
			PreferredGroupID:    &groupID,
			RecruitmentStatus:   statuses[index%len(statuses)],
			InterviewAttendance: "",
		}
		if stage != "" {
			registration.RejectedStage = &stage
		}

		beforeGroup := *registration.PreferredGroupID
		beforeStatus := registration.RecruitmentStatus
		beforeStage := ""
		if registration.RejectedStage != nil {
			beforeStage = *registration.RejectedStage
		}

		registration.InterviewAttendance = model.InterviewAttendancePending
		registration.InterviewSessionID = nil

		if registration.PreferredGroupID == nil || *registration.PreferredGroupID != beforeGroup {
			t.Fatalf("record %d preferred group changed", index)
		}
		if registration.RecruitmentStatus != beforeStatus {
			t.Fatalf("record %d status changed from %q to %q", index, beforeStatus, registration.RecruitmentStatus)
		}
		afterStage := ""
		if registration.RejectedStage != nil {
			afterStage = *registration.RejectedStage
		}
		if afterStage != beforeStage {
			t.Fatalf("record %d rejected stage changed from %q to %q", index, beforeStage, afterStage)
		}
	}
}

func TestBuildRecruitmentBackfillPreservesLegacyFactsWithoutSecondChoiceAdmission(t *testing.T) {
	now := time.Date(2026, 10, 5, 8, 0, 0, 0, time.UTC)
	group1 := uint64(101)
	group2 := uint64(202)
	reviewer := uint64(11)
	interviewer := uint64(12)
	remark := "初筛备注"
	interviewRemark := "面试备注"

	tests := []struct {
		name                 string
		registration         model.Registration
		wantPreferredGroupID uint64
		wantStatus           string
		wantRejectedStage    string
		wantInterviewer      bool
	}{
		{
			name: "new pending screening",
			registration: model.Registration{
				Group1ID:     &group1,
				Group1Status: model.RegistrationStatusPending,
				FinalStatus:  model.RegistrationFinalStatusPending,
			},
			wantPreferredGroupID: group1,
			wantStatus:           model.RecruitmentStatusPendingScreening,
		},
		{
			name: "screening approved waits for interview",
			registration: model.Registration{
				Group1ID:      &group1,
				Group1Status:  model.RegistrationStatusApproved,
				ReviewerID1:   &reviewer,
				ReviewedAt1:   &now,
				ReviewRemark1: &remark,
				FinalStatus:   model.RegistrationFinalStatusPending,
			},
			wantPreferredGroupID: group1,
			wantStatus:           model.RecruitmentStatusPendingInterview,
		},
		{
			name: "screening rejected ignores approved second choice",
			registration: model.Registration{
				Group1ID:     &group1,
				Group2ID:     &group2,
				Group1Status: model.RegistrationStatusRejected,
				Group2Status: model.RegistrationStatusApproved,
				ReviewerID1:  &reviewer,
				ReviewedAt1:  &now,
				FinalStatus:  model.RegistrationFinalStatusPending,
			},
			wantPreferredGroupID: group1,
			wantStatus:           model.RecruitmentStatusRejected,
			wantRejectedStage:    model.RecruitmentRejectedStageScreening,
		},
		{
			name: "legacy interview pass without final admission is not guessed as admitted",
			registration: model.Registration{
				Group1ID:     &group1,
				Group1Status: model.RegistrationStatusApproved,
				FinalStatus:  model.RegistrationFinalStatusPending,
				Interviews: []model.RegistrationInterview{
					{GroupID: group1, Status: model.RegistrationInterviewPassed, InterviewerID: &interviewer, InterviewedAt: &now, Remark: &interviewRemark},
				},
			},
			wantPreferredGroupID: group1,
			wantStatus:           model.RecruitmentStatusPendingInterview,
			wantInterviewer:      true,
		},
		{
			name: "first choice interview failure ends workflow even if second passed",
			registration: model.Registration{
				Group1ID:     &group1,
				Group2ID:     &group2,
				Group1Status: model.RegistrationStatusApproved,
				Group2Status: model.RegistrationStatusApproved,
				FinalStatus:  model.RegistrationFinalStatusPending,
				Interviews: []model.RegistrationInterview{
					{GroupID: group1, Status: model.RegistrationInterviewFailed, InterviewerID: &interviewer, InterviewedAt: &now, Remark: &interviewRemark},
					{GroupID: group2, Status: model.RegistrationInterviewPassed},
				},
			},
			wantPreferredGroupID: group1,
			wantStatus:           model.RecruitmentStatusRejected,
			wantRejectedStage:    model.RecruitmentRejectedStageInterview,
			wantInterviewer:      true,
		},
		{
			name: "second choice only interview is archived and not guessed as admission",
			registration: model.Registration{
				Group1ID:     &group1,
				Group2ID:     &group2,
				Group1Status: model.RegistrationStatusApproved,
				Group2Status: model.RegistrationStatusApproved,
				FinalStatus:  model.RegistrationFinalStatusPending,
				Interviews: []model.RegistrationInterview{
					{GroupID: group2, Status: model.RegistrationInterviewPassed, InterviewerID: &interviewer, InterviewedAt: &now},
				},
			},
			wantPreferredGroupID: group1,
			wantStatus:           model.RecruitmentStatusPendingInterview,
		},
		{
			name: "historical second choice admission keeps recorded final group",
			registration: model.Registration{
				Group1ID:     &group1,
				Group2ID:     &group2,
				FinalGroupID: &group2,
				FinalStatus:  model.RegistrationFinalStatusAdmitted,
				Interviews: []model.RegistrationInterview{
					{GroupID: group1, Status: model.RegistrationInterviewFailed},
					{GroupID: group2, Status: model.RegistrationInterviewPassed, InterviewerID: &interviewer, InterviewedAt: &now, Remark: &interviewRemark},
				},
			},
			wantPreferredGroupID: group2,
			wantStatus:           model.RecruitmentStatusAdmitted,
			wantInterviewer:      true,
		},
		{
			name: "withdrawn legacy record",
			registration: model.Registration{
				Group1ID: &group1,
				Status:   model.RegistrationStatusCancelled,
			},
			wantPreferredGroupID: group1,
			wantStatus:           model.RecruitmentStatusWithdrawn,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := buildRecruitmentBackfill(&test.registration)
			if got.PreferredGroupID == nil || *got.PreferredGroupID != test.wantPreferredGroupID {
				t.Fatalf("preferred group = %#v, want %d", got.PreferredGroupID, test.wantPreferredGroupID)
			}
			if got.Status != test.wantStatus {
				t.Fatalf("status = %q, want %q", got.Status, test.wantStatus)
			}
			stage := ""
			if got.RejectedStage != nil {
				stage = *got.RejectedStage
			}
			if stage != test.wantRejectedStage {
				t.Fatalf("rejected stage = %q, want %q", stage, test.wantRejectedStage)
			}
			if test.wantInterviewer && (got.InterviewerID == nil || *got.InterviewerID != interviewer || got.InterviewedAt == nil || got.InterviewRemark == nil || *got.InterviewRemark != interviewRemark) {
				t.Fatalf("expected canonical first-choice interview facts, got %#v", got)
			}
			if test.name == "second choice only interview is archived and not guessed as admission" && got.InterviewerID != nil {
				t.Fatalf("second-choice-only interview must not populate canonical interviewer: %#v", got)
			}
		})
	}
}
