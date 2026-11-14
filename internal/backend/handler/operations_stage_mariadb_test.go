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
)

func TestMariaDBOperationsStageChangesAndConfirmationsAreAudited(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated acceptance database required")
	}
	prefix := fmt.Sprintf("os%d_", time.Now().UnixNano())
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: prefix}})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	defer db.Migrator().DropTable(&model.OperationsProgressUpdate{}, &model.OperationsProgressItem{})
	if err := db.AutoMigrate(&model.OperationsProgressItem{}, &model.OperationsProgressUpdate{}); err != nil {
		t.Fatal(err)
	}
	item := model.OperationsProgressItem{Title: "视频一期", Kind: "video", Stage: "unconfirmed", Status: "active"}
	if err := db.Create(&item).Error; err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/api/operations/progress/:id/stage", func(c *gin.Context) {
		c.Set("sessionUser", &auth.SessionUser{ID: 42, Role: auth.SessionRole{Name: "super_admin"}})
		NewOperationsProgressHandler(db).RecordStage(c)
	})
	router.POST("/api/operations/progress/:id/stage/undo", func(c *gin.Context) {
		c.Set("sessionUser", &auth.SessionUser{ID: 42, Role: auth.SessionRole{Name: "super_admin"}})
		NewOperationsProgressHandler(db).UndoStage(c)
	})
	request := func(body string, want int) {
		t.Helper()
		res := httptest.NewRecorder()
		router.ServeHTTP(res, httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/operations/progress/%d/stage", item.ID), bytes.NewBufferString(body)))
		if res.Code != want {
			t.Fatalf("status = %d, want %d: %s", res.Code, want, res.Body.String())
		}
	}
	request(`{"stage":"editing"}`, 200)
	request(`{"confirm":true}`, 200)
	request(`{"stage":"editing"}`, 400)
	request(`{"stage":"invalid"}`, 400)
	var updated model.OperationsProgressItem
	if err := db.First(&updated, item.ID).Error; err != nil {
		t.Fatal(err)
	}
	if updated.Stage != "editing" {
		t.Fatalf("incorrect stage: %s", updated.Stage)
	}
	var history []model.OperationsProgressUpdate
	if err := db.Order("id ASC").Find(&history).Error; err != nil {
		t.Fatal(err)
	}
	if len(history) != 2 || history[0].Kind != "stage" || history[0].FromStage != "unconfirmed" ||
		history[0].ToStage != "editing" || history[1].Kind != "confirmed" || history[1].FromStage != "editing" || history[1].ToStage != "editing" ||
		history[0].AuthorID != 42 || history[1].CreatedAt.Before(history[0].CreatedAt.Add(-time.Second)) {
		payload, _ := json.Marshal(history)
		t.Fatalf("invalid audit records: %s", payload)
	}

	undo := func(updateID uint64, want int) {
		t.Helper()
		res := httptest.NewRecorder()
		path := fmt.Sprintf("/api/operations/progress/%d/stage/undo", item.ID)
		payload := fmt.Sprintf(`{"updateId":%d}`, updateID)
		router.ServeHTTP(res, httptest.NewRequest(http.MethodPost, path, bytes.NewBufferString(payload)))
		if res.Code != want {
			t.Fatalf("undo status = %d, want %d: %s", res.Code, want, res.Body.String())
		}
	}
	undo(history[0].ID, 409) // Only the latest action can be undone.
	undo(history[1].ID, 200) // Delete a confirmation without changing the stage.
	undo(history[1].ID, 409) // Repeating a delete cannot affect older changes.
	if err := db.First(&updated, item.ID).Error; err != nil {
		t.Fatal(err)
	}
	if updated.Stage != "editing" {
		t.Fatalf("undo confirmation changed stage: %s", updated.Stage)
	}
	if err := db.First(&model.OperationsProgressUpdate{}, history[1].ID).Error; err != gorm.ErrRecordNotFound {
		t.Fatalf("undone confirmation should be deleted: %v", err)
	}
	undo(history[0].ID, 200) // Now the original stage change is latest.
	if err := db.First(&updated, item.ID).Error; err != nil {
		t.Fatal(err)
	}
	if updated.Stage != "unconfirmed" {
		t.Fatalf("undo stage failed to restore previous stage: %s", updated.Stage)
	}
	var remaining int64
	if err := db.Model(&model.OperationsProgressUpdate{}).Where("item_id = ?", item.ID).Count(&remaining).Error; err != nil {
		t.Fatal(err)
	}
	if remaining != 0 {
		t.Fatalf("undo should leave no stage or undo records, got %d", remaining)
	}
	request(`{"stage":"review"}`, 200)
	var last model.OperationsProgressUpdate
	if err := db.Where("item_id = ?", item.ID).Order("id DESC").First(&last).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.OperationsProgressUpdate{ItemID: item.ID, AuthorID: 42, Kind: "progress", Content: "后续备注"}).Error; err != nil {
		t.Fatal(err)
	}
	undo(last.ID, 409) // A later note makes the stage operation stale.
	if err := db.Model(&model.OperationsProgressUpdate{}).Where("item_id = ?", item.ID).Count(&remaining).Error; err != nil {
		t.Fatal(err)
	}
	if remaining != 2 {
		t.Fatalf("stale undo should not delete any records, got %d", remaining)
	}
}
