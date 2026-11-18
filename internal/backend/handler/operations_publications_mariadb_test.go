package handler

import (
	"bytes"
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
	"tarsgo-backend/service/auth"
	"tarsgo-backend/service/operationsworkflow"
)

func TestMariaDBOperationsMultiPlatformPublicationAndSingleContinuation(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated acceptance database required")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{NamingStrategy: schema.NamingStrategy{
		TablePrefix: fmt.Sprintf("multiwork%d_", time.Now().UnixNano()),
	}})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	defer db.Migrator().DropTable(&model.OperationsPublication{}, &model.OperationsProgressUpdate{},
		&model.OperationsProgressStep{}, &model.OperationsProgressItem{})
	if err := db.AutoMigrate(&model.OperationsProgressItem{}, &model.OperationsProgressStep{},
		&model.OperationsProgressUpdate{}, &model.OperationsPublication{}); err != nil {
		t.Fatal(err)
	}
	channel := model.OperationsProgressItem{Title: "B站运营", Kind: "channel", Platforms: "bilibili", Status: "active"}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	var item *model.OperationsProgressItem
	if err := db.Transaction(func(tx *gorm.DB) error {
		var err error
		item, err = operationsworkflow.CreateEpisode(tx, channel.ID, "RMer 第一期", "RMer")
		if err != nil {
			return err
		}
		return ensureEpisodeTargets(tx, item)
	}); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.OperationsPublication{ItemID: item.ID, Platform: "douyin", Status: "pending"}).Error; err != nil {
		t.Fatal(err)
	}
	var published model.OperationsProgressStep
	if err := db.Where("item_id = ? AND key = ?", item.ID, "published").First(&published).Error; err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	h := NewOperationsProgressHandler(db)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("sessionUser", &auth.SessionUser{ID: 42, Role: auth.SessionRole{Name: "super_admin"}})
		c.Next()
	})
	router.PATCH("/api/operations/progress/:id/publications/:platform", h.UpdatePublication)
	submit := func(platform, status string) *httptest.ResponseRecorder {
		t.Helper()
		data, _ := json.Marshal(map[string]any{"status": status, "url": "https://example.com/" + platform, "versionNote": "不同平台剪辑版本"})
		path := fmt.Sprintf("/api/operations/progress/%d/publications/%s", item.ID, platform)
		request := httptest.NewRequest(http.MethodPatch, path, bytes.NewReader(data))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		return response
	}
	if got := submit("bilibili", "done"); got.Code != http.StatusConflict {
		t.Fatalf("publishing before production completion must fail: %d %s", got.Code, got.Body.String())
	}
	if err := db.Model(&model.OperationsProgressStep{}).
		Where("item_id = ? AND key <> ?", item.ID, "published").
		Update("status", "done").Error; err != nil {
		t.Fatal(err)
	}
	if got := submit("bilibili", "done"); got.Code != http.StatusOK {
		t.Fatalf("first platform failed: %d %s", got.Code, got.Body.String())
	}
	var progress model.OperationsProgressStep
	if err := db.First(&progress, published.ID).Error; err != nil {
		t.Fatal(err)
	}
	if progress.Status != "active" {
		t.Fatalf("one platform must not complete work: %s", progress.Status)
	}
	if got := submit("bilibili", "done"); got.Code != http.StatusOK {
		t.Fatalf("repeat failed: %d %s", got.Code, got.Body.String())
	}
	if got := submit("douyin", "done"); got.Code != http.StatusOK {
		t.Fatalf("final platform failed: %d %s", got.Code, got.Body.String())
	}
	if err := db.First(&progress, published.ID).Error; err != nil {
		t.Fatal(err)
	}
	if progress.Status != "done" {
		t.Fatalf("final platform should complete work: %s", progress.Status)
	}
	var items []model.OperationsProgressItem
	if err := db.Where("channel_id = ?", channel.ID).Order("episode_no").Find(&items).Error; err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 || items[1].SeriesName != "RMer" {
		t.Fatalf("one sequel in correct series, got %+v", items)
	}
	var upcoming []model.OperationsPublication
	if err := db.Where("item_id = ?", items[1].ID).Find(&upcoming).Error; err != nil {
		t.Fatal(err)
	}
	if len(upcoming) != 2 {
		t.Fatalf("must retain both publishing targets: %+v", upcoming)
	}
	for _, target := range upcoming {
		if target.Status != "pending" {
			t.Fatalf("sequel must start uncompleted: %+v", target)
		}
	}
	if got := submit("douyin", "done"); got.Code != http.StatusOK {
		t.Fatalf("final retry failed: %d %s", got.Code, got.Body.String())
	}
	var count int64
	if err := db.Model(&model.OperationsProgressItem{}).Where("channel_id = ?", channel.ID).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("duplicate sequel created: %d", count)
	}
	var updates []model.OperationsProgressUpdate
	if err := db.Where("item_id = ? AND step_id = ?", item.ID, published.ID).Find(&updates).Error; err != nil {
		t.Fatal(err)
	}
	if len(updates) != 2 || updates[0].AuthorID != 42 || updates[1].AuthorID != 42 {
		t.Fatalf("one audit record per actual platform transition: %+v", updates)
	}
}