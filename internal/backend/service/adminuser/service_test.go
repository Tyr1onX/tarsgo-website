package adminuser

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	mysqlDriver "github.com/go-sql-driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/model"
	"tarsgo-backend/service/auth"
)

func TestAccountManagementIsSuperAdminOnly(t *testing.T) {
	service := NewService(newFakeRepository())
	actor := Actor{RoleName: model.RoleNameAdmin}

	if _, err := service.ListUsers(context.Background(), actor, ListUsersInput{}); err == nil {
		t.Fatal("expected regular admin account listing to be denied")
	}
	if _, err := service.CreateUser(context.Background(), actor, CreateUserInput{RoleID: 3, Name: "Candidate", Email: "candidate@example.com", Password: "Password123"}); err == nil {
		t.Fatal("expected regular admin account creation to be denied")
	}
}

func TestCreateUserKeepsOnlyAccountFieldsAndLeavesUserUngrouped(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	detail, err := service.CreateUser(context.Background(), Actor{RoleName: model.RoleNameSuperAdmin}, CreateUserInput{
		RoleID:   repo.roleID(model.RoleNameUser),
		Name:     "Candidate",
		Email:    "candidate@example.com",
		Password: "Password123",
	})
	if err != nil {
		t.Fatalf("CreateUser returned error: %v", err)
	}
	if detail.Role.Name != model.RoleNameUser || !detail.AuthMethods.HasPassword {
		t.Fatalf("unexpected created account: %#v", detail)
	}
	created := repo.users[detail.ID]
	if len(created.GroupMembers) != 0 {
		t.Fatalf("new accounts should remain ungrouped, got %#v", created.GroupMembers)
	}
	if created.Gender != 0 || created.Nickname != nil || created.Phone != nil || created.RealName != nil {
		t.Fatalf("account creation should leave profile fields at their defaults: %#v", created)
	}
}

func TestUniqueEmailConstraintRaceReturnsConflictInAccountManagement(t *testing.T) {
	t.Run("create", func(t *testing.T) {
		repo := newFakeRepository()
		repo.createUserErr = &mysqlDriver.MySQLError{Number: 1062}
		service := NewService(repo)

		_, err := service.CreateUser(context.Background(), Actor{RoleName: model.RoleNameSuperAdmin}, CreateUserInput{
			RoleID: repo.roleID(model.RoleNameUser), Name: "Candidate",
			Email: "candidate@example.com", Password: "Password123",
		})
		assertServiceError(t, err, http.StatusConflict, "邮箱")
	})

	t.Run("update", func(t *testing.T) {
		repo := newFakeRepository()
		repo.updateUserErr = &mysqlDriver.MySQLError{Number: 1062}
		service := NewService(repo)

		_, err := service.UpdateUser(context.Background(), Actor{RoleName: model.RoleNameSuperAdmin}, 3, UpdateUserInput{
			RoleID: repo.roleID(model.RoleNameUser), Name: "Candidate",
			Email: "new-candidate@example.com", Status: model.UserStatusEnabled,
		})
		assertServiceError(t, err, http.StatusConflict, "邮箱")
	})
}

func TestUpdateAccountChangesIdentityRoleAndStatusWithoutChangingMemberProfile(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	updated, err := service.UpdateUser(context.Background(), Actor{RoleName: model.RoleNameSuperAdmin}, 3, UpdateUserInput{
		RoleID: repo.roleID(model.RoleNameUser),
		Name:   "Updated Candidate",
		Email:  "updated@example.com",
		Status: model.UserStatusDisabled,
	})
	if err != nil {
		t.Fatalf("UpdateUser returned error: %v", err)
	}
	if updated.Name != "Updated Candidate" || updated.Email != "updated@example.com" || updated.Status != model.UserStatusDisabled {
		t.Fatalf("account fields were not updated: %#v", updated)
	}
	member := repo.users[3]
	if deref(member.RealName) != "Candidate Real Name" || deref(member.Phone) != "13800138000" || member.Gender != 2 {
		t.Fatalf("member profile fields must remain untouched: %#v", member)
	}
}

