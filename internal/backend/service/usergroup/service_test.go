package usergroup

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mime/multipart"
	"net/textproto"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

func TestServiceCreateGroup_ClearsPreviousDefault(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	detail, err := service.CreateGroup(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, CreateGroupInput{
		Name:      "新的默认组",
		IsDefault: true,
		Status:    model.UserGroupStatusActive,
	})
	if err != nil {
		t.Fatalf("CreateGroup returned error: %v", err)
	}

	if !detail.IsDefault {
		t.Fatalf("expected created group to be default")
	}
	if repo.groups[1].IsDefault {
		t.Fatalf("expected previous default group to be cleared")
	}
}

func TestServiceAddMember_RejectsSuperAdmin(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	_, err := service.AddMember(context.Background(), Actor{ID: 2, RoleName: model.RoleNameAdmin}, 1, AddMemberInput{
		UserID: 1,
		Role:   model.UserGroupMemberRoleMember,
	})
	assertServiceError(t, err, 403, "不允许加入用户组")
}

func TestServiceAddMember_NonDefaultGroupRemovesDefaultMembership(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	member, err := service.AddMember(context.Background(), Actor{ID: 2, RoleName: model.RoleNameAdmin}, 2, AddMemberInput{
		UserID: 3,
		Role:   model.UserGroupMemberRoleMember,
	})
	if err != nil {
		t.Fatalf("AddMember returned error: %v", err)
	}

	if member.UserID != 3 {
		t.Fatalf("expected user 3, got %d", member.UserID)
	}
	if userInGroup(repo, 3, 1) {
		t.Fatalf("expected user 3 removed from default group")
	}
	if !userInGroup(repo, 3, 2) {
		t.Fatalf("expected user 3 added into non-default group")
	}
}

func TestServiceDeleteGroup_RejectsNonEmptyGroup(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	err := service.DeleteGroup(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, 1)
	assertServiceError(t, err, 409, "仍有成员")
}

func TestServiceRemoveMember_LastNonDefaultGroupReassignsDefaultMembership(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	added, err := service.AddMember(context.Background(), Actor{ID: 2, RoleName: model.RoleNameAdmin}, 2, AddMemberInput{
		UserID: 3,
		Role:   model.UserGroupMemberRoleMember,
	})
	if err != nil {
		t.Fatalf("AddMember returned error: %v", err)
	}

	if err := service.RemoveMember(context.Background(), Actor{ID: 2, RoleName: model.RoleNameAdmin}, 2, added.ID); err != nil {
		t.Fatalf("RemoveMember returned error: %v", err)
	}

	if !userInGroup(repo, 3, 1) {
		t.Fatalf("expected user 3 reassigned to default group")
	}
	if userInGroup(repo, 3, 2) {
		t.Fatalf("expected user 3 removed from non-default group")
	}
}

func TestServiceRemoveMember_LastNonDefaultGroupWithoutDefaultLeavesNoGroup(t *testing.T) {
	repo := newFakeRepository()
	repo.groups[1].IsDefault = false
	repo.members = map[uint64]*model.UserGroupMember{
		1: {
			ID:       1,
			GroupID:  2,
			UserID:   3,
			Role:     model.UserGroupMemberRoleMember,
			JoinedAt: time.Now(),
		},
	}
	repo.nextMemberID = 2
	repo.syncRelations()
	service := NewService(repo)

	if err := service.RemoveMember(context.Background(), Actor{ID: 2, RoleName: model.RoleNameAdmin}, 2, 1); err != nil {
		t.Fatalf("RemoveMember returned error: %v", err)
	}

	user, err := repo.GetUserByID(context.Background(), 3)
	if err != nil {
		t.Fatalf("GetUserByID returned error: %v", err)
	}
	if len(user.GroupMembers) != 0 {
		t.Fatalf("expected user 3 to have no group, got %d memberships", len(user.GroupMembers))
	}
}

