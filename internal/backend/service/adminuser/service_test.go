package adminuser

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"

	"tarsgo-backend/model"
	"tarsgo-backend/service/auth"
)

func TestServiceUpdateUser_AdminCanModifyAdminProfileWithoutChangingRole(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	updated, err := service.UpdateUser(context.Background(), Actor{ID: 1, RoleName: model.RoleNameAdmin, AdminScope: model.AdminScopeGroup}, 2, UpdateUserInput{
		RoleID: repo.roleID(model.RoleNameAdmin),
		Name:   "Updated Admin",
		Email:  "admin@example.com",
		Gender: 0,
		Status: model.UserStatusEnabled,
	})
	if err != nil {
		t.Fatalf("admin profile update returned error: %v", err)
	}
	if updated.Name != "Updated Admin" || updated.Role.Name != model.RoleNameAdmin {
		t.Fatalf("unexpected updated admin: %#v", updated)
	}
}

func TestServiceUpdateUser_SuperAdminCannotModifySuperAdmin(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	_, err := service.UpdateUser(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, 1, UpdateUserInput{
		RoleID: repo.roleID(model.RoleNameSuperAdmin),
		Name:   "Updated Root",
		Email:  "root@example.com",
		Gender: 0,
		Status: model.UserStatusEnabled,
	})

	assertServiceError(t, err, 403, "超级管理员")
}

func TestServiceUpdateUser_AdminCanModifyUser(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)
	birthday := time.Date(1999, 3, 12, 0, 0, 0, 0, time.UTC)

	detail, err := service.UpdateUser(context.Background(), Actor{ID: 2, RoleName: model.RoleNameAdmin}, 3, UpdateUserInput{
		RoleID:    repo.roleID(model.RoleNameUser),
		Name:      "Updated User",
		Email:     "member@example.com",
		Nickname:  "new-nick",
		AvatarURL: "https://example.com/avatar.png",
		Phone:     "13800138000",
		RealName:  "Member Real",
		Gender:    2,
		Birthday:  &birthday,
		Status:    model.UserStatusDisabled,
	})
	if err != nil {
		t.Fatalf("UpdateUser returned error: %v", err)
	}

	if detail.Name != "Updated User" {
		t.Fatalf("expected updated name, got %q", detail.Name)
	}
	if detail.Email != "member@example.com" {
		t.Fatalf("expected login email to remain unchanged, got %q", detail.Email)
	}
	if detail.Role.Name != model.RoleNameUser {
		t.Fatalf("expected user role, got %q", detail.Role.Name)
	}
	if detail.Status != model.UserStatusDisabled {
		t.Fatalf("expected disabled status, got %d", detail.Status)
	}
	if detail.Birthday == nil || *detail.Birthday != "1999-03-12" {
		t.Fatalf("expected formatted birthday, got %#v", detail.Birthday)
	}
}

func TestServiceCreateUser_AdminCannotCreateAdmin(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	_, err := service.CreateUser(context.Background(), Actor{ID: 2, RoleName: model.RoleNameAdmin}, CreateUserInput{
		RoleID:   repo.roleID(model.RoleNameAdmin),
		Name:     "Bad Admin",
		Email:    "bad-admin@example.com",
		Password: "Password123",
		Gender:   0,
	})

	assertServiceError(t, err, 403, "创建该角色")
}

func TestServiceCreateUser_SuperAdminCanCreateAdmin(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	detail, err := service.CreateUser(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, CreateUserInput{
		RoleID:   repo.roleID(model.RoleNameAdmin),
		Name:     "Created Admin",
		Email:    "created-admin@example.com",
		Password: "Password123",
		Gender:   1,
	})
	if err != nil {
		t.Fatalf("CreateUser returned error: %v", err)
	}

	if detail.Role.Name != model.RoleNameAdmin {
		t.Fatalf("expected admin role, got %q", detail.Role.Name)
	}
	if detail.AuthMethods.HasPassword != true {
		t.Fatalf("expected created user to have password auth")
	}
	if len(detail.Groups) != 0 {
		t.Fatalf("expected admin account not to be auto-assigned to user groups")
	}
}

