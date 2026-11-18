package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"

	"tarsgo-backend/model"
)

func TestMariaDBWorkbenchOperationsStatusIncludesInternalUpdates(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated acceptance database required")
	}
	prefix := fmt.Sprintf("op%d_", time.Now().UnixNano())
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: prefix}})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	defer db.Migrator().DropTable(&model.OperationsPublication{}, &model.OperationsPlatformPost{}, &model.OperationsAccountSnapshot{}, &model.OperationsProgressStep{}, &model.OperationsProgressUpdate{}, &model.OperationsProgressItem{})
	if err := db.AutoMigrate(&model.OperationsProgressItem{}, &model.OperationsProgressStep{}, &model.OperationsProgressUpdate{}, &model.OperationsAccountSnapshot{}, &model.OperationsPlatformPost{}, &model.OperationsPublication{}); err != nil {
		t.Fatal(err)
	}
	item := model.OperationsProgressItem{Title: "B站运营", Kind: "channel", Owner: "内部负责人", NextAction: "内部沟通计划", Status: "active"}
	private := model.OperationsProgressItem{Title: "内部合作事项", Kind: "workstream", Owner: "内部人员", NextAction: "不可公开", Status: "active"}
	if err := db.Create(&item).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&private).Error; err != nil {
		t.Fatal(err)
	}
	entry := model.OperationsProgressUpdate{ItemID: item.ID, AuthorID: 123, Content: "内部备注不得公开", Kind: "progress"}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatal(err)
	}
	day := "2026-11-05"
	release := model.OperationsProgressUpdate{ItemID: item.ID, AuthorID: 0, Content: "公开培训视频", Kind: "completed", PublishedOn: &day}
	if err := db.Create(&release).Error; err != nil {
		t.Fatal(err)
	}
	post := model.OperationsPlatformPost{Platform: "bilibili", ExternalID: "BV1Cz4h6cEDe", Title: "机器人电源系统培训会议", URL: "https://www.bilibili.com/video/BV1Cz4h6cEDe", PublishedAt: time.Date(2026, 11, 5, 11, 0, 0, 0, time.UTC), SyncedAt: time.Now()}
	if err := db.Create(&post).Error; err != nil {
		t.Fatal(err)
	}
	// Import order is not necessarily publication order. The overview must
	// pick the most recently published work per platform, not the highest ID.
	latestBili := model.OperationsPlatformPost{
		Platform: "bilibili", ExternalID: "BV2LATEST", Title: "最近的B站作品",
		PublishedAt: time.Date(2026, 11, 16, 8, 0, 0, 0, time.UTC),
		ViewCount:   520, SyncedAt: time.Now(),
	}
	olderBili := model.OperationsPlatformPost{
		Platform: "bilibili", ExternalID: "BV3OLDER", Title: "较早的B站作品",
		PublishedAt: time.Date(2026, 10, 1, 8, 0, 0, 0, time.UTC),
		SyncedAt:    time.Now(),
	}
	latestWeChat := model.OperationsPlatformPost{
		Platform: "wechat", ExternalID: "WECHAT-LATEST", Title: "最近的公众号作品",
		PublishedAt: time.Date(2026, 11, 17, 8, 0, 0, 0, time.UTC),
		ViewCount:   293, SyncedAt: time.Now(),
	}
	if err := db.Create(&[]model.OperationsPlatformPost{latestBili, olderBili, latestWeChat}).Error; err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler := NewOperationsProgressHandler(db)
	router.GET("/api/operations/progress", handler.List)
	router.GET("/api/operations/progress/:id/updates", handler.History)
	router.GET("/api/operations/works", handler.Works)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/operations/progress", nil))
	if response.Code != 200 {
		t.Fatalf("unexpected HTTP %d: %s", response.Code, response.Body.String())
	}
	body := response.Body.String()
	for _, content := range []string{"公开培训视频", "内部合作事项", "内部负责人", "内部沟通计划", "不可公开"} {
		if !strings.Contains(body, content) {
			t.Errorf("workbench missing internal field %s", content)
		}
	}
	// The overview only needs the latest progress. Older internal notes are
	// retained in item history, not repeated in every overview payload.
	if strings.Contains(body, "内部备注不得公开") {
		t.Fatal("older internal note must not be expanded in the overview")
	}
	history := httptest.NewRecorder()
	router.ServeHTTP(history, httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/api/operations/progress/%d/updates", item.ID), nil))
	if history.Code != http.StatusOK || !strings.Contains(history.Body.String(), "内部备注不得公开") {
		t.Fatalf("historical internal note must remain retrievable: %d %s", history.Code, history.Body.String())
	}
	var wrapper struct {
		Data struct {
			Items       []operationsProgressView       `json:"items"`
			LatestPosts []model.OperationsPlatformPost `json:"latestPosts"`
		} `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &wrapper); err != nil {
		t.Fatal(err)
	}
	if len(wrapper.Data.Items) != 2 {
		t.Fatalf("workbench overview incorrect items=%d", len(wrapper.Data.Items))
	}
	if len(wrapper.Data.LatestPosts) != 2 {
		t.Fatalf("expected latest post for each platform, got %+v", wrapper.Data.LatestPosts)
	}
	latestByPlatform := make(map[string]model.OperationsPlatformPost)
	for _, entry := range wrapper.Data.LatestPosts {
		latestByPlatform[entry.Platform] = entry
	}
	if latestByPlatform["bilibili"].Title != latestBili.Title ||
		latestByPlatform["bilibili"].ViewCount != 520 ||
		latestByPlatform["wechat"].Title != latestWeChat.Title {
		t.Fatalf("incorrect latest posts: %+v", latestByPlatform)
	}
	works := httptest.NewRecorder()
	router.ServeHTTP(works, httptest.NewRequest(http.MethodGet, "/api/operations/works?platform=bilibili", nil))
	if works.Code != http.StatusOK {
		t.Fatalf("works API failed: %d %s", works.Code, works.Body.String())
	}
	var published struct {
		Data struct {
			Posts []model.OperationsPlatformPost `json:"posts"`
		} `json:"data"`
	}
	if err := json.Unmarshal(works.Body.Bytes(), &published); err != nil {
		t.Fatal(err)
	}
	if len(published.Data.Posts) != 3 {
		t.Fatalf("works API missing historical posts: %+v", published.Data.Posts)
	}
}
