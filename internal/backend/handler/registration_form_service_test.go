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

func TestRegistrationFormServiceGetRecruitmentPageDataReturnsUnavailableWhenNotStarted(t *testing.T) {
	repo := newFakeRegistrationFormRepository()
	service := newRegistrationFormServiceWithRepo(repo)

	now := time.Date(2026, 4, 13, 10, 0, 0, 0, time.Local)
	startAt := now.Add(2 * time.Hour)
	form := repo.forms[2]
	form.StartTime = &startAt
	service.now = func() time.Time { return now }

	result, err := service.GetRecruitmentPageData(context.Background(), RegistrationFormActor{ID: 9, RoleName: model.RoleNameUser})
	if err != nil {
		t.Fatalf("GetRecruitmentPageData returned error: %v", err)
	}

	if result.PageMode != "unavailable" {
		t.Fatalf("expected unavailable page mode, got %q", result.PageMode)
	}
	if result.UnavailableReason == nil || !strings.Contains(*result.UnavailableReason, "尚未开始") {
		t.Fatalf("expected unavailable reason to mention 尚未开始, got %#v", result.UnavailableReason)
	}
	if result.Form != nil {
		t.Fatalf("expected no form payload for unavailable state")
	}
}

func TestRegistrationFormServiceGetRecruitmentPageDataReturnsSubmittedStateForExistingRegistration(t *testing.T) {
	repo := newFakeRegistrationFormRepository()
	repo.usersInDefaultGroup[42] = false
	repo.registrations = append(repo.registrations, &model.Registration{
		ID:           9,
		FormID:       2,
		UserID:       42,
		FormData:     map[string]any{"name": "张三", "phone": "13800138000", "email": "zhangsan@example.com", "group_1": "101", "group_2": "102", "direction": "mechanical"},
		Group1Status: model.RegistrationStatusPending,
		Group2Status: model.RegistrationStatusPending,
		Status:       model.RegistrationStatusPending,
		SubmittedAt:  time.Date(2026, 4, 13, 12, 30, 0, 0, time.Local),
		UpdatedAt:    time.Date(2026, 4, 13, 12, 30, 0, 0, time.Local),
	})
	service := newRegistrationFormServiceWithRepo(repo)

	result, err := service.GetRecruitmentPageData(context.Background(), RegistrationFormActor{ID: 42, RoleName: model.RoleNameUser})
	if err != nil {
		t.Fatalf("GetRecruitmentPageData returned error: %v", err)
	}

	if result.PageMode != "submitted" {
		t.Fatalf("expected submitted page mode, got %q", result.PageMode)
	}
	if result.RegistrationSummary == nil {
		t.Fatalf("expected submitted summary payload")
	}
	if result.RegistrationSummary.FormTitle != "已发布表单" {
		t.Fatalf("expected form title to be preserved, got %q", result.RegistrationSummary.FormTitle)
	}
	if result.RegistrationSummary.Status != model.RegistrationStatusPending {
		t.Fatalf("expected pending summary status, got %d", result.RegistrationSummary.Status)
	}
	if !result.RegistrationSummary.CanEdit || !result.RegistrationSummary.CanCancel {
		t.Fatalf("expected submitted summary to allow edit and cancel, got edit=%v cancel=%v", result.RegistrationSummary.CanEdit, result.RegistrationSummary.CanCancel)
	}
	if result.Form == nil {
		t.Fatalf("expected editable submitted state to include form payload")
	}
	if result.RegistrationFormData == nil {
		t.Fatalf("expected editable submitted state to include existing form data")
	}
	if result.RegistrationFormData["name"] != "张三" {
		t.Fatalf("expected form data to preserve submitted values, got %#v", result.RegistrationFormData["name"])
	}
}

func TestRegistrationFormServiceGetRecruitmentPageDataReturnsReadonlySubmittedStateAfterReview(t *testing.T) {
	repo := newFakeRegistrationFormRepository()
	repo.registrations = append(repo.registrations, &model.Registration{
		ID:           19,
		FormID:       2,
		UserID:       52,
		FormData:     map[string]any{"name": "李四", "group_1": "101", "group_2": "102"},
		Group1Status: model.RegistrationStatusApproved,
		Group2Status: model.RegistrationStatusPending,
		Status:       model.RegistrationStatusPending,
		SubmittedAt:  time.Date(2026, 4, 13, 12, 30, 0, 0, time.Local),
		UpdatedAt:    time.Date(2026, 4, 13, 13, 0, 0, 0, time.Local),
	})
	service := newRegistrationFormServiceWithRepo(repo)

	result, err := service.GetRecruitmentPageData(context.Background(), RegistrationFormActor{ID: 52, RoleName: model.RoleNameUser})
	if err != nil {
		t.Fatalf("GetRecruitmentPageData returned error: %v", err)
	}

	if result.PageMode != "submitted" {
		t.Fatalf("expected submitted page mode, got %q", result.PageMode)
	}
	if result.RegistrationSummary == nil {
		t.Fatalf("expected submitted summary payload")
	}
	if result.RegistrationSummary.CanEdit || result.RegistrationSummary.CanCancel {
		t.Fatalf("expected reviewed registration to be readonly, got edit=%v cancel=%v", result.RegistrationSummary.CanEdit, result.RegistrationSummary.CanCancel)
	}
	if result.Form != nil {
		t.Fatalf("expected readonly submitted state to hide form payload")
	}
	if result.RegistrationFormData != nil {
		t.Fatalf("expected readonly submitted state to hide form data")
	}
}

