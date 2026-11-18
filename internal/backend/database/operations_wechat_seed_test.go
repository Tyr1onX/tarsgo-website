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

func TestMariaDBWeChatOperationsSeedPreservesExistingData(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated acceptance MariaDB required")
	}
	prefix := fmt.Sprintf("wechat_ops_%d_", time.Now().UnixNano())
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: prefix}})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	defer db.Migrator().DropTable(&model.OperationsPlatformPost{}, &model.OperationsAccountSnapshot{}, &model.OperationsProgressItem{})
	if err := db.AutoMigrate(&model.OperationsAccountSnapshot{}, &model.OperationsPlatformPost{}, &model.OperationsProgressItem{}); err != nil {
		t.Fatal(err)
	}

	previous := model.OperationsAccountSnapshot{Platform: "wechat", ObservedOn: "2026-11-18", Followers: 999, Source: "manual"}
	if err := db.Create(&previous).Error; err != nil {
		t.Fatal(err)
	}
	manual := model.OperationsPlatformPost{
		Platform: "wechat", ExternalID: "jamVxvx2V6RLw72oHCUmBQ", Title: "保留已编辑标题",
		URL:         "https://mp.weixin.qq.com/s/jamVxvx2V6RLw72oHCUmBQ",
		PublishedAt: time.Date(2026, 11, 17, 4, 16, 0, 0, time.UTC),
		ViewCount:   999, SyncedAt: time.Now(),
	}
	if err := db.Create(&manual).Error; err != nil {
		t.Fatal(err)
	}
	key := "channel:wechat"
	channel := model.OperationsProgressItem{SeedKey: &key, Title: "公众号运营", Kind: "channel", Status: "active"}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	other := model.OperationsProgressItem{Title: "跨平台任务", Kind: "channel", Platforms: "bilibili", Status: "active"}
	if err := db.Create(&other).Error; err != nil {
		t.Fatal(err)
	}

	for i := 0; i < 2; i++ {
		if err := migrateWeChatOperationsV68(db); err != nil {
			t.Fatal(err)
		}
	}
	var saved model.OperationsAccountSnapshot
	if err := db.Where("platform = ? AND observed_on = ?", "wechat", "2026-11-18").Take(&saved).Error; err != nil {
		t.Fatal(err)
	}
	if saved.Followers != 999 || saved.Source != "manual" {
		t.Fatalf("manual snapshot was overwritten: %+v", saved)
	}
	var posts []model.OperationsPlatformPost
	if err := db.Where("platform = ?", "wechat").Find(&posts).Error; err != nil {
		t.Fatal(err)
	}
	if len(posts) != 10 {
		t.Fatalf("expected 10 unique WeChat posts, got %d", len(posts))
	}
	if err := db.Where("platform = ? AND external_id = ?", "wechat", manual.ExternalID).Take(&manual).Error; err != nil {
		t.Fatal(err)
	}
	if manual.ViewCount != 999 || manual.Title != "保留已编辑标题" {
		t.Fatalf("manual post was overwritten: %+v", manual)
	}
	if err := db.First(&channel, channel.ID).Error; err != nil {
		t.Fatal(err)
	}
	if channel.Platforms != "wechat" {
		t.Fatalf("expected seeded channel platform to be filled: %+v", channel)
	}
	if err := db.First(&other, other.ID).Error; err != nil {
		t.Fatal(err)
	}
	if other.Platforms != "bilibili" {
		t.Fatalf("manual platform selection was overwritten: %+v", other)
	}

	for i := 0; i < 2; i++ {
		if err := migrateWeChatHistoryV71(db); err != nil {
			t.Fatal(err)
		}
	}
	var postCount, snapshotCount int64
	if err := db.Model(&model.OperationsPlatformPost{}).Where("platform = ?", "wechat").Count(&postCount).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.OperationsAccountSnapshot{}).Where("platform = ?", "wechat").Count(&snapshotCount).Error; err != nil {
		t.Fatal(err)
	}
	if postCount != 383 || snapshotCount != 92 {
		t.Fatalf("unexpected expanded history: %d articles and %d snapshots", postCount, snapshotCount)
	}
	if err := db.Where("platform = ? AND external_id = ?", "wechat", manual.ExternalID).Take(&manual).Error; err != nil {
		t.Fatal(err)
	}
	if manual.ViewCount != 999 || manual.Title != "保留已编辑标题" {
		t.Fatalf("updated manual article was overwritten: %+v", manual)
	}
	var imported model.OperationsPlatformPost
	if err := db.Where("platform = ? AND external_id = ?", "wechat", "ehEbaB-8GAx_CAcZUrQTfQ").Take(&imported).Error; err != nil {
		t.Fatal(err)
	}
	if imported.ViewCount != 854 || imported.LikeCount != 26 {
		t.Fatalf("unchanged v68 article metrics were not refreshed: %+v", imported)
	}
	var follower model.OperationsAccountSnapshot
	if err := db.Where("platform = ? AND observed_on = ?", "wechat", "2026-11-17").Take(&follower).Error; err != nil {
		t.Fatal(err)
	}
	if follower.Followers != 3425 || follower.NewFollowers == nil || *follower.NewFollowers != 1 ||
		follower.Unfollows == nil || *follower.Unfollows != 5 {
		t.Fatalf("daily follower data was not imported: %+v", follower)
	}
}
