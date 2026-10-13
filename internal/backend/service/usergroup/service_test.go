package usergroup

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"mime/multipart"
	"net/http/httptest"
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

func TestServiceAdmissionQRCodeUploadReplaceRemoveAndAudit(t *testing.T) {
	repo := newFakeRepository()
	store, err := newLocalAdmissionQRCodeFileStore(t.TempDir())
	if err != nil {
		t.Fatalf("new QR store: %v", err)
	}
	service := newServiceWithAdmissionQRCodeDependencies(repo, &fakeGroupLogoFileStore{}, store)
	service.now = func() time.Time { return time.Date(2026, 10, 13, 10, 0, 0, 0, time.UTC) }
	superAdmin := Actor{ID: 41, RoleName: model.RoleNameSuperAdmin}

	first, err := service.UploadAdmissionQRCode(context.Background(), superAdmin, 1, newTestQRCodeFileHeader(t, "../first.png", makeTestQRCodePNG(t)))
	if err != nil {
		t.Fatalf("upload first QR: %v", err)
	}
	if !first.Configured || first.AdmissionQRCodeURL == nil || !strings.HasPrefix(*first.AdmissionQRCodeURL, admissionQRCodeURLPrefix) {
		t.Fatalf("unexpected first QR configuration: %#v", first)
	}
	firstName, ok := store.RelativePathFromURL(*first.AdmissionQRCodeURL)
	if !ok {
		t.Fatalf("stored QR URL is not a safe managed URL: %q", *first.AdmissionQRCodeURL)
	}
	if _, contentType, err := store.Read(context.Background(), firstName); err != nil || contentType != "image/png" {
		t.Fatalf("uploaded QR could not be previewed: type=%q err=%v", contentType, err)
	}
	if _, err := service.UploadAdmissionQRCode(context.Background(), Actor{ID: 42, RoleName: model.RoleNameAdmin}, 1, newTestQRCodeFileHeader(t, "other.png", makeTestQRCodePNG(t))); err == nil {
		t.Fatal("ordinary admin uploaded an admission QR")
	} else {
		assertServiceError(t, err, 403, "超级管理员")
	}
	if _, err := service.RemoveAdmissionQRCode(context.Background(), Actor{ID: 42, RoleName: model.RoleNameAdmin}, 1); err == nil {
		t.Fatal("ordinary admin removed an admission QR")
	} else {
		assertServiceError(t, err, 403, "超级管理员")
	}
	if _, err := service.OpenAdmissionQRCode(context.Background(), Actor{ID: 42, RoleName: model.RoleNameAdmin}, "../secret.png"); err == nil {
		t.Fatal("QR preview accepted a path traversal")
	}

	second, err := service.UploadAdmissionQRCode(context.Background(), superAdmin, 1, newTestQRCodeFileHeader(t, "replacement.jpg", makeTestQRCodeJPEG(t)))
	if err != nil {
		t.Fatalf("replace QR: %v", err)
	}
	if second.AdmissionQRCodeURL == nil || *second.AdmissionQRCodeURL == *first.AdmissionQRCodeURL {
		t.Fatalf("QR replacement did not produce a new version: first=%#v second=%#v", first, second)
	}
	secondName, ok := store.RelativePathFromURL(*second.AdmissionQRCodeURL)
	if !ok {
		t.Fatalf("replacement QR URL is not a managed URL: %q", *second.AdmissionQRCodeURL)
	}
	if _, contentType, err := store.Read(context.Background(), secondName); err != nil || contentType != "image/jpeg" {
		t.Fatalf("replacement JPEG could not be previewed: type=%q err=%v", contentType, err)
	}
	if _, err := service.OpenAdmissionQRCode(context.Background(), Actor{ID: 99, RoleName: model.RoleNameUser}, secondName); err == nil {
		t.Fatal("ordinary user read a private admission QR")
	} else {
		assertServiceError(t, err, 403, "管理员")
	}
	oldBytes, oldType, err := store.Read(context.Background(), firstName)
	if err != nil || len(oldBytes) == 0 || oldType != "image/png" {
		t.Fatalf("replacing QR removed an older notification snapshot file: type=%q err=%v", oldType, err)
	}
	logs := repo.auditLogs
	if len(logs) != 2 || logs[0].Action != "user_group_admission_qr_updated" || !strings.Contains(logs[1].Metadata, *first.AdmissionQRCodeURL) || !strings.Contains(logs[1].Metadata, *second.AdmissionQRCodeURL) {
		t.Fatalf("QR replacement audit did not preserve old and new URL: %#v", logs)
	}

	removed, err := service.RemoveAdmissionQRCode(context.Background(), superAdmin, 1)
	if err != nil {
		t.Fatalf("remove QR: %v", err)
	}
	if removed.Configured || removed.AdmissionQRCodeURL != nil || repo.groups[1].AdmissionImageURL != nil {
		t.Fatalf("QR config was not removed: result=%#v group=%#v", removed, repo.groups[1])
	}
	if _, _, err := store.Read(context.Background(), firstName); err != nil {
		t.Fatalf("removing current config must preserve snapshotted image files: %v", err)
	}
	if len(repo.auditLogs) != 3 || repo.auditLogs[2].Action != "user_group_admission_qr_removed" {
		t.Fatalf("QR removal audit missing: %#v", repo.auditLogs)
	}
}