func TestServiceCreateUser_AssignsDefaultGroupForNormalUser(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	detail, err := service.CreateUser(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, CreateUserInput{
		RoleID:   repo.roleID(model.RoleNameUser),
		Name:     "Created Member",
		Email:    "created-member@example.com",
		Password: "Password123",
		Gender:   0,
	})
	if err != nil {
		t.Fatalf("CreateUser returned error: %v", err)
	}

	if len(detail.Groups) != 1 {
		t.Fatalf("expected 1 default group, got %d", len(detail.Groups))
	}
	if detail.Groups[0].Name != repo.defaultGroup.Name {
		t.Fatalf("expected default group %q, got %q", repo.defaultGroup.Name, detail.Groups[0].Name)
	}
}

func TestServiceResetPassword_SuperAdminOnly(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	if err := service.ResetPassword(context.Background(), Actor{ID: 2, RoleName: model.RoleNameAdmin}, 3, "Password123"); err == nil {
		t.Fatalf("expected admin password reset to fail")
	}

	oldHash := deref(repo.users[3].PasswordHash)
	if err := service.ResetPassword(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, 3, "Password123"); err != nil {
		t.Fatalf("super admin ResetPassword returned error: %v", err)
	}
	newHash := deref(repo.users[3].PasswordHash)
	if newHash == "" || newHash == oldHash {
		t.Fatalf("expected password hash to change")
	}
	if err := auth.ComparePassword(newHash, "Password123"); err != nil {
		t.Fatalf("expected new hash to match password: %v", err)
	}
}

func TestServiceValidationErrors(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	_, err := service.CreateUser(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, CreateUserInput{
		RoleID:   repo.roleID(model.RoleNameUser),
		Name:     "Invalid Gender",
		Email:    "invalid-gender@example.com",
		Password: "Password123",
		Gender:   9,
	})
	assertServiceError(t, err, 400, "性别")

	_, err = service.UpdateUser(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, 3, UpdateUserInput{
		RoleID: repo.roleID(model.RoleNameUser),
		Name:   "Invalid Status",
		Email:  "member@example.com",
		Gender: 0,
		Status: 9,
	})
	assertServiceError(t, err, 400, "状态")
}

func TestServiceListUsers_SupportsGroupFilter(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	repo.users[3].GroupMembers = []model.UserGroupMember{
		{
			ID:       1,
			GroupID:  repo.defaultGroup.ID,
			UserID:   3,
			Role:     model.UserGroupMemberRoleMember,
			JoinedAt: time.Now(),
			Group:    repo.defaultGroup,
		},
		{
			ID:       2,
			GroupID:  2,
			UserID:   3,
			Role:     model.UserGroupMemberRoleLeader,
			JoinedAt: time.Now(),
			Group: model.UserGroup{
				ID:     2,
				Name:   "视觉组",
				Status: model.UserGroupStatusActive,
			},
		},
	}

	groupID := uint64(2)
	result, err := service.ListUsers(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, ListUsersInput{
		GroupID: &groupID,
	})
	if err != nil {
		t.Fatalf("ListUsers returned error: %v", err)
	}

	if len(result.Items) != 1 {
		t.Fatalf("expected 1 filtered user, got %d", len(result.Items))
	}
	if result.Items[0].ID != 3 {
		t.Fatalf("expected filtered user 3, got %d", result.Items[0].ID)
	}
	if len(result.Items[0].Groups) != 2 {
		t.Fatalf("expected user groups to remain populated, got %d", len(result.Items[0].Groups))
	}
}

func TestServiceGroupLeaderCanEditManagedAdminProfile(t *testing.T) {
	repo := newFakeRepository()
	groupID := uint64(7)
	repo.users[4] = &model.User{ID: 4, RoleID: repo.roleID(model.RoleNameAdmin), Role: repo.roles[repo.roleID(model.RoleNameAdmin)], Name: "组内管理员", Email: "managed@example.com", Status: model.UserStatusEnabled, AdminScope: model.AdminScopeGroup, ManagementGroupID: &groupID, GroupMembers: []model.UserGroupMember{{GroupID: groupID, Role: model.UserGroupMemberRoleGroupAdmin}}}
	service := NewService(repo)
	updated, err := service.UpdateUser(context.Background(), Actor{ID: 9, RoleName: model.RoleNameAdmin, AdminScope: model.AdminScopeGroup, ManagementGroupID: &groupID, GroupRole: "leader"}, 4, UpdateUserInput{RoleID: repo.roleID(model.RoleNameAdmin), Name: "已修改", Email: "managed@example.com", Nickname: "新昵称", Status: model.UserStatusEnabled})
	if err != nil {
		t.Fatalf("group leader profile update: %v", err)
	}
	if updated.Name != "已修改" || updated.Nickname == nil || *updated.Nickname != "新昵称" {
		t.Fatalf("unexpected updated profile: %#v", updated)
	}
}

