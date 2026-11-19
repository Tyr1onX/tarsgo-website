package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
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
	"tarsgo-backend/service/privatefile"
)

func TestMariaDBOperationsPublicationRenewalAuditAndFiles(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated acceptance database required")
	}
	prefix := fmt.Sprintf("publication%d_", time.Now().UnixNano())
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: prefix}})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	defer db.Migrator().DropTable(&model.OperationsPublication{}, &model.OperationsPlatformPost{}, &model.OperationsStepAttachment{}, &model.OperationsProgressUpdate{},
		&model.OperationsProgressStep{}, &model.OperationsProgressItem{})
	if err := db.AutoMigrate(&model.OperationsProgressItem{}, &model.OperationsProgressStep{},
		&model.OperationsProgressUpdate{}, &model.OperationsStepAttachment{}, &model.OperationsPlatformPost{}, &model.OperationsPublication{}); err != nil {
		t.Fatal(err)
	}
	channel := model.OperationsProgressItem{Title: "B站运营", Kind: "channel", Platforms: "bilibili", Status: "active"}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	var episode *model.OperationsProgressItem
	if err := db.Transaction(func(tx *gorm.DB) error {
		var err error
		episode, err = operationsworkflow.CreateEpisode(tx, channel.ID, "")
		return err
	}); err != nil {
		t.Fatal(err)
	}
	var steps []model.OperationsProgressStep
	if err := db.Where("item_id = ?", episode.ID).Order("position").Find(&steps).Error; err != nil {
		t.Fatal(err)
	}
	if len(steps) != 5 {
		t.Fatalf("expected five steps, got %d", len(steps))
	}
	gin.SetMode(gin.TestMode)
	store, err := privatefile.NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	handler := NewOperationsProgressHandler(db, store)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("sessionUser", &auth.SessionUser{ID: 42, Role: auth.SessionRole{Name: "super_admin"}})
		c.Next()
	})
	route := "/api/operations/progress/:id/steps/:stepId"
	router.PATCH(route, handler.UpdateStep)
	router.POST(route+"/attachments", handler.UploadStepAttachment)
	router.GET("/api/operations/attachments/:fileId", handler.OpenStepAttachment)
	router.GET("/api/operations/works", handler.Works)
	endpoint := fmt.Sprintf("/api/operations/progress/%d/steps/%d", episode.ID, steps[4].ID)
	submit := func() *httptest.ResponseRecorder {
		t.Helper()
		data, _ := json.Marshal(map[string]any{"status": "done", "note": "发布成功", "evidenceUrl": "https://www.bilibili.com/video/BV1example12"})
		request := httptest.NewRequest(http.MethodPatch, endpoint, bytes.NewReader(data))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		return response
	}
	if got := submit(); got.Code != http.StatusConflict {
		t.Fatalf("publishing before review must be blocked, got %d: %s", got.Code, got.Body.String())
	}
	if err := db.Model(&model.OperationsProgressStep{}).Where("item_id = ? AND id <> ?", episode.ID, steps[4].ID).
		Update("status", "done").Error; err != nil {
		t.Fatal(err)
	}
	if got := submit(); got.Code != http.StatusOK {
		t.Fatalf("publication failed: %d %s", got.Code, got.Body.String())
	}
	if got := submit(); got.Code != http.StatusOK {
		t.Fatalf("repeat publication must be harmless: %d %s", got.Code, got.Body.String())
	}
	var issues []model.OperationsProgressItem
	if err := db.Where("channel_id = ?", channel.ID).Order("episode_no").Find(&issues).Error; err != nil {
		t.Fatal(err)
	}
	if len(issues) != 2 || issues[1].EpisodeNo != 2 || issues[1].PublicationURL != "" ||
		issues[0].PublicationURL != "https://www.bilibili.com/video/BV1example12" {
		t.Fatalf("publishing must create one draft and preserve URL: %+v", issues)
	}
	var log model.OperationsProgressUpdate
	if err := db.Where("item_id = ? AND step_id = ?", episode.ID, steps[4].ID).First(&log).Error; err != nil {
		t.Fatal(err)
	}
	if log.AuthorID != 42 || !strings.Contains(log.Content, "发布成功") || log.FromStage != "pending" || log.ToStage != "done" {
		t.Fatalf("missing accurate publication audit: %+v", log)
	}

	works := httptest.NewRecorder()
	router.ServeHTTP(works, httptest.NewRequest(http.MethodGet, "/api/operations/works?platform=bilibili", nil))
	if works.Code != http.StatusOK || !strings.Contains(works.Body.String(), "archiveTotal") {
		t.Fatalf("works archive failed on prefixed schema: status=%d body=%s", works.Code, works.Body.String())
	}
	now := time.Now().UTC()
	if err := db.Create(&model.OperationsPlatformPost{
		Platform: "bilibili", ExternalID: "search-test", Title: "RMer 赛事采访",
		URL: "https://www.bilibili.com/video/BV1example12", PublishedAt: now, SyncedAt: now,
	}).Error; err != nil {
		t.Fatal(err)
	}
	for _, scenario := range []struct {
		query string
		total string
	}{
		{"RMer", "\"total\":1"},
		{"没有结果", "\"total\":0"},
	} {
		record := httptest.NewRecorder()
		router.ServeHTTP(record, httptest.NewRequest(http.MethodGet,
			"/api/operations/works?platform=bilibili&q="+scenario.query, nil))
		if record.Code != http.StatusOK || !strings.Contains(record.Body.String(), scenario.total) {
			t.Fatalf("search %q failed: status=%d body=%s", scenario.query, record.Code, record.Body.String())
		}
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "release.txt")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write([]byte("delivery evidence")); err != nil {
		t.Fatal(err)
	}
	writer.Close()
	upload := httptest.NewRequest(http.MethodPost, endpoint+"/attachments", &body)
	upload.Header.Set("Content-Type", writer.FormDataContentType())
	uploadResponse := httptest.NewRecorder()
	router.ServeHTTP(uploadResponse, upload)
	if uploadResponse.Code != http.StatusCreated {
		t.Fatalf("upload failed: %d %s", uploadResponse.Code, uploadResponse.Body.String())
	}
	var saved model.OperationsStepAttachment
	if err := db.Where("step_id = ?", steps[4].ID).First(&saved).Error; err != nil {
		t.Fatal(err)
	}
	download := httptest.NewRecorder()
	router.ServeHTTP(download, httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/operations/attachments/%d", saved.ID), nil))
	if download.Code != http.StatusOK || download.Body.String() != "delivery evidence" {
		t.Fatalf("download failed: status=%d body=%q", download.Code, download.Body.String())
	}
}

