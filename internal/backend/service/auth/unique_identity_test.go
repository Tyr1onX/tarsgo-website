package auth

import (
	"net/http"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"tarsgo-backend/model"
)

func TestRejectDuplicateStudentID(t *testing.T) {
	db, mock := newAuthSQLMock(t)
	mock.ExpectQuery("SELECT count\\(\\*\\) FROM `users` WHERE status = \\? AND UPPER\\(TRIM\\(student_id\\)\\) = \\?").
		WithArgs(model.UserStatusEnabled, "20240001").
		WillReturnRows(sqlmock.NewRows([]string{"count(*)"}).AddRow(1))
	err := ensureDistinctStudentID(db, 0, " 20240001 ")
	if e, ok := err.(*ServiceError); !ok || e.Status != http.StatusConflict {
		t.Fatalf("duplicate student ID must be rejected: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestRejectDuplicateProfilePhone(t *testing.T) {
	db, mock := newAuthSQLMock(t)
	mock.ExpectQuery("SELECT count\\(\\*\\) FROM `users` WHERE status = \\? AND phone = \\? AND id <> \\?").
		WithArgs(model.UserStatusEnabled, "13900139000", uint64(22)).
		WillReturnRows(sqlmock.NewRows([]string{"count(*)"}).AddRow(1))
	err := ensureDistinctPhone(db, 22, "13900139000")
	if e, ok := err.(*ServiceError); !ok || e.Status != http.StatusConflict {
		t.Fatalf("duplicate phone must be rejected: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}