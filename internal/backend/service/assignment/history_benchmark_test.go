package assignment

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

// Measures the full history assembler with 100 members and one file/review each.
func BenchmarkLoadSubmissionHistories(b *testing.B) {
	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		b.Fatal(err)
	}
	defer sqlDB.Close()
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true})
	if err != nil {
		b.Fatal(err)
	}
	users := make([]uint64, 100)
	for i := range users {
		users[i] = uint64(i + 1)
	}
	now := time.Date(2026, 11, 3, 0, 0, 0, 0, time.UTC)
	service := &Service{db: db}
	b.ReportAllocs()
	for n := 0; n < b.N; n++ {
		b.StopTimer()
		submissions := sqlmock.NewRows([]string{"id", "assignment_id", "user_id", "attempt", "submitted_at"})
		files := sqlmock.NewRows([]string{"id", "submission_id", "file_name", "size"})
		reviews := sqlmock.NewRows([]string{"id", "submission_id", "reviewer_id", "decision", "comment"})
		for _, id := range users {
			submissions.AddRow(id, 1, id, 1, now)
			files.AddRow(id, id, fmt.Sprintf("%d.pdf", id), 1024)
			reviews.AddRow(id, id, 1000, "passed", "通过")
		}
		mock.ExpectQuery("SELECT .* FROM `assignment_submissions`").WillReturnRows(submissions)
		mock.ExpectQuery("SELECT .* FROM `assignment_submission_files`").WillReturnRows(files)
		mock.ExpectQuery("SELECT .* FROM `assignment_reviews`").WillReturnRows(reviews)
		b.StartTimer()
		histories, err := service.loadSubmissionHistories(context.Background(), 1, users, true)
		if err != nil {
			b.Fatal(err)
		}
		if len(histories) != 100 || len(histories[1][0].Files) != 1 || len(histories[100][0].Reviews) != 1 {
			b.Fatal("incomplete histories")
		}
	}
	b.StopTimer()
	if err := mock.ExpectationsWereMet(); err != nil {
		b.Fatal(err)
	}
}
