package handler

import (
	"context"
	"testing"
	"time"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

func TestRegistrationServiceReviewRegistrationFullAccessApproveAddsUserToBothGroups(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	service := newRegistrationServiceWithDependencies(repo, nil)
	service.now = func() time.Time {
		return time.Date(2026, 4, 14, 10, 0, 0, 0, time.Local)
	}

	detail, err := service.ReviewRegistration(
		context.Background(),
		RegistrationFormActor{ID: 9001, RoleName: model.RoleNameAdmin},
		repo.registration.ID,
		ReviewRegistrationInput{Decision: registrationReviewDecisionApprove},
	)
	if err != nil {
		t.Fatalf("ReviewRegistration returned error: %v", err)
	}

	if detail.Group1Status != model.RegistrationStatusApproved {
		t.Fatalf("expected group 1 approved, got %d", detail.Group1Status)
	}
	if detail.Group2Status != model.RegistrationStatusApproved {
		t.Fatalf("expected group 2 approved, got %d", detail.Group2Status)
	}
	if detail.Status != model.RegistrationStatusApproved {
		t.Fatalf("expected overall approved, got %d", detail.Status)
	}

	assertAddedMemberships(
		t,
		repo.addedMemberships,
		[]fakeAddedMembership{
			{GroupID: 101, UserID: repo.registration.UserID},
			{GroupID: 102, UserID: repo.registration.UserID},
		},
	)
	assertRemovedMemberships(
		t,
		repo.removedMemberships,
		[]fakeAddedMembership{
			{GroupID: 1, UserID: repo.registration.UserID},
		},
	)
}

func TestRegistrationServiceReviewRegistrationAllowsTwoLeadersToApproveTwoGroups(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	repo.leaderGroupIDs[2001] = []uint64{101}
	repo.leaderGroupIDs[2002] = []uint64{102}

	service := newRegistrationServiceWithDependencies(repo, nil)
	service.now = func() time.Time {
		return time.Date(2026, 4, 14, 11, 0, 0, 0, time.Local)
	}

	firstDetail, err := service.ReviewRegistration(
		context.Background(),
		RegistrationFormActor{ID: 2001, RoleName: model.RoleNameAdmin},
		repo.registration.ID,
		ReviewRegistrationInput{Decision: registrationReviewDecisionApprove},
	)
	if err != nil {
		t.Fatalf("first ReviewRegistration returned error: %v", err)
	}

	if firstDetail.Group1Status != model.RegistrationStatusApproved {
		t.Fatalf("expected group 1 approved after first review, got %d", firstDetail.Group1Status)
	}
	if firstDetail.Group2Status != model.RegistrationStatusPending {
		t.Fatalf("expected group 2 pending after first review, got %d", firstDetail.Group2Status)
	}
	if firstDetail.Status != model.RegistrationStatusPending {
		t.Fatalf("expected overall pending after first review, got %d", firstDetail.Status)
	}
	if len(repo.addedMemberships) != 0 {
		t.Fatalf("expected no memberships before both slots are reviewed, got %d", len(repo.addedMemberships))
	}

	secondDetail, err := service.ReviewRegistration(
		context.Background(),
		RegistrationFormActor{ID: 2002, RoleName: model.RoleNameAdmin},
		repo.registration.ID,
		ReviewRegistrationInput{Decision: registrationReviewDecisionApprove},
	)
	if err != nil {
		t.Fatalf("second ReviewRegistration returned error: %v", err)
	}

	if secondDetail.Group1Status != model.RegistrationStatusApproved {
		t.Fatalf("expected group 1 to stay approved, got %d", secondDetail.Group1Status)
	}
	if secondDetail.Group2Status != model.RegistrationStatusApproved {
		t.Fatalf("expected group 2 approved after second review, got %d", secondDetail.Group2Status)
	}
	if secondDetail.Status != model.RegistrationStatusApproved {
		t.Fatalf("expected overall approved after second review, got %d", secondDetail.Status)
	}

	assertAddedMemberships(
		t,
		repo.addedMemberships,
		[]fakeAddedMembership{
			{GroupID: 101, UserID: repo.registration.UserID},
			{GroupID: 102, UserID: repo.registration.UserID},
		},
	)
	assertRemovedMemberships(
		t,
		repo.removedMemberships,
		[]fakeAddedMembership{
			{GroupID: 1, UserID: repo.registration.UserID},
		},
	)
}

func TestRegistrationAccessScopeReviewActionAvailabilityForLeaderSlot1(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	scope := newRegistrationAccessScope(false, []uint64{101})

	item := toRegistrationListItem(repo.registration, scope)
	if !item.CanApprove || !item.CanReject {
		t.Fatalf("expected both actions enabled for leader reviewing group 1, got approve=%v reject=%v", item.CanApprove, item.CanReject)
	}
}

func TestRegistrationAccessScopeReviewActionAvailabilityForLeaderSlot2(t *testing.T) {
	repo := newFakeRegistrationReviewRepository()
	scope := newRegistrationAccessScope(false, []uint64{102})

	item := toRegistrationListItem(repo.registration, scope)
	if !item.CanApprove || !item.CanReject {
		t.Fatalf("expected both actions enabled for leader reviewing group 2, got approve=%v reject=%v", item.CanApprove, item.CanReject)
	}
}

type fakeRegistrationReviewRepository struct {
	registration        *model.Registration
	shownGroups         []model.UserGroup
	defaultGroupIDs     []uint64
	leaderGroupIDs      map[uint64][]uint64
	users               map[uint64]*model.User
	addedMemberships    []fakeAddedMembership
	removedMemberships  []fakeAddedMembership
	addedMembershipKV   map[fakeAddedMembership]struct{}
	removedMembershipKV map[fakeAddedMembership]struct{}
}

type fakeAddedMembership struct {
	GroupID uint64
	UserID  uint64
}

func newFakeRegistrationReviewRepository() *fakeRegistrationReviewRepository {
	group1ID := uint64(101)
	group2ID := uint64(102)
	now := time.Date(2026, 4, 14, 9, 0, 0, 0, time.Local)

	return &fakeRegistrationReviewRepository{
		registration: &model.Registration{
			ID:           7001,
			FormID:       301,
			UserID:       501,
			FormData:     map[string]any{"name": "张三", "group_1": "101", "group_2": "102"},
			ContactName:  stringPtr("张三"),
			ContactPhone: stringPtr("13800138000"),
			ContactEmail: stringPtr("zhangsan@example.com"),
			Group1ID:     &group1ID,
			Group1Status: model.RegistrationStatusPending,
			Group2ID:     &group2ID,
			Group2Status: model.RegistrationStatusPending,
			Status:       model.RegistrationStatusPending,
			SubmittedAt:  now.Add(-2 * time.Hour),
			UpdatedAt:    now.Add(-90 * time.Minute),
			Form: model.RegistrationForm{
				ID:           301,
				Title:        "2026 招新报名",
				FieldsSchema: validRegistrationFields(),
				Status:       model.RegistrationFormStatusPublished,
			},
			Group1: &model.UserGroup{ID: group1ID, Name: "机械组", Show: 1},
			Group2: &model.UserGroup{ID: group2ID, Name: "电控组", Show: 1},
		},
		shownGroups: []model.UserGroup{
			{ID: 101, Name: "机械组", Show: 1},
			{ID: 102, Name: "电控组", Show: 1},
		},
		defaultGroupIDs: []uint64{1},
		leaderGroupIDs:  map[uint64][]uint64{},
		users: map[uint64]*model.User{
			2001: {ID: 2001, Name: "机械组长", Email: "leader1@example.com"},
			2002: {ID: 2002, Name: "电控组长", Email: "leader2@example.com"},
			9001: {ID: 9001, Name: "审核管理员", Email: "admin@example.com"},
		},
		addedMembershipKV:   make(map[fakeAddedMembership]struct{}),
		removedMembershipKV: make(map[fakeAddedMembership]struct{}),
	}
}

func (r *fakeRegistrationReviewRepository) RunInTx(_ context.Context, fn func(repo registrationRepository) error) error {
	return fn(r)
}

func (r *fakeRegistrationReviewRepository) ListPublishedForms(_ context.Context) ([]model.RegistrationForm, error) {
	return nil, nil
}

func (r *fakeRegistrationReviewRepository) GetFormByID(_ context.Context, _ uint64) (*model.RegistrationForm, error) {
	return nil, gorm.ErrRecordNotFound
}

func (r *fakeRegistrationReviewRepository) FindRegistrationByFormAndUser(_ context.Context, _, _ uint64) (*model.Registration, error) {
	return nil, gorm.ErrRecordNotFound
}

func (r *fakeRegistrationReviewRepository) CountRegistrationsByFormID(_ context.Context, _ uint64) (int64, error) {
	return 0, nil
}

func (r *fakeRegistrationReviewRepository) CreateRegistration(_ context.Context, _ *model.Registration) error {
	return nil
}

func (r *fakeRegistrationReviewRepository) UpdateRegistration(_ context.Context, registrationID uint64, updates map[string]any) error {
	if r.registration == nil || r.registration.ID != registrationID {
		return gorm.ErrRecordNotFound
	}

	if value, ok := updates["group_1_status"].(uint8); ok {
		r.registration.Group1Status = value
	}
	if value, ok := updates["group_2_status"].(uint8); ok {
		r.registration.Group2Status = value
	}
	if value, ok := updates["status"].(uint8); ok {
		r.registration.Status = value
	}
	if value, ok := updates["reviewer_id_1"].(uint64); ok {
		r.registration.ReviewerID1 = uint64Ptr(value)
		r.registration.Reviewer1 = cloneUserModel(r.users[value])
	}
	if value, ok := updates["reviewer_id_2"].(uint64); ok {
		r.registration.ReviewerID2 = uint64Ptr(value)
		r.registration.Reviewer2 = cloneUserModel(r.users[value])
	}
	if value, ok := updates["reviewed_at_1"].(time.Time); ok {
		r.registration.ReviewedAt1 = copyTimePtr(&value)
	}
	if value, ok := updates["reviewed_at_2"].(time.Time); ok {
		r.registration.ReviewedAt2 = copyTimePtr(&value)
	}
	if value, ok := updates["review_remark_1"].(*string); ok {
		r.registration.ReviewRemark1 = copyStringPtr(value)
	} else if updates["review_remark_1"] == nil {
		r.registration.ReviewRemark1 = nil
	}
	if value, ok := updates["review_remark_2"].(*string); ok {
		r.registration.ReviewRemark2 = copyStringPtr(value)
	} else if updates["review_remark_2"] == nil {
		r.registration.ReviewRemark2 = nil
	}

	updatedAt := time.Now()
	r.registration.UpdatedAt = updatedAt
	return nil
}

func (r *fakeRegistrationReviewRepository) UpdateRegistrationFormData(_ context.Context, registrationID uint64, formData map[string]any) error {
	if r.registration == nil || r.registration.ID != registrationID {
		return gorm.ErrRecordNotFound
	}
	r.registration.FormData = cloneMap(formData)
	return nil
}

func (r *fakeRegistrationReviewRepository) ListRegistrations(_ context.Context, _ ListRegistrationsInput) ([]model.Registration, error) {
	return nil, nil
}

func (r *fakeRegistrationReviewRepository) GetRegistrationStats(_ context.Context, _ ListRegistrationsInput) (RegistrationStats, error) {
	return RegistrationStats{}, nil
}

func (r *fakeRegistrationReviewRepository) GetRegistrationByID(_ context.Context, registrationID uint64) (*model.Registration, error) {
	if r.registration == nil || r.registration.ID != registrationID {
		return nil, gorm.ErrRecordNotFound
	}
	return cloneRegistrationModel(r.registration), nil
}

func (r *fakeRegistrationReviewRepository) GetRegistrationByIDForUpdate(_ context.Context, registrationID uint64) (*model.Registration, error) {
	return r.GetRegistrationByID(context.Background(), registrationID)
}

func (r *fakeRegistrationReviewRepository) DeleteRegistration(_ context.Context, registrationID uint64) error {
	if r.registration == nil || r.registration.ID != registrationID {
		return gorm.ErrRecordNotFound
	}
	r.registration = nil
	return nil
}

func (r *fakeRegistrationReviewRepository) ListShownUserGroups(_ context.Context) ([]model.UserGroup, error) {
	return append([]model.UserGroup(nil), r.shownGroups...), nil
}

func (r *fakeRegistrationReviewRepository) ListDefaultGroupIDs(_ context.Context) ([]uint64, error) {
	return append([]uint64(nil), r.defaultGroupIDs...), nil
}

func (r *fakeRegistrationReviewRepository) ListLeaderGroupIDs(_ context.Context, userID uint64) ([]uint64, error) {
	groupIDs := r.leaderGroupIDs[userID]
	return append([]uint64(nil), groupIDs...), nil
}

func (r *fakeRegistrationReviewRepository) AddUserToGroupIfAbsent(_ context.Context, groupID uint64, userID uint64) error {
	key := fakeAddedMembership{GroupID: groupID, UserID: userID}
	if _, exists := r.addedMembershipKV[key]; exists {
		return nil
	}
	r.addedMembershipKV[key] = struct{}{}
	r.addedMemberships = append(r.addedMemberships, key)
	return nil
}

func (r *fakeRegistrationReviewRepository) RemoveUserFromGroupIfPresent(_ context.Context, groupID uint64, userID uint64) error {
	key := fakeAddedMembership{GroupID: groupID, UserID: userID}
	if _, exists := r.removedMembershipKV[key]; exists {
		return nil
	}
	r.removedMembershipKV[key] = struct{}{}
	r.removedMemberships = append(r.removedMemberships, key)
	return nil
}

func cloneRegistrationModel(registration *model.Registration) *model.Registration {
	if registration == nil {
		return nil
	}

	cloned := *registration
	cloned.FormData = cloneMap(registration.FormData)
	cloned.ContactName = copyStringPtr(registration.ContactName)
	cloned.ContactPhone = copyStringPtr(registration.ContactPhone)
	cloned.ContactEmail = copyStringPtr(registration.ContactEmail)
	cloned.Group1ID = copyUint64Ptr(registration.Group1ID)
	cloned.Group2ID = copyUint64Ptr(registration.Group2ID)
	cloned.ReviewerID1 = copyUint64Ptr(registration.ReviewerID1)
	cloned.ReviewerID2 = copyUint64Ptr(registration.ReviewerID2)
	cloned.ReviewedAt1 = copyTimePtr(registration.ReviewedAt1)
	cloned.ReviewedAt2 = copyTimePtr(registration.ReviewedAt2)
	cloned.ReviewRemark1 = copyStringPtr(registration.ReviewRemark1)
	cloned.ReviewRemark2 = copyStringPtr(registration.ReviewRemark2)
	cloned.Form = *cloneRegistrationFormModel(&registration.Form)
	cloned.Group1 = cloneGroupModel(registration.Group1)
	cloned.Group2 = cloneGroupModel(registration.Group2)
	cloned.Reviewer1 = cloneUserModel(registration.Reviewer1)
	cloned.Reviewer2 = cloneUserModel(registration.Reviewer2)
	return &cloned
}

func cloneGroupModel(group *model.UserGroup) *model.UserGroup {
	if group == nil {
		return nil
	}
	cloned := *group
	cloned.Description = copyStringPtr(group.Description)
	cloned.Tags = append([]string(nil), group.Tags...)
	return &cloned
}

func cloneUserModel(user *model.User) *model.User {
	if user == nil {
		return nil
	}
	cloned := *user
	cloned.Name = user.Name
	cloned.Email = user.Email
	cloned.PasswordHash = user.PasswordHash
	cloned.GitHubID = copyStringPtr(user.GitHubID)
	cloned.AvatarURL = copyStringPtr(user.AvatarURL)
	cloned.LastLoginAt = copyTimePtr(user.LastLoginAt)
	return &cloned
}

func cloneMap(source map[string]any) map[string]any {
	if source == nil {
		return nil
	}
	cloned := make(map[string]any, len(source))
	for key, value := range source {
		cloned[key] = value
	}
	return cloned
}

func stringPtr(value string) *string {
	return &value
}

func uint64Ptr(value uint64) *uint64 {
	return &value
}

func assertAddedMemberships(t *testing.T, actual []fakeAddedMembership, expected []fakeAddedMembership) {
	t.Helper()
	if len(actual) != len(expected) {
		t.Fatalf("expected %d memberships, got %d", len(expected), len(actual))
	}

	expectedSet := make(map[fakeAddedMembership]struct{}, len(expected))
	for _, item := range expected {
		expectedSet[item] = struct{}{}
	}
	for _, item := range actual {
		if _, ok := expectedSet[item]; !ok {
			t.Fatalf("unexpected membership added: group=%d user=%d", item.GroupID, item.UserID)
		}
	}
}

func assertRemovedMemberships(t *testing.T, actual []fakeAddedMembership, expected []fakeAddedMembership) {
	t.Helper()
	if len(actual) != len(expected) {
		t.Fatalf("expected %d removed memberships, got %d", len(expected), len(actual))
	}

	expectedSet := make(map[fakeAddedMembership]struct{}, len(expected))
	for _, item := range expected {
		expectedSet[item] = struct{}{}
	}
	for _, item := range actual {
		if _, ok := expectedSet[item]; !ok {
			t.Fatalf("unexpected removed membership: group=%d user=%d", item.GroupID, item.UserID)
		}
	}
}
