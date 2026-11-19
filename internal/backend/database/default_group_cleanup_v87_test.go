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

func TestMariaDBDefaultGroupCleanupV87(t *testing.T) {
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

	marker := time.Now().UnixNano()
	retired := model.UserGroup{Name: fmt.Sprintf("[TEST] retired-%d", marker), IsDefault: true, Status: 1, Show: 1}
	current := model.UserGroup{Name: fmt.Sprintf("[TEST] current-%d", marker), Status: 1, Show: 1}
	for _, group := range []*model.UserGroup{&retired, &current} {
		if err := tx.Create(group).Error; err != nil {
			t.Fatal(err)
		}
	}
	event := model.ActivityEvent{ActionKey: "test.default_group_retirement", GroupID: &retired.ID}
	if err := tx.Create(&event).Error; err != nil {
		t.Fatal(err)
	}

	if err := purgeUnreferencedDefaultGroupsV87(tx); err != nil {
		t.Fatal(err)
	}
	var count int64
	if err := tx.Model(&model.UserGroup{}).Where("id = ?", retired.ID).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("referenced group must be preserved: count=%d err=%v", count, err)
	}
	var preserved model.ActivityEvent
	if err := tx.First(&preserved, event.ID).Error; err != nil || preserved.GroupID == nil || *preserved.GroupID != retired.ID {
		t.Fatalf("historical activity must retain its group reference: %#v err=%v", preserved, err)
	}
	if err := tx.Delete(&event).Error; err != nil {
		t.Fatal(err)
	}

	// This relation has no database foreign key: the cleanup must still protect it.
	record := model.MemberCultivationRecord{GroupID: retired.ID, UserID: uint64(marker), UpdatedBy: uint64(marker), UpdatedByName: "test", InternalNote: "preserve"}
	if err := tx.Create(&record).Error; err != nil {
		t.Fatal(err)
	}
	if err := purgeUnreferencedDefaultGroupsV87(tx); err != nil {
		t.Fatal(err)
	}
	if err := tx.Model(&model.UserGroup{}).Where("id = ?", retired.ID).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("logical group reference must prevent deletion: count=%d err=%v", count, err)
	}
	if err := tx.Delete(&record).Error; err != nil {
		t.Fatal(err)
	}
	if err := purgeUnreferencedDefaultGroupsV87(tx); err != nil {
		t.Fatal(err)
	}
	if err := tx.Model(&model.UserGroup{}).Where("id = ?", retired.ID).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("unreferenced retired group must be removed: count=%d err=%v", count, err)
	}
	if err := tx.Model(&model.UserGroup{}).Where("id = ?", current.ID).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("real organization group must be unchanged: count=%d err=%v", count, err)
	}
}