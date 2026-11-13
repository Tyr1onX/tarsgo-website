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

func TestMariaDBOperationsProgressSeedIsIdempotentAndPreservesManualRows(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated acceptance MariaDB required")
	}

	prefix := fmt.Sprintf("ops_probe_%d_", time.Now().UnixNano())
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: prefix}})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	defer db.Migrator().DropTable(&model.OperationsProgressUpdate{}, &model.OperationsProgressItem{})

	if err := db.AutoMigrate(&model.OperationsProgressItem{}, &model.OperationsProgressUpdate{}); err != nil {
		t.Fatal(err)
	}
	existing := model.OperationsProgressItem{Title: "抖音运营", Kind: "channel", Status: "active", Owner: "已有负责人"}
	if err := db.Create(&existing).Error; err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := migrateOperationsProgressV60(db); err != nil {
			t.Fatal(err)
		}
	}
	var items []model.OperationsProgressItem
	if err := db.Order("id").Find(&items).Error; err != nil {
		t.Fatal(err)
	}
	if len(items) != 5 {
		t.Fatalf("expected 5 unique workstreams, got %d", len(items))
	}
	var videos int
	for _, item := range items {
		if item.ID == existing.ID {
			if item.Owner != "已有负责人" {
				t.Fatalf("manual existing owner was overwritten: %s", item.Owner)
			}
		}
		if item.Kind == "video" {
			videos++
			if item.Stage != "unconfirmed" {
				t.Fatal("video stage must not claim unverified progress")
			}
		}
		if item.NextCheckAt != nil || item.IntervalDays != 0 {
			t.Fatal("seed must not invent a deadline or publishing frequency")
		}
	}
	if videos != 1 {
		t.Fatalf("expected one video in the five initial workstreams, got %d", videos)
	}
	var updates []model.OperationsProgressUpdate
	if err := db.Order("published_on").Find(&updates).Error; err != nil {
		t.Fatal(err)
	}
	if len(updates) != 2 || updates[0].PublishedOn == nil || *updates[0].PublishedOn != "2026-11-02" ||
		updates[1].PublishedOn == nil || *updates[1].PublishedOn != "2026-11-05" {
		t.Fatalf("unexpected verified Bilibili release days: %+v", updates)
	}
}
