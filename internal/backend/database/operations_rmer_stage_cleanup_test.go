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

func TestMariaDBRMerTrialStageCleanupOnlyTouchesSeededVideo(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated acceptance database required")
	}
	prefix := fmt.Sprintf("rm%d_", time.Now().UnixNano())
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
	key := "video:rmer"
	video := model.OperationsProgressItem{Title: "RMer 人物系列 · 下一期", SeedKey: &key, Kind: "video", Stage: "materials", Status: "active"}
	other := model.OperationsProgressItem{Title: "其他视频", Kind: "video", Stage: "review", Status: "active"}
	for _, item := range []*model.OperationsProgressItem{&video, &other} {
		if err := db.Create(item).Error; err != nil {
			t.Fatal(err)
		}
	}
	updates := []model.OperationsProgressUpdate{
		{ItemID: video.ID, Kind: "stage", Content: "阶段：待确认 → 素材拍摄"},
		{ItemID: video.ID, Kind: "reverted", Content: "阶段：素材拍摄 → 选题文案"},
		{ItemID: video.ID, Kind: "undo", Content: "撤回阶段：选题文案 → 素材拍摄"},
		{ItemID: video.ID, Kind: "confirmed", Content: "已确认"},
		{ItemID: video.ID, Kind: "progress", Content: "保留真实采访备注"},
		{ItemID: other.ID, Kind: "stage", Content: "其他视频的阶段"},
	}
	if err := db.Create(&updates).Error; err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := clearRMerTrialStageHistoryV62(db); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.First(&video, video.ID).Error; err != nil {
		t.Fatal(err)
	}
	if video.Stage != "unconfirmed" {
		t.Fatalf("RMer stage not reset: %s", video.Stage)
	}
	var remaining []model.OperationsProgressUpdate
	if err := db.Order("id").Find(&remaining).Error; err != nil {
		t.Fatal(err)
	}
	if len(remaining) != 2 || remaining[0].ItemID != video.ID || remaining[0].Kind != "progress" ||
		remaining[1].ItemID != other.ID || remaining[1].Kind != "stage" {
		t.Fatalf("cleanup touched unrelated records: %+v", remaining)
	}
	if err := db.First(&other, other.ID).Error; err != nil {
		t.Fatal(err)
	}
	if other.Stage != "review" {
		t.Fatalf("cleanup changed another item's stage: %s", other.Stage)
	}
}
