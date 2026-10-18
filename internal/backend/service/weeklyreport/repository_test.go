package weeklyreport

import (
	"context"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/model"
)

func newWeeklyReportMockGorm(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
	t.Helper()
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
			t.Errorf("unmet SQL expectations: %v", err)
		}
		_ = sqlDB.Close()
	})
	return db, mock
}

func TestFindOperationsMembershipRequiresActiveOperationsGroupAndUser(t *testing.T) {
	db, mock := newWeeklyReportMockGorm(t)
	pattern := "(?s)SELECT user_group_members\\.\\* FROM `user_group_members` JOIN user_groups ON .* JOIN users ON .*WHERE user_group_members\\.user_id = \\? AND user_groups\\.name = \\? AND user_groups\\.status = \\? AND users\\.status = \\?.*LIMIT \\?"
	mock.ExpectQuery(pattern).
		WithArgs(uint64(22), OperationsGroupName, model.UserGroupStatusActive, model.UserStatusEnabled, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "group_id", "user_id", "role", "joined_at"}).
			AddRow(7, 55, 22, model.UserGroupMemberRoleLeader, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)))

	member, err := NewGormRepository(db).FindOperationsMembership(context.Background(), 22)
	if err != nil || member == nil || member.GroupID != 55 || member.Role != model.UserGroupMemberRoleLeader {
		t.Fatalf("unexpected operations membership: %#v, error=%v", member, err)
	}
}

func TestFindOwnedReportFiltersByIDGroupAndOwner(t *testing.T) {
	db, mock := newWeeklyReportMockGorm(t)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `weekly_reports` WHERE id = ? AND group_id = ? AND user_id = ? ORDER BY `weekly_reports`.`id` LIMIT ?")).
		WithArgs(uint64(90), uint64(55), uint64(22), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "group_id", "user_id", "week_start", "completed", "blockers", "next_plan", "created_at", "updated_at"}).
			AddRow(90, 55, 22, "2026-10-12", "完成", "无", "计划", time.Now(), time.Now()))

	report, err := NewGormRepository(db).FindOwnedReport(context.Background(), 55, 22, 90)
	if err != nil || report == nil || report.ID != 90 || string(report.WeekStart) != "2026-10-12" {
		t.Fatalf("unexpected owned report: %#v, error=%v", report, err)
	}
}