func TestServiceUpdateGroup_HideDefaultGroupWithTags(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	detail, err := service.UpdateGroup(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, 1, UpdateGroupInput{
		Name:        "默认分组",
		Description: "默认分组",
		Tags:        []string{"新注册"},
		IsDefault:   true,
		Show:        0,
		Status:      model.UserGroupStatusActive,
	})
	if err != nil {
		t.Fatalf("UpdateGroup returned error: %v", err)
	}

	if detail.Show != 0 {
		t.Fatalf("expected show=0, got %d", detail.Show)
	}
	if len(detail.Tags) != 1 || detail.Tags[0] != "新注册" {
		t.Fatalf("expected tags to contain 新注册, got %#v", detail.Tags)
	}
}

func TestServiceListGroups_FiltersByStatus(t *testing.T) {
	repo := newFakeRepository()
	repo.groups[2].Status = model.UserGroupStatusDisabled
	service := NewService(repo)

	status := uint8(model.UserGroupStatusDisabled)
	result, err := service.ListGroups(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, ListGroupsInput{
		Status: &status,
	})
	if err != nil {
		t.Fatalf("ListGroups returned error: %v", err)
	}

	if len(result.Items) != 1 {
		t.Fatalf("expected 1 disabled group, got %d", len(result.Items))
	}
	if result.Items[0].Name != "运营组" {
		t.Fatalf("expected disabled group to be 运营组, got %s", result.Items[0].Name)
	}
}

func TestToGroupDetail_IncludesMemberPhone(t *testing.T) {
	repo := newFakeRepository()
	detail := toGroupDetail(repo.groups[1])

	if len(detail.Members) != 1 {
		t.Fatalf("expected 1 member, got %d", len(detail.Members))
	}

	if detail.Members[0].User.Phone == nil || *detail.Members[0].User.Phone != "13800138003" {
		t.Fatalf("expected member phone 13800138003, got %#v", detail.Members[0].User.Phone)
	}
}

func TestServiceListMemberCandidates_IncludesPhone(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	items, err := service.ListMemberCandidates(context.Background(), Actor{ID: 2, RoleName: model.RoleNameAdmin}, 1)
	if err != nil {
		t.Fatalf("ListMemberCandidates returned error: %v", err)
	}

	if len(items) == 0 {
		t.Fatalf("expected candidate items")
	}

	for _, item := range items {
		if item.ID != 2 {
			continue
		}
		if item.Phone == nil || *item.Phone != "13800138002" {
			t.Fatalf("expected candidate phone 13800138002, got %#v", item.Phone)
		}
		return
	}

	t.Fatalf("expected admin user candidate")
}

func TestServiceCreateGroup_SavesLogo(t *testing.T) {
	repo := newFakeRepository()
	store := &fakeGroupLogoFileStore{}
	service := newServiceWithDependencies(repo, store)

	detail, err := service.CreateGroup(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, CreateGroupInput{
		Name:      "视觉组",
		Logo:      newTestLogoFileHeader("group-logo.png", 1024, "image/png"),
		Show:      1,
		Status:    model.UserGroupStatusActive,
		IsDefault: false,
	})
	if err != nil {
		t.Fatalf("CreateGroup returned error: %v", err)
	}

	if detail.LogoURL == nil || *detail.LogoURL != groupLogoURLPrefix+"logo-1.png" {
		t.Fatalf("expected created group logo url, got %#v", detail.LogoURL)
	}
	if len(store.saved) != 1 {
		t.Fatalf("expected 1 saved logo, got %d", len(store.saved))
	}
}

