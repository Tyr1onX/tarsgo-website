package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/model"
	"tarsgo-backend/service/auth"
	"tarsgo-backend/service/leave"
)

func TestSchoolLeaveGroupResultRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true})
	if err != nil {
		t.Fatal(err)
	}
	h := NewLeaveHandler(leave.NewService(db))
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Set("sessionUser", &auth.SessionUser{ID: 99})
		c.Next()
	})
	const path = "/api/admin/school-leave/runs/:id/groups/:groupIndex/result"
	engine.GET(path, h.SchoolGroupResult)
	engine.POST(path, h.UploadSchoolGroupResult)

	t.Run("admin downloads another member's signed document", func(t *testing.T) {
		start := time.Date(2026, 11, 9, 10, 0, 0, 0, time.UTC)
		mock.ExpectQuery("SELECT .*FROM .*school_leave_requests.*WHERE").
			WithArgs(uint64(42), model.LeaveStatusIncluded).
			WillReturnRows(sqlmock.NewRows([]string{"id", "run_id", "status", "start_at", "end_at", "name_snapshot", "student_id_snapshot"}).
				AddRow(3, 42, model.LeaveStatusIncluded, start, start.Add(time.Hour), "成员", "12345678"))
		mock.ExpectQuery("SELECT .*FROM .*school_leave_group_results.*WHERE").
			WithArgs(uint64(42), 1, 1).
			WillReturnRows(sqlmock.NewRows([]string{"id", "run_id", "group_index", "original_filename", "mime_type", "content", "expires_at"}).
				AddRow(8, 42, 1, "signed.pdf", "application/pdf", []byte("%PDF-1.7\n"), time.Now().Add(24*time.Hour)))

		res := httptest.NewRecorder()
		engine.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/admin/school-leave/runs/42/groups/1/result", nil))
		if res.Code != http.StatusOK || res.Body.String() != "%PDF-1.7\n" {
			t.Fatalf("admin download: status=%d body=%q", res.Code, res.Body.String())
		}
		if res.Header().Get("Content-Type") != "application/pdf" || !strings.Contains(res.Header().Get("Content-Disposition"), "signed.pdf") {
			t.Fatalf("signed document headers: %#v", res.Header())
		}
	})

	t.Run("upload reaches file selection after valid group index", func(t *testing.T) {
		res := httptest.NewRecorder()
		engine.ServeHTTP(res, httptest.NewRequest(http.MethodPost, "/api/admin/school-leave/runs/42/groups/1/result", nil))
		if res.Code != http.StatusBadRequest || !strings.Contains(res.Body.String(), "请选择签回材料") {
			t.Fatalf("upload group index rejected: status=%d body=%q", res.Code, res.Body.String())
		}
	})

	t.Run("invalid group index rejected", func(t *testing.T) {
		res := httptest.NewRecorder()
		engine.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/admin/school-leave/runs/42/groups/invalid/result", nil))
		if res.Code != http.StatusBadRequest || !strings.Contains(res.Body.String(), "时间组无效") {
			t.Fatalf("invalid group index: status=%d body=%q", res.Code, res.Body.String())
		}
	})

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
