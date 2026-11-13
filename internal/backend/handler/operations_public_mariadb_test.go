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

func TestMariaDBPublicOperationsStatusRedactsInternalUpdates(t *testing.T) {
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
	defer db.Migrator().DropTable(&model.OperationsPlatformPost{}, &model.OperationsAccountSnapshot{}, &model.OperationsProgressUpdate{}, &model.OperationsProgressItem{})
	if err := db.AutoMigrate(&model.OperationsProgressItem{}, &model.OperationsProgressUpdate{}, &model.OperationsAccountSnapshot{}, &model.OperationsPlatformPost{}); err != nil {
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
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/api/operations/public", NewOperationsProgressHandler(db).Public)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/operations/public", nil))
	if response.Code != 200 {
		t.Fatalf("unexpected HTTP %d: %s", response.Code, response.Body.String())
	}
	body := response.Body.String()
	for _, secret := range []string{"内部备注不得公开", "内部合作事项", "内部负责人", "内部沟通计划", "不可公开"} {
		if strings.Contains(body, secret) {
			t.Errorf("public API leaked %s", secret)
		}
	}
	var wrapper struct {
		Data struct {
			Items []operationsProgressView       `json:"items"`
			Posts []model.OperationsPlatformPost `json:"posts"`
		} `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &wrapper); err != nil {
		t.Fatal(err)
	}
	if len(wrapper.Data.Items) != 1 || len(wrapper.Data.Posts) != 1 || wrapper.Data.Items[0].LastUpdate != nil {
		t.Fatalf("public overview incorrect items=%d posts=%d lastNote=%v", len(wrapper.Data.Items), len(wrapper.Data.Posts), wrapper.Data.Items[0].LastUpdate)
	}
}
