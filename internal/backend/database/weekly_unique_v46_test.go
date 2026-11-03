package database

import (
	"fmt"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"os"
	"strings"
	"testing"
	"time"
)

func TestMariaDBWeeklyUniqueMigrationPreservesHistory(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated database")
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
	table := fmt.Sprintf("weekly_unique_probe_%d", time.Now().UnixNano())
	if err := db.Exec("CREATE TABLE " + table + " (id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NOT NULL,week_start DATE NOT NULL,group_id BIGINT NULL,completed TEXT, UNIQUE KEY old_group_week (group_id,user_id,week_start)) ENGINE=InnoDB").Error; err != nil {
		t.Fatal(err)
	}
	defer db.Exec("DROP TABLE " + table)
	if err := db.Exec("INSERT INTO " + table + " (user_id,week_start,group_id,completed) VALUES (1,'2026-11-02',NULL,'first'),(1,'2026-11-02',NULL,'second')").Error; err != nil {
		t.Fatal(err)
	}
	if err := migrateWeeklyUniqueV46Table(db, table); err == nil {
		t.Fatal("duplicate history must block migration")
	}
	var count int64
	db.Table(table).Count(&count)
	if count != 2 {
		t.Fatal("history lost")
	}
	// Fixture reconciliation changes only its second week; production migration
	// does not mutate content or choose a duplicate to retain.
	if err := db.Exec("UPDATE " + table + " SET week_start='2026-10-26' WHERE id=2").Error; err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := migrateWeeklyUniqueV46Table(db, table); err != nil {
			t.Fatal(err)
		}
	}
	for _, group := range []string{"NULL", "99"} {
		if err := db.Exec("INSERT INTO " + table + " (user_id,week_start,group_id,completed) VALUES (1,'2026-11-02'," + group + ",'duplicate')").Error; err == nil {
			t.Fatal("duplicate user-week accepted")
		}
	}
	var body string
	if err := db.Table(table).Select("completed").Where("id=2").Scan(&body).Error; err != nil || body != "second" {
		t.Fatalf("history changed: %q %v", body, err)
	}
}
