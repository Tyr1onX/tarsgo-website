package timetable

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"tarsgo-backend/model"
)

func mockService(t *testing.T) (*Service, sqlmock.Sqlmock) {
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
	return NewService(db), mock
}

func TestListReturnsOnlyTheConfiguredCurrentSemesterForSessionUser(t *testing.T) {
	service, mock := mockService(t)
	now := time.Now()
	values, _ := json.Marshal([]Course{{Name: "课程甲", Weekday: 1, StartSection: 1, EndSection: 2, Weeks: []int{1}, Parity: "all"}})
	sql := "SELECT .* FROM `personal_timetables` WHERE user_id = \\? AND semester = \\? ORDER BY updated_at DESC"
	mock.ExpectQuery(sql).WithArgs(uint64(12), CurrentSemester).WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "semester", "courses_json", "notes_json", "updated_at"}).
		AddRow(1, 12, CurrentSemester, string(values), "[]", now))
	mock.ExpectQuery(sql).WithArgs(uint64(19), CurrentSemester).WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "semester", "courses_json", "notes_json", "updated_at"}).
		AddRow(3, 19, CurrentSemester, "[]", "[]", now))
	mine, err := service.List(context.Background(), 12)
	if err != nil || len(mine) != 1 || len(mine[0].Courses) != 1 {
		t.Fatalf("user12 data %v err %v", mine, err)
	}
	another, err := service.List(context.Background(), 19)
	if err != nil || len(another) != 1 || len(another[0].Courses) != 0 {
		t.Fatalf("user19 data %v err %v", another, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestImportUpsertsSameSemesterAndRejectsInvalidBeforeWriting(t *testing.T) {
	service, mock := mockService(t)
	valid := schoolWorkbook("")
	for i := 0; i < 2; i++ {
		mock.ExpectQuery("SELECT GET_LOCK\\(\\?, 30\\)").WithArgs(lifecycleLockName).WillReturnRows(sqlmock.NewRows([]string{"GET_LOCK"}).AddRow(1))
		mock.ExpectBegin()
		mock.ExpectExec("INSERT INTO `personal_timetables`").WillReturnResult(sqlmock.NewResult(1, 1))
		mock.ExpectCommit()
		mock.ExpectQuery("SELECT RELEASE_LOCK\\(\\?\\)").WithArgs(lifecycleLockName).WillReturnRows(sqlmock.NewRows([]string{"RELEASE_LOCK"}).AddRow(1))
		result, err := service.Import(context.Background(), 10, "我的课表.xlsx", valid)
		if err != nil || len(result.Courses) != 13 {
			t.Fatalf("reimport attempt %d: result=%v err=%v", i, result, err)
		}
	}
	for _, data := range [][]byte{[]byte("bad"), schoolWorkbook("C001-课程甲\n8-3周,星期3,第3节-第4节教室A")} {
		result, err := service.Import(context.Background(), 10, "我的课表.xlsx", data)
		if err == nil || result != nil {
			t.Fatalf("invalid workbook wrote data: %v %v", result, err)
		}
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestDatabaseFailureDoesNotClaimSuccess(t *testing.T) {
	service, mock := mockService(t)
	mock.ExpectQuery("SELECT GET_LOCK\\(\\?, 30\\)").WithArgs(lifecycleLockName).WillReturnRows(sqlmock.NewRows([]string{"GET_LOCK"}).AddRow(1))
	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO `personal_timetables`").WillReturnError(errors.New("database unavailable"))
	mock.ExpectRollback()
	mock.ExpectQuery("SELECT RELEASE_LOCK\\(\\?\\)").WithArgs(lifecycleLockName).WillReturnRows(sqlmock.NewRows([]string{"RELEASE_LOCK"}).AddRow(1))
	result, err := service.Import(context.Background(), 10, "我的课表.xlsx", schoolWorkbook(""))
	if result != nil || err == nil {
		t.Fatalf("unexpected success: %v %v", result, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestTimetableCleanupRequiresExactSuperAdminRole(t *testing.T) {
	service, mock := mockService(t)
	for _, actor := range []struct {
		userID uint64
		role   string
		status int
	}{
		{userID: 17, role: model.RoleNameAdmin, status: http.StatusForbidden},
		{userID: 18, role: model.RoleNameUser, status: http.StatusForbidden},
		{userID: 0, role: model.RoleNameSuperAdmin, status: http.StatusUnauthorized},
	} {
		if _, err := service.CountAll(context.Background(), actor.userID, actor.role); err == nil {
			t.Fatalf("CountAll accepted actor %#v", actor)
		} else {
			var serviceErr *Error
			if !errors.As(err, &serviceErr) || serviceErr.Status != actor.status {
				t.Fatalf("CountAll actor %#v: %v", actor, err)
			}
		}
		if _, err := service.ClearAll(context.Background(), actor.userID, actor.role, 0); err == nil {
			t.Fatalf("ClearAll accepted actor %#v", actor)
		} else {
			var serviceErr *Error
			if !errors.As(err, &serviceErr) || serviceErr.Status != actor.status {
				t.Fatalf("ClearAll actor %#v: %v", actor, err)
			}
		}
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestClearAllConfirmsCountAndAuditsWithinTransaction(t *testing.T) {
	service, mock := mockService(t)
	mock.ExpectQuery("SELECT GET_LOCK\\(\\?, 30\\)").WithArgs(lifecycleLockName).WillReturnRows(sqlmock.NewRows([]string{"GET_LOCK"}).AddRow(1))
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT count\\(\\*\\) FROM `personal_timetables`").WillReturnRows(sqlmock.NewRows([]string{"count(*)"}).AddRow(2))
	mock.ExpectExec("DELETE FROM `personal_timetables`").WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectExec("INSERT INTO `audit_logs`").WithArgs("personal_timetables_cleared", http.MethodPost,
		"/api/admin/timetable-availability/cleanup", http.StatusOK, "", sqlmock.AnyArg(), `{"deletedCount":2}`, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()
	mock.ExpectQuery("SELECT RELEASE_LOCK\\(\\?\\)").WithArgs(lifecycleLockName).WillReturnRows(sqlmock.NewRows([]string{"RELEASE_LOCK"}).AddRow(1))

	result, err := service.ClearAll(context.Background(), 91, model.RoleNameSuperAdmin, 2)
	if err != nil || result == nil || result.DeletedCount != 2 {
		t.Fatalf("cleanup result=%+v err=%v", result, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestClearAllRejectsChangedCountWithoutDeletingAndRepeatedClearIsAudited(t *testing.T) {
	service, mock := mockService(t)
	mock.ExpectQuery("SELECT GET_LOCK\\(\\?, 30\\)").WithArgs(lifecycleLockName).WillReturnRows(sqlmock.NewRows([]string{"GET_LOCK"}).AddRow(1))
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT count\\(\\*\\) FROM `personal_timetables`").WillReturnRows(sqlmock.NewRows([]string{"count(*)"}).AddRow(3))
	mock.ExpectRollback()
	mock.ExpectQuery("SELECT RELEASE_LOCK\\(\\?\\)").WithArgs(lifecycleLockName).WillReturnRows(sqlmock.NewRows([]string{"RELEASE_LOCK"}).AddRow(1))
	if _, err := service.ClearAll(context.Background(), 91, model.RoleNameSuperAdmin, 2); err == nil {
		t.Fatal("cleanup accepted a stale confirmation count")
	} else {
		var serviceErr *Error
		if !errors.As(err, &serviceErr) || serviceErr.Status != http.StatusConflict {
			t.Fatalf("stale confirmation error=%v", err)
		}
	}

	mock.ExpectQuery("SELECT GET_LOCK\\(\\?, 30\\)").WithArgs(lifecycleLockName).WillReturnRows(sqlmock.NewRows([]string{"GET_LOCK"}).AddRow(1))
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT count\\(\\*\\) FROM `personal_timetables`").WillReturnRows(sqlmock.NewRows([]string{"count(*)"}).AddRow(0))
	mock.ExpectExec("INSERT INTO `audit_logs`").WithArgs("personal_timetables_cleared", http.MethodPost,
		"/api/admin/timetable-availability/cleanup", http.StatusOK, "", sqlmock.AnyArg(), `{"deletedCount":0}`, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(2, 1))
	mock.ExpectCommit()
	mock.ExpectQuery("SELECT RELEASE_LOCK\\(\\?\\)").WithArgs(lifecycleLockName).WillReturnRows(sqlmock.NewRows([]string{"RELEASE_LOCK"}).AddRow(1))
	result, err := service.ClearAll(context.Background(), 91, model.RoleNameSuperAdmin, 0)
	if err != nil || result == nil || result.DeletedCount != 0 {
		t.Fatalf("repeated cleanup result=%+v err=%v", result, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
