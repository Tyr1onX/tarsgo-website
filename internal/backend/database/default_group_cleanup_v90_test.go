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

func TestMariaDBFinalRetiredDefaultGroupCorrectionV90(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("refusing test outside isolated MariaDB")
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
	retired := model.UserGroup{Name: fmt.Sprintf("[TEST] retired group %d", marker), IsDefault: true, Status: 1}
	if err := tx.Create(&retired).Error; err != nil {
		t.Fatal(err)
	}
	form := model.RegistrationForm{CreatorID: actor.ID, Title: fmt.Sprintf("[TEST] corrected admissions %d", marker), FieldsSchema: []model.FormField{}}
	if err := tx.Create(&form).Error; err != nil {
		t.Fatal(err)
	}

	type caseRecord struct {
		user         model.User
		group        model.UserGroup
		registration model.Registration
	}
	records := make([]caseRecord, 2)
	for i, name := range []string{"电控组", "视觉组"} {
		group := model.UserGroup{Name: fmt.Sprintf("[TEST] %s %d", name, marker), Status: model.UserGroupStatusActive}
		if err := tx.Create(&group).Error; err != nil {
			t.Fatal(err)
		}
		user := model.User{RoleID: actor.RoleID, Email: fmt.Sprintf("test-retired-default-%d-%d@tarsgo.test", marker, i)}
		if err := tx.Create(&user).Error; err != nil {
			t.Fatal(err)
		}
		if err := tx.Create(&model.UserGroupMember{UserID: user.ID, GroupID: group.ID}).Error; err != nil {
			t.Fatal(err)
		}
		registration := model.Registration{
			FormID: form.ID, UserID: user.ID, PreferredGroupID: &retired.ID,
			RecruitmentStatus: model.RecruitmentStatusAdmitted, FormData: map[string]any{"note": "keep"},
		}
		if err := tx.Create(&registration).Error; err != nil {
			t.Fatal(err)
		}
		if err := tx.Exec(`INSERT INTO registration_legacy_archives
			(id,form_id,form_title,user_id,applicant_name,submitted_at,main_group_id,main_group_name,group_source,final_status,recruitment_status)
			VALUES (?,?,?,?,?,NOW(),?,?,'final',1,'admitted')`,
			registration.ID, form.ID, form.Title, user.ID, name, retired.ID, retired.Name).Error; err != nil {
			t.Fatal(err)
		}
		records[i] = caseRecord{user: user, group: group, registration: registration}
	}
	event := model.ActivityEvent{ActionKey: "test.legacy.member_role_changed", GroupID: &retired.ID}
	if err := tx.Create(&event).Error; err != nil {
		t.Fatal(err)
	}

	corrections := []retiredAdmissionCorrection{
		{records[0].registration.ID, records[0].user.ID, records[0].group.ID},
		{records[1].registration.ID, records[1].user.ID, records[1].group.ID},
	}
	bad := append([]retiredAdmissionCorrection(nil), corrections...)
	bad[1].GroupID = records[0].group.ID
	if err := finalizeRetiredDefaultGroupCorrections(tx, bad); err == nil {
		t.Fatal("wrong organization membership must reject the entire correction")
	}
	var unchanged model.Registration
	if err := tx.First(&unchanged, records[0].registration.ID).Error; err != nil || unchanged.PreferredGroupID == nil || *unchanged.PreferredGroupID != retired.ID {
		t.Fatalf("failed correction did not roll back: %#v err=%v", unchanged, err)
	}

	if err := finalizeRetiredDefaultGroupCorrections(tx, corrections); err != nil {
		t.Fatal(err)
	}
	if err := finalizeRetiredDefaultGroupCorrections(tx, corrections); err != nil {
		t.Fatalf("idempotent rerun: %v", err)
	}
	var count int64
	if err := tx.Model(&model.UserGroup{}).Where("id = ?", retired.ID).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("retired group remains: count=%d err=%v", count, err)
	}
	for _, entry := range records {
		var saved model.Registration
		if err := tx.First(&saved, entry.registration.ID).Error; err != nil {
			t.Fatal(err)
		}
		if saved.PreferredGroupID == nil || *saved.PreferredGroupID != entry.group.ID || saved.RecruitmentStatus != model.RecruitmentStatusAdmitted || saved.FormData["note"] != "keep" {
			t.Fatalf("admitted registration must retain contents with real group: %#v", saved)
		}
		var archive struct {
			GroupID   uint64 `gorm:"column:main_group_id"`
			GroupName string `gorm:"column:main_group_name"`
		}
		if err := tx.Table("registration_legacy_archives").
			Select("main_group_id,main_group_name").Where("id = ?", entry.registration.ID).Scan(&archive).Error; err != nil {
			t.Fatal(err)
		}
		if archive.GroupID != entry.group.ID || archive.GroupName != entry.group.Name {
			t.Fatalf("legacy archive not corrected: %#v", archive)
		}
		if err := tx.Model(&model.UserGroupMember{}).Where("user_id = ? AND group_id = ?", entry.user.ID, entry.group.ID).
			Count(&count).Error; err != nil || count != 1 {
			t.Fatalf("real membership changed: count=%d err=%v", count, err)
		}
	}
	var savedEvent model.ActivityEvent
	if err := tx.First(&savedEvent, event.ID).Error; err != nil || savedEvent.GroupID != nil {
		t.Fatalf("historical activity must remain without invented group: %#v err=%v", savedEvent, err)
	}
}