func TestServiceUpdateGroup_ReplacesLogoAndRemovesOldFile(t *testing.T) {
	repo := newFakeRepository()
	oldLogoURL := groupLogoURLPrefix + "old.png"
	repo.groups[1].LogoURL = &oldLogoURL
	store := &fakeGroupLogoFileStore{}
	service := newServiceWithDependencies(repo, store)

	detail, err := service.UpdateGroup(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, 1, UpdateGroupInput{
		Name:        "默认组",
		Description: "默认分组",
		Logo:        newTestLogoFileHeader("next.webp", 2048, "image/webp"),
		Show:        1,
		Status:      model.UserGroupStatusActive,
		IsDefault:   true,
	})
	if err != nil {
		t.Fatalf("UpdateGroup returned error: %v", err)
	}

	if detail.LogoURL == nil || *detail.LogoURL != groupLogoURLPrefix+"logo-1.png" {
		t.Fatalf("expected updated group logo url, got %#v", detail.LogoURL)
	}
	if len(store.removed) != 1 || store.removed[0] != "old.png" {
		t.Fatalf("expected old logo removed, got %#v", store.removed)
	}
}

func TestServiceUpdateGroup_RemoveLogo(t *testing.T) {
	repo := newFakeRepository()
	oldLogoURL := groupLogoURLPrefix + "old.png"
	repo.groups[1].LogoURL = &oldLogoURL
	store := &fakeGroupLogoFileStore{}
	service := newServiceWithDependencies(repo, store)

	detail, err := service.UpdateGroup(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, 1, UpdateGroupInput{
		Name:        "默认组",
		Description: "默认分组",
		RemoveLogo:  true,
		Show:        1,
		Status:      model.UserGroupStatusActive,
		IsDefault:   true,
	})
	if err != nil {
		t.Fatalf("UpdateGroup returned error: %v", err)
	}

	if detail.LogoURL != nil {
		t.Fatalf("expected logo url cleared, got %#v", detail.LogoURL)
	}
	if len(store.removed) != 1 || store.removed[0] != "old.png" {
		t.Fatalf("expected old logo removed, got %#v", store.removed)
	}
}

func TestServiceUpdateGroup_RejectsOversizedLogo(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	_, err := service.UpdateGroup(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, 1, UpdateGroupInput{
		Name:      "默认组",
		Logo:      newTestLogoFileHeader("too-large.png", 2*1024*1024+1, "image/png"),
		Show:      1,
		Status:    model.UserGroupStatusActive,
		IsDefault: true,
	})
	assertServiceError(t, err, 400, "不能超过 2MB")
}

func TestServiceUpdateGroup_RejectsNonImageLogo(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)

	_, err := service.UpdateGroup(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, 1, UpdateGroupInput{
		Name:      "默认组",
		Logo:      newTestLogoFileHeader("group.pdf", 1024, "application/pdf"),
		Show:      1,
		Status:    model.UserGroupStatusActive,
		IsDefault: true,
	})
	assertServiceError(t, err, 400, "必须为图片文件")
}

func TestServiceDeleteGroup_RemovesManagedLogo(t *testing.T) {
	repo := newFakeRepository()
	logoURL := groupLogoURLPrefix + "remove-me.png"
	repo.groups[2].LogoURL = &logoURL
	store := &fakeGroupLogoFileStore{}
	service := newServiceWithDependencies(repo, store)

	if err := service.DeleteGroup(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, 2); err != nil {
		t.Fatalf("DeleteGroup returned error: %v", err)
	}

	if len(store.removed) != 1 || store.removed[0] != "remove-me.png" {
		t.Fatalf("expected group logo removed, got %#v", store.removed)
	}
}

type fakeRepository struct {
	groups       map[uint64]*model.UserGroup
	users        map[uint64]*model.User
	members      map[uint64]*model.UserGroupMember
	nextGroupID  uint64
	nextMemberID uint64
}

