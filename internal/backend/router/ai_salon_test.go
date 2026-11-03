package router

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
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
	expect := func(w *httptest.ResponseRecorder, status int) {
		t.Helper()
		if w.Code != status {
			t.Fatalf("status %d expected %d: %s", w.Code, status, w.Body.String())
		}
	}
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
	expect(request("POST", path+"/registration", p, -1, "http://salon.test"), 401)
	expect(request("POST", path+"/registration", p, 0, "https://attacker.test"), 403)
	// Submitted actor/status/email properties cannot affect another user's state.
	payload := map[string]any{"realName": p.RealName, "college": p.College, "grade": p.Grade, "studentId": p.StudentID, "campus": p.Campus, "gender": p.Gender, "userId": users[3].ID, "status": "registered", "checkedInAt": now, "email": "spoof@tarsgo.test"}
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
	if r.UserID != users[0].ID || r.Email != users[0].Email || r.CheckedInAt != nil {
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
	// A plain account with no group membership can still manage its own profile.
	expect(request("PUT", "/api/ai-salon/profile", p, 3, "http://salon.test"), 200)
	var groupCount int64
	db.Model(&model.UserGroupMember{}).Where("user_id = ?", users[0].ID).Count(&groupCount)
	if groupCount != 0 {
		t.Fatal("salon granted internal membership")
	}
	expect(request("DELETE", fmt.Sprintf("%s/%d", adminPath, e.ID), nil, 2, "http://salon.test"), 200)
	expect(request("GET", path, nil, -1, ""), 404)
}
