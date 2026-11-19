package handler

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/service/auth"
	"tarsgo-backend/service/privatefile"
)

func TestOperationsPermissionGroups(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		name, role               string
		groupCount               int
		canManage, canEditStatus bool
	}{
		{"super administrator", "super_admin", -1, true, true},
		{"operations member", "user", 1, false, true},
		{"operations administrator", "admin", 1, false, true},
		{"other group administrator", "admin", 0, false, false},
		{"unrelated assignee", "user", 0, false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			sqlDB, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer sqlDB.Close()
			db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}),
				&gorm.Config{DisableAutomaticPing: true})
			if err != nil {
				t.Fatal(err)
			}
			if tc.groupCount >= 0 {
				mock.ExpectQuery("SELECT count\\(\\*\\) FROM user_group_members AS m").
					WithArgs(uint64(42), "运营组", 1).
					WillReturnRows(sqlmock.NewRows([]string{"count(*)"}).AddRow(tc.groupCount))
			}
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
			c.Set("sessionUser", &auth.SessionUser{ID: 42, Role: auth.SessionRole{Name: tc.role}})
			handler := NewOperationsProgressHandler(db)
			gotManage, err := handler.canManage(c)
			if err != nil || gotManage != tc.canManage {
				t.Fatalf("manage = %v, err = %v", gotManage, err)
			}
			gotEdit, err := handler.canEditStatus(c)
			if err != nil || gotEdit != tc.canEditStatus {
				t.Fatalf("status edit = %v, err = %v", gotEdit, err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestOperationsMemberStatusOnly(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		name, payload string
		want          int
	}{
		{"cannot add note", `{"status":"active","note":"不允许新增说明"}`, http.StatusForbidden},
		{"cannot submit evidence", `{"status":"active","evidenceUrl":"https://example.com"}`, http.StatusForbidden},
		{"cannot edit reason without a status", `{"blockReason":"不允许单独修改"}`, http.StatusForbidden},
		{"can update unassigned step", `{"status":"active"}`, http.StatusOK},
	} {
		t.Run(tc.name, func(t *testing.T) {
			sqlDB, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer sqlDB.Close()
			db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}),
				&gorm.Config{DisableAutomaticPing: true})
			if err != nil {
				t.Fatal(err)
			}
			mock.ExpectQuery("SELECT count\\(\\*\\) FROM user_group_members AS m").
				WithArgs(uint64(42), "运营组", 1).
				WillReturnRows(sqlmock.NewRows([]string{"count(*)"}).AddRow(1))
			if tc.want == http.StatusOK {
				mock.ExpectBegin()
				mock.ExpectQuery("SELECT .* FROM `operations_progress_items` .*FOR UPDATE").
					WillReturnRows(sqlmock.NewRows([]string{"id", "kind", "status"}).AddRow(7, "video", "active"))
				mock.ExpectQuery("SELECT .* FROM `operations_progress_steps` .*FOR UPDATE").
					WillReturnRows(sqlmock.NewRows([]string{"id", "item_id", "key", "title", "status"}).AddRow(8, 7, "planning", "选题文案", "pending"))
				mock.ExpectExec("UPDATE `operations_progress_steps`").WillReturnResult(sqlmock.NewResult(0, 1))
				mock.ExpectExec("INSERT INTO `operations_progress_updates`").WillReturnResult(sqlmock.NewResult(1, 1))
				mock.ExpectCommit()
			}
			router := gin.New()
			handler := NewOperationsProgressHandler(db)
			router.PATCH("/operations/:id/steps/:stepId", func(c *gin.Context) {
				c.Set("sessionUser", &auth.SessionUser{ID: 42, Role: auth.SessionRole{Name: "user"}})
				handler.UpdateStep(c)
			})
			request := httptest.NewRequest(http.MethodPatch, "/operations/7/steps/8", bytes.NewBufferString(tc.payload))
			request.Header.Set("Content-Type", "application/json")
			record := httptest.NewRecorder()
			router.ServeHTTP(record, request)
			if record.Code != tc.want {
				t.Fatalf("status = %d, want = %d; body = %s", record.Code, tc.want, record.Body.String())
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestOperationsMemberCannotUseManagementEndpoints(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, action := range []struct {
		method, path string
		run          func(*OperationsProgressHandler, *gin.Context)
	}{
		{http.MethodDelete, "/operations/progress/7/plan", (*OperationsProgressHandler).DeleteEpisodePlan},
		{http.MethodDelete, "/operations/posts/7", (*OperationsProgressHandler).DeletePost},
		{http.MethodPatch, "/operations/progress/7/setup", (*OperationsProgressHandler).SetupEpisode},
		{http.MethodPatch, "/operations/progress/7/publications/douyin", (*OperationsProgressHandler).UpdatePublication},
		{http.MethodPost, "/operations/channels/7/episodes", (*OperationsProgressHandler).CreateEpisode},
		{http.MethodPost, "/operations/progress", (*OperationsProgressHandler).Create},
		{http.MethodPatch, "/operations/progress/7", (*OperationsProgressHandler).Update},
		{http.MethodPost, "/operations/progress/7/updates", (*OperationsProgressHandler).AddUpdate},
		{http.MethodPost, "/operations/progress/7/steps/8/attachments", (*OperationsProgressHandler).UploadStepAttachment},
	} {
		store, err := privatefile.NewStore(t.TempDir())
		if err != nil {
			t.Fatal(err)
		}
		router := gin.New()
		handler := NewOperationsProgressHandler(nil, store)
		route := action.path
		if action.path == "/operations/progress/7/steps/8/attachments" {
			route = "/operations/progress/:id/steps/:stepId/attachments"
		}
		router.Handle(action.method, route, func(c *gin.Context) {
			c.Set("sessionUser", &auth.SessionUser{ID: 42, Role: auth.SessionRole{Name: "user"}})
			action.run(handler, c)
		})
		record := httptest.NewRecorder()
		router.ServeHTTP(record, httptest.NewRequest(action.method, action.path, bytes.NewBufferString("{}")))
		if record.Code != http.StatusForbidden {
			t.Errorf("%s %s = %d (want 403)", action.method, action.path, record.Code)
		}
	}
}
