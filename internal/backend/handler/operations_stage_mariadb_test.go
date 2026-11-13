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
	prefix := fmt.Sprintf("ops_stage_probe_%d_", time.Now().UnixNano())
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
}