func newFakeRepository() *fakeRepository {
	repo := &fakeRepository{
		groups: map[uint64]*model.UserGroup{
			1: {
				ID:        1,
				Name:      "默认组",
				Show:      1,
				Status:    model.UserGroupStatusActive,
				IsDefault: true,
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			},
			2: {
				ID:        2,
				Name:      "运营组",
				Show:      1,
				Status:    model.UserGroupStatusActive,
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			},
		},
		users: map[uint64]*model.User{
			1: {
				ID:     1,
				Name:   "Root",
				Email:  "root@example.com",
				Status: model.UserStatusEnabled,
				RoleID: 1,
				Role:   model.Role{ID: 1, Name: model.RoleNameSuperAdmin, DisplayName: "超级管理员"},
			},
			2: {
				ID:     2,
				Name:   "Admin",
				Email:  "admin@example.com",
				Phone:  stringPtr("13800138002"),
				Status: model.UserStatusEnabled,
				RoleID: 2,
				Role:   model.Role{ID: 2, Name: model.RoleNameAdmin, DisplayName: "管理员"},
			},
			3: {
				ID:     3,
				Name:   "Member",
				Email:  "member@example.com",
				Phone:  stringPtr("13800138003"),
				Status: model.UserStatusEnabled,
				RoleID: 3,
				Role:   model.Role{ID: 3, Name: model.RoleNameUser, DisplayName: "普通用户"},
			},
		},
		members: map[uint64]*model.UserGroupMember{
			1: {
				ID:       1,
				GroupID:  1,
				UserID:   3,
				Role:     model.UserGroupMemberRoleLeader,
				JoinedAt: time.Now(),
			},
		},
		nextGroupID:  3,
		nextMemberID: 2,
	}
	repo.syncRelations()
	return repo
}

func (r *fakeRepository) RunInTx(_ context.Context, fn func(repo Repository) error) error {
	return fn(r)
}

func (r *fakeRepository) ListGroups(_ context.Context, filter ListGroupsInput) ([]model.UserGroup, error) {
	items := make([]model.UserGroup, 0, len(r.groups))
	for _, group := range r.groups {
		if filter.Status != nil && group.Status != *filter.Status {
			continue
		}
		items = append(items, *cloneGroup(group))
	}
	return items, nil
}

func (r *fakeRepository) GetGroupStats(_ context.Context) (GroupStats, error) {
	stats := GroupStats{}
	for _, group := range r.groups {
		stats.Total++
		if group.Status == model.UserGroupStatusActive {
			stats.Active++
		}
		if group.Status == model.UserGroupStatusDisabled {
			stats.Disabled++
		}
		if group.IsDefault {
			stats.DefaultCount++
		}
	}
	stats.TotalMembers = int64(len(r.members))
	return stats, nil
}

func (r *fakeRepository) GetGroupByID(_ context.Context, groupID uint64) (*model.UserGroup, error) {
	group, ok := r.groups[groupID]
	if !ok {
		return nil, gorm.ErrRecordNotFound
	}
	return cloneGroup(group), nil
}

func (r *fakeRepository) GetActiveDefaultGroup(_ context.Context) (*model.UserGroup, error) {
	for _, group := range r.groups {
		if group.IsDefault && group.Status == model.UserGroupStatusActive {
			return cloneGroup(group), nil
		}
	}
	return nil, gorm.ErrRecordNotFound
}

func (r *fakeRepository) CreateGroup(_ context.Context, group *model.UserGroup) error {
	group.ID = r.nextGroupID
	r.nextGroupID++
	group.CreatedAt = time.Now()
	group.UpdatedAt = group.CreatedAt
	r.groups[group.ID] = cloneGroup(group)
	return nil
}

