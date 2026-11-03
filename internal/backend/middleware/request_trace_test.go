package middleware

import (
	"bytes"
	"errors"
	"log"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"tarsgo-backend/requestmetrics"
)

func TestRequestTracingLogsCorrelationAndOmitsSecrets(t *testing.T) {
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
	engine := gin.New()
	engine.Use(RequestTracing())
	engine.Use(gin.LoggerWithConfig(gin.LoggerConfig{Formatter: RequestLogFormatter, SkipQueryString: true}))
	engine.Use(RecoveryWithRequestID())
	engine.GET("/api/assignments", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	request := httptest.NewRequest(http.MethodGet, "/api/assignments?token=query-secret", nil)
	request.Header.Set("Cookie", "tarsgo_token=cookie-secret")
	request.Header.Set("Authorization", "Bearer authorization-secret")
	request.Header.Set(requestIDHeader, "caller-chosen-id")
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, request)

	requestID := response.Header().Get(requestIDHeader)
	if !regexp.MustCompile(`^[a-f0-9]{32}$`).MatchString(requestID) || requestID == "caller-chosen-id" {
		t.Fatalf("expected a server-generated request ID, got %q", requestID)
	}
	output := logs.String()
	for _, expected := range []string{"request_id=" + requestID, "method=GET", `path="/api/assignments"`, "status=204"} {
		if !strings.Contains(output, expected) {
			t.Fatalf("request log does not contain %q: %s", expected, output)
		}
	}
	for _, secret := range []string{"query-secret", "cookie-secret", "authorization-secret", "caller-chosen-id", "Cookie:", "Authorization:"} {
		if strings.Contains(output, secret) {
			t.Fatalf("request log leaked %q: %s", secret, output)
		}
	}
}

func TestSafeLogValueRedactsQuotedAndCamelCaseCredentialFields(t *testing.T) {
	value := safeLogValue(`database error {"refreshToken":"refresh-secret","password": "quoted-password-secret","api_key":"api-secret"} assignmentId=42`)
	for _, secret := range []string{"refresh-secret", "quoted-password-secret", "api-secret"} {
		if strings.Contains(value, secret) {
			t.Fatalf("sanitized log value leaked %q: %s", secret, value)
		}
	}
	if !strings.Contains(value, "assignmentId=42") {
		t.Fatalf("sanitizer removed non-sensitive context: %s", value)
	}
}

func TestInternalErrorLogIncludesContextAndRedactsSecrets(t *testing.T) {
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
	engine := gin.New()
	engine.Use(RequestTracing())
	engine.Use(gin.LoggerWithConfig(gin.LoggerConfig{Formatter: RequestLogFormatter, SkipQueryString: true}))
	engine.Use(RecoveryWithRequestID())
	engine.GET("/api/assignments/:id", func(c *gin.Context) {
		LogInternalError(c, "load assignment", http.StatusInternalServerError,
			errors.New("database read failed password=pass-secret Cookie: session=cookie-secret token=token-secret"))
		writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
	})

	request := httptest.NewRequest(http.MethodGet, "/api/assignments/42?session=query-secret", nil)
	request.Header.Set("Cookie", "tarsgo_token=cookie-secret")
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, request)

	requestID := response.Header().Get(requestIDHeader)
	output := logs.String()
	for _, expected := range []string{"server_error", "request_started_at=", "request_id=" + requestID, "method=GET", `path="/api/assignments/42"`, `route="/api/assignments/:id"`, "status=500", `operation="load assignment"`, "database read failed"} {
		if !strings.Contains(output, expected) {
			t.Fatalf("internal error log does not contain %q: %s", expected, output)
		}
	}
	for _, secret := range []string{"pass-secret", "cookie-secret", "token-secret", "query-secret", "session=query-secret"} {
		if strings.Contains(output, secret) {
			t.Fatalf("internal error log leaked %q: %s", secret, output)
		}
	}
}

func TestRecoveryLogsRequestIDWithoutDumpingCookieOrPanicValue(t *testing.T) {
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
	engine := gin.New()
	engine.Use(RequestTracing())
	engine.Use(gin.LoggerWithConfig(gin.LoggerConfig{Formatter: RequestLogFormatter, SkipQueryString: true}))
	engine.Use(RecoveryWithRequestID())
	engine.GET("/api/assignments", func(c *gin.Context) {
		panic(errors.New("backend panic Cookie: session=cookie-secret token=panic-secret"))
	})

	request := httptest.NewRequest(http.MethodGet, "/api/assignments", nil)
	request.Header.Set("Cookie", "tarsgo_token=cookie-secret")
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, request)

	requestID := response.Header().Get(requestIDHeader)
	if response.Code != http.StatusInternalServerError || requestID == "" {
		t.Fatalf("expected traced 500, status=%d request_id=%q", response.Code, requestID)
	}
	output := logs.String()
	for _, expected := range []string{"server_error", "panic recovery", "server_error_stack", "request_id=" + requestID, "status=500"} {
		if !strings.Contains(output, expected) {
			t.Fatalf("panic log does not contain %q: %s", expected, output)
		}
	}
	for _, secret := range []string{"cookie-secret", "panic-secret", "Cookie:"} {
		if strings.Contains(output, secret) {
			t.Fatalf("panic log leaked %q: %s", secret, output)
		}
	}
}

func TestRequestSQLMetricsReachHTTPLog(t *testing.T) {
	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true, Logger: requestmetrics.NewSQLLogger()})
	if err != nil {
		t.Fatal(err)
	}
	mock.ExpectQuery("SELECT 1").WillReturnRows(sqlmock.NewRows([]string{"value"}).AddRow(1))
	previous := gin.DefaultWriter
	defer func() { gin.DefaultWriter = previous }()
	var output bytes.Buffer
	gin.DefaultWriter = &output
	engine := gin.New()
	engine.Use(RequestTracing(), gin.LoggerWithConfig(gin.LoggerConfig{Formatter: RequestLogFormatter}))
	engine.GET("/query", func(c *gin.Context) {
		var value int
		if err := db.WithContext(c.Request.Context()).Raw("SELECT 1").Scan(&value).Error; err != nil {
			t.Error(err)
		}
		c.Status(204)
	})
	engine.GET("/empty", func(c *gin.Context) { c.Status(204) })
	engine.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/query", nil))
	if !strings.Contains(output.String(), "sql_count=1") || !strings.Contains(output.String(), "sql_errors=0") {
		t.Fatalf("missing totals: %s", output.String())
	}
	output.Reset()
	engine.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/empty", nil))
	if !strings.Contains(output.String(), "sql_count=0") {
		t.Fatal("counts leaked between requests")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
