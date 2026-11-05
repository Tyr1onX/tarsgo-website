package router

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"tarsgo-backend/config"
	"tarsgo-backend/database"
	"tarsgo-backend/model"
	"tarsgo-backend/service/aisalon"
)

func TestMariaDBAISalonAPIPermissionsAndOwnership(t *testing.T) {
	dsn := os.Getenv("TARSGO_QA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires isolated MariaDB")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("isolated database required")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	defer sqlDB.Close()
	if err := database.RunMigrations(context.Background(), db, "test"); err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{App: config.AppConfig{Env: "test", GinMode: "test"}, Auth: config.AuthConfig{JWTSecret: strings.Repeat("s", 32), CookieName: "salon_test_session", TokenTTL: 72 * time.Hour}}
	engine := New(cfg, db)
	users := []model.User{}
	tokens := []string{}
	eventIDs := []uint64{}
	marker := time.Now().UnixNano()
	t.Cleanup(func() {
		for _, id := range eventIDs {
			db.Where("event_id = ?", id).Delete(&model.AISalonRegistration{})
			db.Delete(&model.AISalonEvent{}, id)
		}
		for _, u := range users {
			db.Where("actor_id = ?", u.ID).Delete(&model.AuditLog{})
			db.Where("user_id = ?", u.ID).Delete(&model.AuthSession{})
			db.Delete(&model.User{}, u.ID)
		}
	})
	for i, roleName := range []string{model.RoleNameUser, model.RoleNameAdmin, model.RoleNameSuperAdmin, model.RoleNameUser} {
		var role model.Role
		db.Where("name = ?", roleName).First(&role)
		u := model.User{RoleID: role.ID, Email: fmt.Sprintf("salon-api-%d-%d@tarsgo.test", marker, i), Status: 1}
		if err := db.Create(&u).Error; err != nil {
			t.Fatal(err)
		}
		users = append(users, u)
		token := fmt.Sprintf("synthetic-salon-session-%d-%d", marker, i)
		digest := sha256.Sum256([]byte(token))
		if err := db.Create(&model.AuthSession{UserID: u.ID, TokenHash: hex.EncodeToString(digest[:]), ExpiresAt: time.Now().Add(72 * time.Hour)}).Error; err != nil {
			t.Fatal(err)
		}
		tokens = append(tokens, token)
	}
	request := func(method, path string, body any, actor int, origin string) *httptest.ResponseRecorder {
		t.Helper()
		data, _ := json.Marshal(body)
		r := httptest.NewRequest(method, "http://salon.test"+path, bytes.NewReader(data))
		r.Header.Set("Content-Type", "application/json")
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		if actor >= 0 {
			r.AddCookie(&http.Cookie{Name: cfg.Auth.CookieName, Value: tokens[actor]})
		}
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, r)
		return w
	}
	workingDirectory, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(t.TempDir()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(workingDirectory) })
	uploadPoster := func(name string, content []byte, actor int, origin string) *httptest.ResponseRecorder {
		t.Helper()
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		part, err := writer.CreateFormFile("poster", name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(content); err != nil {
			t.Fatal(err)
		}
		if err := writer.Close(); err != nil {
			t.Fatal(err)
		}
		r := httptest.NewRequest(http.MethodPost, "http://salon.test/api/admin/ai-salon/posters", &body)
		r.Header.Set("Content-Type", writer.FormDataContentType())
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		if actor >= 0 {
			r.AddCookie(&http.Cookie{Name: cfg.Auth.CookieName, Value: tokens[actor]})
		}
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, r)
		return w
	}
	expect := func(w *httptest.ResponseRecorder, status int) {
		t.Helper()
		if w.Code != status {
			t.Fatalf("status %d expected %d: %s", w.Code, status, w.Body.String())
		}
	}
	var imageData bytes.Buffer
	testImage := image.NewRGBA(image.Rect(0, 0, 2, 2))
	testImage.Set(0, 0, color.RGBA{R: 0x30, G: 0x80, B: 0xc0, A: 0xff})
	if err := png.Encode(&imageData, testImage); err != nil {
		t.Fatal(err)
	}
	for _, actor := range []int{-1, 0, 1} {
		status := 403
		if actor < 0 {
			status = 401
		}
		expect(uploadPoster("poster.png", imageData.Bytes(), actor, "http://salon.test"), status)
	}
	expect(uploadPoster("poster.png", imageData.Bytes(), 2, "https://attacker.test"), 403)
	uploadResponse := uploadPoster("poster.png", imageData.Bytes(), 2, "http://salon.test")
	expect(uploadResponse, 200)
	var uploaded struct {
		Data struct {
			PosterURL string `json:"posterUrl"`
		} `json:"data"`
	}
	if err := json.Unmarshal(uploadResponse.Body.Bytes(), &uploaded); err != nil || !strings.HasPrefix(uploaded.Data.PosterURL, "/upload/ai-salon/posters/") {
		t.Fatalf("poster upload response: %+v %v", uploaded, err)
	}
	posterRequest := httptest.NewRequest(http.MethodGet, "http://salon.test"+uploaded.Data.PosterURL, nil)
	posterResponse := httptest.NewRecorder()
	New(cfg, db).ServeHTTP(posterResponse, posterRequest)
	if posterResponse.Code != http.StatusOK || posterResponse.Header().Get("Content-Type") != "image/png" || posterResponse.Header().Get("X-Content-Type-Options") != "nosniff" || !bytes.Equal(posterResponse.Body.Bytes(), imageData.Bytes()) {
		t.Fatalf("public poster response: %d %s", posterResponse.Code, posterResponse.Header())
	}
	if _, err := os.Stat(filepath.Join("upload", "ai-salon", "posters", filepath.Base(uploaded.Data.PosterURL))); err != nil {
		t.Fatalf("poster did not persist across router recreation: %v", err)
	}
	expect(uploadPoster("invalid.png", []byte("not an image"), 2, "http://salon.test"), http.StatusBadRequest)
	now := time.Now().UTC()
	e := model.AISalonEvent{Title: "[TEST] Public salon", Summary: "介绍", Location: "南岭", Capacity: 1, Published: true, StartAt: now.Add(time.Hour), EndAt: now.Add(2 * time.Hour), Deadline: now.Add(30 * time.Minute)}
	adminPath := "/api/admin/ai-salon/events"
	for _, actor := range []int{-1, 0, 1} {
		w := request("POST", adminPath, e, actor, "http://salon.test")
		status := 403
		if actor < 0 {
			status = 401
		}
		expect(w, status)
	}
	expect(request("POST", adminPath, e, 2, "https://attacker.test"), 403)
	w := request("POST", adminPath, e, 2, "http://salon.test")
	expect(w, 200)
	var saved struct {
		Data model.AISalonEvent `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &saved); err != nil {
		t.Fatal(err)
	}
	e = saved.Data
	eventIDs = append(eventIDs, e.ID)
	path := fmt.Sprintf("/api/ai-salon/events/%d", e.ID)
	rosterPath := fmt.Sprintf("%s/%d/roster", adminPath, e.ID)
	exportPath := fmt.Sprintf("%s/%d/export", adminPath, e.ID)
	expect(request("GET", path, nil, -1, ""), 200)
	for _, actor := range []int{-1, 0, 1} {
		status := 403
		if actor < 0 {
			status = 401
		}
		for _, p := range []string{adminPath, rosterPath, exportPath} {
			expect(request("GET", p, nil, actor, ""), status)
		}
		for _, method := range []string{"PUT", "DELETE"} {
			expect(request(method, fmt.Sprintf("%s/%d", adminPath, e.ID), e, actor, "http://salon.test"), status)
		}
	}
	p := model.AcademicInfo{RealName: "测试同学", College: "未收录学院", Grade: "2026", StudentID: "API001", Campus: "南岭", Gender: 1}
	if err := db.Model(&model.User{}).Where("id = ?", users[0].ID).Updates(map[string]any{"real_name": p.RealName, "college": p.College, "grade": p.Grade, "student_id": p.StudentID, "is_student": true}).Error; err != nil {
		t.Fatal(err)
	}
	expect(request("POST", path+"/registration", p, -1, "http://salon.test"), 401)
	expect(request("POST", path+"/registration", p, 0, "https://attacker.test"), 403)
	// Submitted actor/status/email properties cannot affect another user's state.
	payload := map[string]any{"realName": "伪造姓名", "college": "伪造学院", "grade": "伪造年级", "studentId": "SPOOF", "campus": p.Campus, "gender": p.Gender, "userId": users[3].ID, "status": "registered", "checkedInAt": now, "email": "spoof@tarsgo.test"}
	expect(request("POST", path+"/registration", payload, 0, "http://salon.test"), 200)
	w = request("GET", "/api/ai-salon/registrations", nil, 3, "")
	expect(w, 200)
	if !strings.Contains(w.Body.String(), `"data":[]`) {
		t.Fatal("other user's registration leaked", w.Body.String())
	}
	expect(request("DELETE", path+"/registration", nil, 3, "http://salon.test"), 409)
	expect(request("POST", path+"/check-in", nil, 3, "http://salon.test"), 409)
	w = request("GET", "/api/ai-salon/registrations?userId="+fmt.Sprint(users[0].ID), nil, 3, "")
	expect(w, 200)
	if strings.Contains(w.Body.String(), p.StudentID) {
		t.Fatal("query actor override")
	}
	w = request("GET", path, nil, -1, "")
	expect(w, 200)
	for _, key := range []string{"registered", "waitlisted", "email", "capacity", "studentId"} {
		if strings.Contains(w.Body.String(), `"`+key+`"`) {
			t.Fatal("public data leak")
		}
	}
	var r model.AISalonRegistration
	db.Where("event_id = ?", e.ID).First(&r)
	if r.UserID != users[0].ID || r.Email != users[0].Email || r.StudentID != p.StudentID || r.RealName != p.RealName || r.CheckedInAt != nil {
		t.Fatal("actor spoof accepted")
	}
	expect(request("GET", rosterPath, nil, 2, ""), 200)
	w = request("GET", exportPath, nil, 2, "")
	expect(w, 200)
	if !strings.Contains(w.Body.String(), p.StudentID) || !strings.Contains(w.Header().Get("Content-Type"), "text/csv") {
		t.Fatal("CSV export incomplete")
	}
	// No administrative endpoint can edit registration or check-in state.
	for _, method := range []string{"PUT", "PATCH", "POST"} {
		w = request(method, fmt.Sprintf("%s/%d/registrations/%d", adminPath, e.ID, r.ID), map[string]any{"status": aisalon.Registered}, 2, "http://salon.test")
		if w.Code != 404 {
			t.Fatalf("admin status mutation route exists: %d", w.Code)
		}
	}
	// Anonymous readers can get the meeting entry without a registration.
	online := model.AISalonEvent{Title: "[TEST] Online salon", Summary: "Online", Location: "腾讯会议", Online: true, Published: true, StartAt: now.Add(time.Hour), EndAt: now.Add(2 * time.Hour)}
	w = request("POST", adminPath, online, 2, "http://salon.test")
	expect(w, 200)
	if err := json.Unmarshal(w.Body.Bytes(), &saved); err != nil {
		t.Fatal(err)
	}
	online = saved.Data
	eventIDs = append(eventIDs, online.ID)
	onlinePath := fmt.Sprintf("/api/ai-salon/events/%d", online.ID)
	expect(request("GET", onlinePath, nil, -1, ""), 200)
	online.MeetingURL = "https://meeting.tencent.com/dm/example?x=1&y=2"
	expect(request("PUT", fmt.Sprintf("%s/%d", adminPath, online.ID), online, 2, "http://salon.test"), 200)
	w = request("GET", onlinePath, nil, -1, "")
	expect(w, 200)
	var publicBody struct {
		Data aisalon.PublicEvent `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &publicBody); err != nil || publicBody.Data.MeetingURL != online.MeetingURL || publicBody.Data.RegistrationOpen {
		t.Fatalf("anonymous online entry: %s", w.Body)
	}
	expect(request("POST", onlinePath+"/registration", nil, 0, "http://salon.test"), 409)
	// A plain account with no group membership can still manage its own profile.
	expect(request("PUT", "/api/ai-salon/profile", p, 3, "http://salon.test"), 404)
	expect(request("GET", "/api/me/profile", nil, 3, ""), 200)
	var groupCount int64
	db.Model(&model.UserGroupMember{}).Where("user_id = ?", users[0].ID).Count(&groupCount)
	if groupCount != 0 {
		t.Fatal("salon granted internal membership")
	}
	expect(request("DELETE", fmt.Sprintf("%s/%d", adminPath, e.ID), nil, 2, "http://salon.test"), 200)
	expect(request("GET", path, nil, -1, ""), 404)
}
