package operationssync

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"

	"tarsgo-backend/model"
)

func TestMariaDBOperationsPublicSyncKeepsOneSamplePerDayAndUpsertsPosts(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated acceptance MariaDB required")
	}
	prefix := fmt.Sprintf("ops_collector_probe_%d_", time.Now().UnixNano())
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: prefix}})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	defer db.Migrator().DropTable(&model.OperationsPlatformPost{}, &model.OperationsAccountSnapshot{})
	if err := db.AutoMigrate(&model.OperationsAccountSnapshot{}, &model.OperationsPlatformPost{}); err != nil {
		t.Fatal(err)
	}
	views, followerCalls := int64(100), 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/x/relation/stat":
			followerCalls++
			fmt.Fprintf(w, `{"code":0,"data":{"mid":488284486,"follower":2805}}`)
		case "/x/series/recArchivesByKeywords":
			fmt.Fprintf(w, `{"code":0,"data":{"page":{"total":1},"archives":[{"bvid":"BV1Cz4h6cEDe","title":"培训会议","upMid":488284486,"pubdate":1793891736,"stat":{"view":%d}}]}}`, views)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	now := time.Date(2026, 11, 14, 9, 0, 0, 0, beijing)
	collector := &Collector{db: db, client: server.Client(), apiURL: server.URL, now: func() time.Time { return now }}
	for _, viewCount := range []int64{100, 125} {
		views = viewCount
		if err := collector.Sync(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	var snapshots []model.OperationsAccountSnapshot
	if err := db.Find(&snapshots).Error; err != nil {
		t.Fatal(err)
	}
	if len(snapshots) != 1 || followerCalls != 1 || snapshots[0].ObservedOn != "2026-11-14" {
		t.Fatalf("wrong daily snapshot count=%d calls=%d data=%+v", len(snapshots), followerCalls, snapshots)
	}
	var posts []model.OperationsPlatformPost
	if err := db.Find(&posts).Error; err != nil {
		t.Fatal(err)
	}
	if len(posts) != 1 || posts[0].ViewCount != 125 || posts[0].ExternalID != "BV1Cz4h6cEDe" {
		t.Fatalf("duplicate or stale posts: %+v", posts)
	}
	now = now.Add(24 * time.Hour)
	if err := collector.Sync(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := db.Find(&snapshots).Error; err != nil {
		t.Fatal(err)
	}
	if len(snapshots) != 2 || followerCalls != 2 {
		t.Fatal("next calendar day did not create one fresh sample")
	}
}