func TestServiceLegacyGroupAdminCanEditAdminProfile(t *testing.T) {
	repo := newFakeRepository()
	groupID := uint64(7)
	repo.users[4] = &model.User{ID: 4, RoleID: repo.roleID(model.RoleNameAdmin), Role: repo.roles[repo.roleID(model.RoleNameAdmin)], Name: "管理员", Email: "global-in-group@example.com", Status: model.UserStatusEnabled, AdminScope: model.AdminScopeGlobal, GroupMembers: []model.UserGroupMember{{GroupID: groupID, Role: model.UserGroupMemberRoleMember}}}
	service := NewService(repo)
	updated, err := service.UpdateUser(context.Background(), Actor{ID: 9, RoleName: model.RoleNameAdmin, AdminScope: model.AdminScopeGroup, ManagementGroupID: &groupID, GroupRole: "leader"}, 4, UpdateUserInput{RoleID: repo.roleID(model.RoleNameAdmin), Name: "已更新管理员", Email: "global-in-group@example.com", Status: model.UserStatusEnabled})
	if err != nil {
		t.Fatalf("legacy group-scoped admin should have normal admin profile access: %v", err)
	}
	if updated.Name != "已更新管理员" {
		t.Fatalf("unexpected updated admin: %#v", updated)
	}
}

func TestServiceGlobalAdminCannotChangeAdminStatus(t *testing.T) {
	repo := newFakeRepository()
	repo.users[4] = &model.User{ID: 4, RoleID: repo.roleID(model.RoleNameAdmin), Role: repo.roles[repo.roleID(model.RoleNameAdmin)], Name: "全局管理员", Email: "global@example.com", Status: model.UserStatusEnabled, AdminScope: model.AdminScopeGlobal}
	service := NewService(repo)
	_, err := service.UpdateUser(context.Background(), Actor{ID: 9, RoleName: model.RoleNameAdmin, AdminScope: model.AdminScopeGlobal}, 4, UpdateUserInput{RoleID: repo.roleID(model.RoleNameAdmin), Name: "全局管理员", Email: "global@example.com", Status: model.UserStatusDisabled})
	assertServiceError(t, err, http.StatusForbidden, "只能启用或停用成员账号")
}

func TestServiceGlobalAdminCanChangeUserStatus(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)
	_, err := service.UpdateUser(context.Background(), Actor{ID: 9, RoleName: model.RoleNameAdmin, AdminScope: model.AdminScopeGlobal}, 3, UpdateUserInput{RoleID: repo.roleID(model.RoleNameUser), Name: "Member", Email: "member@example.com", Status: model.UserStatusDisabled})
	if err != nil {
		t.Fatalf("global admin user status update: %v", err)
	}
	if repo.users[3].Status != model.UserStatusDisabled {
		t.Fatalf("expected user to be disabled")
	}
}

func TestServiceLegacyGroupAdminCanChangeMemberStatus(t *testing.T) {
	repo := newFakeRepository()
	groupID := uint64(7)
	repo.users[3].GroupMembers = []model.UserGroupMember{{GroupID: groupID, Role: model.UserGroupMemberRoleMember}}
	service := NewService(repo)
	_, err := service.UpdateUser(context.Background(), Actor{ID: 9, RoleName: model.RoleNameAdmin, AdminScope: model.AdminScopeGroup, ManagementGroupID: &groupID, GroupRole: "leader"}, 3, UpdateUserInput{RoleID: repo.roleID(model.RoleNameUser), Name: "Member", Email: "member@example.com", Status: model.UserStatusDisabled})
	if err != nil {
		t.Fatalf("legacy group-scoped admin should retain normal admin status access: %v", err)
	}
	if repo.users[3].Status != model.UserStatusDisabled {
		t.Fatal("expected member to be disabled")
	}
}

