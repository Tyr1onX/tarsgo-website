package handler

import (
	"bytes"
	"encoding/json"
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

func TestJoinInterestValidation(t *testing.T) {
	tests := []struct {
		name  string
		input joinInterestInput
		valid bool
	}{
		{"normalizes whitespace", joinInterestInput{QQ: " 12345678 ", Motivation: "  想参加  "}, true},
		{"invalid short qq", joinInterestInput{QQ: "1234"}, false},
		{"invalid letters", joinInterestInput{QQ: "12abc567"}, false},
		{"invalid leading zero", joinInterestInput{QQ: "0123456"}, false},
		{"reason too long", joinInterestInput{QQ: "123456", Motivation: strings.Repeat("测", 501)}, false},
		{"source too long", joinInterestInput{QQ: "123456", Source: strings.Repeat("a", 61)}, false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			ok := normalizeJoinInterestInput(&test.input)
			if ok != test.valid {
				t.Fatalf("valid = %v, want %v", ok, test.valid)
			}
			if ok && test.name == "normalizes whitespace" &&
				(test.input.QQ != "12345678" || test.input.Motivation != "想参加") {
				t.Fatalf("not normalized: %#v", test.input)
			}
		})
	}
}

func TestJoinInterestSaveUpsertsOwnAccountWithoutTouchingRecruitment(t *testing.T) {
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
	now := time.Now()
	for _, qq := range []string{"12345678", "87654321"} {
		mock.ExpectBegin()
		mock.ExpectExec("INSERT INTO .*join_interests.*ON DUPLICATE KEY UPDATE").
			WillReturnResult(sqlmock.NewResult(3, 1))
		mock.ExpectCommit()
		mock.ExpectQuery("SELECT .* FROM .*join_interests.*WHERE user_id = .*").
			WithArgs(uint64(42), 1).
			WillReturnRows(sqlmock.NewRows([]string{
				"id", "user_id", "preferred_group_id", "qq", "motivation",
				"background", "source", "status", "created_at", "updated_at",
			}).AddRow(3, 42, nil, qq, "", "", "website", "pending", now, now))

		body, _ := json.Marshal(joinInterestInput{QQ: qq, Source: "website"})
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodPut, "/api/join-interest", bytes.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("sessionUser", &auth.SessionUser{ID: 42})
		NewJoinInterestHandler(db).Save(c)
		if c.Writer.Status() != http.StatusOK {
			t.Fatalf("save status %d, want 200", c.Writer.Status())
		}
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
	// The only write is an upsert into join_interests; it never creates a
	// registration, changes its review status, or grants group membership.
}