func TestSuperAdminAccountCannotBeChanged(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	_, err := service.UpdateUser(context.Background(), Actor{RoleName: model.RoleNameSuperAdmin}, 1, UpdateUserInput{
		RoleID: repo.roleID(model.RoleNameSuperAdmin),
		Name:   "Changed Root",
		Email:  "root@example.com",
		Status: model.UserStatusEnabled,
	})
	assertServiceError(t, err, http.StatusForbidden, "超级管理员")
}

func TestResetPasswordRemainsSuperAdminOnly(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	if err := service.ResetPassword(context.Background(), Actor{RoleName: model.RoleNameAdmin}, 3, "Password123"); err == nil {
		t.Fatal("expected regular admin password reset to be denied")
	}
	oldHash := deref(repo.users[3].PasswordHash)
	if err := service.ResetPassword(context.Background(), Actor{RoleName: model.RoleNameSuperAdmin}, 3, "Password123"); err != nil {
		t.Fatalf("super admin ResetPassword returned error: %v", err)
	}
	newHash := deref(repo.users[3].PasswordHash)
	if newHash == "" || newHash == oldHash {
		t.Fatal("expected password hash to change")
	}
	if err := auth.ComparePassword(newHash, "Password123"); err != nil {
		t.Fatalf("expected new hash to match password: %v", err)
	}
}

func TestUpdateUserGroupRoleKeepsSystemPermissionsSeparate(t *testing.T) {
	repo := newFakeRepository()
	user := repo.users[2]
	groupID := uint64(11)
	user.AdminScope = model.AdminScopeGroup
	user.ManagementGroupID = &groupID
	user.GroupMembers = []model.UserGroupMember{{
		GroupID: groupID,
		UserID:  user.ID,
		Role:    model.UserGroupMemberRoleLeader,
		Group:   model.UserGroup{ID: groupID, Name: "机械组", Status: model.UserGroupStatusActive},
	}}
	service := NewService(repo)

	if _, err := service.UpdateUserGroupRole(context.Background(), Actor{ID: 1, RoleName: model.RoleNameAdmin}, user.ID, groupID, model.UserGroupMemberRoleMember); err == nil {
		t.Fatal("expected regular administrator to be denied")
	}
	if user.GroupMembers[0].Role != model.UserGroupMemberRoleLeader {
		t.Fatal("denied role update changed the group membership")
	}
	if _, err := service.UpdateUserGroupRole(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, user.ID, groupID, model.UserGroupMemberRoleLegacyAdmin); err == nil {
		t.Fatal("legacy group administrator must not be assignable")
	} else if serviceErr, ok := err.(*ServiceError); !ok || serviceErr.Status != http.StatusBadRequest {
		t.Fatalf("legacy organization title error = %#v, want bad request", err)
	}
	if user.GroupMembers[0].Role != model.UserGroupMemberRoleLeader {
		t.Fatal("rejected legacy organization identity changed the group membership")
	}

	if _, err := service.UpdateUserGroupRole(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, user.ID, groupID, model.UserGroupMemberRoleMember); err != nil {
		t.Fatalf("UpdateUserGroupRole returned error: %v", err)
	}
	if user.GroupMembers[0].Role != model.UserGroupMemberRoleMember {
		t.Fatalf("group role = %d, want ordinary member", user.GroupMembers[0].Role)
	}
	if user.Role.Name != model.RoleNameAdmin || user.AdminScope != model.AdminScopeGroup || user.ManagementGroupID == nil || *user.ManagementGroupID != groupID {
		t.Fatalf("group role update changed system permissions: %#v", user)
	}
}

