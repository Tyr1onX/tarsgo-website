package database

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"tarsgo-backend/model"
)

func TestMariaDBDefaultGroupReferenceNormalizationV89(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("refusing cleanup test outside isolated acceptance database")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
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

	var actor model.User
	if err := tx.Where("email = ?", "test-super-admin@tarsgo.test").First(&actor).Error; err != nil {
		t.Fatal(err)
	}
	marker := time.Now().UnixNano()
	createRegistration := func(groupID uint64, status string) model.Registration {
		t.Helper()
		form := model.RegistrationForm{Title: fmt.Sprintf("[TEST] default cleanup %d %s", marker, status), CreatorID: actor.ID, FieldsSchema: []model.FormField{}}
		if err := tx.Create(&form).Error; err != nil {
			t.Fatal(err)
		}
		registration := model.Registration{FormID: form.ID, UserID: actor.ID, PreferredGroupID: &groupID, FormData: map[string]any{"note": "keep"}, RecruitmentStatus: status}
		if err := tx.Create(&registration).Error; err != nil {
			t.Fatal(err)
		}
		return registration
	}

	retired := model.UserGroup{Name: fmt.Sprintf("[TEST] disposable default %d", marker), IsDefault: true, Status: 1}
	if err := tx.Create(&retired).Error; err != nil {
		t.Fatal(err)
	}
	registration := createRegistration(retired.ID, model.RecruitmentStatusPendingScreening)
	event := model.ActivityEvent{ActionKey: "test.default_group_reference", GroupID: &retired.ID}
	if err := tx.Create(&event).Error; err != nil {
		t.Fatal(err)
	}
	if err := normalizeRetiredDefaultGroupReferencesV89(tx); err != nil {
		t.Fatal(err)
	}
	var count int64
	if err := tx.Model(&model.UserGroup{}).Where("id = ?", retired.ID).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("disposable group not deleted: count=%d err=%v", count, err)
	}
	var saved model.Registration
	if err := tx.First(&saved, registration.ID).Error; err != nil {
		t.Fatal(err)
	}
	if saved.PreferredGroupID != nil || saved.RecruitmentStatus != model.RecruitmentStatusPendingScreening || saved.FormData["note"] != "keep" {
		t.Fatalf("registration must be preserved without fake preference: %#v", saved)
	}
	var activity model.ActivityEvent
	if err := tx.First(&activity, event.ID).Error; err != nil || activity.GroupID != nil {
		t.Fatalf("activity must be preserved without fake group: %#v err=%v", activity, err)
	}

	// Never silently discard the stated group of an already-admitted record.
	protected := model.UserGroup{Name: fmt.Sprintf("[TEST] protected default %d", marker), IsDefault: true, Status: 1}
	if err := tx.Create(&protected).Error; err != nil {
		t.Fatal(err)
	}
	admitted := createRegistration(protected.ID, model.RecruitmentStatusAdmitted)
	if err := normalizeRetiredDefaultGroupReferencesV89(tx); err != nil {
		t.Fatal(err)
	}
	if err := tx.Model(&model.UserGroup{}).Where("id = ?", protected.ID).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("admitted record must block group deletion: count=%d err=%v", count, err)
	}
	var savedAdmitted model.Registration
	if err := tx.First(&savedAdmitted, admitted.ID).Error; err != nil || savedAdmitted.PreferredGroupID == nil || *savedAdmitted.PreferredGroupID != protected.ID {
		t.Fatalf("admitted preference unexpectedly changed: %#v err=%v", savedAdmitted, err)
	}
}