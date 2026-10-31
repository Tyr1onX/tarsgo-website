package cobuilderbadge

import (
	"context"
	"regexp"
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