func TestSuperAdminCanChangeGroupForAccountWithLeaderOrganizationTitle(t *testing.T) {
	repo := newFakeRepository()
	user := repo.users[2]
	oldGroupID := uint64(11)
	user.GroupMembers = []model.UserGroupMember{{
		GroupID: oldGroupID,
		UserID:  user.ID,
		Role:    model.UserGroupMemberRoleLeader,
		Group:   model.UserGroup{ID: oldGroupID, Name: "机械组", Status: model.UserGroupStatusActive},
	}}
	service := NewService(repo)
	newGroupID := uint64(22)
	if _, err := service.UpdateUserGroup(context.Background(), Actor{ID: 1, RoleName: model.RoleNameAdmin}, user.ID, &newGroupID); err == nil {
		t.Fatal("ordinary admin must not modify group assignments")
	}
	if repo.users[user.ID].GroupMembers[0].Role != model.UserGroupMemberRoleLeader {
		t.Fatal("denied group change altered the organizational title")
	}
	if _, err := service.UpdateUserGroup(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, user.ID, &newGroupID); err != nil {
		t.Fatalf("super admin could not change group for a group leader: %v", err)
	}
	updated := repo.users[user.ID]
	if len(updated.GroupMembers) != 1 || updated.GroupMembers[0].GroupID != newGroupID || updated.GroupMembers[0].Role != model.UserGroupMemberRoleMember {
		t.Fatalf("group membership did not move cleanly: %#v", updated.GroupMembers)
	}
	if updated.Role.Name != model.RoleNameAdmin {
		t.Fatalf("group editing changed system role: %q", updated.Role.Name)
	}
}

func TestAccountInputValidation(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	_, err := service.UpdateUser(context.Background(), Actor{RoleName: model.RoleNameSuperAdmin}, 3, UpdateUserInput{
		RoleID: repo.roleID(model.RoleNameUser),
		Name:   "Invalid Status",
		Email:  "member@example.com",
		Status: 9,
	})
	assertServiceError(t, err, http.StatusBadRequest, "状态")
}

func TestListUsersFiltersBySystemRoleAndStatus(t *testing.T) {
	service := NewService(newFakeRepository())
	enabled := model.UserStatusEnabled
	result, err := service.ListUsers(context.Background(), Actor{RoleName: model.RoleNameSuperAdmin}, ListUsersInput{
		Role:   model.RoleNameUser,
		Status: &enabled,
	})
	if err != nil {
		t.Fatalf("ListUsers returned error: %v", err)
	}
	if result.Pagination.Total != 1 || len(result.Items) != 1 || result.Items[0].Role.Name != model.RoleNameUser {
		t.Fatalf("unexpected filtered account list: %#v", result)
	}
}

func TestListUsersDefaultsToRecentlyConfirmedAccountsAndCanIncludeAll(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)
	now := time.Date(2027, time.February, 1, 12, 0, 0, 0, accountActivityConfirmationStartedAt.Location())
	service.now = func() time.Time { return now }
	repo.users[1].LastLoginAt = timePtr(time.Date(2026, time.October, 20, 12, 0, 0, 0, now.Location()))
	repo.users[2].LastLoginAt = timePtr(time.Date(2026, time.November, 3, 12, 0, 0, 0, now.Location()))
	repo.users[3].LastLoginAt = timePtr(time.Date(2026, time.November, 2, 12, 0, 0, 0, now.Location()))
	repo.addUser(&model.User{
		ID:          4,
		RoleID:      repo.roleID(model.RoleNameUser),
		Name:        "已停用但近期登录",
		Email:       "disabled@example.com",
		Status:      model.UserStatusDisabled,
		LastLoginAt: timePtr(time.Date(2026, time.December, 1, 12, 0, 0, 0, now.Location())),
	})

	active, err := service.ListUsers(context.Background(), Actor{RoleName: model.RoleNameSuperAdmin}, ListUsersInput{})
	if err != nil {
		t.Fatalf("ListUsers returned error: %v", err)
	}
	if len(active.Items) != 1 || active.Items[0].ID != 2 || active.Pagination.Total != 1 {
		t.Fatalf("default list should include only enabled users who logged in after confirmation and within 90 days: %#v", active)
	}
	if active.Summary.Total != 4 || active.Summary.Disabled != 1 {
		t.Fatalf("activity filtering must not change account summary totals: %#v", active.Summary)
	}

	all, err := service.ListUsers(context.Background(), Actor{RoleName: model.RoleNameSuperAdmin}, ListUsersInput{IncludeInactive: true})
	if err != nil {
		t.Fatalf("ListUsers(include inactive) returned error: %v", err)
	}
	if len(all.Items) != 4 || all.Pagination.Total != 4 {
		t.Fatalf("all-account list omitted an inactive or disabled account: %#v", all)
	}
}