func (r *fakeRepository) UpdateGroup(_ context.Context, groupID uint64, updates map[string]any) error {
	group, ok := r.groups[groupID]
	if !ok {
		return gorm.ErrRecordNotFound
	}
	if value, ok := updates["name"].(string); ok {
		group.Name = value
	}
	if value, ok := updates["description"].(*string); ok {
		group.Description = copyString(value)
	} else if updates["description"] == nil {
		group.Description = nil
	}
	if value, ok := updates["logo_url"].(*string); ok {
		group.LogoURL = copyString(value)
	} else if _, exists := updates["logo_url"]; exists && updates["logo_url"] == nil {
		group.LogoURL = nil
	}
	if value, ok := updates["tags"].(string); ok {
		var tags []string
		if err := json.Unmarshal([]byte(value), &tags); err != nil {
			return err
		}
		group.Tags = append([]string(nil), tags...)
	}
	if value, ok := updates["status"].(uint8); ok {
		group.Status = value
	}
	if value, ok := updates["is_default"].(bool); ok {
		group.IsDefault = value
	}
	if value, ok := updates["show"].(uint8); ok {
		group.Show = value
	}
	group.UpdatedAt = time.Now()
	return nil
}

func (r *fakeRepository) DeleteGroup(_ context.Context, groupID uint64) error {
	delete(r.groups, groupID)
	return nil
}

func (r *fakeRepository) ClearDefaultExcept(_ context.Context, exceptGroupID uint64) error {
	for id, group := range r.groups {
		if id == exceptGroupID {
			continue
		}
		group.IsDefault = false
	}
	return nil
}

func (r *fakeRepository) CountMembers(_ context.Context, groupID uint64) (int64, error) {
	var count int64
	for _, member := range r.members {
		if member.GroupID == groupID {
			count++
		}
	}
	return count, nil
}

func (r *fakeRepository) GetMemberByID(_ context.Context, groupID uint64, memberID uint64) (*model.UserGroupMember, error) {
	member, ok := r.members[memberID]
	if !ok || member.GroupID != groupID {
		return nil, gorm.ErrRecordNotFound
	}
	return cloneMember(member), nil
}

func (r *fakeRepository) FindMemberByUserID(_ context.Context, groupID uint64, userID uint64) (*model.UserGroupMember, error) {
	for _, member := range r.members {
		if member.GroupID == groupID && member.UserID == userID {
			return cloneMember(member), nil
		}
	}
	return nil, gorm.ErrRecordNotFound
}

func (r *fakeRepository) CreateMember(_ context.Context, member *model.UserGroupMember) error {
	member.ID = r.nextMemberID
	r.nextMemberID++
	member.JoinedAt = time.Now()
	r.members[member.ID] = cloneMember(member)
	r.syncRelations()
	return nil
}

func (r *fakeRepository) UpdateMember(_ context.Context, groupID uint64, memberID uint64, updates map[string]any) error {
	member, ok := r.members[memberID]
	if !ok || member.GroupID != groupID {
		return gorm.ErrRecordNotFound
	}
	if value, ok := updates["role"].(uint8); ok {
		member.Role = value
	}
	r.syncRelations()
	return nil
}

func (r *fakeRepository) DeleteMember(_ context.Context, groupID uint64, memberID uint64) error {
	member, ok := r.members[memberID]
	if !ok || member.GroupID != groupID {
		return gorm.ErrRecordNotFound
	}
	delete(r.members, memberID)
	r.syncRelations()
	return nil
}

func (r *fakeRepository) ListCandidateUsers(_ context.Context, groupID uint64) ([]model.User, error) {
	items := make([]model.User, 0, len(r.users))
	for _, user := range r.users {
		if !EligibleRoleName(user.Role.Name) {
			continue
		}
		if _, err := r.FindMemberByUserID(context.Background(), groupID, user.ID); err == nil {
			continue
		}
		items = append(items, *cloneUserWithMembers(user))
	}
	return items, nil
}

func (r *fakeRepository) GetUserByID(_ context.Context, userID uint64) (*model.User, error) {
	user, ok := r.users[userID]
	if !ok {
		return nil, gorm.ErrRecordNotFound
	}
	return cloneUserWithMembers(user), nil
}