func TestServiceLegacyGroupAdminHasGlobalPersonnelAccess(t *testing.T) {
	repo := newFakeRepository()
	groupID := uint64(7)
	repo.users[2].AdminScope = model.AdminScopeGroup
	repo.users[2].ManagementGroupID = &groupID
	repo.users[2].GroupMembers = []model.UserGroupMember{{GroupID: groupID, Role: model.UserGroupMemberRoleLeader}}
	repo.users[5] = &model.User{ID: 5, RoleID: repo.roleID(model.RoleNameUser), Role: repo.roles[repo.roleID(model.RoleNameUser)], Name: "其他组成员", Email: "other-group-member@example.com", Status: model.UserStatusEnabled, GroupMembers: []model.UserGroupMember{{GroupID: 8, Role: model.UserGroupMemberRoleMember}}}
	service := NewService(repo)
	actor := Actor{ID: 8, RoleName: model.RoleNameAdmin, AdminScope: model.AdminScopeGroup, ManagementGroupID: &groupID, GroupRole: "group_admin"}

	result, err := service.ListUsers(context.Background(), actor, ListUsersInput{})
	if err != nil {
		t.Fatalf("legacy group admin list: %v", err)
	}
	seen := map[uint64]bool{}
	for _, item := range result.Items {
		seen[item.ID] = true
	}
	if !seen[5] {
		t.Fatalf("legacy group scope must not hide users from another group: %#v", result.Items)
	}
	if _, err := service.GetUser(context.Background(), actor, 5); err != nil {
		t.Fatalf("legacy group scope must not restrict user detail access: %v", err)
	}
}

func TestServiceListUsersSupportsBusinessRoleFilters(t *testing.T) {
	repo := newFakeRepository()
	groupID := uint64(7)
	otherGroupID := uint64(8)
	repo.users[2].AdminScope = model.AdminScopeGroup
	repo.users[2].ManagementGroupID = &groupID
	repo.users[2].GroupMembers = []model.UserGroupMember{{GroupID: groupID, Role: model.UserGroupMemberRoleLeader}}
	repo.users[3].GroupMembers = []model.UserGroupMember{{GroupID: groupID, Role: model.UserGroupMemberRoleMember}}
	repo.users[4] = &model.User{
		ID:                4,
		RoleID:            repo.roleID(model.RoleNameAdmin),
		Role:              repo.roles[repo.roleID(model.RoleNameAdmin)],
		Name:              "组内管理员",
		Email:             "group-admin@example.com",
		Status:            model.UserStatusEnabled,
		AdminScope:        model.AdminScopeGroup,
		ManagementGroupID: &groupID,
		GroupMembers:      []model.UserGroupMember{{GroupID: groupID, Role: model.UserGroupMemberRoleGroupAdmin}},
	}
	globalGroupMember := model.UserGroupMember{GroupID: otherGroupID, Role: model.UserGroupMemberRoleMember}
	repo.users[5] = &model.User{
		ID:           5,
		RoleID:       repo.roleID(model.RoleNameAdmin),
		Role:         repo.roles[repo.roleID(model.RoleNameAdmin)],
		Name:         "全局管理员",
		Email:        "global-admin@example.com",
		Status:       model.UserStatusEnabled,
		AdminScope:   model.AdminScopeGlobal,
		GroupMembers: []model.UserGroupMember{globalGroupMember},
	}

	service := NewService(repo)
	cases := []struct {
		name string
		role string
		want uint64
	}{
		{name: "member", role: UserFilterRoleMember, want: 1},
		{name: "group admin", role: UserFilterRoleGroupAdmin, want: 1},
		{name: "leader", role: UserFilterRoleLeader, want: 1},
		{name: "global admin", role: UserFilterRoleGlobal, want: 1},
		{name: "super admin", role: UserFilterRoleSuperAdmin, want: 1},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			result, err := service.ListUsers(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, ListUsersInput{Role: testCase.role})
			if err != nil {
				t.Fatalf("ListUsers returned error: %v", err)
			}
			if result.Pagination.Total != int64(testCase.want) {
				t.Fatalf("expected %d result(s), got %d: %#v", testCase.want, result.Pagination.Total, result.Items)
			}
		})
	}

	result, err := service.ListUsers(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, ListUsersInput{
		Role:    UserFilterRoleGroupAdmin,
		GroupID: &otherGroupID,
	})
	if err != nil {
		t.Fatalf("group-scoped ListUsers returned error: %v", err)
	}
	if result.Pagination.Total != 0 {
		t.Fatalf("expected no group admins in another group, got %#v", result.Items)
	}
}

