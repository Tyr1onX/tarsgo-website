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

func TestMariaDBOperationsStepsV67PreservesLegacyProgressAndIsIdempotent(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated acceptance database required")
	}
	prefix := fmt.Sprintf("steps%d_", time.Now().UnixNano())
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: prefix}})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	defer db.Migrator().DropTable(&model.OperationsProgressStep{}, &model.OperationsProgressItem{})
	if err := db.AutoMigrate(&model.OperationsProgressItem{}); err != nil {
		t.Fatal(err)
	}
	biliKey := "channel:bilibili"
	items := []model.OperationsProgressItem{
		{Title: "旧视频", Kind: "video", Stage: "editing", Status: "active", Owner: "原负责人"},
		{Title: "旧周边", Kind: "merchandise", Stage: "delivered", Status: "done"},
		{Title: "B站运营", Kind: "channel", Status: "active", SeedKey: &biliKey},
	}
	if err := db.Create(&items).Error; err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := migrateOperationsStepsV67(db); err != nil {
			t.Fatal(err)
		}
	}
	var steps []model.OperationsProgressStep
	if err := db.Order("item_id, position").Find(&steps).Error; err != nil {
		t.Fatal(err)
	}
	if len(steps) != 11 {
		t.Fatalf("expected exactly 11 steps after repeated migration, got %d", len(steps))
	}
	expected := []string{"done", "done", "active", "pending", "pending", "done", "done", "done", "done", "done", "done"}
	for i, step := range steps {
		if step.Status != expected[i] || step.CompletedAt != nil || step.AssigneeID != nil {
			t.Fatalf("step %d incorrectly fabricated a completion time or assignment: %+v", i, step)
		}
	}
	var video model.OperationsProgressItem
	if err := db.First(&video, items[0].ID).Error; err != nil {
		t.Fatal(err)
	}
	if video.Stage != "editing" || video.Owner != "原负责人" {
		t.Fatalf("legacy stage/owner must not be rewritten: %+v", video)
	}
	var channel model.OperationsProgressItem
	if err := db.First(&channel, items[2].ID).Error; err != nil {
		t.Fatal(err)
	}
	if channel.Platforms != "bilibili" {
		t.Fatalf("existing channel must be associated with its known platform, got %q", channel.Platforms)
	}
}