package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

func TestAuditAdministrativeActionsDoesNotPersistQueryParameters(t *testing.T) {
	previousMode := gin.Mode()
	defer gin.SetMode(previousMode)
	gin.SetMode(gin.TestMode)

	connection, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Close()
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: connection, SkipInitializeWithVersion: true}), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}

	mock.ExpectBegin()
	mock.ExpectExec("INSERT INTO `audit_logs`").
		WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), "{}").
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()
	engine := gin.New()
	engine.Use(AuditAdministrativeActions(db))
	engine.POST("/api/admin/assignments", func(c *gin.Context) { c.Status(http.StatusCreated) })

	request := httptest.NewRequest(http.MethodPost, "/api/admin/assignments?token=query-secret&session=session-secret", nil)
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("response status = %d, want %d", response.Code, http.StatusCreated)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
