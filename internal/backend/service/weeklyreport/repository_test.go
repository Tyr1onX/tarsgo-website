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

func TestListUserGroupsRequiresActiveMembershipAndUser(t *testing.T) {
	db, mock := newWeeklyReportMockGorm(t)
	pattern := "(?s)SELECT DISTINCT user_groups\\.id AS group_id, user_groups\\.name FROM `user_groups` JOIN user_group_members ON .* JOIN users ON .* WHERE user_groups\\.status = \\? AND user_group_members\\.user_id = \\? ORDER BY user_groups\\.name ASC, user_groups\\.id ASC"
	mock.ExpectQuery(pattern).
		WithArgs(model.UserGroupStatusActive, model.UserStatusEnabled, uint64(22)).
		WillReturnRows(sqlmock.NewRows([]string{"group_id", "name"}).AddRow(55, "机械组"))

	groups, err := NewGormRepository(db).ListUserGroups(context.Background(), 22)
	if err != nil || len(groups) != 1 || groups[0].GroupID != 55 || groups[0].Name != "机械组" {
		t.Fatalf("unexpected membership groups: %#v, error=%v", groups, err)
	}
}

func TestSuperAdminGetsAllActiveGroupsAndMemberDoesNotGetManagementScope(t *testing.T) {
	db, mock := newWeeklyReportMockGorm(t)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT DISTINCT user_groups.id AS group_id, user_groups.name FROM `user_groups` WHERE user_groups.status = ? ORDER BY user_groups.name ASC, user_groups.id ASC")).
		WithArgs(model.UserGroupStatusActive).
		WillReturnRows(sqlmock.NewRows([]string{"group_id", "name"}).AddRow(55, "机械组").AddRow(88, "AI组"))
	groups, err := NewGormRepository(db).ListTeamGroups(context.Background(), 1, model.RoleNameSuperAdmin)
	if err != nil || len(groups) != 2 {
		t.Fatalf("super admin groups = %#v, error=%v", groups, err)
	}
	memberGroups, err := NewGormRepository(db).ListTeamGroups(context.Background(), 2, model.RoleNameUser)
	if err != nil || len(memberGroups) != 0 {
		t.Fatalf("member must not receive management scope: %#v, error=%v", memberGroups, err)
	}
}

func TestFindOwnedReportFiltersByReportIDAndOwnerWithoutCurrentGroup(t *testing.T) {
	db, mock := newWeeklyReportMockGorm(t)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `weekly_reports` WHERE id = ? AND user_id = ? ORDER BY `weekly_reports`.`id` LIMIT ?")).
		WithArgs(uint64(90), uint64(22), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "group_id", "user_id", "week_start", "completed", "gains", "blockers", "next_plan", "created_at", "updated_at"}).
			AddRow(90, 55, 22, "2026-10-12", "进展", "收获", "无", "计划", time.Now(), time.Now()))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `user_groups` WHERE `user_groups`.`id` = ?")).
		WithArgs(uint64(55)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "description", "logo_url", "admission_image_url", "tags", "is_default", "show", "status", "created_at", "updated_at"}).
			AddRow(55, "机械组", nil, nil, nil, "[]", 0, 1, model.UserGroupStatusActive, time.Now(), time.Now()))

	report, err := NewGormRepository(db).FindOwnedReport(context.Background(), 22, 90)
	if err != nil || report == nil || report.ID != 90 || report.GroupID == nil || *report.GroupID != 55 || report.Gains != "收获" {
		t.Fatalf("unexpected owned report: %#v, error=%v", report, err)
	}
}
