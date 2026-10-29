package availability

import (
	"context"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"tarsgo-backend/model"
)

func testRepository(t *testing.T) (*GormRepository, sqlmock.Sqlmock) {
	t.Helper()
	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true})
	if err != nil {
		t.Fatal(err)
	}
	return NewGormRepository(db), mock
}
func TestNormalAdminGroupOptionsRequireOwnEnabledActiveMembership(t *testing.T) {
	repo, mock := testRepository(t)
	sqlPattern := `(?s)SELECT DISTINCT user_groups\.id AS group_id, user_groups\.name FROM ` + "\x60" + `user_groups` + "\x60" + ` JOIN user_group_members AS manager_members ON manager_members\.group_id = user_groups\.id JOIN users AS managers ON managers\.id = manager_members\.user_id AND managers\.status = \? WHERE user_groups\.status = \? AND manager_members\.user_id = \? ORDER BY user_groups\.name ASC, user_groups\.id ASC`
	mock.ExpectQuery(sqlPattern).WithArgs(model.UserStatusEnabled, model.UserGroupStatusActive, uint64(8)).
		WillReturnRows(sqlmock.NewRows([]string{"group_id", "name"}).AddRow(11, "机械组"))
	groups, err := repo.Groups(context.Background(), Actor{UserID: 8, Role: model.RoleNameAdmin})
	if err != nil || len(groups) != 1 || groups[0].GroupID != 11 {
		t.Fatalf("scoped groups %+v err %v", groups, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
func TestScopedRosterAndTimetableQueries(t *testing.T) {
	repo, mock := testRepository(t)
	mock.ExpectQuery(`(?s)SELECT .* FROM `+"\x60"+`user_group_members`+"\x60"+` JOIN user_groups ON .* JOIN users ON .* WHERE user_group_members\.group_id = \? ORDER BY users\.real_name ASC, users\.name ASC, users\.id ASC`).
		WithArgs(model.UserGroupStatusActive, model.UserStatusEnabled, uint64(4)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "group_id", "user_id", "role", "joined_at"}))
	roster, err := repo.Members(context.Background(), 4)
	if err != nil || len(roster) != 0 {
		t.Fatalf("members %v err %v", roster, err)
	}
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `personal_timetables` WHERE user_id IN (?,?)")).
		WithArgs(uint64(44), uint64(45)).WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "semester", "courses_json", "notes_json", "updated_at"}))
	records, err := repo.Timetables(context.Background(), []uint64{44, 45})
	if err != nil || len(records) != 0 {
		t.Fatalf("timetables %v err %v", records, err)
	}
	_, err = repo.Timetables(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestSemestersAreRestrictedToEnabledMembersOfSelectedGroup(t *testing.T) {
	repo, mock := testRepository(t)
	pattern := "(?s)SELECT DISTINCT personal_timetables.* FROM .*personal_timetables.* JOIN user_group_members ON .* JOIN user_groups ON .* JOIN users ON .* WHERE user_group_members.*group_id = .* ORDER BY personal_timetables.*"
	mock.ExpectQuery(pattern).WithArgs(model.UserGroupStatusActive, model.UserStatusEnabled, uint64(11)).
		WillReturnRows(sqlmock.NewRows([]string{"semester"}).AddRow("2026-2027学年第1学期"))
	options, err := repo.Semesters(context.Background(), 11)
	if err != nil || len(options) != 1 || options[0] != "2026-2027学年第1学期" {
		t.Fatalf("scoped semesters %v err %v", options, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
