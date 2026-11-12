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
	"tarsgo-backend/service/auth"
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
	// CI forwards host port 3317 to MariaDB's internal port 3306.
	// Only a direct local socket needs the instance-path and port check.
	if localSocket && (port != 3317 || filepath.Clean(datadir) != filepath.Join(home, "Library", "Application Support", "TarsGo", "Acceptance", "mariadb")) {
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
	engine.GET("/collection-forms/:id", h.GetPublic)
	asSuperAdmin := func(c *gin.Context) {
		c.Set("sessionUser", &auth.SessionUser{Role: auth.SessionRole{Name: model.RoleNameSuperAdmin}})
		c.Next()
	}
	engine.PUT("/admin/:id", asSuperAdmin, h.Update)
	engine.GET("/admin/:id", asSuperAdmin, h.GetAdmin)
	engine.GET("/admin/:id/export", asSuperAdmin, h.Export)
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

	// Multi-select consumes quota for every selected option. Partial inserts
	// must roll back when any selected option is full.
	multiFields := testCollectionInput().Fields
	multiFields[1].Type = "checkbox"
	multiFields[1].Options[0].Capacity = 1
	multiFields[1].Options[1].Capacity = 1
	multi := model.CollectionForm{Title: "多选名额测试", Fields: multiFields, LoginRequired: false, Status: "published"}
	if err := db.Create(&multi).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Where("form_id = ?", multi.ID).Delete(&model.CollectionSubmission{})
		db.Delete(&multi)
	})
	multiRequest := func(values []string) int {
		body, _ := json.Marshal(map[string]any{"answers": map[string]any{"name": "测试", "slot": values}})
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/collection-forms/%d/submissions", multi.ID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, req)
		return w.Code
	}
	result = make(chan int, attempts)
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); result <- multiRequest([]string{"am", "pm"}) }()
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
			t.Fatalf("unexpected checkbox status %d", status)
		}
	}
	if success != 1 || full != attempts-1 {
		t.Fatalf("checkbox success %d, full %d", success, full)
	}
	if got := multiRequest([]string{"am"}); got != 409 {
		t.Fatalf("checkbox full status %d", got)
	}

	// Increasing an existing option quota must not change or discard answers.
	multiFields[1].Options[0].Capacity = 2
	multiFields[1].Options[0].Description = "南湖校区，上午"
	notRequired := false
	updateBody, _ := json.Marshal(collectionFormInput{
		Title: multi.Title, Status: "published", Fields: multiFields, LoginRequired: &notRequired,
	})
	updateReq := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/admin/%d", multi.ID), bytes.NewReader(updateBody))
	updateReq.Header.Set("Content-Type", "application/json")
	updateResponse := httptest.NewRecorder()
	engine.ServeHTTP(updateResponse, updateReq)
	if updateResponse.Code != 200 {
		t.Fatalf("cannot update quota after submissions: %d %s", updateResponse.Code, updateResponse.Body.String())
	}
	var saved model.CollectionForm
	if err := db.First(&saved, multi.ID).Error; err != nil || saved.Fields[1].Options[0].Capacity != 2 ||
		saved.Fields[1].Options[0].Description != "南湖校区，上午" {
		t.Fatalf("updated form was not persisted: %v %+v", err, saved.Fields)
	}
	if got := multiRequest([]string{"am"}); got != 200 {
		t.Fatalf("increased quota status %d", got)
	}
	if got := multiRequest([]string{"am", "pm"}); got != 409 {
		t.Fatalf("atomic multi-option quota status %d", got)
	}
	for _, check := range []struct {
		value string
		want  int64
	}{{"am", 2}, {"pm", 1}} {
		used, err := collectionOptionUsed(db, multi.ID, multiFields[1], check.value)
		if err != nil || used != check.want {
			t.Fatalf("option %s used %d, want %d: %v", check.value, used, check.want, err)
		}
	}

	adminRequest := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/admin/%d", multi.ID), nil)
	adminResponse := httptest.NewRecorder()
	engine.ServeHTTP(adminResponse, adminRequest)
	var adminData struct {
		Data struct {
			Count int64                       `json:"count"`
			Usage map[string]map[string]int64 `json:"usage"`
		} `json:"data"`
	}
	if err := json.Unmarshal(adminResponse.Body.Bytes(), &adminData); err != nil ||
		adminResponse.Code != 200 || adminData.Data.Count != 2 ||
		adminData.Data.Usage["slot"]["am"] != 2 || adminData.Data.Usage["slot"]["pm"] != 1 {
		t.Fatalf("admin choice statistics: %d %s, error %v", adminResponse.Code, adminResponse.Body.String(), err)
	}

	publicRequest := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/collection-forms/%d", multi.ID), nil)
	publicResponse := httptest.NewRecorder()
	engine.ServeHTTP(publicResponse, publicRequest)
	var publicData struct {
		Data struct {
			Form model.CollectionForm `json:"form"`
		} `json:"data"`
	}
	if err := json.Unmarshal(publicResponse.Body.Bytes(), &publicData); err != nil ||
		publicResponse.Code != 200 || publicData.Data.Form.Fields[1].Options[0].Remaining == nil ||
		*publicData.Data.Form.Fields[1].Options[0].Remaining != 0 ||
		publicData.Data.Form.Fields[1].Options[1].Remaining == nil ||
		*publicData.Data.Form.Fields[1].Options[1].Remaining != 0 {
		t.Fatalf("public quota state: %d %s, error %v", publicResponse.Code, publicResponse.Body.String(), err)
	}

	exportRequest := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/admin/%d/export", multi.ID), nil)
	exportResponse := httptest.NewRecorder()
	engine.ServeHTTP(exportResponse, exportRequest)
	if exportResponse.Code != 200 || !strings.Contains(exportResponse.Body.String(), "上午") ||
		!strings.Contains(exportResponse.Body.String(), "下午") {
		t.Fatalf("CSV should export option labels: %d %s", exportResponse.Code, exportResponse.Body.String())
	}
}
