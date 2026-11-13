package database

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"

	"tarsgo-backend/model"
)

func TestMariaDBOperationsPublicMetricsMigrationIsIdempotent(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated acceptance MariaDB required")
	}
	prefix := fmt.Sprintf("om%d_", time.Now().UnixNano())
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: prefix}})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	defer db.Migrator().DropTable(&model.OperationsPlatformPost{}, &model.OperationsAccountSnapshot{}, &model.OperationsProgressUpdate{}, &model.OperationsProgressItem{})
	if err := db.AutoMigrate(&model.OperationsAccountSnapshot{}, &model.OperationsPlatformPost{}, &model.OperationsProgressItem{}, &model.OperationsProgressUpdate{}); err != nil {
		t.Fatal(err)
	}
	merch := model.OperationsProgressItem{Title: "周边制作", Kind: "workstream", Owner: "运营组", Status: "active"}
	if err := db.Create(&merch).Error; err != nil {
		t.Fatal(err)
	}
	manual := model.OperationsAccountSnapshot{Platform: "douyin", ObservedOn: "2026-10-14", Followers: 999, Source: "manual"}
	if err := db.Create(&manual).Error; err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := migrateOperationsPublicMetricsV61(db); err != nil {
			t.Fatal(err)
		}
	}
	var migrated model.OperationsProgressItem
	if err := db.First(&migrated, merch.ID).Error; err != nil {
		t.Fatal(err)
	}
	if migrated.Kind != "merchandise" || migrated.Stage != "unconfirmed" {
		t.Fatalf("merchandise workflow was not initialized: %+v", migrated)
	}
	var snapshots []model.OperationsAccountSnapshot
	if err := db.Order("observed_on, platform").Find(&snapshots).Error; err != nil {
		t.Fatal(err)
	}
	if len(snapshots) != 10 {
		t.Fatalf("expected 10 unique dated observations, got %d", len(snapshots))
	}
	var preserved model.OperationsAccountSnapshot
	if err := db.Where("platform = ? AND observed_on = ?", "douyin", "2026-10-14").Take(&preserved).Error; err != nil {
		t.Fatal(err)
	}
	if preserved.Followers != 999 || preserved.Source != "manual" {
		t.Fatalf("manual observation was overwritten: %+v", preserved)
	}
	var latest model.OperationsAccountSnapshot
	if err := db.Where("platform = ? AND observed_on = ?", "bilibili", "2026-11-13").Take(&latest).Error; err != nil {
		t.Fatal(err)
	}
	if latest.Followers != 2805 || latest.Source != "public_page" {
		t.Fatalf("incorrect verified public observation: %+v", latest)
	}
}
