package handler

import (
	"bytes"
	"errors"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/middleware"
	"tarsgo-backend/service/assignment"
)

func TestAssignmentInternalErrorIsLoggedWithRequestIDAndRedacted(t *testing.T) {
	previousMode := gin.Mode()
	previousWriter := gin.DefaultWriter
	previousLogWriter := log.Writer()
	defer gin.SetMode(previousMode)
	defer func() {
		gin.DefaultWriter = previousWriter
		log.SetOutput(previousLogWriter)
	}()
	gin.SetMode(gin.TestMode)

	var logs bytes.Buffer
	gin.DefaultWriter = &logs
	log.SetOutput(&logs)
	connection, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Close()
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: connection, SkipInitializeWithVersion: true}), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	mock.ExpectQuery("SELECT .*group_id.*FROM `user_group_members` JOIN user_groups ON.*JOIN users ON.*").
		WillReturnError(errors.New("database unavailable password=must-not-appear"))

	assignmentHandler := NewAssignmentHandler(assignment.NewService(db))
	engine := gin.New()
	engine.Use(middleware.RequestTracing())
	engine.Use(gin.LoggerWithConfig(gin.LoggerConfig{Formatter: middleware.RequestLogFormatter, SkipQueryString: true}))
	engine.Use(middleware.RecoveryWithRequestID())
	engine.GET("/api/assignments", assignmentHandler.ListMine)

	request := httptest.NewRequest(http.MethodGet, "/api/assignments?token=query-secret", nil)
	request.Header.Set("Cookie", "tarsgo_token=cookie-secret")
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, request)

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", response.Code, response.Body.String())
	}
	requestID := response.Header().Get("X-Request-ID")
	output := logs.String()
	for _, expected := range []string{"server_error", "request_id=" + requestID, "method=GET", `path="/api/assignments"`, "status=500", "assignment", "读取所属技术组失败", "database unavailable"} {
		if !strings.Contains(output, expected) {
			t.Fatalf("assignment error log does not contain %q: %s", expected, output)
		}
	}
	for _, secret := range []string{"must-not-appear", "query-secret", "cookie-secret"} {
		if strings.Contains(output, secret) {
			t.Fatalf("assignment error log leaked %q: %s", secret, output)
		}
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
