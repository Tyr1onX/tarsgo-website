package cobuilderbadge

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	"tarsgo-backend/model"
)

func TestBadgeLevelAndProgressUseEffectiveContributionCount(t *testing.T) {
	for _, test := range []struct {
		count, progress, target int
		code, label, next       string
	}{
		{0, 0, 1, "none", "未获得", "青铜 I"},
		{1, 33, 3, "bronze", "青铜 I", "白银 II"},
		{2, 66, 3, "bronze", "青铜 I", "白银 II"},
		{3, 30, 10, "silver", "白银 II", "黄金 III"},
		{9, 90, 10, "silver", "白银 II", "黄金 III"},
		{10, 100, 0, "gold", "黄金 III", ""},
	} {
		records := make([]model.CoBuilderContribution, 0, test.count+1)
		for index := 0; index < test.count; index++ {
			records = append(records, model.CoBuilderContribution{ID: uint64(index + 1)})
		}
		revokedAt := time.Date(2026, time.October, 1, 0, 0, 0, 0, time.UTC)
		records = append(records, model.CoBuilderContribution{ID: 99, RevokedAt: &revokedAt})
		got := summarize(records)
		if got.ContributionCount != test.count || got.ProgressPercent != test.progress || got.NextLevelCount != test.target || got.LevelCode != test.code || got.LevelLabel != test.label || got.NextLevelLabel != test.next {
			t.Fatalf("summary for %d effective contributions = %#v", test.count, got)
		}
	}
}

func TestOnlySuperAdminCanReadOtherMembersGrantAndRevoke(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)
	for _, actor := range []Actor{
		{ID: 2, RoleName: model.RoleNameAdmin},
		{ID: 3, RoleName: model.RoleNameUser},
	} {
		if _, err := service.GetForAdmin(context.Background(), actor, 1); serviceStatus(err) != http.StatusForbidden {
			t.Errorf("GetForAdmin actor %#v status = %d, want 403", actor, serviceStatus(err))
		}
		if _, err := service.Grant(context.Background(), actor, 1, "协助完成基地整理"); serviceStatus(err) != http.StatusForbidden {
			t.Errorf("Grant actor %#v status = %d, want 403", actor, serviceStatus(err))
		}
		if _, err := service.Revoke(context.Background(), actor, 1, 1); serviceStatus(err) != http.StatusForbidden {
			t.Errorf("Revoke actor %#v status = %d, want 403", actor, serviceStatus(err))
		}
	}
	if repo.createCalls != 0 || repo.revokeCalls != 0 || repo.listCalls != 0 {
		t.Fatalf("unauthorized actor reached repository: %#v", repo)
	}
	for _, action := range []func() error{
		func() error { _, err := service.GetForAdmin(context.Background(), Actor{}, 1); return err },
		func() error { _, err := service.Grant(context.Background(), Actor{}, 1, "有效贡献"); return err },
		func() error { _, err := service.Revoke(context.Background(), Actor{}, 1, 1); return err },
	} {
		if status := serviceStatus(action()); status != http.StatusUnauthorized {
			t.Errorf("anonymous action status = %d, want 401", status)
		}
	}
}

func TestMemberReadsOnlyOwnContributionsAndRevokedRecordDoesNotCount(t *testing.T) {
	repo := newFakeRepository()
	repo.records[7] = []model.CoBuilderContribution{
		{ID: 1, UserID: 7, Description: "已完成文档整理", GrantedByID: 1},
	}
	repo.records[8] = []model.CoBuilderContribution{
		{ID: 2, UserID: 8, Description: "另一成员贡献", GrantedByID: 1},
	}
	service := NewService(repo)
	memberSummary, err := service.GetMine(context.Background(), Actor{ID: 7, RoleName: model.RoleNameUser})
	if err != nil || memberSummary.ContributionCount != 1 || len(memberSummary.Contributions) != 1 || repo.lastListUserID != 7 {
		t.Fatalf("member summary=%#v listed user=%d err=%v", memberSummary, repo.lastListUserID, err)
	}

	admin := Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}
	updated, err := service.Revoke(context.Background(), admin, 7, 1)
	if err != nil || updated.ContributionCount != 0 || len(updated.Contributions) != 1 || updated.Contributions[0].RevokedAt == nil {
		t.Fatalf("revocation should preserve but exclude record: summary=%#v err=%v", updated, err)
	}
	if _, err := service.Revoke(context.Background(), admin, 7, 1); serviceStatus(err) != http.StatusConflict {
		t.Fatalf("repeated revoke status = %d, want 409", serviceStatus(err))
	}
}

