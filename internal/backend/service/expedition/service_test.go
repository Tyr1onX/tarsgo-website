package expedition

import (
	"context"
	"net/http"
	"testing"
)

func TestNormalizeProjectRequiresCrossGroupStagesJointAcceptanceAndParticipants(t *testing.T) {
	mechanicalID, controlsID := uint64(10), uint64(20)
	base := ProjectInput{
		Title: "跨组联调", Objective: "完成联合验收", Visibility: "team",
		Milestones: []MilestoneInput{
			{GroupID: &mechanicalID, Name: "底盘", Criteria: "完成装配"},
			{GroupID: &controlsID, Name: "控制", Criteria: "完成调试"},
			{Name: "联合验收", Criteria: "完成整机联调"},
		},
		Participants: []ParticipantInput{{GroupID: mechanicalID, UserID: 101}, {GroupID: controlsID, UserID: 202}},
	}
	if _, err := normalizeProjectInput(base); err != nil {
		t.Fatalf("valid project input rejected: %v", err)
	}

	withoutJoint := base
	withoutJoint.Milestones = append([]MilestoneInput(nil), base.Milestones[:2]...)
	if _, err := normalizeProjectInput(withoutJoint); statusOf(err) != http.StatusBadRequest {
		t.Fatalf("project without joint phase status = %d, want 400", statusOf(err))
	}

	withoutParticipant := base
	withoutParticipant.Participants = []ParticipantInput{{GroupID: mechanicalID, UserID: 101}}
	if _, err := normalizeProjectInput(withoutParticipant); statusOf(err) != http.StatusBadRequest {
		t.Fatalf("project missing a group's participants status = %d, want 400", statusOf(err))
	}

	withForeignParticipant := base
	withForeignParticipant.Participants = append(append([]ParticipantInput(nil), base.Participants...), ParticipantInput{GroupID: 99, UserID: 303})
	if _, err := normalizeProjectInput(withForeignParticipant); statusOf(err) != http.StatusBadRequest {
		t.Fatalf("project with unrelated participant group status = %d, want 400", statusOf(err))
	}
}

func TestOnlySuperAdminCanCreateAndOnlyAdminsCanReview(t *testing.T) {
	service := NewService(nil)
	if _, err := service.CreateProject(context.Background(), Actor{ID: 7, RoleName: "user"}, ProjectInput{}); statusOf(err) != http.StatusForbidden {
		t.Fatalf("member create status = %d, want 403", statusOf(err))
	}
	if _, err := service.ReviewMilestone(context.Background(), Actor{ID: 8, RoleName: "user"}, 1, ReviewInput{Action: "accept", Content: "依据"}); statusOf(err) != http.StatusForbidden {
		t.Fatalf("member review status = %d, want 403", statusOf(err))
	}
}

func TestEvolutionTargetMustMatchTheOwningGroupAndExplicitJointStage(t *testing.T) {
	mechanicalID, visionID := uint64(10), uint64(30)
	cases := []struct {
		name      string
		groupName string
		groupID   *uint64
		target    string
		valid     bool
	}{
		{name: "mechanical chassis", groupName: "机械组", groupID: &mechanicalID, target: "chassis", valid: true},
		{name: "vision perception", groupName: "视觉组", groupID: &visionID, target: "perception", valid: true},
		{name: "mechanical cannot activate control", groupName: "机械组", groupID: &mechanicalID, target: "control"},
		{name: "vision cannot activate chassis", groupName: "视觉组", groupID: &visionID, target: "chassis"},
		{name: "unknown target rejected", groupName: "机械组", groupID: &mechanicalID, target: "robot-complete"},
		{name: "joint target requires joint stage", groupName: "机械组", groupID: &mechanicalID, target: "joint"},
		{name: "joint may activate whole robot", target: "joint", valid: true},
		{name: "joint cannot activate a component", target: "chassis"},
		{name: "unassociated stages remain valid", groupName: "机械组", groupID: &mechanicalID, valid: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := validEvolutionTarget(tc.groupName, tc.groupID, tc.target); got != tc.valid {
				t.Fatalf("validEvolutionTarget() = %v, want %v", got, tc.valid)
			}
		})
	}
}