func TestServiceListUsers_ReturnsGithubBoundSummary(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	result, err := service.ListUsers(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, ListUsersInput{})
	if err != nil {
		t.Fatalf("ListUsers returned error: %v", err)
	}

	if result.Summary.GitHubBound != 1 {
		t.Fatalf("expected github bound summary to be 1, got %d", result.Summary.GitHubBound)
	}

	var member *UserListItem
	for i := range result.Items {
		if result.Items[i].ID == 3 {
			member = &result.Items[i]
			break
		}
	}
	if member == nil || member.RealName == nil || *member.RealName != "成员真实姓名" {
		t.Fatalf("expected list user realName to be preserved, got %#v", result.Items)
	}
}

type fakeRepository struct {
	roles             map[uint64]model.Role
	roleByName        map[string]uint64
	users             map[uint64]*model.User
	nextUserID        uint64
	defaultGroup      model.UserGroup
	nextGroupMemberID uint64
}

func newFakeRepository() *fakeRepository {
	repo := &fakeRepository{
		roles:      map[uint64]model.Role{},
		roleByName: map[string]uint64{},
		users:      map[uint64]*model.User{},
		nextUserID: 4,
		defaultGroup: model.UserGroup{
			ID:        1,
			Name:      "默认用户组",
			Status:    model.UserGroupStatusActive,
			IsDefault: true,
		},
		nextGroupMemberID: 1,
	}

	repo.addRole(model.Role{ID: 1, Name: model.RoleNameSuperAdmin, DisplayName: "超级管理员", SortOrder: 1})
	repo.addRole(model.Role{ID: 2, Name: model.RoleNameAdmin, DisplayName: "管理员", SortOrder: 2})
	repo.addRole(model.Role{ID: 3, Name: model.RoleNameUser, DisplayName: "普通用户", SortOrder: 3})

	superAdminHash, _ := auth.HashPassword("RootPassword123")
	adminHash, _ := auth.HashPassword("AdminPassword123")
	memberHash, _ := auth.HashPassword("UserPassword123")

	repo.addUser(&model.User{
		ID:           1,
		RoleID:       repo.roleID(model.RoleNameSuperAdmin),
		Name:         "Root",
		Email:        "root@example.com",
		PasswordHash: stringPtr(superAdminHash),
		Status:       model.UserStatusEnabled,
	})
	repo.addUser(&model.User{
		ID:           2,
		RoleID:       repo.roleID(model.RoleNameAdmin),
		Name:         "Admin",
		Email:        "admin@example.com",
		PasswordHash: stringPtr(adminHash),
		Status:       model.UserStatusEnabled,
	})
	repo.addUser(&model.User{
		ID:             3,
		RoleID:         repo.roleID(model.RoleNameUser),
		Name:           "Member",
		Email:          "member@example.com",
		RealName:       stringPtr("成员真实姓名"),
		PasswordHash:   stringPtr(memberHash),
		GitHubID:       stringPtr("github-3"),
		GitHubUsername: stringPtr("member-gh"),
		Status:         model.UserStatusEnabled,
	})

	return repo
}

func (r *fakeRepository) ListUsers(_ context.Context, input ListUsersInput) ([]model.User, int64, error) {
	result := make([]model.User, 0, len(r.users))
	for _, user := range r.users {
		if input.Role != "" && !matchesUserRoleFilter(user, input.Role, input.GroupID) {
			continue
		}
		if input.Status != nil && user.Status != *input.Status {
			continue
		}
		if input.GroupID != nil && !userInGroup(user, *input.GroupID) {
			continue
		}
		result = append(result, *cloneUser(user))
	}
	return result, int64(len(result)), nil
}

