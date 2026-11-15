package recruitmentanalytics

import (
	"context"
	"os"
	"strings"
	"testing"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/model"
)

func TestMariaDBCollegeAggregateUsesRegistrationSnapshot(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated database required")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()

	tx := db.Begin()
	if tx.Error != nil {
		t.Fatal(tx.Error)
	}
	defer tx.Rollback()

	var user model.User
	if err := tx.Where("email = ?", "test-super-admin@tarsgo.test").First(&user).Error; err != nil {
		t.Fatal(err)
	}
	form := model.RegistrationForm{
		CreatorID: user.ID,
		Title:     "synthetic campus snapshot",
		Status:    model.RegistrationFormStatusPublished,
		FieldsSchema: []model.FormField{
			{Key: "college_major", Label: "学院+专业", Type: "text", Required: true},
		},
	}
	if err := tx.Create(&form).Error; err != nil {
		t.Fatal(err)
	}
	entry := model.Registration{
		FormID:            form.ID,
		UserID:            user.ID,
		FormData:          map[string]any{"college_major": "机械与航空航天工程学院 机械设计"},
		RecruitmentStatus: model.RecruitmentStatusPendingScreening,
	}
	if err := tx.Create(&entry).Error; err != nil {
		t.Fatal(err)
	}
	rows, err := (gormRepository{db: tx}).CollegeAggregates(context.Background(), []uint64{form.ID})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].FormID != form.ID || rows[0].CollegeText != "机械与航空航天工程学院 机械设计" || rows[0].Count != 1 {
		t.Fatalf("snapshot campus input = %#v", rows)
	}
}
