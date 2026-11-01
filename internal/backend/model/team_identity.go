package model

import "time"

const (
	TeamIdentityCommunityMember = "community_member"
	TeamIdentityReserveMember   = "reserve_member"
	TeamIdentityFormalMember    = "formal_member"
	TeamIdentityFormerMember    = "former_member"
)

func NormalizeTeamIdentityStatus(status string) string {
	switch status {
	case TeamIdentityReserveMember, TeamIdentityFormalMember, TeamIdentityFormerMember:
		return status
	default:
		return TeamIdentityCommunityMember
	}
}

func IsTeamIdentityStatus(status string) bool {
	switch status {
	case TeamIdentityCommunityMember, TeamIdentityReserveMember, TeamIdentityFormalMember, TeamIdentityFormerMember:
		return true
	default:
		return false
	}
}

// TeamIdentityChange is an append-only administrative audit record. It is kept
// independent of system roles, organization positions, group membership, and
// community growth data.
type TeamIdentityChange struct {
	ID                           uint64    `json:"id" gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	UserID                       uint64    `json:"userId" gorm:"column:user_id;type:bigint unsigned;not null;index:idx_team_identity_user_created"`
	ActorUserID                  uint64    `json:"actorUserId" gorm:"column:actor_user_id;type:bigint unsigned;not null"`
	ActorName                    string    `json:"actorName" gorm:"column:actor_name;size:120;not null;default:''"`
	PreviousStatus               string    `json:"previousStatus" gorm:"column:previous_status;size:32;not null"`
	NextStatus                   string    `json:"nextStatus" gorm:"column:next_status;size:32;not null"`
	Reason                       string    `json:"reason" gorm:"type:varchar(500);not null"`
	AssessmentPassed             bool      `json:"assessmentPassed" gorm:"column:assessment_passed;not null;default:false"`
	LeaderConfirmed              bool      `json:"leaderConfirmed" gorm:"column:leader_confirmed;not null;default:false"`
	PriorFormalMembershipConfirm bool      `json:"priorFormalMembershipConfirmed" gorm:"column:prior_formal_membership_confirmed;not null;default:false"`
	CreatedAt                    time.Time `json:"createdAt" gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP;index:idx_team_identity_user_created"`
}

func (TeamIdentityChange) TableName() string { return "team_identity_changes" }
