package adminuser

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

func TestGetUserStatsUsesUniqueMembershipBuckets(t *testing.T) {
	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true})
	if err != nil {
		sqlDB.Close()
		t.Fatalf("open GORM over SQL mock: %v", err)
	}
	t.Cleanup(func() {
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("unmet SQL expectations: %v", err)
		}
		_ = sqlDB.Close()
	})

	mock.ExpectQuery("SELECT COUNT").
		WillReturnRows(sqlmock.NewRows([]string{"total", "enabled", "disabled", "admins", "grouped", "unassigned", "pending", "cleanup"}).
			AddRow(8, 6, 2, 2, 2, 4, 2, 1))
	mock.ExpectQuery("SELECT groups").
		WillReturnRows(sqlmock.NewRows([]string{"group_id", "name", "user_count"}).
			AddRow(11, "机械组", 1).
			AddRow(12, "AI组", 1).
			AddRow(13, "运营组", 0))

	stats, err := (&GormRepository{db: db}).GetUserStats(context.Background())
	if err != nil {
		t.Fatalf("GetUserStats returned error: %v", err)
	}
	if stats.Total != 8 || stats.Enabled != 6 || stats.Disabled != 2 {
		t.Fatalf("account totals = (%d,%d,%d), want total=8 enabled=6 disabled=2", stats.Total, stats.Enabled, stats.Disabled)
	}
	if stats.Grouped != 2 || stats.Unassigned != 4 || stats.Pending != 2 || stats.CleanupPending != 1 {
		t.Fatalf("membership buckets = (%d,%d,%d,%d), want grouped=2 unassigned=4 pending=2 cleanup=1", stats.Grouped, stats.Unassigned, stats.Pending, stats.CleanupPending)
	}
	if len(stats.GroupDistribution) != 3 || stats.GroupDistribution[0].UserCount != 1 || stats.GroupDistribution[1].UserCount != 1 || stats.GroupDistribution[2].UserCount != 0 {
		t.Fatalf("group distribution must count only uniquely assigned users: %#v", stats.GroupDistribution)
	}
}