func TestRegistrationFormServiceGetRecruitmentPageDataReturnsUnavailableWhenUserIsNotInDefaultGroup(t *testing.T) {
	repo := newFakeRegistrationFormRepository()
	repo.usersInDefaultGroup[77] = false
	service := newRegistrationFormServiceWithRepo(repo)
	service.now = func() time.Time {
		return time.Date(2026, 4, 13, 10, 0, 0, 0, time.Local)
	}

	result, err := service.GetRecruitmentPageData(context.Background(), RegistrationFormActor{ID: 77, RoleName: model.RoleNameUser})
	if err != nil {
		t.Fatalf("GetRecruitmentPageData returned error: %v", err)
	}

	if result.PageMode != "unavailable" {
		t.Fatalf("expected unavailable page mode, got %q", result.PageMode)
	}
	if result.UnavailableReason == nil || !strings.Contains(*result.UnavailableReason, "暂无纳新报名资格") {
		t.Fatalf("expected unavailable reason to mention 暂无纳新报名资格, got %#v", result.UnavailableReason)
	}
	if result.Form != nil {
		t.Fatalf("expected no form payload for unavailable state")
	}
}

func TestRegistrationFormServiceGetRecruitmentPageDataReturnsFormStateWhenOpen(t *testing.T) {
	repo := newFakeRegistrationFormRepository()
	service := newRegistrationFormServiceWithRepo(repo)
	service.now = func() time.Time {
		return time.Date(2026, 4, 13, 10, 0, 0, 0, time.Local)
	}

	result, err := service.GetRecruitmentPageData(context.Background(), RegistrationFormActor{ID: 9, RoleName: model.RoleNameUser})
	if err != nil {
		t.Fatalf("GetRecruitmentPageData returned error: %v", err)
	}

	if result.PageMode != "form" {
		t.Fatalf("expected form page mode, got %q", result.PageMode)
	}
	if result.Form == nil {
		t.Fatalf("expected form payload")
	}
	if len(result.Form.FieldsSchema) != len(validRegistrationFields()) {
		t.Fatalf("expected hydrated form fields, got %d", len(result.Form.FieldsSchema))
	}
	if result.RegistrationSummary != nil {
		t.Fatalf("expected no submitted summary in form state")
	}
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
	if len(detail.FieldsSchema) != 6 {
		t.Fatalf("expected 6 fields, got %d", len(detail.FieldsSchema))
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
	forms               map[uint64]*model.RegistrationForm
	registrations       []*model.Registration
	usersInDefaultGroup map[uint64]bool
	nextID              uint64
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
		usersInDefaultGroup: map[uint64]bool{
			9:  true,
			42: true,
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

func (r *fakeRegistrationFormRepository) ListShownUserGroups(_ context.Context) ([]model.UserGroup, error) {
	return []model.UserGroup{
		{ID: 101, Name: "机械组", Show: 1},
		{ID: 102, Name: "电控组", Show: 1},
		{ID: 103, Name: "视觉组", Show: 1},
	}, nil
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

func (r *fakeRegistrationFormRepository) IsUserInActiveDefaultGroup(_ context.Context, userID uint64) (bool, error) {
	inDefaultGroup, ok := r.usersInDefaultGroup[userID]
	if !ok {
		return true, nil
	}
	return inDefaultGroup, nil
}

func validRegistrationFields() []model.FormField {
	return []model.FormField{
		{Key: "name", Label: "姓名", Type: "text", Required: true, Placeholder: "请输入姓名"},
		{Key: "phone", Label: "手机号", Type: "phone", Required: true, Placeholder: "请输入手机号"},
		{Key: "email", Label: "邮箱", Type: "email", Required: true, Placeholder: "请输入邮箱"},
		{Key: "group_1", Label: "意向组别(1)", Type: "user_group_select", Required: true, Placeholder: "请选择意向组别(1)"},
		{Key: "group_2", Label: "意向组别(2)", Type: "user_group_select", Required: true, Placeholder: "请选择意向组别(2)"},
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