func matchesUserRoleFilter(user *model.User, roleName string, groupID *uint64) bool {
	switch roleName {
	case UserFilterRoleMember:
		return user.Role.Name == model.RoleNameUser
	case UserFilterRoleGroupAdmin:
		return hasMembershipRole(user, model.UserGroupMemberRoleGroupAdmin, groupID)
	case UserFilterRoleLeader:
		return hasMembershipRole(user, model.UserGroupMemberRoleLeader, groupID)
	case UserFilterRoleGlobal, UserFilterRoleGlobalAdmin:
		return user.Role.Name == model.RoleNameAdmin && user.AdminScope == model.AdminScopeGlobal
	case UserFilterRoleSuperAdmin:
		return user.Role.Name == model.RoleNameSuperAdmin
	default:
		return user.Role.Name == roleName
	}
}

func hasMembershipRole(user *model.User, role uint8, groupID *uint64) bool {
	for _, member := range user.GroupMembers {
		if member.Role == role && (groupID == nil || member.GroupID == *groupID) {
			return true
		}
	}
	return false
}

func (r *fakeRepository) GetUserStats(context.Context) (UserStats, error) {
	stats := UserStats{}
	for _, user := range r.users {
		stats.Total++
		if user.Status == model.UserStatusEnabled {
			stats.Enabled++
		}
		if user.Status == model.UserStatusDisabled {
			stats.Disabled++
		}
		if user.Role.Name == model.RoleNameAdmin || user.Role.Name == model.RoleNameSuperAdmin {
			stats.Admins++
		}
		if user.GitHubID != nil && strings.TrimSpace(*user.GitHubID) != "" {
			stats.GitHubBound++
		}
	}
	return stats, nil
}

func (r *fakeRepository) GetUserStatsInGroup(_ context.Context, groupID uint64) (UserStats, error) {
	stats := UserStats{}
	for _, user := range r.users {
		if !userInGroup(user, groupID) {
			continue
		}
		stats.Total++
		if user.Status == model.UserStatusEnabled {
			stats.Enabled++
		}
		if user.Status == model.UserStatusDisabled {
			stats.Disabled++
		}
		if user.Role.Name == model.RoleNameAdmin || user.Role.Name == model.RoleNameSuperAdmin {
			stats.Admins++
		}
		if user.GitHubID != nil && strings.TrimSpace(*user.GitHubID) != "" {
			stats.GitHubBound++
		}
	}
	return stats, nil
}

func (r *fakeRepository) GetUserByID(_ context.Context, userID uint64) (*model.User, error) {
	user, ok := r.users[userID]
	if !ok {
		return nil, gorm.ErrRecordNotFound
	}
	return cloneUser(user), nil
}

func (r *fakeRepository) GetUserByEmail(_ context.Context, email string) (*model.User, error) {
	for _, user := range r.users {
		if user.Email == email {
			return cloneUser(user), nil
		}
	}
	return nil, gorm.ErrRecordNotFound
}

func (r *fakeRepository) ListRoles(context.Context) ([]model.Role, error) {
	roles := make([]model.Role, 0, len(r.roles))
	for _, role := range r.roles {
		roles = append(roles, role)
	}
	return roles, nil
}

func (r *fakeRepository) GetRoleByID(_ context.Context, roleID uint64) (*model.Role, error) {
	role, ok := r.roles[roleID]
	if !ok {
		return nil, gorm.ErrRecordNotFound
	}
	roleCopy := role
	return &roleCopy, nil
}

func (r *fakeRepository) CreateUser(_ context.Context, user *model.User, assignDefaultGroup bool) error {
	role, ok := r.roles[user.RoleID]
	if !ok {
		return gorm.ErrRecordNotFound
	}

	user.ID = r.nextUserID
	r.nextUserID++
	created := cloneUser(user)
	created.Role = role
	if assignDefaultGroup {
		created.GroupMembers = []model.UserGroupMember{
			{
				ID:       r.nextGroupMemberID,
				GroupID:  r.defaultGroup.ID,
				UserID:   created.ID,
				Role:     model.UserGroupMemberRoleMember,
				JoinedAt: time.Now(),
				Group:    r.defaultGroup,
			},
		}
		r.nextGroupMemberID++
	}
	r.users[created.ID] = created
	return nil
}

