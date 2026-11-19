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

func TestMariaDBOperationsMerchandiseV84CreatesIndependentWorks(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated acceptance database required")
	}
	prefix := fmt.Sprintf("merch84_%d_", time.Now().UnixNano())
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		NamingStrategy:                           schema.NamingStrategy{TablePrefix: prefix},
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	defer db.Migrator().DropTable(&model.OperationsProgressStep{}, &model.OperationsProgressItem{})
	if err := db.AutoMigrate(&model.OperationsProgressItem{}, &model.OperationsProgressStep{}); err != nil {
		t.Fatal(err)
	}

	legacy := model.OperationsProgressItem{Title: "周边制作", Kind: "merchandise", Status: "active"}
	existing := model.OperationsProgressItem{Title: "鼠标垫", Kind: "merchandise", Status: "active"}
	if err := db.Create(&legacy).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&existing).Error; err != nil {
		t.Fatal(err)
	}
	presets := model.OperationsStepPresets("merchandise")
	for position, preset := range presets {
		status := "pending"
		if position == 0 {
			status = "done"
		}
		if err := db.Create(&model.OperationsProgressStep{
			ItemID: existing.ID, Key: preset.Key, Title: preset.Title,
			Position: position, Status: status,
		}).Error; err != nil {
			t.Fatal(err)
		}
	}

	for i := 0; i < 3; i++ {
		if err := migrateOperationsMerchandiseItemsV84(db); err != nil {
			t.Fatal(err)
		}
	}
	var all []model.OperationsProgressItem
	if err := db.Find(&all).Error; err != nil {
		t.Fatal(err)
	}
	if len(all) != 11 {
		t.Fatalf("expected ten single products plus legacy work, got %d", len(all))
	}
	names := map[string]bool{}
	for _, name := range []string{
		"小灯泡", "指尖陀螺", "鼠标垫", "帆布袋", "尺子",
		"小口袋", "卡通人物立牌", "钥匙扣", "光栅卡", "机器人拼接积木",
	} {
		names[name] = false
	}
	for _, item := range all {
		if item.ID == legacy.ID {
			if item.Title != "周边制作" {
				t.Fatalf("legacy work unexpectedly changed: %+v", item)
			}
			continue
		}
		if _, ok := names[item.Title]; !ok || names[item.Title] {
			t.Fatalf("missing or duplicate individual merchandise: %+v", item)
		}
		names[item.Title] = true
		if item.Kind != "merchandise" || item.SeriesName != "" ||
			item.IntervalDays != 0 || item.NextCheckAt != nil {
			t.Fatalf("item must have no batch, priority or invented deadline: %+v", item)
		}
		var steps []model.OperationsProgressStep
		if err := db.Where("item_id = ?", item.ID).Order("position").Find(&steps).Error; err != nil {
			t.Fatal(err)
		}
		if len(steps) != 6 {
			t.Fatalf("%s expected six independent stages, got %d", item.Title, len(steps))
		}
		for i, step := range steps {
			if step.Key != presets[i].Key || step.Position != i || step.AssigneeID != nil {
				t.Fatalf("unexpected step assignment for %s: %+v", item.Title, step)
			}
			want := "pending"
			if item.ID == existing.ID && i == 0 {
				want = "done"
			}
			if step.Status != want {
				t.Fatalf("migration overwrote status on %s: %+v, want %s", item.Title, step, want)
			}
		}
	}
	for name, found := range names {
		if !found {
			t.Fatalf("missing product: %s", name)
		}
	}
}
