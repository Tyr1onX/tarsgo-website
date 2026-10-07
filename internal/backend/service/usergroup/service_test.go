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

func TestServiceGroupConfigurationRequiresSuperAdmin(t *testing.T) {
	service := NewService(newFakeRepository())
	admin := Actor{ID: 2, RoleName: model.RoleNameAdmin}

	if _, err := service.ListGroups(context.Background(), admin, ListGroupsInput{}); err == nil {
		t.Fatal("admin must not list recruitment group configuration")
	} else {
		assertServiceError(t, err, 403, "超级管理员")
	}
	if _, err := service.CreateGroup(context.Background(), admin, CreateGroupInput{
		Name:   "新组",
		Status: model.UserGroupStatusActive,
		Show:   1,
	}); err == nil {
		t.Fatal("admin must not create recruitment groups")
	} else {
		assertServiceError(t, err, 403, "超级管理员")
	}
	if _, err := service.UpdateGroup(context.Background(), admin, 1, UpdateGroupInput{
		Name:      "默认组",
		IsDefault: true,
		Status:    model.UserGroupStatusActive,
		Show:      1,
	}); err == nil {
		t.Fatal("admin must not update recruitment groups")
	} else {
		assertServiceError(t, err, 403, "超级管理员")
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

func TestGroupAPIResponsesExposeRecruitmentConfigurationOnly(t *testing.T) {
	repo := newFakeRepository()
	detail, err := json.Marshal(toGroupDetail(repo.groups[1]))
	if err != nil {
		t.Fatalf("marshal group detail: %v", err)
	}
	for _, retiredField := range []string{"members", "memberCount", "leaders", "admissionImageUrl"} {
		if strings.Contains(string(detail), retiredField) {
			t.Fatalf("group detail exposed retired field %q: %s", retiredField, detail)
		}
	}
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

type fakeRepository struct {
	groups      map[uint64]*model.UserGroup
	nextGroupID uint64
}

func newFakeRepository() *fakeRepository {
	return &fakeRepository{
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
		nextGroupID: 3,
	}
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
	return stats, nil
}

func (r *fakeRepository) GetGroupByID(_ context.Context, groupID uint64) (*model.UserGroup, error) {
	group, ok := r.groups[groupID]
	if !ok {
		return nil, gorm.ErrRecordNotFound
	}
	return cloneGroup(group), nil
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

func (r *fakeRepository) ClearDefaultExcept(_ context.Context, exceptGroupID uint64) error {
	for id, group := range r.groups {
		if id == exceptGroupID {
			continue
		}
		group.IsDefault = false
	}
	return nil
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

func copyString(value *string) *string {
	if value == nil {
		return nil
	}
	copied := *value
	return &copied
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
