package handler

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

func TestRegistrationFormServiceCreateFormRejectsMissingLockedFields(t *testing.T) {
	repo := newFakeRegistrationFormRepository()
	service := newRegistrationFormServiceWithRepo(repo)

	_, err := service.CreateForm(context.Background(), RegistrationFormActor{ID: 1, RoleName: model.RoleNameAdmin}, UpsertRegistrationFormInput{
		Title: "2026 招新报名",
		FieldsSchema: []model.FormField{
			{Key: "name", Label: "姓名", Type: "text", Required: true},
			{Key: "email", Label: "邮箱", Type: "email", Required: true},
		},
		Status: model.RegistrationFormStatusDraft,
	})

	assertRegistrationFormServiceError(t, err, 400, "系统字段")
}

func TestRegistrationFormServiceUpdateFormRejectsPublishConflict(t *testing.T) {
	repo := newFakeRegistrationFormRepository()
	service := newRegistrationFormServiceWithRepo(repo)

	_, err := service.UpdateForm(context.Background(), RegistrationFormActor{ID: 1, RoleName: model.RoleNameSuperAdmin}, 1, UpsertRegistrationFormInput{
		Title:        "草稿表单",
		FieldsSchema: validRegistrationFields(),
		Status:       model.RegistrationFormStatusPublished,
	})

	assertRegistrationFormServiceError(t, err, 409, "已有已发布报名表")
}

func TestRegistrationFormServiceGetActiveFormChecksTimeWindow(t *testing.T) {
	repo := newFakeRegistrationFormRepository()
	service := newRegistrationFormServiceWithRepo(repo)

	now := time.Date(2026, 4, 13, 10, 0, 0, 0, time.Local)
	startAt := now.Add(2 * time.Hour)
	form := repo.forms[2]
	form.StartTime = &startAt
	service.now = func() time.Time { return now }

	_, err := service.GetActiveForm(context.Background(), RegistrationFormActor{ID: 9, RoleName: model.RoleNameUser})

	assertRegistrationFormServiceError(t, err, 409, "尚未开始")
}

func TestRegistrationFormServiceGetActiveFormRejectsSubmittedUser(t *testing.T) {
	repo := newFakeRegistrationFormRepository()
	repo.registrations = append(repo.registrations, &model.Registration{
		ID:     9,
		FormID: 2,
		UserID: 42,
		Status: model.RegistrationStatusPending,
	})
	service := newRegistrationFormServiceWithRepo(repo)

	_, err := service.GetActiveForm(context.Background(), RegistrationFormActor{ID: 42, RoleName: model.RoleNameUser})

	assertRegistrationFormServiceError(t, err, 409, "已完成当前报名")
}

func TestRegistrationFormServiceCreateFormPersistsValidForm(t *testing.T) {
	repo := newFakeRegistrationFormRepository()
	delete(repo.forms, 2)

	service := newRegistrationFormServiceWithRepo(repo)

	maxRegistrations := 120
	startAt := time.Date(2026, 4, 20, 9, 0, 0, 0, time.Local)
	endAt := startAt.Add(72 * time.Hour)

	detail, err := service.CreateForm(context.Background(), RegistrationFormActor{ID: 5, RoleName: model.RoleNameAdmin}, UpsertRegistrationFormInput{
		Title:            "2026 春季招新",
		Description:      "欢迎加入 TARS-GO",
		CoverImageURL:    "https://example.com/cover.jpg",
		FieldsSchema:     validRegistrationFields(),
		MaxRegistrations: &maxRegistrations,
		StartTime:        &startAt,
		EndTime:          &endAt,
		Status:           model.RegistrationFormStatusDraft,
	})
	if err != nil {
		t.Fatalf("CreateForm returned error: %v", err)
	}

	if detail.Title != "2026 春季招新" {
		t.Fatalf("expected created title, got %q", detail.Title)
	}
	if len(detail.FieldsSchema) != 4 {
		t.Fatalf("expected 4 fields, got %d", len(detail.FieldsSchema))
	}
	if repo.forms[detail.ID].CreatorID != 5 {
		t.Fatalf("expected creator id 5, got %d", repo.forms[detail.ID].CreatorID)
	}
}

