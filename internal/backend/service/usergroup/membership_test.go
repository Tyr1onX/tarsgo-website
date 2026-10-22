package usergroup

import (
	"testing"

	"tarsgo-backend/model"
)

func TestBuildMembershipResolution(t *testing.T) {
	tests := []struct {
		name           string
		user           model.User
		members        []model.UserGroupMember
		state          string
		groupCount     int
		canSelfConfirm bool
	}{
		{
			name:           "unassigned account",
			user:           model.User{Role: model.Role{Name: model.RoleNameUser}},
			state:          MembershipStateUnassigned,
			groupCount:     0,
			canSelfConfirm: false,
		},
		{
			name: "one active group ignores disabled group choices",
			user: model.User{Role: model.Role{Name: model.RoleNameUser}},
			members: []model.UserGroupMember{
				{GroupID: 1, Group: model.UserGroup{ID: 1, Name: "机械组", Status: model.UserGroupStatusActive}},
				{GroupID: 2, Group: model.UserGroup{ID: 2, Name: "旧组", Status: model.UserGroupStatusDisabled}},
			},
			state:          MembershipStateAssigned,
			groupCount:     1,
			canSelfConfirm: false,
		},
		{
			name: "ordinary multi group account can self confirm",
			user: model.User{Role: model.Role{Name: model.RoleNameUser}},
			members: []model.UserGroupMember{
				{GroupID: 1, Group: model.UserGroup{ID: 1, Name: "AI组", Status: model.UserGroupStatusActive}},
				{GroupID: 2, Group: model.UserGroup{ID: 2, Name: "运营组", Status: model.UserGroupStatusActive}},
			},
			state:          MembershipStatePending,
			groupCount:     2,
			canSelfConfirm: true,
		},
		{
			name: "group manager membership cannot be self removed",
			user: model.User{Role: model.Role{Name: model.RoleNameUser}},
			members: []model.UserGroupMember{
				{GroupID: 1, Group: model.UserGroup{ID: 1, Name: "AI组", Status: model.UserGroupStatusActive}},
				{GroupID: 2, Role: model.UserGroupMemberRoleLeader, Group: model.UserGroup{ID: 2, Name: "运营组", Status: model.UserGroupStatusActive}},
			},
			state:          MembershipStatePending,
			groupCount:     2,
			canSelfConfirm: false,
		},
		{
			name: "legacy admin scope does not constrain group identity confirmation",
			user: model.User{Role: model.Role{Name: model.RoleNameAdmin}, AdminScope: model.AdminScopeGroup},
			members: []model.UserGroupMember{
				{GroupID: 1, Group: model.UserGroup{ID: 1, Name: "AI组", Status: model.UserGroupStatusActive}},
				{GroupID: 2, Group: model.UserGroup{ID: 2, Name: "运营组", Status: model.UserGroupStatusActive}},
			},
			state:          MembershipStatePending,
			groupCount:     2,
			canSelfConfirm: true,
		},
		{
			name: "legacy group administrator title does not grant or constrain confirmation",
			user: model.User{Role: model.Role{Name: model.RoleNameUser}},
			members: []model.UserGroupMember{
				{GroupID: 1, Role: model.UserGroupMemberRoleLegacyAdmin, Group: model.UserGroup{ID: 1, Name: "AI组", Status: model.UserGroupStatusActive}},
				{GroupID: 2, Group: model.UserGroup{ID: 2, Name: "运营组", Status: model.UserGroupStatusActive}},
			},
			state:          MembershipStatePending,
			groupCount:     2,
			canSelfConfirm: true,
		},
		{
			name: "super admin membership cannot be self removed",
			user: model.User{Role: model.Role{Name: model.RoleNameSuperAdmin}},
			members: []model.UserGroupMember{
				{GroupID: 1, Group: model.UserGroup{ID: 1, Name: "AI组", Status: model.UserGroupStatusActive}},
				{GroupID: 2, Group: model.UserGroup{ID: 2, Name: "运营组", Status: model.UserGroupStatusActive}},
			},
			state:          MembershipStatePending,
			groupCount:     2,
			canSelfConfirm: false,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			user := test.user
			user.GroupMembers = test.members
			resolution := buildMembershipResolution(&user)
			if resolution.State != test.state {
				t.Fatalf("state = %q, want %q", resolution.State, test.state)
			}
			if len(resolution.Groups) != test.groupCount {
				t.Fatalf("candidate groups = %d, want %d", len(resolution.Groups), test.groupCount)
			}
			if resolution.CanSelfConfirm != test.canSelfConfirm {
				t.Fatalf("canSelfConfirm = %v, want %v", resolution.CanSelfConfirm, test.canSelfConfirm)
			}
		})
	}
}

func TestOnlyMemberAndLeaderCanBeAssignedAsOrganizationIdentity(t *testing.T) {
	if !isAssignableOrganizationRole(model.UserGroupMemberRoleMember) || !isAssignableOrganizationRole(model.UserGroupMemberRoleLeader) {
		t.Fatal("member and leader identities should remain assignable")
	}
	if isAssignableOrganizationRole(model.UserGroupMemberRoleLegacyAdmin) || isAssignableOrganizationRole(3) {
		t.Fatal("legacy group administrator and unknown identity values must not be assignable")
	}
}

func TestContainsMembershipGroupOnlyAcceptsListedGroup(t *testing.T) {
	groups := []MembershipOption{{GroupID: 10}, {GroupID: 20}}
	if !containsMembershipGroup(groups, 20) {
		t.Fatal("expected current group to be selectable")
	}
	if containsMembershipGroup(groups, 30) {
		t.Fatal("group outside the current candidate list must not be selectable")
	}
}
