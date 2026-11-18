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

func TestMariaDBOperationsContentV80PreservesHistoryAndBackfillsTargets(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated acceptance database required")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{NamingStrategy: schema.NamingStrategy{
		TablePrefix: fmt.Sprintf("content%d_", time.Now().UnixNano()),
	}})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	defer db.Migrator().DropTable(&model.OperationsPublication{}, &model.OperationsProgressStep{}, &model.OperationsProgressItem{})
	if err := db.AutoMigrate(&model.OperationsProgressItem{}, &model.OperationsProgressStep{}); err != nil {
		t.Fatal(err)
	}
	channel := model.OperationsProgressItem{Title: "B站运营", Kind: "channel", Platforms: "bilibili", Status: "active"}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	seed := "video:rmer"
	work := model.OperationsProgressItem{
		Title: "RMer 人物采访", Kind: "video", Platforms: "bilibili", SeedKey: &seed,
		Status: "active", PublicationURL: "https://www.bilibili.com/video/BV1example12",
	}
	if err := db.Create(&work).Error; err != nil {
		t.Fatal(err)
	}
	completed := time.Now().UTC()
	step := model.OperationsProgressStep{ItemID: work.ID, Key: "published", Title: "发布", Status: "done", CompletedAt: &completed}
	if err := db.Create(&step).Error; err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := migrateOperationsContentV80(db); err != nil {
			t.Fatal(err)
		}
	}
	var refreshed model.OperationsProgressItem
	if err := db.First(&refreshed, work.ID).Error; err != nil {
		t.Fatal(err)
	}
	if refreshed.SeriesName != "RMer" || refreshed.PublicationURL != work.PublicationURL {
		t.Fatalf("work history changed: %+v", refreshed)
	}
	var targets []model.OperationsPublication
	if err := db.Where("item_id = ?", work.ID).Find(&targets).Error; err != nil {
		t.Fatal(err)
	}
	if len(targets) != 1 || targets[0].Platform != "bilibili" || targets[0].Status != "done" || targets[0].URL != work.PublicationURL {
		t.Fatalf("backfill does not preserve published target: %+v", targets)
	}
	var videoChannels int64
	if err := db.Model(&model.OperationsProgressItem{}).Where("seed_key = ?", "channel:wechat_video").
		Count(&videoChannels).Error; err != nil {
		t.Fatal(err)
	}
	if videoChannels != 1 {
		t.Fatalf("video channel must be created once, got %d", videoChannels)
	}
}