func TestPrepareRegistrationFormUpdates_MarshalsFieldsSchema(t *testing.T) {
	fields := validRegistrationFields()

	updates, err := prepareRegistrationFormUpdates(map[string]any{
		"title":         "Test",
		"fields_schema": fields,
		"status":        model.RegistrationFormStatusPublished,
	})
	if err != nil {
		t.Fatalf("prepareRegistrationFormUpdates returned error: %v", err)
	}

	raw, ok := updates["fields_schema"].(string)
	if !ok {
		t.Fatalf("expected fields_schema to be json string, got %T", updates["fields_schema"])
	}

	var decoded []model.FormField
	if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
		t.Fatalf("fields_schema is not valid json: %v", err)
	}
	if len(decoded) != len(fields) {
		t.Fatalf("expected %d decoded fields, got %d", len(fields), len(decoded))
	}
	if updates["title"] != "Test" {
		t.Fatalf("expected title to be preserved")
	}
}

type fakeRegistrationFormRepository struct {
	forms         map[uint64]*model.RegistrationForm
	registrations []*model.Registration
	nextID        uint64
}

func newFakeRegistrationFormRepository() *fakeRegistrationFormRepository {
	now := time.Date(2026, 4, 13, 10, 0, 0, 0, time.Local)
	return &fakeRegistrationFormRepository{
		forms: map[uint64]*model.RegistrationForm{
			1: {
				ID:           1,
				CreatorID:    1,
				Title:        "草稿表单",
				FieldsSchema: validRegistrationFields(),
				Status:       model.RegistrationFormStatusDraft,
				CreatedAt:    now.Add(-48 * time.Hour),
				UpdatedAt:    now.Add(-24 * time.Hour),
			},
			2: {
				ID:           2,
				CreatorID:    1,
				Title:        "已发布表单",
				FieldsSchema: validRegistrationFields(),
				Status:       model.RegistrationFormStatusPublished,
				CreatedAt:    now.Add(-72 * time.Hour),
				UpdatedAt:    now.Add(-2 * time.Hour),
			},
		},
		nextID: 3,
	}
}

func (r *fakeRegistrationFormRepository) RunInTx(_ context.Context, fn func(repo registrationFormRepository) error) error {
	return fn(r)
}

func (r *fakeRegistrationFormRepository) ListForms(_ context.Context, filter ListRegistrationFormsInput) ([]model.RegistrationForm, error) {
	items := make([]model.RegistrationForm, 0, len(r.forms))
	for _, form := range r.forms {
		if filter.Status != nil && form.Status != *filter.Status {
			continue
		}
		if keyword := strings.TrimSpace(filter.Keyword); keyword != "" && !strings.Contains(form.Title, keyword) {
			continue
		}
		items = append(items, *cloneRegistrationFormModel(form))
	}
	return items, nil
}

func (r *fakeRegistrationFormRepository) GetFormStats(_ context.Context) (RegistrationFormStats, error) {
	stats := RegistrationFormStats{}
	for _, form := range r.forms {
		stats.Total++
		switch form.Status {
		case model.RegistrationFormStatusDraft:
			stats.Draft++
		case model.RegistrationFormStatusPublished:
			stats.Published++
		case model.RegistrationFormStatusClosed:
			stats.Closed++
		}
	}
	return stats, nil
}

func (r *fakeRegistrationFormRepository) GetFormByID(_ context.Context, formID uint64) (*model.RegistrationForm, error) {
	form, ok := r.forms[formID]
	if !ok {
		return nil, gorm.ErrRecordNotFound
	}
	return cloneRegistrationFormModel(form), nil
}

func (r *fakeRegistrationFormRepository) CreateForm(_ context.Context, form *model.RegistrationForm) error {
	form.ID = r.nextID
	r.nextID++
	form.CreatedAt = time.Now()
	form.UpdatedAt = form.CreatedAt
	r.forms[form.ID] = cloneRegistrationFormModel(form)
	return nil
}