func TestAccountActivityCutoffUsesBothConfirmationStartAndNinetyDays(t *testing.T) {
	wantLaunch := time.Date(2026, time.October, 19, 11, 19, 8, 0, accountActivityConfirmationStartedAt.Location())
	if !accountActivityConfirmationStartedAt.Equal(wantLaunch) {
		t.Fatalf("confirmation start = %s, want production launch %s", accountActivityConfirmationStartedAt, wantLaunch)
	}

	launchDayNow := time.Date(2026, time.October, 20, 12, 0, 0, 0, accountActivityConfirmationStartedAt.Location())
	if got := accountActivityCutoff(launchDayNow); !got.Equal(accountActivityConfirmationStartedAt) {
		t.Fatalf("cutoff shortly after launch = %s, want launch %s", got, accountActivityConfirmationStartedAt)
	}

	laterNow := time.Date(2027, time.February, 1, 12, 0, 0, 0, accountActivityConfirmationStartedAt.Location())
	want := laterNow.Add(-90 * 24 * time.Hour)
	if got := accountActivityCutoff(laterNow); !got.Equal(want) {
		t.Fatalf("cutoff after 90 days = %s, want %s", got, want)
	}
}

type fakeRepository struct {
	roles         map[uint64]model.Role
	roleByName    map[string]uint64
	users         map[uint64]*model.User
	nextUserID    uint64
	lastListInput ListUsersInput
	createUserErr error
	updateUserErr error
}

func newFakeRepository() *fakeRepository {
	repo := &fakeRepository{
		roles:      map[uint64]model.Role{},
		roleByName: map[string]uint64{},
		users:      map[uint64]*model.User{},
		nextUserID: 4,
	}
	repo.addRole(model.Role{ID: 1, Name: model.RoleNameSuperAdmin, DisplayName: "超级管理员"})
	repo.addRole(model.Role{ID: 2, Name: model.RoleNameAdmin, DisplayName: "管理员"})
	repo.addRole(model.Role{ID: 3, Name: model.RoleNameUser, DisplayName: "普通用户"})

	rootHash, _ := auth.HashPassword("RootPassword123")
	adminHash, _ := auth.HashPassword("AdminPassword123")
	memberHash, _ := auth.HashPassword("UserPassword123")
	lastLoginAt := accountActivityConfirmationStartedAt.Add(time.Minute)
	repo.addUser(&model.User{ID: 1, RoleID: 1, Name: "Root", Email: "root@example.com", PasswordHash: stringPtr(rootHash), Status: model.UserStatusEnabled, LastLoginAt: &lastLoginAt})
	repo.addUser(&model.User{ID: 2, RoleID: 2, Name: "Admin", Email: "admin@example.com", PasswordHash: stringPtr(adminHash), Status: model.UserStatusEnabled, LastLoginAt: &lastLoginAt})
	repo.addUser(&model.User{
		ID:           3,
		RoleID:       3,
		Name:         "Candidate",
		Email:        "member@example.com",
		Phone:        stringPtr("13800138000"),
		RealName:     stringPtr("Candidate Real Name"),
		Gender:       2,
		PasswordHash: stringPtr(memberHash),
		GitHubID:     stringPtr("github-3"),
		Status:       model.UserStatusEnabled,
		LastLoginAt:  &lastLoginAt,
	})
	return repo
}

func (r *fakeRepository) ListUsers(_ context.Context, input ListUsersInput) ([]model.User, int64, error) {
	r.lastListInput = input
	users := make([]model.User, 0, len(r.users))
	for _, user := range r.users {
		if !input.IncludeInactive && (user.Status != model.UserStatusEnabled || user.LastLoginAt == nil || user.LastLoginAt.Before(input.ActivitySince)) {
			continue
		}
		if input.Role != "" && user.Role.Name != input.Role {
			continue
		}
		if input.Status != nil && user.Status != *input.Status {
			continue
		}
		users = append(users, *cloneUser(user))
	}
	return users, int64(len(users)), nil
}

