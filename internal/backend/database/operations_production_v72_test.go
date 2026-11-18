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
	"tarsgo-backend/service/operationsworkflow"
)

func TestMariaDBOperationsProductionV72IdempotentBootstrapAndRenewal(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated acceptance database required")
	}
	prefix := fmt.Sprintf("production%d_", time.Now().UnixNano())
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: prefix}})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	defer db.Migrator().DropTable(&model.OperationsStepAttachment{}, &model.OperationsProgressStep{},
		&model.OperationsProgressUpdate{}, &model.OperationsProgressItem{})
	if err := db.AutoMigrate(&model.OperationsProgressItem{}, &model.OperationsProgressStep{}, &model.OperationsProgressUpdate{}); err != nil {
		t.Fatal(err)
	}
	channels := []model.OperationsProgressItem{
		{Title: "抖音运营", Kind: "channel", Platforms: "douyin", Status: "active"},
		{Title: "公众号运营", Kind: "channel", Platforms: "wechat", Status: "active"},
		{Title: "旧视频", Kind: "video", Platforms: "bilibili", Status: "active"},
	}
	if err := db.Create(&channels).Error; err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := migrateOperationsProductionV72(db); err != nil {
			t.Fatal(err)
		}
	}
	var episodes []model.OperationsProgressItem
	if err := db.Where("channel_id IS NOT NULL").Order("id").Find(&episodes).Error; err != nil {
		t.Fatal(err)
	}
	if len(episodes) != 2 {
		t.Fatalf("bootstrap must create one draft per channel and leave legacy videos alone; got %d", len(episodes))
	}
	if episodes[0].ChannelID == nil || *episodes[0].ChannelID != channels[0].ID || episodes[0].Kind != "video" || episodes[0].EpisodeNo != 1 {
		t.Fatalf("Douyin bootstrap incorrect: %+v", episodes[0])
	}
	if episodes[1].ChannelID == nil || *episodes[1].ChannelID != channels[1].ID || episodes[1].Kind != "article" || episodes[1].EpisodeNo != 1 {
		t.Fatalf("WeChat bootstrap incorrect: %+v", episodes[1])
	}
	for _, episode := range episodes {
		var steps []model.OperationsProgressStep
		if err := db.Where("item_id = ?", episode.ID).Order("position").Find(&steps).Error; err != nil {
			t.Fatal(err)
		}
		if len(steps) != 5 {
			t.Fatalf("expected five steps, got %d for item %d", len(steps), episode.ID)
		}
		for _, step := range steps {
			if step.AssigneeID != nil || step.CompletedAt != nil || step.Status != "pending" {
				t.Fatalf("migration invented a completion or assignee: %+v", step)
			}
		}
	}
	// A started episode requires an upcoming draft once it is published.
	if err := db.Model(&model.OperationsProgressStep{}).Where("item_id = ?", episodes[0].ID).
		Update("status", "done").Error; err != nil {
		t.Fatal(err)
	}
	var nextID uint64
	for i := 0; i < 2; i++ {
		if err := db.Transaction(func(tx *gorm.DB) error {
			next, err := operationsworkflow.EnsureUpcoming(tx, channels[0].ID)
			if err != nil {
				return err
			}
			if i == 0 {
				nextID = next.ID
			} else if next.ID != nextID {
				t.Fatal("duplicate renewal created")
			}
			return nil
		}); err != nil {
			t.Fatal(err)
		}
	}
	var douyinCount int64
	if err := db.Model(&model.OperationsProgressItem{}).Where("channel_id = ?", channels[0].ID).Count(&douyinCount).Error; err != nil {
		t.Fatal(err)
	}
	if douyinCount != 2 {
		t.Fatalf("expected exactly one upcoming draft, got %d episodes", douyinCount)
	}
	if err := db.Transaction(func(tx *gorm.DB) error {
		_, err := operationsworkflow.CreateEpisode(tx, channels[0].ID, "并行人物采访")
		return err
	}); err != nil {
		t.Fatal(err)
	}
	if err := db.Transaction(func(tx *gorm.DB) error {
		_, err := operationsworkflow.EnsureUpcoming(tx, channels[0].ID)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.OperationsProgressItem{}).Where("channel_id = ?", channels[0].ID).Count(&douyinCount).Error; err != nil {
		t.Fatal(err)
	}
	if douyinCount != 3 {
		t.Fatalf("parallel draft should prevent automatic duplicates; got %d", douyinCount)
	}
}