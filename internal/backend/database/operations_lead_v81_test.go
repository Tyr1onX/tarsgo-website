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

func TestMariaDBOperationsLeadV81PreservesLegacyAssignments(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated acceptance database required")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{NamingStrategy: schema.NamingStrategy{
		TablePrefix: fmt.Sprintf("lead%d_", time.Now().UnixNano()),
	}})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	defer db.Migrator().DropTable(&model.OperationsProgressItem{})
	if err := db.AutoMigrate(&model.OperationsProgressItem{}); err != nil {
		t.Fatal(err)
	}
	old := model.OperationsProgressItem{Title: "既有作品", Owner: "原显示名称", Kind: "video", Status: "active"}
	if err := db.Create(&old).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Migrator().DropColumn(&model.OperationsProgressItem{}, "LeadID"); err != nil {
		t.Fatal(err)
	}
	registry := migrationRegistry("test")
	if len(registry) < 81 || registry[80].version != 81 {
		t.Fatal("expected lead migration v81 to be registered")
	}
	if err := registry[80].apply(db); err != nil {
		t.Fatal(err)
	}
	var existing model.OperationsProgressItem
	if err := db.First(&existing, old.ID).Error; err != nil {
		t.Fatal(err)
	}
	if existing.Owner != "原显示名称" || existing.LeadID != nil {
		t.Fatalf("migration must not infer member identity from legacy text: %+v", existing)
	}
	leadID := uint64(17)
	if err := db.Model(&existing).Update("lead_id", leadID).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.First(&existing, old.ID).Error; err != nil {
		t.Fatal(err)
	}
	if existing.LeadID == nil || *existing.LeadID != leadID {
		t.Fatalf("lead ID was not persisted: %+v", existing)
	}
	if err := registry[80].apply(db); err != nil {
		t.Fatal("lead migration must be idempotent: ", err)
	}
}
