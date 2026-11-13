package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/service/auth"
)

func TestValidateOperationsInputs(t *testing.T) {
	next := time.Now().UTC()
	input := operationsProgressInput{Title: " 视频更新 ", IntervalDays: 7, Status: "active", NextCheckAt: &next}
	if !validateOperationsProgress(&input) || input.Title != "视频更新" || input.NextCheckAt != nil {
		t.Fatal("recurring input should trim its title and not retain a redundant review deadline")
	}
	for _, invalid := range []operationsProgressInput{
		{Title: "", Status: "active"},
		{Title: "事项", IntervalDays: -1, Status: "active"},
		{Title: "事项", IntervalDays: 366, Status: "active"},
		{Title: "事项", Status: "bogus"},
		{Title: "事项", Status: "active"},
	} {
		if validateOperationsProgress(&invalid) {
			t.Fatalf("accepted invalid item: %+v", invalid)
		}
	}
	for _, link := range []string{"javascript:alert(1)", "file:///etc/passwd", "https://a.com@evil.test"} {
		update := operationsUpdateInput{Content: "已更新", Kind: "completed", Link: link}
		if validateOperationsUpdate(&update) {
			t.Fatalf("accepted unsafe progress link: %s", link)
		}
	}
	ok := operationsUpdateInput{Content: " 发布第 1 期 ", Kind: "completed", Link: "https://www.douyin.com/video/1"}
	if !validateOperationsUpdate(&ok) || ok.Content != "发布第 1 期" {
		t.Fatal("valid completion update rejected")
	}
}

func TestOperationsProgressOnlyOperationsMembersMayWrite(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		name, role string
		count      int
		want       int
	}{
		{"ordinary member", "user", 0, http.StatusForbidden},
		{"other group admin", "admin", 0, http.StatusForbidden},
		{"operations member", "user", 1, http.StatusCreated},
		{"super admin", "super_admin", -1, http.StatusCreated},
	} {
		t.Run(tc.name, func(t *testing.T) {
			sqlDB, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer sqlDB.Close()
			db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true})
			if err != nil {
				t.Fatal(err)
			}
			if tc.count >= 0 {
				mock.ExpectQuery("SELECT count\\(\\*\\) FROM user_group_members").
					WithArgs(uint64(42), "运营组", 1).
					WillReturnRows(sqlmock.NewRows([]string{"count(*)"}).AddRow(tc.count))
			}
			if tc.want == http.StatusCreated {
				mock.ExpectBegin()
				mock.ExpectExec("INSERT INTO `operations_progress_items`").WillReturnResult(sqlmock.NewResult(10, 1))
				mock.ExpectCommit()
			}
			handler := NewOperationsProgressHandler(db)
			router := gin.New()
			router.POST("/api/operations/progress", func(c *gin.Context) {
				c.Set("sessionUser", &auth.SessionUser{ID: 42, Role: auth.SessionRole{Name: tc.role}})
				handler.Create(c)
			})
			next := time.Now().Add(24 * time.Hour)
			input, _ := json.Marshal(operationsProgressInput{Title: "运营事项", Status: "active", NextCheckAt: &next})
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/operations/progress", bytes.NewReader(input)))
			if response.Code != tc.want {
				t.Fatalf("status = %d, want %d; response %s", response.Code, tc.want, response.Body.String())
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}
