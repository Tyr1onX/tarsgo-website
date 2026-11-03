package model

const (
	TeamIdentityCommunityMember = "community_member"
	TeamIdentityTraineeMember   = "trainee_member"
	TeamIdentityReserveMember   = "reserve_member"
	TeamIdentityFormalMember    = "formal_member"
	TeamIdentityFormerMember    = "former_member"
)

func NormalizeTeamIdentityStatus(status string) string {
	switch status {
	case TeamIdentityTraineeMember, TeamIdentityReserveMember, TeamIdentityFormalMember, TeamIdentityFormerMember:
		return status
	default:
		return TeamIdentityCommunityMember
	}
}

func IsTeamIdentityStatus(status string) bool {
	switch status {
	case TeamIdentityCommunityMember, TeamIdentityTraineeMember, TeamIdentityReserveMember, TeamIdentityFormalMember, TeamIdentityFormerMember:
		return true
	default:
		return false
	}
}