func TestAdmissionQRCodeStoreValidatesActualImageAndSize(t *testing.T) {
	store, err := newLocalAdmissionQRCodeFileStore(t.TempDir())
	if err != nil {
		t.Fatalf("new QR store: %v", err)
	}
	for _, test := range []struct {
		name string
		data []byte
	}{
		{name: "extension-is-not-content", data: []byte("<svg><script>alert(1)</script></svg>")},
		{name: "truncated-png", data: makeTestQRCodePNG(t)[:20]},
		{name: "oversized", data: bytes.Repeat([]byte("x"), admissionQRCodeMaxBytes+1)},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, err := store.Save(context.Background(), newTestQRCodeFileHeader(t, "looks-like-image.png", test.data), time.Now())
			if err == nil {
				t.Fatal("invalid or oversized QR image was accepted")
			}
		})
	}
}

func TestSuperAdminGroupListShowsQRConfigurationWithoutExposingItToRegularGroupOptions(t *testing.T) {
	repo := newFakeRepository()
	url := admissionQRCodeURLPrefix + "qr_20261013100000_0123456789abcdef01234567.png"
	repo.groups[1].AdmissionImageURL = &url
	service := NewService(repo)
	result, err := service.ListGroups(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, ListGroupsInput{})
	if err != nil {
		t.Fatalf("ListGroups: %v", err)
	}
	var found *GroupListItem
	for i := range result.Items {
		if result.Items[i].ID == 1 {
			found = &result.Items[i]
			break
		}
	}
	if found == nil || !found.AdmissionQRCodeConfigured || found.AdmissionQRCodeURL == nil || *found.AdmissionQRCodeURL != url {
		t.Fatalf("super admin list did not expose QR configuration state: %#v", found)
	}
	options, err := service.ListGroupOptions(context.Background(), Actor{ID: 2, RoleName: model.RoleNameAdmin})
	if err != nil {
		t.Fatalf("ListGroupOptions: %v", err)
	}
	encoded, _ := json.Marshal(options)
	if strings.Contains(string(encoded), "admission") || strings.Contains(string(encoded), "qr_") {
		t.Fatalf("regular admin group options exposed QR configuration outside notification preview: %s", encoded)
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
	auditLogs   []model.AuditLog
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

func (r *fakeRepository) GetGroupByIDForUpdate(ctx context.Context, groupID uint64) (*model.UserGroup, error) {
	return r.GetGroupByID(ctx, groupID)
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
	if value, ok := updates["admission_image_url"].(*string); ok {
		group.AdmissionImageURL = copyString(value)
	} else if _, exists := updates["admission_image_url"]; exists && updates["admission_image_url"] == nil {
		group.AdmissionImageURL = nil
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

func (r *fakeRepository) CreateAuditLog(_ context.Context, audit *model.AuditLog) error {
	clone := *audit
	r.auditLogs = append(r.auditLogs, clone)
	return nil
}

func cloneGroup(group *model.UserGroup) *model.UserGroup {
	cloned := *group
	if len(group.Tags) > 0 {
		cloned.Tags = append([]string(nil), group.Tags...)
	}
	cloned.Description = copyString(group.Description)
	cloned.LogoURL = copyString(group.LogoURL)
	cloned.AdmissionImageURL = copyString(group.AdmissionImageURL)
	cloned.Members = nil
	return &cloned
}

func makeTestQRCodePNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 16, 16))
	for y := 0; y < 16; y++ {
		for x := 0; x < 16; x++ {
			if (x/4+y/4)%2 == 0 {
				img.Set(x, y, color.Black)
			} else {
				img.Set(x, y, color.White)
			}
		}
	}
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, img); err != nil {
		t.Fatalf("encode PNG: %v", err)
	}
	return buffer.Bytes()
}

func makeTestQRCodeJPEG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 16, 16))
	for y := 0; y < 16; y++ {
		for x := 0; x < 16; x++ {
			if (x/4+y/4)%2 == 0 {
				img.Set(x, y, color.Black)
			} else {
				img.Set(x, y, color.White)
			}
		}
	}
	var buffer bytes.Buffer
	if err := jpeg.Encode(&buffer, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatalf("encode JPEG: %v", err)
	}
	return buffer.Bytes()
}

func newTestQRCodeFileHeader(t *testing.T, filename string, data []byte) *multipart.FileHeader {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("image", filename)
	if err != nil {
		t.Fatalf("create QR form field: %v", err)
	}
	if _, err := io.Copy(part, bytes.NewReader(data)); err != nil {
		t.Fatalf("write QR form field: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close QR form: %v", err)
	}
	request := httptest.NewRequest("POST", "/", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	if err := request.ParseMultipartForm(int64(len(data)) + 1024); err != nil {
		t.Fatalf("parse QR form: %v", err)
	}
	t.Cleanup(func() { _ = request.MultipartForm.RemoveAll() })
	return request.MultipartForm.File["image"][0]
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