func TestGrantValidatesDescriptionAndTargetAccount(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)
	admin := Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}
	for _, description := range []string{strings.Repeat("字", maxDescriptionRunes+1)} {
		if _, err := service.Grant(context.Background(), admin, 2, description); serviceStatus(err) != http.StatusBadRequest {
			t.Errorf("description length %d status = %d, want 400", len([]rune(description)), serviceStatus(err))
		}
	}
	if _, err := service.Grant(context.Background(), admin, 999, "完成公共资料归档"); serviceStatus(err) != http.StatusNotFound {
		t.Fatalf("unknown target status = %d, want 404", serviceStatus(err))
	}
	if repo.createCalls != 0 {
		t.Fatalf("invalid grant reached repository %d times", repo.createCalls)
	}
}

func TestEmptyContributionDescriptionUsesDefault(t *testing.T) {
	for _, input := range []string{"", "   "} {
		repo := newFakeRepository()
		service := NewService(repo)
		got, err := service.Grant(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, 2, input)
		if err != nil {
			t.Fatalf("Grant with blank description returned an error: %v", err)
		}
		if got.ContributionCount != 1 || len(got.Contributions) != 1 || got.Contributions[0].Description != defaultContributionDescription {
			t.Fatalf("blank description should create one default contribution, got %#v", got)
		}
	}
}

func TestSuperAdminGrantCreatesOneEffectiveContributionAndRecalculatesBadge(t *testing.T) {
	repo := newFakeRepository()
	service := NewService(repo)
	createdAt := time.Date(2026, time.October, 31, 2, 30, 0, 0, time.UTC)
	service.now = func() time.Time { return createdAt }

	got, err := service.Grant(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, 2, "  完成公共资料归档  ")
	if err != nil {
		t.Fatalf("Grant returned an error: %v", err)
	}
	if got.ContributionCount != 1 || got.LevelCode != "bronze" || got.LevelLabel != "青铜 I" || len(got.Contributions) != 1 {
		t.Fatalf("grant did not recalculate badge from the new record: %#v", got)
	}
	created := got.Contributions[0]
	if created.Description != "完成公共资料归档" || created.GrantedByID != 1 || !created.CreatedAt.Equal(createdAt) || created.RevokedAt != nil {
		t.Fatalf("created contribution = %#v", created)
	}
	if repo.createCalls != 1 {
		t.Fatalf("grant created %d records, want exactly one", repo.createCalls)
	}
}

func serviceStatus(err error) int {
	var serviceErr *ServiceError
	if errors.As(err, &serviceErr) {
		return serviceErr.Status
	}
	if err == nil {
		return http.StatusOK
	}
	return http.StatusInternalServerError
}

type fakeRepository struct {
	users          map[uint64]bool
	records        map[uint64][]model.CoBuilderContribution
	lastListUserID uint64
	listCalls      int
	createCalls    int
	revokeCalls    int
	nextID         uint64
}

func newFakeRepository() *fakeRepository {
	return &fakeRepository{
		users:   map[uint64]bool{1: true, 2: true, 3: true, 7: true, 8: true},
		records: map[uint64][]model.CoBuilderContribution{},
		nextID:  10,
	}
}

func (r *fakeRepository) UserExists(_ context.Context, userID uint64) (bool, error) {
	return r.users[userID], nil
}

func (r *fakeRepository) ListContributions(_ context.Context, userID uint64) ([]model.CoBuilderContribution, error) {
	r.listCalls++
	r.lastListUserID = userID
	return append([]model.CoBuilderContribution(nil), r.records[userID]...), nil
}

func (r *fakeRepository) CreateContribution(_ context.Context, record *model.CoBuilderContribution) error {
	r.createCalls++
	r.nextID++
	record.ID = r.nextID
	r.records[record.UserID] = append(r.records[record.UserID], *record)
	return nil
}

func (r *fakeRepository) RevokeContribution(_ context.Context, userID, contributionID, actorID uint64, at time.Time) (bool, error) {
	r.revokeCalls++
	for index := range r.records[userID] {
		record := &r.records[userID][index]
		if record.ID == contributionID && record.RevokedAt == nil {
			record.RevokedAt = &at
			record.RevokedByID = &actorID
			return true, nil
		}
	}
	return false, nil
}
