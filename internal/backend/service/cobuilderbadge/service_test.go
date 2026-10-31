package cobuilderbadge

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync"
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

func TestMemberSummaryIncludesDistinctTierAwardTotals(t *testing.T) {
	repo := newFakeRepository()
	repo.users[9], repo.enabledUsers[9] = true, true
	repo.users[10], repo.enabledUsers[10] = true, true
	repo.users[11], repo.enabledUsers[11] = true, false
	repo.users[12], repo.enabledUsers[12] = true, true
	for userID, total := range map[uint64]int{8: 1, 9: 3, 10: 10, 11: 10} {
		for contributionID := 0; contributionID < total; contributionID++ {
			repo.records[userID] = append(repo.records[userID], model.CoBuilderContribution{ID: uint64(contributionID + 1), UserID: userID})
		}
	}
	revokedAt := time.Date(2026, time.October, 31, 0, 0, 0, 0, time.UTC)
	repo.records[12] = []model.CoBuilderContribution{
		{ID: 1, UserID: 12}, {ID: 2, UserID: 12}, {ID: 3, UserID: 12}, {ID: 4, UserID: 12, RevokedAt: &revokedAt},
	}
	service := NewService(repo)

	got, err := service.GetMine(context.Background(), Actor{ID: 7, RoleName: model.RoleNameUser})
	if err != nil {
		t.Fatalf("GetMine returned an error: %v", err)
	}
	if got.AwardCounts != (AwardCounts{Bronze: 4, Silver: 3, Gold: 1}) {
		t.Fatalf("award counts = %#v, want bronze=4 silver=3 gold=1", got.AwardCounts)
	}
}

func TestGrantAndRevokeRecalculateAwardTotalsFromEffectiveContributions(t *testing.T) {
	repo := newFakeRepository()
	repo.records[7] = []model.CoBuilderContribution{{ID: 1, UserID: 7}}
	repo.records[8] = []model.CoBuilderContribution{{ID: 2, UserID: 8}, {ID: 3, UserID: 8}}
	service := NewService(repo)
	admin := Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}

	got, err := service.Grant(context.Background(), admin, 8, "第三次贡献")
	if err != nil || got.AwardCounts != (AwardCounts{Bronze: 2, Silver: 1}) {
		t.Fatalf("grant award counts = %#v, %v", got, err)
	}

	contributionID := got.Contributions[len(got.Contributions)-1].ID
	got, err = service.Revoke(context.Background(), admin, 8, contributionID)
	if err != nil || got.AwardCounts != (AwardCounts{Bronze: 2}) {
		t.Fatalf("revoke award counts = %#v, %v", got, err)
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

func TestUnlockNoticesAdvanceOnlyOnUnseenTierAndCanBeRetriedUntilAcknowledged(t *testing.T) {
	repo := newFakeRepository()
	base := time.Date(2026, time.October, 31, 3, 0, 0, 0, time.UTC)
	service := NewService(repo)
	service.now = func() time.Time { return base }
	actor := Actor{ID: 7, RoleName: model.RoleNameUser}
	claim := func(wantCode, wantLabel string) *UnlockNotice {
		t.Helper()
		got, err := service.ClaimUnlock(context.Background(), actor)
		if err != nil || got == nil || got.LevelCode != wantCode || got.LevelLabel != wantLabel || got.ClaimToken == "" {
			t.Fatalf("ClaimUnlock() = %#v, %v; want %s %s", got, err, wantCode, wantLabel)
		}
		return got
	}

	if got, err := service.ClaimUnlock(context.Background(), actor); err != nil || got != nil {
		t.Fatalf("no badge should not claim a notice: %#v, %v", got, err)
	}
	repo.records[7] = []model.CoBuilderContribution{{ID: 1}}
	bronze := claim("bronze", "青铜 I")
	if got, err := service.ClaimUnlock(context.Background(), actor); err != nil || got != nil {
		t.Fatalf("another tab should not claim an active notice: %#v, %v", got, err)
	}
	if err := service.AcknowledgeUnlock(context.Background(), actor, bronze.ClaimToken); err != nil {
		t.Fatalf("acknowledge bronze: %v", err)
	}
	if err := service.AcknowledgeUnlock(context.Background(), actor, bronze.ClaimToken); err != nil {
		t.Fatalf("repeat acknowledgment should be idempotent: %v", err)
	}
	repo.records[7] = append(repo.records[7], model.CoBuilderContribution{ID: 2})
	if got, err := service.ClaimUnlock(context.Background(), actor); err != nil || got != nil {
		t.Fatalf("same-tier contribution should not unlock again: %#v, %v", got, err)
	}
	repo.records[7] = append(repo.records[7], model.CoBuilderContribution{ID: 3})
	silver := claim("silver", "白银 II")
	if err := service.AcknowledgeUnlock(context.Background(), actor, silver.ClaimToken); err != nil {
		t.Fatalf("acknowledge silver: %v", err)
	}
	for id := uint64(4); id <= 10; id++ {
		repo.records[7] = append(repo.records[7], model.CoBuilderContribution{ID: id})
	}
	gold := claim("gold", "黄金 III")
	if err := service.AcknowledgeUnlock(context.Background(), actor, gold.ClaimToken); err != nil {
		t.Fatalf("acknowledge gold: %v", err)
	}

	for index := range repo.records[7] {
		repo.records[7][index].RevokedAt = &base
	}
	if got, err := service.ClaimUnlock(context.Background(), actor); err != nil || got != nil {
		t.Fatalf("revoked contributions should not unlock a notice: %#v, %v", got, err)
	}
}

func TestUnlockNoticeLeaseExpiresWhenItWasNotShown(t *testing.T) {
	repo := newFakeRepository()
	repo.records[7] = []model.CoBuilderContribution{{ID: 1}}
	now := time.Date(2026, time.October, 31, 3, 0, 0, 0, time.UTC)
	service := NewService(repo)
	service.now = func() time.Time { return now }
	actor := Actor{ID: 7, RoleName: model.RoleNameUser}
	first, err := service.ClaimUnlock(context.Background(), actor)
	if err != nil || first == nil {
		t.Fatalf("first claim = %#v, %v", first, err)
	}
	now = now.Add(unlockClaimDuration + time.Second)
	second, err := service.ClaimUnlock(context.Background(), actor)
	if err != nil || second == nil || second.ClaimToken == first.ClaimToken {
		t.Fatalf("expired unshown claim should be retried: first=%#v second=%#v err=%v", first, second, err)
	}
	if err := service.AcknowledgeUnlock(context.Background(), actor, "forged"); serviceStatus(err) != http.StatusBadRequest {
		t.Fatalf("invalid acknowledgment token status = %d, want 400", serviceStatus(err))
	}
}

func TestConcurrentUnlockClaimsOnlyReturnOneNotice(t *testing.T) {
	repo := newFakeRepository()
	repo.records[7] = []model.CoBuilderContribution{{ID: 1}}
	service := NewService(repo)
	var wait sync.WaitGroup
	var claimed sync.Mutex
	count := 0
	for range 24 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			notice, err := service.ClaimUnlock(context.Background(), Actor{ID: 7})
			if err != nil {
				t.Errorf("ClaimUnlock: %v", err)
				return
			}
			if notice != nil {
				claimed.Lock()
				count++
				claimed.Unlock()
			}
		}()
	}
	wait.Wait()
	if count != 1 {
		t.Fatalf("concurrent claims returned %d notices, want 1", count)
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
	unlockMu       sync.Mutex
	users          map[uint64]bool
	enabledUsers   map[uint64]bool
	records        map[uint64][]model.CoBuilderContribution
	unlockStates   map[uint64]fakeUnlockState
	lastListUserID uint64
	listCalls      int
	createCalls    int
	revokeCalls    int
	nextID         uint64
}

