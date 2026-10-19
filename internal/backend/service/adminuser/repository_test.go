package adminuser

import (
	"context"
	"database/sql/driver"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/model"
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

func TestListUsersAppliesActivityFilterUnlessAllAccountsRequested(t *testing.T) {
	for _, testCase := range []struct {
		name            string
		includeInactive bool
		countPattern    string
		listPattern     string
		countArgs       []driver.Value
		listArgs        []driver.Value
	}{
		{
			name:         "active by default",
			countPattern: "SELECT count\\(\\*\\) FROM `users`.*users.status = \\? AND users.last_login_at >= \\?",
			listPattern:  "SELECT .* FROM `users`.*WHERE users.status = \\? AND users.last_login_at >= \\?.*ORDER BY users.created_at DESC LIMIT \\?",
			countArgs:    []driver.Value{model.UserGroupStatusActive, model.UserStatusEnabled, activitySince},
			listArgs:     []driver.Value{model.UserGroupStatusActive, model.UserStatusEnabled, activitySince, 20},
		},
		{
			name:            "all accounts",
			includeInactive: true,
			countPattern:    "SELECT count\\(\\*\\) FROM `users`.*JOIN roles",
			listPattern:     "SELECT .* FROM `users`.*JOIN roles.*ORDER BY users.created_at DESC LIMIT \\?",
			countArgs:       []driver.Value{model.UserGroupStatusActive},
			listArgs:        []driver.Value{model.UserGroupStatusActive, 20},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			sqlDB, mock, err := sqlmock.New()
			if err != nil {
				t.Fatalf("create SQL mock: %v", err)
			}
			db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true})
			if err != nil {
				_ = sqlDB.Close()
				t.Fatalf("open GORM over SQL mock: %v", err)
			}
			t.Cleanup(func() {
				if err := mock.ExpectationsWereMet(); err != nil {
					t.Errorf("unmet SQL expectation: %v", err)
				}
				_ = sqlDB.Close()
			})

			mock.ExpectQuery(testCase.countPattern).
				WithArgs(testCase.countArgs...).
				WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
			mock.ExpectQuery(testCase.listPattern).
				WithArgs(testCase.listArgs...).
				WillReturnRows(sqlmock.NewRows([]string{"id"}))

			_, _, err = (&GormRepository{db: db}).ListUsers(context.Background(), ListUsersInput{
				Page: 1, PageSize: 20, IncludeInactive: testCase.includeInactive, ActivitySince: activitySince,
			})
			if err != nil {
				t.Fatalf("ListUsers returned error: %v", err)
			}
		})
	}
}

var activitySince = time.Date(2026, time.October, 19, 11, 0, 0, 0, time.FixedZone("Asia/Shanghai", 8*60*60))