func (r *fakeRepository) UpdateUser(_ context.Context, userID uint64, updates map[string]any) error {
	user, ok := r.users[userID]
	if !ok {
		return gorm.ErrRecordNotFound
	}

	for key, value := range updates {
		switch key {
		case "role_id":
			roleID, ok := value.(uint64)
			if !ok {
				return errors.New("invalid role_id type")
			}
			role, exists := r.roles[roleID]
			if !exists {
				return gorm.ErrRecordNotFound
			}
			user.RoleID = roleID
			user.Role = role
		case "name":
			user.Name = value.(string)
		case "email":
			user.Email = value.(string)
		case "nickname":
			user.Nickname = copyStringPointer(value.(*string))
		case "avatar_url":
			user.AvatarURL = copyStringPointer(value.(*string))
		case "phone":
			user.Phone = copyStringPointer(value.(*string))
		case "real_name":
			user.RealName = copyStringPointer(value.(*string))
		case "gender":
			user.Gender = value.(uint8)
		case "birthday":
			if birthday, ok := value.(*time.Time); ok && birthday != nil {
				birthdayCopy := *birthday
				user.Birthday = &birthdayCopy
			} else {
				user.Birthday = nil
			}
		case "status":
			user.Status = value.(uint8)
		}
	}

	return nil
}

func (r *fakeRepository) UpdatePasswordHash(_ context.Context, userID uint64, passwordHash string) error {
	user, ok := r.users[userID]
	if !ok {
		return gorm.ErrRecordNotFound
	}
	user.PasswordHash = stringPtr(passwordHash)
	return nil
}

func (r *fakeRepository) addRole(role model.Role) {
	r.roles[role.ID] = role
	r.roleByName[role.Name] = role.ID
}

func (r *fakeRepository) addUser(user *model.User) {
	cloned := cloneUser(user)
	cloned.Role = r.roles[user.RoleID]
	r.users[user.ID] = cloned
}

func (r *fakeRepository) roleID(name string) uint64 {
	return r.roleByName[name]
}

func cloneUser(user *model.User) *model.User {
	cloned := *user
	cloned.PasswordHash = copyStringPointer(user.PasswordHash)
	cloned.GitHubID = copyStringPointer(user.GitHubID)
	cloned.GitHubUsername = copyStringPointer(user.GitHubUsername)
	cloned.Nickname = copyStringPointer(user.Nickname)
	cloned.AvatarURL = copyStringPointer(user.AvatarURL)
	cloned.Phone = copyStringPointer(user.Phone)
	cloned.RealName = copyStringPointer(user.RealName)
	if user.Birthday != nil {
		birthday := *user.Birthday
		cloned.Birthday = &birthday
	}
	cloned.Role = user.Role
	if len(user.GroupMembers) > 0 {
		cloned.GroupMembers = make([]model.UserGroupMember, 0, len(user.GroupMembers))
		for _, member := range user.GroupMembers {
			cloned.GroupMembers = append(cloned.GroupMembers, model.UserGroupMember{
				ID:       member.ID,
				GroupID:  member.GroupID,
				UserID:   member.UserID,
				Role:     member.Role,
				JoinedAt: member.JoinedAt,
				Group:    member.Group,
			})
		}
	}
	return &cloned
}

func copyStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	copied := *value
	return &copied
}

func deref(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func userInGroup(user *model.User, groupID uint64) bool {
	for _, member := range user.GroupMembers {
		if member.GroupID == groupID {
			return true
		}
	}
	return false
}

func assertServiceError(t *testing.T, err error, status int, contains string) {
	t.Helper()

	if err == nil {
		t.Fatalf("expected error, got nil")
	}

	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected ServiceError, got %T", err)
	}
	if serviceErr.Status != status {
		t.Fatalf("expected status %d, got %d", status, serviceErr.Status)
	}
	if contains != "" && !strings.Contains(serviceErr.Message, contains) {
		t.Fatalf("expected message %q to contain %q", serviceErr.Message, contains)
	}
}