func (r *fakeRepository) syncRelations() {
	for _, group := range r.groups {
		group.Members = nil
	}
	for _, user := range r.users {
		user.GroupMembers = nil
	}

	for _, member := range r.members {
		group := r.groups[member.GroupID]
		user := r.users[member.UserID]
		member.Group = *cloneGroup(group)
		member.User = *cloneUser(user)
		group.Members = append(group.Members, *cloneMember(member))
		user.GroupMembers = append(user.GroupMembers, *cloneMember(member))
	}
}

func cloneGroup(group *model.UserGroup) *model.UserGroup {
	cloned := *group
	if len(group.Tags) > 0 {
		cloned.Tags = append([]string(nil), group.Tags...)
	}
	cloned.Description = copyString(group.Description)
	cloned.LogoURL = copyString(group.LogoURL)
	cloned.Members = nil
	return &cloned
}

func cloneUser(user *model.User) *model.User {
	cloned := *user
	cloned.GroupMembers = nil
	return &cloned
}

func cloneUserWithMembers(user *model.User) *model.User {
	cloned := *user
	if len(user.GroupMembers) == 0 {
		cloned.GroupMembers = nil
		return &cloned
	}

	cloned.GroupMembers = make([]model.UserGroupMember, 0, len(user.GroupMembers))
	for _, member := range user.GroupMembers {
		cloned.GroupMembers = append(cloned.GroupMembers, *cloneMember(&member))
	}
	return &cloned
}

func cloneMember(member *model.UserGroupMember) *model.UserGroupMember {
	cloned := *member
	cloned.Group = *cloneGroupShallow(&member.Group)
	cloned.User = *cloneUserShallow(&member.User)
	return &cloned
}

func cloneGroupShallow(group *model.UserGroup) *model.UserGroup {
	cloned := *group
	cloned.Description = copyString(group.Description)
	cloned.LogoURL = copyString(group.LogoURL)
	if len(group.Tags) > 0 {
		cloned.Tags = append([]string(nil), group.Tags...)
	}
	cloned.Members = nil
	return &cloned
}

func cloneUserShallow(user *model.User) *model.User {
	cloned := *user
	cloned.GroupMembers = nil
	return &cloned
}

func copyString(value *string) *string {
	if value == nil {
		return nil
	}
	copied := *value
	return &copied
}

func userInGroup(repo *fakeRepository, userID uint64, groupID uint64) bool {
	for _, member := range repo.members {
		if member.UserID == userID && member.GroupID == groupID {
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

type fakeGroupLogoFileStore struct {
	saved   []*storedGroupLogo
	removed []string
	saveErr error
}

func (s *fakeGroupLogoFileStore) Save(_ context.Context, _ groupLogoSaveInput) (*storedGroupLogo, error) {
	if s.saveErr != nil {
		return nil, s.saveErr
	}

	index := len(s.saved) + 1
	stored := &storedGroupLogo{
		FileName:     fmt.Sprintf("logo-%d.png", index),
		RelativePath: fmt.Sprintf("logo-%d.png", index),
		URL:          groupLogoURLPrefix + fmt.Sprintf("logo-%d.png", index),
		Size:         1024,
		ContentType:  "image/png",
	}
	s.saved = append(s.saved, stored)
	return stored, nil
}

func (s *fakeGroupLogoFileStore) Remove(_ context.Context, relativePath string) error {
	s.removed = append(s.removed, relativePath)
	return nil
}

func (s *fakeGroupLogoFileStore) RelativePathFromURL(rawURL string) (string, bool) {
	if !strings.HasPrefix(rawURL, groupLogoURLPrefix) {
		return "", false
	}
	return strings.TrimPrefix(rawURL, groupLogoURLPrefix), true
}

func newTestLogoFileHeader(filename string, size int64, contentType string) *multipart.FileHeader {
	header := textproto.MIMEHeader{}
	if contentType != "" {
		header.Set("Content-Type", contentType)
	}

	return &multipart.FileHeader{
		Filename: filename,
		Size:     size,
		Header:   header,
	}
}
