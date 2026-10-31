package cobuilderbadge

import (
	"context"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

func openRepositoryMock(t *testing.T) (*GormRepository, sqlmock.Sqlmock) {
	t.Helper()
	dbConn, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: dbConn, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true})
	if err != nil {
		_ = dbConn.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("unmet SQL expectations: %v", err)
		}
		_ = dbConn.Close()
	})
	return NewRepository(db), mock
}

func TestListContributionsIsScopedAndChronological(t *testing.T) {
	repo, mock := openRepositoryMock(t)
	created := time.Date(2026, time.October, 29, 8, 0, 0, 0, time.UTC)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `co_builder_contributions` WHERE user_id = ? ORDER BY created_at DESC, id DESC")).
		WithArgs(uint64(7)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "description", "granted_by_id", "created_at", "revoked_at", "revoked_by_id"}).
			AddRow(12, 7, "完成文档整理", 1, created, nil, nil))

	records, err := repo.ListContributions(context.Background(), 7)
	if err != nil || len(records) != 1 || records[0].ID != 12 || records[0].Description != "完成文档整理" || !records[0].CreatedAt.Equal(created) {
		t.Fatalf("records=%#v err=%v", records, err)
	}
}

func TestListEnabledContributionCountsFiltersDisabledAccountsAndRevokedRecords(t *testing.T) {
	repo, mock := openRepositoryMock(t)
	query := "SELECT COUNT(co_builder_contributions.id) AS total FROM `users` LEFT JOIN co_builder_contributions ON co_builder_contributions.user_id = users.id AND co_builder_contributions.revoked_at IS NULL WHERE users.status = ? GROUP BY `users`.`id`"
	mock.ExpectQuery(regexp.QuoteMeta(query)).
		WithArgs(uint8(1)).
		WillReturnRows(sqlmock.NewRows([]string{"total"}).AddRow(0).AddRow(1).AddRow(3).AddRow(10))

	counts, err := repo.ListEnabledContributionCounts(context.Background())
	if err != nil || len(counts) != 4 || counts[0] != 0 || counts[1] != 1 || counts[2] != 3 || counts[3] != 10 {
		t.Fatalf("effective contribution counts = %#v, %v", counts, err)
	}
}

func TestRevokeContributionUpdatesOnlyAnActiveRecordForItsOwner(t *testing.T) {
	repo, mock := openRepositoryMock(t)
	at := time.Date(2026, time.October, 31, 1, 0, 0, 0, time.UTC)
	mock.ExpectBegin()
	mock.ExpectExec("UPDATE `co_builder_contributions` SET .* WHERE id = \\? AND user_id = \\? AND revoked_at IS NULL").
		WithArgs(at, uint64(3), uint64(12), uint64(7)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	revoked, err := repo.RevokeContribution(context.Background(), 7, 12, 3, at)
	if err != nil || !revoked {
		t.Fatalf("revoked=%t err=%v", revoked, err)
	}

	mock.ExpectBegin()
	mock.ExpectExec("UPDATE `co_builder_contributions` SET .* WHERE id = \\? AND user_id = \\? AND revoked_at IS NULL").
		WithArgs(at, uint64(3), uint64(12), uint64(7)).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectCommit()
	revoked, err = repo.RevokeContribution(context.Background(), 7, 12, 3, at)
	if err != nil || revoked {
		t.Fatalf("repeated revoke result=%t err=%v", revoked, err)
	}
}

func TestUnlockClaimIsAtomicAndAcknowledgesOnlyItsClaimToken(t *testing.T) {
	repo, mock := openRepositoryMock(t)
	now := time.Date(2026, time.October, 31, 3, 0, 0, 0, time.UTC)
	expiresAt := now.Add(30 * time.Second)
	token := strings.Repeat("a", 43)
	insert := regexp.QuoteMeta("INSERT INTO co_builder_badge_unlock_states (user_id, highest_seen, claimed_level) VALUES (?, 0, 0) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)")
	claim := regexp.QuoteMeta("UPDATE co_builder_badge_unlock_states SET claimed_level = ?, claim_token = ?, claim_expires_at = ? WHERE user_id = ? AND highest_seen < ? AND (claim_token IS NULL OR claim_expires_at <= ?)")
	mock.ExpectExec(insert).WithArgs(uint64(7)).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(claim).WithArgs(uint8(1), token, expiresAt, uint64(7), uint8(1), now).WillReturnResult(sqlmock.NewResult(0, 1))
	claimed, err := repo.ClaimUnlock(context.Background(), 7, 1, token, expiresAt, now)
	if err != nil || !claimed {
		t.Fatalf("first claim = %t, %v", claimed, err)
	}
	mock.ExpectExec(insert).WithArgs(uint64(7)).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(claim).WithArgs(uint8(1), token, expiresAt, uint64(7), uint8(1), now).WillReturnResult(sqlmock.NewResult(0, 0))
	claimed, err = repo.ClaimUnlock(context.Background(), 7, 1, token, expiresAt, now)
	if err != nil || claimed {
		t.Fatalf("duplicate claim = %t, %v", claimed, err)
	}
	acknowledge := regexp.QuoteMeta("UPDATE co_builder_badge_unlock_states SET highest_seen = GREATEST(highest_seen, claimed_level), claimed_level = 0, claim_token = NULL, claim_expires_at = NULL WHERE user_id = ? AND claim_token = ?")
	mock.ExpectExec(acknowledge).WithArgs(uint64(7), token).WillReturnResult(sqlmock.NewResult(0, 1))
	if err := repo.AcknowledgeUnlock(context.Background(), 7, token); err != nil {
		t.Fatalf("acknowledge current claim: %v", err)
	}
	mock.ExpectExec(acknowledge).WithArgs(uint64(7), token).WillReturnResult(sqlmock.NewResult(0, 0))
	if err := repo.AcknowledgeUnlock(context.Background(), 7, token); err != nil {
		t.Fatalf("repeat acknowledgment: %v", err)
	}
}
