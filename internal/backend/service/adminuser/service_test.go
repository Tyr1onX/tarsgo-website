package adminuser

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

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

func TestCreateUserKeepsOnlyAccountFieldsAndAssignsDefaultRecruitmentGroup(t *testing.T) {
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
	if len(created.GroupMembers) != 1 || created.GroupMembers[0].GroupID != repo.defaultGroup.ID {
		t.Fatalf("expected candidate account in default recruitment group, got %#v", created.GroupMembers)
	}
	if created.Gender != 0 || created.Nickname != nil || created.Phone != nil || created.RealName != nil {
		t.Fatalf("account creation should leave profile fields at their defaults: %#v", created)
	}
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

type fakeRepository struct {
	roles        map[uint64]model.Role
	roleByName   map[string]uint64
	users        map[uint64]*model.User
	nextUserID   uint64
	defaultGroup model.UserGroup
}

func newFakeRepository() *fakeRepository {
	repo := &fakeRepository{
		roles:      map[uint64]model.Role{},
		roleByName: map[string]uint64{},
		users:      map[uint64]*model.User{},
		nextUserID: 4,
		defaultGroup: model.UserGroup{
			ID:        1,
			Name:      "招新候选人",
			Status:    model.UserGroupStatusActive,
			IsDefault: true,
		},
	}
	repo.addRole(model.Role{ID: 1, Name: model.RoleNameSuperAdmin, DisplayName: "超级管理员"})
	repo.addRole(model.Role{ID: 2, Name: model.RoleNameAdmin, DisplayName: "管理员"})
	repo.addRole(model.Role{ID: 3, Name: model.RoleNameUser, DisplayName: "普通用户"})

	rootHash, _ := auth.HashPassword("RootPassword123")
	adminHash, _ := auth.HashPassword("AdminPassword123")
	memberHash, _ := auth.HashPassword("UserPassword123")
	repo.addUser(&model.User{ID: 1, RoleID: 1, Name: "Root", Email: "root@example.com", PasswordHash: stringPtr(rootHash), Status: model.UserStatusEnabled})
	repo.addUser(&model.User{ID: 2, RoleID: 2, Name: "Admin", Email: "admin@example.com", PasswordHash: stringPtr(adminHash), Status: model.UserStatusEnabled})
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
	})
	return repo
}

func (r *fakeRepository) ListUsers(_ context.Context, input ListUsersInput) ([]model.User, int64, error) {
	users := make([]model.User, 0, len(r.users))
	for _, user := range r.users {
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
		created.GroupMembers = []model.UserGroupMember{{
			ID:      1,
			GroupID: r.defaultGroup.ID,
			UserID:  created.ID,
			Role:    model.UserGroupMemberRoleMember,
			Group:   r.defaultGroup,
		}}
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
			roleID := value.(uint64)
			user.RoleID = roleID
			user.Role = r.roles[roleID]
		case "name":
			user.Name = value.(string)
		case "email":
			user.Email = value.(string)
		case "status":
			user.Status = value.(uint8)
		case "admin_scope":
			user.AdminScope = value.(string)
		case "management_group_id":
			if value == nil {
				user.ManagementGroupID = nil
			} else {
				user.ManagementGroupID = value.(*uint64)
			}
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
