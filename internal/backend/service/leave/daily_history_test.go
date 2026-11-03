package leave

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"tarsgo-backend/model"
)

func TestDailyHistoryCursorPreservesWallTime(t *testing.T) {
	at := time.Date(2026, 11, 3, 9, 30, 0, 0, time.FixedZone("Shanghai", 8*3600))
	raw := dailyHistoryCursor(model.DailyLeaveEntry{ID: 42, SubmittedAt: at})
	wall, id, err := parseDailyHistoryCursor(raw)
	if err != nil || wall != "2026-11-03 09:30:00" || id != 42 {
		t.Fatalf("%s %d %v", wall, id, err)
	}
	for _, raw := range []string{"bad", "", "Zm9vLzE"} {
		if _, _, err := parseDailyHistoryCursor(raw); err == nil {
			t.Fatal("invalid cursor accepted")
		}
	}
}

func TestMariaDBDailyHistoryPageBoundariesAndScope(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated database")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated database required")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	tx := db.Begin()
	if tx.Error != nil {
		t.Fatal(tx.Error)
	}
	defer tx.Rollback()
	var user model.User
	if err := tx.Where("email=?", "test-super-admin@tarsgo.test").First(&user).Error; err != nil {
		t.Fatal(err)
	}
	if err := tx.Where("user_id=?", user.ID).Delete(&model.DailyLeaveEntry{}).Error; err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 11, 3, 8, 0, 0, 0, time.UTC)
	for i := 0; i < 65; i++ {
		row := model.DailyLeaveEntry{UserID: &user.ID, StartAt: &at, EndAt: &at, SubmittedAt: at, NameSnapshot: "synthetic", StudentIDSnapshot: fmt.Sprintf("%08d", i), CollegeSnapshot: "test"}
		if i == 64 {
			row.StartAt = nil
			row.EndAt = nil
		}
		if err := tx.Create(&row).Error; err != nil {
			t.Fatal(err)
		}
	}
	svc := NewService(tx)
	cursor := ""
	seen := map[uint64]bool{}
	for pageNumber := 0; pageNumber < 4; pageNumber++ {
		page, err := svc.ListDailyRecordsPage(context.Background(), &user.ID, nil, cursor, true)
		if err != nil {
			t.Fatal(err)
		}
		if len(page.Items) > 30 {
			t.Fatal("page unbounded")
		}
		for _, row := range page.Items {
			if seen[row.ID] {
				t.Fatal("duplicate across equal-timestamp boundary")
			}
			seen[row.ID] = true
		}
		cursor = page.NextCursor
		if cursor == "" {
			break
		}
	}
	if len(seen) != 64 || cursor != "" {
		t.Fatalf("rows=%d cursor=%s", len(seen), cursor)
	}
	otherID := uint64(98765002)
	other, err := svc.ListDailyRecordsPage(context.Background(), &otherID, nil, "", true)
	if err != nil || len(other.Items) != 0 {
		t.Fatal("cross-account history leak")
	}
	admin, err := svc.ListDailyRecordsPage(context.Background(), nil, &user.ID, "", false)
	if err != nil || len(admin.Items) != 30 || admin.NextCursor == "" {
		t.Fatal("admin page failed")
	}
}
