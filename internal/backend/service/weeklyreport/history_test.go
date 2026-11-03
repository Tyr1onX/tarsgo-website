package weeklyreport

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

func TestHistoryCursorRejectsMalformedInput(t *testing.T) {
	for _, input := range []string{"bad", "2026-02-30/1", "2026-11-02/0", "2026-11-02/-1", "2026-11-02/1/2"} {
		if _, _, err := parseHistoryCursor(input); err == nil {
			t.Fatalf("accepted %q", input)
		}
	}
}

func TestMariaDBWeeklyHistoryPagesAndDeepLinks(t *testing.T) {
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
	if err := tx.Where("email = ?", "test-super-admin@tarsgo.test").First(&user).Error; err != nil {
		t.Fatal(err)
	}
	if err := tx.Where("user_id = ?", user.ID).Delete(&model.WeeklyReport{}).Error; err != nil {
		t.Fatal(err)
	}
	err = func(conn *gorm.DB) error {
		base := time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC)
		for i := 0; i < 45; i++ {
			row := model.WeeklyReport{ID: uint64(9000000 + i), UserID: user.ID, WeekStart: model.WeeklyReportWeekStart(base.AddDate(0, 0, -7*i).Format(time.DateOnly)), Completed: fmt.Sprint(i), Gains: "g", Blockers: "b", NextPlan: "n"}
			if err := conn.Create(&row).Error; err != nil {
				return err
			}
		}
		svc := NewService(NewGormRepository(conn))
		first, err := svc.GetDashboardPage(context.Background(), user.ID, model.RoleNameUser, HistoryQuery{WeekStart: base.AddDate(0, 0, -7*44).Format(time.DateOnly)})
		if err != nil {
			return err
		}
		if len(first.Reports) != 21 || first.NextCursor == "" || first.Reports[20].Completed != "44" {
			t.Fatalf("first/deep link=%#v", first)
		}
		seen := map[uint64]bool{}
		// Deep-link record is deliberately outside the page window; deduplicate.
		for _, row := range first.Reports {
			seen[row.ID] = true
		}
		cursor := first.NextCursor
		for cursor != "" {
			page, err := svc.GetDashboardPage(context.Background(), user.ID, model.RoleNameUser, HistoryQuery{Cursor: cursor})
			if err != nil {
				return err
			}
			if len(page.Reports) > 20 {
				t.Fatal("unbounded history")
			}
			for _, row := range page.Reports {
				seen[row.ID] = true
			}
			cursor = page.NextCursor
		}
		if len(seen) != 45 {
			t.Fatalf("missing history: %d", len(seen))
		}
		other, err := svc.GetDashboardPage(context.Background(), 98765002, model.RoleNameUser, HistoryQuery{WeekStart: string(first.Reports[0].WeekStart)})
		if err != nil {
			return err
		}
		if len(other.Reports) != 0 {
			t.Fatal("cross-account history leak")
		}
		return nil
	}(tx)
	if err != nil {
		t.Fatal(err)
	}
}