func (r *fakeRepository) GetUserStats(context.Context) (UserStats, error) {
	stats := UserStats{}
	for _, user := range r.users {
		stats.Total++
		if user.Status == model.UserStatusEnabled {
			stats.Enabled++
		} else {
			stats.Disabled++
		}
		if user.Role.Name == model.RoleNameAdmin || user.Role.Name == model.RoleNameSuperAdmin {
			stats.Admins++
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

func (r *fakeRepository) ListRecruitmentHistory(context.Context, uint64) ([]model.Registration, error) {
	return []model.Registration{}, nil
}

func (r *fakeRepository) UpdateCurrentRecruitmentGroup(context.Context, uint64, uint64) error {
	return nil
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
	return &role, nil
}

func (r *fakeRepository) CreateUser(_ context.Context, user *model.User) error {
	if r.createUserErr != nil {
		return r.createUserErr
	}
	role, ok := r.roles[user.RoleID]
	if !ok {
		return gorm.ErrRecordNotFound
	}
	user.ID = r.nextUserID
	r.nextUserID++
	created := cloneUser(user)
	created.Role = role
	r.users[created.ID] = created
	return nil
}

func (r *fakeRepository) UpdateUserGroup(_ context.Context, actorID, userID uint64, groupID *uint64) error {
	if actorID == 0 {
		return errors.New("actor ID is required")
	}
	user, ok := r.users[userID]
	if !ok {
		return gorm.ErrRecordNotFound
	}
	user.GroupMembers = nil
	if groupID != nil {
		user.GroupMembers = []model.UserGroupMember{{
			GroupID: *groupID,
			UserID:  user.ID,
			Role:    model.UserGroupMemberRoleMember,
			Group:   model.UserGroup{ID: *groupID, Name: "机械组", Status: model.UserGroupStatusActive},
		}}
	}
	return nil
}

func (r *fakeRepository) UpdateUserGroupRole(_ context.Context, actorID, userID, groupID uint64, role uint8) error {
	if actorID == 0 {
		return errors.New("actor ID is required")
	}
	user, ok := r.users[userID]
	if !ok {
		return gorm.ErrRecordNotFound
	}
	for index := range user.GroupMembers {
		if user.GroupMembers[index].GroupID == groupID {
			user.GroupMembers[index].Role = role
			return nil
		}
	}
	return gorm.ErrRecordNotFound
}

func (r *fakeRepository) UpdateUser(_ context.Context, userID uint64, updates map[string]any) error {
	if r.updateUserErr != nil {
		return r.updateUserErr
	}
	user, ok := r.users[userID]
	if !ok {
		return gorm.ErrRecordNotFound
	}
	for key, value := range updates {
		switch key {
		case "role_id":
			roleID := value.(uint64)
			user.RoleID = roleID
			user.Role = r.roles[roleID]
		case "name":
			user.Name = value.(string)
		case "email":
			user.Email = value.(string)
		case "status":
			user.Status = value.(uint8)
		default:
			return errors.New("unexpected account update field: " + key)
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

func (r *fakeRepository) roleID(name string) uint64 { return r.roleByName[name] }

func cloneUser(user *model.User) *model.User {
	cloned := *user
	cloned.PasswordHash = copyStringPointer(user.PasswordHash)
	cloned.GitHubID = copyStringPointer(user.GitHubID)
	cloned.Phone = copyStringPointer(user.Phone)
	cloned.RealName = copyStringPointer(user.RealName)
	if user.LastLoginAt != nil {
		lastLoginAt := *user.LastLoginAt
		cloned.LastLoginAt = &lastLoginAt
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

func timePtr(value time.Time) *time.Time { return &value }

func deref(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func assertServiceError(t *testing.T, err error, status int, contains string) {
	t.Helper()
	if err == nil {
		t.Fatal("expected error, got nil")
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
