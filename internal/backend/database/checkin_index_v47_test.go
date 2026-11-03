package database

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

func TestMariaDBCheckinIndexMigrationPreservesConstraintAndRows(t *testing.T) {
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
	table := fmt.Sprintf("checkin_probe_%d", time.Now().UnixNano())
	exec := func(sql string) {
		t.Helper()
		if err := db.Exec(sql).Error; err != nil {
			t.Fatal(err)
		}
	}
	exec("CREATE TABLE " + table + " (id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NOT NULL,day VARCHAR(10) NOT NULL,body TEXT, UNIQUE KEY uk_community_checkin_day(user_id,day), KEY idx_community_checkin_user_day(user_id,day)) ENGINE=InnoDB")
	defer db.Exec("DROP TABLE " + table)
	exec("INSERT INTO " + table + " (user_id,day,body) VALUES (1,'2026-11-03','preserved')")
	for i := 0; i < 2; i++ {
		if err := migrateCheckinIndexV47Table(db, table); err != nil {
			t.Fatal(err)
		}
	}
	if db.Migrator().HasIndex(table, "idx_community_checkin_user_day") {
		t.Fatal("duplicate remains")
	}
	var row struct{ Body string }
	if err := db.Table(table).Take(&row).Error; err != nil || row.Body != "preserved" {
		t.Fatalf("row=%+v error=%v", row, err)
	}
	if err := db.Exec("INSERT INTO " + table + " (user_id,day) VALUES (1,'2026-11-03')").Error; err == nil {
		t.Fatal("unique constraint lost")
	}
	exec("ALTER TABLE " + table + " ADD INDEX idx_community_checkin_user_day(day,user_id)")
	if err := migrateCheckinIndexV47Table(db, table); err == nil {
		t.Fatal("mismatching index must block")
	}
	if !db.Migrator().HasIndex(table, "idx_community_checkin_user_day") {
		t.Fatal("mismatching index deleted")
	}
	exec("ALTER TABLE " + table + " DROP INDEX uk_community_checkin_day")
	if err := migrateCheckinIndexV47Table(db, table); err == nil {
		t.Fatal("missing unique must block")
	}
}
