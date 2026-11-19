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

func TestMariaDBOperationsContentBacklogV83IdempotentAndMultiPlatform(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated acceptance database required")
	}
	prefix := fmt.Sprintf("content83_%d_", time.Now().UnixNano())
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
	defer db.Migrator().DropTable(
		&model.OperationsPublication{}, &model.OperationsProgressStep{}, &model.OperationsProgressItem{},
		&model.UserGroupMember{}, &model.UserGroup{}, &model.User{}, &model.Role{},
	)
	if err := db.AutoMigrate(
		&model.Role{}, &model.User{}, &model.UserGroup{}, &model.UserGroupMember{},
		&model.OperationsProgressItem{}, &model.OperationsProgressStep{}, &model.OperationsPublication{},
	); err != nil {
		t.Fatal(err)
	}
	group := model.UserGroup{Name: "运营组", Status: model.UserGroupStatusActive}
	if err := db.Create(&group).Error; err != nil {
		t.Fatal(err)
	}
	ma, an, wang := "马鹤铭", "安博", "王钰涵"
	users := []model.User{
		{Email: "planning@test.invalid", RoleID: 1, RealName: &ma, Status: model.UserStatusEnabled},
		{Email: "camera1@test.invalid", RoleID: 1, RealName: &an, Status: model.UserStatusEnabled},
		{Email: "camera2@test.invalid", RoleID: 1, RealName: &an, Status: model.UserStatusEnabled},
		{Email: "editing@test.invalid", RoleID: 1, RealName: &wang, Status: model.UserStatusEnabled},
	}
	if err := db.Create(&users).Error; err != nil {
		t.Fatal(err)
	}
	for _, user := range users {
		if err := db.Create(&model.UserGroupMember{GroupID: group.ID, UserID: user.ID}).Error; err != nil {
			t.Fatal(err)
		}
	}
	for iteration := 0; iteration < 2; iteration++ {
		if err := migrateOperationsContentBacklogV83(db); err != nil {
			t.Fatal(err)
		}
	}
	var works []model.OperationsProgressItem
	if err := db.Order("id").Find(&works).Error; err != nil {
		t.Fatal(err)
	}
	if len(works) != 14 {
		t.Fatalf("expected 4 video + 10 article works, got %d", len(works))
	}
	var videos, articles int
	for _, work := range works {
		switch work.Kind {
		case "video":
			videos++
		case "article":
			articles++
		default:
			t.Fatalf("unexpected work type: %s", work.Kind)
		}
		if work.SeedKey != nil || work.NextCheckAt != nil || work.IntervalDays != 0 {
			t.Fatalf("work must stay editable without invented deadlines: %+v", work)
		}
		var steps []model.OperationsProgressStep
		if err := db.Where("item_id = ?", work.ID).Order("position").Find(&steps).Error; err != nil {
			t.Fatal(err)
		}
		if len(steps) != 5 {
			t.Fatalf("%s: expected 5 steps, got %d", work.Title, len(steps))
		}
		for _, step := range steps {
			if step.Status != "pending" || step.CompletedAt != nil {
				t.Fatalf("migration must not start or complete work: %+v", step)
			}
			switch step.Key {
			case "planning":
				if step.AssigneeID == nil || *step.AssigneeID != users[0].ID {
					t.Fatalf("planner reference not resolved for %s: %+v", work.Title, step)
				}
			case "editing":
				if work.Kind == "video" && (step.AssigneeID == nil || *step.AssigneeID != users[3].ID) {
					t.Fatalf("editing reference not resolved for %s: %+v", work.Title, step)
				}
			case "materials":
				if step.AssigneeID != nil {
					t.Fatalf("ambiguous filming owner must remain unassigned: %+v", step)
				}
			default:
				if step.AssigneeID != nil {
					t.Fatalf("unconfirmed role must remain unassigned: %+v", step)
				}
			}
		}
		var publications []model.OperationsPublication
		if err := db.Where("item_id = ?", work.ID).Find(&publications).Error; err != nil {
			t.Fatal(err)
		}
		if work.Kind == "video" {
			if len(publications) != 3 {
				t.Fatalf("%s should be one workflow with 3 targets, got %d", work.Title, len(publications))
			}
			seen := map[string]bool{}
			for _, publication := range publications {
				seen[publication.Platform] = true
				if publication.Status != "pending" || publication.VersionNote == "" {
					t.Fatalf("platform note/status missing: %+v", publication)
				}
			}
			for _, platform := range []string{"bilibili", "douyin", "wechat_video"} {
				if !seen[platform] {
					t.Fatalf("%s missing %s publication", work.Title, platform)
				}
			}
		} else if len(publications) != 1 || publications[0].Platform != "wechat" {
			t.Fatalf("article must target only WeChat: %+v", publications)
		}
	}
	if videos != 4 || articles != 10 {
		t.Fatalf("wrong work types: %d video, %d article", videos, articles)
	}

	// Repeat execution should preserve work that an operator has subsequently updated.
	if err := db.Model(&model.OperationsProgressStep{}).
		Where("item_id = ? AND `key` = ?", works[0].ID, "planning").
		Update("status", "active").Error; err != nil {
		t.Fatal(err)
	}
	if err := migrateOperationsContentBacklogV83(db); err != nil {
		t.Fatal(err)
	}
	var count int64
	if err := db.Model(&model.OperationsProgressItem{}).Count(&count).Error; err != nil || count != 14 {
		t.Fatalf("rerun must be idempotent: count=%d err=%v", count, err)
	}
	var first model.OperationsProgressStep
	if err := db.Where("item_id = ? AND `key` = ?", works[0].ID, "planning").Take(&first).Error; err != nil {
		t.Fatal(err)
	}
	if first.Status != "active" {
		t.Fatalf("rerun overwrote operator progress: %+v", first)
	}
}