func (r *fakeRegistrationFormRepository) UpdateForm(_ context.Context, formID uint64, updates map[string]any) error {
	form, ok := r.forms[formID]
	if !ok {
		return gorm.ErrRecordNotFound
	}
	if value, ok := updates["title"].(string); ok {
		form.Title = value
	}
	if value, ok := updates["description"].(*string); ok {
		form.Description = copyStringPtr(value)
	} else if updates["description"] == nil {
		form.Description = nil
	}
	if value, ok := updates["cover_image_url"].(*string); ok {
		form.CoverImageURL = copyStringPtr(value)
	} else if updates["cover_image_url"] == nil {
		form.CoverImageURL = nil
	}
	if value, ok := updates["fields_schema"].([]model.FormField); ok {
		form.FieldsSchema = cloneRegistrationFields(value)
	}
	if value, ok := updates["max_registrations"].(*int); ok {
		form.MaxRegistrations = copyIntPtr(value)
	} else if updates["max_registrations"] == nil {
		form.MaxRegistrations = nil
	}
	if value, ok := updates["start_time"].(*time.Time); ok {
		form.StartTime = copyTimePtr(value)
	} else if updates["start_time"] == nil {
		form.StartTime = nil
	}
	if value, ok := updates["end_time"].(*time.Time); ok {
		form.EndTime = copyTimePtr(value)
	} else if updates["end_time"] == nil {
		form.EndTime = nil
	}
	if value, ok := updates["status"].(uint8); ok {
		form.Status = value
	}
	form.UpdatedAt = time.Now()
	return nil
}

func (r *fakeRegistrationFormRepository) ListPublishedForms(_ context.Context) ([]model.RegistrationForm, error) {
	forms := make([]model.RegistrationForm, 0)
	for _, form := range r.forms {
		if form.Status == model.RegistrationFormStatusPublished {
			forms = append(forms, *cloneRegistrationFormModel(form))
		}
	}
	return forms, nil
}

func (r *fakeRegistrationFormRepository) FindRegistrationByFormAndUser(_ context.Context, formID uint64, userID uint64) (*model.Registration, error) {
	for _, registration := range r.registrations {
		if registration.FormID == formID && registration.UserID == userID {
			cloned := *registration
			return &cloned, nil
		}
	}
	return nil, gorm.ErrRecordNotFound
}

func validRegistrationFields() []model.FormField {
	return []model.FormField{
		{Key: "name", Label: "姓名", Type: "text", Required: true, Placeholder: "请输入姓名"},
		{Key: "phone", Label: "手机号", Type: "phone", Required: true, Placeholder: "请输入手机号"},
		{Key: "email", Label: "邮箱", Type: "email", Required: true, Placeholder: "请输入邮箱"},
		{
			Key:      "direction",
			Label:    "意向方向",
			Type:     "select",
			Required: true,
			Options: []model.FormFieldOption{
				{Label: "机械组", Value: "mechanical"},
				{Label: "电控组", Value: "embedded"},
			},
		},
	}
}

func cloneRegistrationFormModel(form *model.RegistrationForm) *model.RegistrationForm {
	if form == nil {
		return nil
	}

	cloned := *form
	cloned.Description = copyStringPtr(form.Description)
	cloned.CoverImageURL = copyStringPtr(form.CoverImageURL)
	cloned.FieldsSchema = cloneRegistrationFields(form.FieldsSchema)
	cloned.MaxRegistrations = copyIntPtr(form.MaxRegistrations)
	cloned.StartTime = copyTimePtr(form.StartTime)
	cloned.EndTime = copyTimePtr(form.EndTime)
	return &cloned
}

func assertRegistrationFormServiceError(t *testing.T, err error, status int, contains string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected error, got nil")
	}

	serviceErr, ok := err.(*registrationFormServiceError)
	if !ok {
		t.Fatalf("expected registrationFormServiceError, got %T", err)
	}
	if serviceErr.Status != status {
		t.Fatalf("expected status %d, got %d", status, serviceErr.Status)
	}
	if !strings.Contains(serviceErr.Message, contains) {
		t.Fatalf("expected message %q to contain %q", serviceErr.Message, contains)
	}
}
