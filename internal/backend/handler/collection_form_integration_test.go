package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"tarsgo-backend/model"
)

// Real InnoDB row locks and JSON quota queries cannot be proven with mock SQL.
func TestMariaDBCollectionQuotasUnderConcurrency(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	home, _ := os.UserHomeDir()
	acceptanceSocket := filepath.Join(home, "Library", "Application Support", "TarsGo", "Acceptance", "mariadb.sock")
	loopback := strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?")
	localSocket := strings.Contains(dsn, "@unix("+acceptanceSocket+")/tarsgo_acceptance?")
	if !loopback && !localSocket {
		t.Fatal("isolated test database required")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	defer sqlDB.Close()
	var port int
	var datadir string
	if err := db.Raw("SELECT @@port, @@datadir").Row().Scan(&port, &datadir); err != nil {
		t.Fatal(err)
	}
	if port != 3317 || (localSocket && filepath.Clean(datadir) != filepath.Join(home, "Library", "Application Support", "TarsGo", "Acceptance", "mariadb")) {
		t.Fatal("database instance is not the isolated acceptance instance")
	}
	if err := db.AutoMigrate(&model.CollectionForm{}, &model.CollectionSubmission{}); err != nil {
		t.Fatal(err)
	}

	form := model.CollectionForm{Title: "并发名额测试", Fields: testCollectionInput().Fields,
		LoginRequired: false, Status: "published", Capacity: 20}
	if err := db.Create(&form).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Where("form_id = ?", form.ID).Delete(&model.CollectionSubmission{})
		db.Delete(&form)
	})

	gin.SetMode(gin.TestMode)
	h := NewCollectionFormHandler(db)
	engine := gin.New()
	engine.POST("/collection-forms/:id/submissions", h.Submit)
	request := func(formID uint64, slot string) int {
		body, _ := json.Marshal(map[string]any{"answers": map[string]any{"name": "测试", "slot": slot}})
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/collection-forms/%d/submissions", formID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)
		return w.Code
	}
	const attempts = 8
	result := make(chan int, attempts)
	var wg sync.WaitGroup
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); result <- request(form.ID, "am") }()
	}
	wg.Wait()
	close(result)
	success, full := 0, 0
	for status := range result {
		if status == 200 {
			success++
		} else if status == 409 {
			full++
		} else {
			t.Fatalf("unexpected submission status %d", status)
		}
	}
	if success != 2 || full != attempts-2 {
		t.Fatalf("success %d, full %d", success, full)
	}
	if got := request(form.ID, "pm"); got != 200 {
		t.Fatalf("other option status %d", got)
	}
	if got := request(form.ID, "pm"); got != 409 {
		t.Fatalf("full option status %d", got)
	}
	var count int64
	if err := db.Model(&model.CollectionSubmission{}).Where("form_id = ?", form.ID).Count(&count).Error; err != nil || count != 3 {
		t.Fatalf("saved submissions %d: %v", count, err)
	}

	// The global quota must hold under concurrent requests too.
	totalForm := model.CollectionForm{Title: "总名额测试", Fields: testCollectionInput().Fields,
		LoginRequired: false, Status: "published", Capacity: 1}
	if err := db.Create(&totalForm).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Where("form_id = ?", totalForm.ID).Delete(&model.CollectionSubmission{})
		db.Delete(&totalForm)
	})
	result = make(chan int, attempts)
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); result <- request(totalForm.ID, "am") }()
	}
	wg.Wait()
	close(result)
	success, full = 0, 0
	for status := range result {
		if status == 200 {
			success++
		} else if status == 409 {
			full++
		} else {
			t.Fatalf("unexpected total quota status %d", status)
		}
	}
	if success != 1 || full != attempts-1 {
		t.Fatalf("global quota success %d, full %d", success, full)
	}
}