func TestMariaDBOperationsLaunchReusesPendingEpisode(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated acceptance database required")
	}
	prefix := fmt.Sprintf("launch%d_", time.Now().UnixNano())
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: prefix}})
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
	channel := model.OperationsProgressItem{Title: "抖音", Kind: "channel", Platforms: "douyin", Status: "active"}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	var upcoming *model.OperationsProgressItem
	if err := db.Transaction(func(tx *gorm.DB) error {
		var err error
		upcoming, err = operationsworkflow.EnsureUpcoming(tx, channel.ID, "RMer")
		return err
	}); err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	h := NewOperationsProgressHandler(db, nil)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("sessionUser", &auth.SessionUser{ID: 42, Role: auth.SessionRole{Name: "super_admin"}})
		c.Next()
	})
	router.POST("/api/operations/channels/:id/episodes", h.CreateEpisode)
	body, _ := json.Marshal(map[string]any{
		"title": "RMer 新一期", "seriesName": "RMer", "startPlanning": true,
	})
	request := httptest.NewRequest(http.MethodPost,
		fmt.Sprintf("/api/operations/channels/%d/episodes", channel.ID), bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("launch failed: %d %s", response.Code, response.Body.String())
	}
	var episodes []model.OperationsProgressItem
	if err := db.Where("channel_id = ?", channel.ID).Find(&episodes).Error; err != nil {
		t.Fatal(err)
	}
	if len(episodes) != 1 || episodes[0].ID != upcoming.ID || episodes[0].Title != "RMer 新一期" {
		t.Fatalf("launch must reuse existing pending episode: %+v", episodes)
	}
	var steps []model.OperationsProgressStep
	if err := db.Where("item_id = ?", upcoming.ID).Order("position").Find(&steps).Error; err != nil {
		t.Fatal(err)
	}
	if len(steps) != 5 || steps[0].Key != "planning" || steps[0].Status != "active" {
		t.Fatalf("launch must start planning only: %+v", steps)
	}
	for _, step := range steps[1:] {
		if step.Status != "pending" {
			t.Fatalf("later step %s advanced during launch", step.Key)
		}
	}
	var audit model.OperationsProgressUpdate
	if err := db.Where("item_id = ?", upcoming.ID).First(&audit).Error; err != nil {
		t.Fatal(err)
	}
	if audit.AuthorID != 42 || audit.FromStage != "pending" || audit.ToStage != "active" {
		t.Fatalf("launch audit incorrect: %+v", audit)
	}
}
