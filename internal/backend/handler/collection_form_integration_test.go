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
	"time"

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
	// Cleanup runs after defers; close the pool last so fixture deletion can
	// still access the database.
	t.Cleanup(func() { _ = sqlDB.Close() })
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
	engine.POST("/admin", asSuperAdmin, h.Create)
	engine.PUT("/admin/:id", asSuperAdmin, h.Update)
	engine.GET("/admin/:id", asSuperAdmin, h.GetAdmin)
	engine.DELETE("/admin/:id", asSuperAdmin, h.Delete)
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

	// Unfinished drafts must persist through create/update, remain private,
	// and fail publication until all user-facing labels are complete.
	draftFields := testCollectionInput().Fields
	draftFields[0].Label = ""
	draftFields[1].Options[0].Label = ""
	draftInput := collectionFormInput{Status: "draft", Fields: draftFields, LoginRequired: &notRequired}
	sendAdmin := func(method, path string, input collectionFormInput) *httptest.ResponseRecorder {
		data, _ := json.Marshal(input)
		req := httptest.NewRequest(method, path, bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, req)
		return response
	}
	created := sendAdmin(http.MethodPost, "/admin", draftInput)
	if created.Code != 200 {
		t.Fatalf("unfinished draft create: %d %s", created.Code, created.Body.String())
	}
	var createData struct {
		Data struct {
			ID uint64 `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &createData); err != nil || createData.Data.ID == 0 {
		t.Fatalf("draft id missing: %v, %s", err, created.Body.String())
	}
	draftID := createData.Data.ID
	t.Cleanup(func() { db.Delete(&model.CollectionForm{}, draftID) })
	if response := sendAdmin(http.MethodPut, fmt.Sprintf("/admin/%d", draftID), draftInput); response.Code != 200 {
		t.Fatalf("unfinished draft update: %d %s", response.Code, response.Body.String())
	}
	public := httptest.NewRecorder()
	engine.ServeHTTP(public, httptest.NewRequest(http.MethodGet, fmt.Sprintf("/collection-forms/%d", draftID), nil))
	if public.Code != 404 {
		t.Fatalf("draft exposed publicly: %d", public.Code)
	}
	draftInput.Status = "published"
	if response := sendAdmin(http.MethodPut, fmt.Sprintf("/admin/%d", draftID), draftInput); response.Code != 400 {
		t.Fatalf("incomplete draft published: %d %s", response.Code, response.Body.String())
	}
	draftInput.Title = "填写完成的报名表"
	draftInput.Fields[0].Label = "姓名"
	draftInput.Fields[1].Options[0].Label = "上午"
	if response := sendAdmin(http.MethodPut, fmt.Sprintf("/admin/%d", draftID), draftInput); response.Code != 200 {
		t.Fatalf("completed draft could not publish: %d %s", response.Code, response.Body.String())
	}
	var persisted model.CollectionForm
	if err := db.First(&persisted, draftID).Error; err != nil || persisted.Status != "published" ||
		persisted.Fields[0].Label != "姓名" {
		t.Fatalf("published draft was not persisted: %v %#v", err, persisted)
	}
	deletion := httptest.NewRecorder()
	engine.ServeHTTP(deletion, httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/admin/%d", draftID), nil))
	if deletion.Code != 409 {
		t.Fatalf("published form deleted: %d %s", deletion.Code, deletion.Body.String())
	}
	draftInput.Status, draftInput.Title = "draft", ""
	created = sendAdmin(http.MethodPost, "/admin", draftInput)
	if err := json.Unmarshal(created.Body.Bytes(), &createData); err != nil || created.Code != 200 {
		t.Fatalf("draft for deletion was not created: %v %s", err, created.Body.String())
	}
	deletion = httptest.NewRecorder()
	engine.ServeHTTP(deletion, httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/admin/%d", createData.Data.ID), nil))
	if deletion.Code != 200 {
		t.Fatalf("draft deletion failed: %d %s", deletion.Code, deletion.Body.String())
	}

	// Internal forms use the account as identity, not duplicate name/college
	// fields in answers. These users exist only in this isolated test DB.
	var role model.Role
	if err := db.Where("name = ?", model.RoleNameUser).First(&role).Error; err != nil {
		t.Fatal(err)
	}
	isStudent := true
	name := "集成测试成员"
	member := model.User{
		Email:  fmt.Sprintf("collection-member-%d@tarsgo.test", time.Now().UnixNano()),
		RoleID: role.ID, Status: model.UserStatusEnabled, RealName: &name,
		IsStudent: &isStudent, StudentID: "20240101", College: "通信工程学院", Grade: "2024 级",
	}
	if err := db.Create(&member).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Delete(&member) })

	choice := model.CollectionField{Key: "slot", Label: "场次", Type: "radio", Required: true,
		Options: []model.CollectionOption{{Value: "am", Label: "上午", Capacity: 2}, {Value: "pm", Label: "下午", Capacity: 2}}}
	internal := model.CollectionForm{Title: "内部活动报名", Status: "published", LoginRequired: true,
		Fields: []model.CollectionField{choice}}
	if err := db.Create(&internal).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Where("form_id = ?", internal.ID).Delete(&model.CollectionSubmission{})
		db.Delete(&internal)
	})
	asMember := func(canUseWorkbench bool) gin.HandlerFunc {
		return func(c *gin.Context) {
			c.Set("sessionUser", &auth.SessionUser{ID: member.ID, WorkbenchAccess: canUseWorkbench})
			c.Next()
		}
	}
	engine.GET("/member/:id", asMember(true), h.GetPublic)
	engine.POST("/member/:id/submissions", asMember(true), h.Submit)
	engine.GET("/outside/:id", asMember(false), h.GetPublic)
	engine.POST("/outside/:id/submissions", asMember(false), h.Submit)
	engine.GET("/admin/:id/submissions", asSuperAdmin, h.Submissions)
	sendMember := func(method, path string, body []byte) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, req)
		return response
	}
	publicPath := fmt.Sprintf("/collection-forms/%d", internal.ID)
	memberPath := fmt.Sprintf("/member/%d", internal.ID)
	outsidePath := fmt.Sprintf("/outside/%d", internal.ID)
	if response := sendMember(http.MethodGet, publicPath, nil); response.Code != 401 {
		t.Fatalf("internal form visible without login: %d", response.Code)
	}
	if response := sendMember(http.MethodGet, outsidePath, nil); response.Code != 403 {
		t.Fatalf("nonmember accessed internal form: %d", response.Code)
	}
	memberView := sendMember(http.MethodGet, memberPath, nil)
	var view struct {
		Data struct {
			Viewer struct {
				Participant     model.CollectionParticipant `json:"participant"`
				ProfileComplete bool                        `json:"profileComplete"`
				Submitted       bool                        `json:"submitted"`
			} `json:"viewer"`
		} `json:"data"`
	}
	if err := json.Unmarshal(memberView.Body.Bytes(), &view); err != nil ||
		memberView.Code != 200 || !view.Data.Viewer.ProfileComplete ||
		view.Data.Viewer.Submitted || view.Data.Viewer.Participant.RealName != name ||
		view.Data.Viewer.Participant.StudentID != member.StudentID {
		t.Fatalf("member identity not loaded: %d %s, err=%v", memberView.Code, memberView.Body.String(), err)
	}
	selection, _ := json.Marshal(map[string]any{"answers": map[string]any{"slot": "am"}})
	if response := sendMember(http.MethodPost, publicPath+"/submissions", selection); response.Code != 401 {
		t.Fatalf("anonymous internal submission accepted: %d", response.Code)
	}
	if response := sendMember(http.MethodPost, outsidePath+"/submissions", selection); response.Code != 403 {
		t.Fatalf("nonmember submitted internal form: %d", response.Code)
	}
	if response := sendMember(http.MethodPost, memberPath+"/submissions", selection); response.Code != 200 {
		t.Fatalf("member submit failed: %d %s", response.Code, response.Body.String())
	}
	if response := sendMember(http.MethodPost, memberPath+"/submissions", selection); response.Code != 409 {
		t.Fatalf("repeat member submit accepted: %d", response.Code)
	}
	memberView = sendMember(http.MethodGet, memberPath, nil)
	if err := json.Unmarshal(memberView.Body.Bytes(), &view); err != nil || !view.Data.Viewer.Submitted {
		t.Fatalf("submission state not updated: %s %v", memberView.Body.String(), err)
	}
	results := sendMember(http.MethodGet, fmt.Sprintf("/admin/%d/submissions", internal.ID), nil)
	if results.Code != 200 || !strings.Contains(results.Body.String(), name) ||
		!strings.Contains(results.Body.String(), member.StudentID) {
		t.Fatalf("admin results lack account identity: %d %s", results.Code, results.Body.String())
	}
	csv := sendMember(http.MethodGet, fmt.Sprintf("/admin/%d/export", internal.ID), nil)
	if csv.Code != 200 || !strings.Contains(csv.Body.String(), name) ||
		!strings.Contains(csv.Body.String(), member.College) ||
		!strings.Contains(csv.Body.String(), member.StudentID) {
		t.Fatalf("CSV lacks account identity: %d %s", csv.Code, csv.Body.String())
	}
	renamed := "更新后的成员姓名"
	if err := db.Model(&member).Update("real_name", renamed).Error; err != nil {
		t.Fatal(err)
	}
	results = sendMember(http.MethodGet, fmt.Sprintf("/admin/%d/submissions", internal.ID), nil)
	if results.Code != 200 || !strings.Contains(results.Body.String(), renamed) {
		t.Fatalf("result does not use current account profile: %d %s", results.Code, results.Body.String())
	}

	missing := model.User{
		Email:  fmt.Sprintf("collection-incomplete-%d@tarsgo.test", time.Now().UnixNano()),
		RoleID: role.ID, Status: model.UserStatusEnabled,
	}
	if err := db.Create(&missing).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Delete(&missing) })
	engine.POST("/incomplete/:id/submissions", func(c *gin.Context) {
		c.Set("sessionUser", &auth.SessionUser{ID: missing.ID, WorkbenchAccess: true})
		c.Next()
	}, h.Submit)
	if response := sendMember(http.MethodPost,
		fmt.Sprintf("/incomplete/%d/submissions", internal.ID), selection); response.Code != 409 {
		t.Fatalf("incomplete profile not blocked: %d %s", response.Code, response.Body.String())
	}
}