type fakeUnlockState struct {
	highestSeen uint8
	claimed     uint8
	token       string
	expiresAt   time.Time
}

func newFakeRepository() *fakeRepository {
	return &fakeRepository{
		users:        map[uint64]bool{1: true, 2: true, 3: true, 7: true, 8: true},
		enabledUsers: map[uint64]bool{1: true, 2: true, 3: true, 7: true, 8: true},
		records:      map[uint64][]model.CoBuilderContribution{},
		unlockStates: map[uint64]fakeUnlockState{},
		nextID:       10,
	}
}

func (r *fakeRepository) ClaimUnlock(_ context.Context, userID uint64, level uint8, token string, expiresAt, now time.Time) (bool, error) {
	r.unlockMu.Lock()
	defer r.unlockMu.Unlock()
	state := r.unlockStates[userID]
	if state.highestSeen >= level || (state.token != "" && state.expiresAt.After(now)) {
		return false, nil
	}
	state.claimed, state.token, state.expiresAt = level, token, expiresAt
	r.unlockStates[userID] = state
	return true, nil
}

func (r *fakeRepository) AcknowledgeUnlock(_ context.Context, userID uint64, token string) error {
	r.unlockMu.Lock()
	defer r.unlockMu.Unlock()
	state := r.unlockStates[userID]
	if state.token == token && token != "" {
		if state.claimed > state.highestSeen {
			state.highestSeen = state.claimed
		}
		state.claimed, state.token, state.expiresAt = 0, "", time.Time{}
		r.unlockStates[userID] = state
	}
	return nil
}

func (r *fakeRepository) UserExists(_ context.Context, userID uint64) (bool, error) {
	return r.users[userID], nil
}

func (r *fakeRepository) ListContributions(_ context.Context, userID uint64) ([]model.CoBuilderContribution, error) {
	r.unlockMu.Lock()
	defer r.unlockMu.Unlock()
	r.listCalls++
	r.lastListUserID = userID
	return append([]model.CoBuilderContribution(nil), r.records[userID]...), nil
}

func (r *fakeRepository) ListEnabledContributionCounts(_ context.Context) ([]int, error) {
	counts := make([]int, 0, len(r.enabledUsers))
	for userID, enabled := range r.enabledUsers {
		if !enabled {
			continue
		}
		count := 0
		for _, record := range r.records[userID] {
			if record.RevokedAt == nil {
				count++
			}
		}
		counts = append(counts, count)
	}
	return counts, nil
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
