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
	"tarsgo-backend/service/auth"
)

func TestRMUCProgressSessionIsolation(t *testing.T) {
	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true})
	if err != nil {
		t.Fatal(err)
	}
	h := NewRMUCProgressHandler(db)
	context := func(method, body string, id uint64) (*gin.Context, *httptest.ResponseRecorder) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(method, "/api/rmuc-academy/progress", strings.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")
		if id != 0 {
			c.Set("sessionUser", &auth.SessionUser{ID: id})
		}
		return c, w
	}
	c, w := context(http.MethodGet, "", 0)
	h.List(c)
	if w.Code != 401 {
		t.Fatal(w.Code)
	}
	c, w = context(http.MethodPut, `{"courseId":"field","version":1}`, 0)
	h.Save(c)
	if w.Code != 401 {
		t.Fatal(w.Code)
	}
	c, w = context(http.MethodPut, `{"courseId":"field","version":0}`, 42)
	h.Save(c)
	if w.Code != 400 {
		t.Fatal(w.Code)
	}
	now := time.Now()
	columns := []string{"user_id", "course_id", "version", "completed", "position", "updated_at"}
	for _, id := range []uint64{42, 43} {
		mock.ExpectQuery("SELECT .* FROM .*rmuc_lesson_progresses.*WHERE user_id = .*").WithArgs(id).WillReturnRows(sqlmock.NewRows(columns))
		c, w = context(http.MethodGet, "", id)
		h.List(c)
		if w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO .*rmuc_lesson_progresses.*ON DUPLICATE KEY UPDATE.*completed OR").WithArgs(uint64(42), "field", 1, false, 2, sqlmock.AnyArg(), false, 2, sqlmock.AnyArg()).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	mock.ExpectQuery("SELECT .* FROM .*rmuc_lesson_progresses.*WHERE user_id = .* AND course_id = .* AND version = .*").WithArgs(uint64(42), "field", 1, 1).WillReturnRows(sqlmock.NewRows(columns).AddRow(42, "field", 1, true, 2, now))
	c, w = context(http.MethodPut, `{"userId":43,"courseId":"field","version":1,"completed":false,"position":2}`, 42)
	h.Save(c)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"completed":true`) {
		t.Fatal(w.Code, w.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
