package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"tarsgo-backend/model"
	"tarsgo-backend/service/auth"
)

func TestMariaDBPixelHomePersistence(t *testing.T) {
	dsn := os.Getenv("TARSGO_INTEGRATION_MYSQL_DSN")
	if dsn == "" {
		t.Skip("isolated MariaDB DSN not set")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("refusing non-isolated database")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	tx := db.Begin()
	if tx.Error != nil {
		t.Fatal(tx.Error)
	}
	defer tx.Rollback()
	var user model.User
	if err = tx.First(&user).Error; err != nil {
		t.Fatal(err)
	}
	if err = tx.Where("user_id = ?", user.ID).Delete(&model.PixelHome{}).Error; err != nil {
		t.Fatal(err)
	}
	if err = tx.Where("user_id = ?", user.ID).Delete(&model.PixelAchievement{}).Error; err != nil {
		t.Fatal(err)
	}
	var other model.User
	if err = tx.Where("id <> ?", user.ID).First(&other).Error; err != nil {
		t.Fatal(err)
	}
	if err = tx.Where("user_id = ?", other.ID).Delete(&model.PixelAchievement{}).Error; err != nil {
		t.Fatal(err)
	}
	activeID := user.ID
	h := NewPixelHomeHandler(tx)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		if activeID != 0 {
			c.Set("sessionUser", &auth.SessionUser{ID: activeID})
		}
		c.Next()
	})
	r.GET("/me", h.Mine)
	r.GET("/achievements", h.Achievements)
	r.POST("/achievements", h.Earn)
	r.PUT("/achievements/display", h.DisplayAchievement)
	r.PUT("/me", h.Save)
	r.POST("/invite", h.Invite)
	r.DELETE("/invite", h.Revoke)
	r.GET("/visit", h.Visit)
	request := func(method, path, body string, want int) map[string]json.RawMessage {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != want {
			t.Fatalf("%s %s: status %d, want %d: %s", method, path, rec.Code, want, rec.Body.String())
		}
		var response struct {
			Data json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		if strings.HasPrefix(string(response.Data), "[") {
			return map[string]json.RawMessage{"rows": response.Data}
		}
		var obj map[string]json.RawMessage
		if len(response.Data) > 0 && string(response.Data) != "null" {
			if err := json.Unmarshal(response.Data, &obj); err != nil {
				t.Fatal(err)
			}
		}
		return obj
	}
	if string(request(http.MethodGet, "/me", "", 200)["furniture"]) != "[]" {
		t.Fatal("new room not empty")
	}
	layout := `[{"kind":"desk","x":4,"y":8},{"kind":"chair","x":9,"y":10}]`
	request(http.MethodPut, "/me", `{"furniture":`+layout+`}`, 200)
	if string(request(http.MethodGet, "/me", "", 200)["furniture"]) != layout {
		t.Fatal("saved room did not reload")
	}
	var token string
	if err := json.Unmarshal(request(http.MethodPost, "/invite", "", 200)["token"], &token); err != nil || len(token) != 43 {
		t.Fatal("invite generation failed")
	}
	if string(request(http.MethodGet, "/visit?token="+token, "", 200)["furniture"]) != layout {
		t.Fatal("invite did not return saved layout")
	}
	next := `[{"kind":"plant","x":12,"y":12}]`
	request(http.MethodPut, "/me", `{"revision":1,"furniture":`+next+`}`, 200)
	request(http.MethodPut, "/me", `{"furniture":[{"kind":"desk","x":4,"y":8},{"kind":"chair","x":5,"y":9}]}`, 400)
	if string(request(http.MethodGet, "/visit?token="+token, "", 200)["furniture"]) != next {
		t.Fatal("invite must preserve updated layout")
	}
	var home model.PixelHome
	if err := tx.Where("user_id = ?", user.ID).First(&home).Error; err != nil || len(home.InviteHash) != 64 || home.InviteHash == token {
		t.Fatal("invite must store only its hash")
	}
	// Owner-scoped achievements are deduplicated and independent of furniture.
	request(http.MethodPost, "/achievements", `{"id":"assembly-guodong"}`, 200)
	request(http.MethodPost, "/achievements", `{"id":"assembly-guodong"}`, 200)
	request(http.MethodPost, "/achievements", `{"id":"unknown"}`, 400)
	request(http.MethodPut, "/achievements/display", `{"id":"vision","displayed":true}`, 404)
	var rows []pixelAchievementView
	if err := json.Unmarshal(request(http.MethodGet, "/achievements", "", 200)["rows"], &rows); err != nil || len(rows) != 1 || rows[0].Displayed {
		t.Fatal("duplicate or incorrect default visibility")
	}
	if string(request(http.MethodGet, "/visit?token="+token, "", 200)["achievements"]) != "[]" {
		t.Fatal("private souvenir leaked")
	}
	request(http.MethodPut, "/achievements/display", `{"id":"assembly-guodong","displayed":true}`, 200)
	if err := json.Unmarshal(request(http.MethodGet, "/visit?token="+token, "", 200)["achievements"], &rows); err != nil || len(rows) != 1 || !rows[0].Displayed {
		t.Fatal("visitor missing shared souvenir")
	}
	activeID = other.ID
	request(http.MethodPut, "/achievements/display", `{"id":"assembly-guodong","displayed":false}`, 404)
	if string(request(http.MethodGet, "/achievements", "", 200)["rows"]) != "[]" {
		t.Fatal("cross-account souvenir leak")
	}
	activeID = 0
	request(http.MethodPost, "/achievements", `{"id":"planning"}`, 401)
	activeID = user.ID
	request(http.MethodPut, "/achievements/display", `{"id":"assembly-guodong","displayed":false}`, 200)
	if string(request(http.MethodGet, "/visit?token="+token, "", 200)["achievements"]) != "[]" {
		t.Fatal("hidden souvenir leaked")
	}
	if string(request(http.MethodGet, "/me", "", 200)["furniture"]) != next {
		t.Fatal("achievement modified furniture")
	}

	request(http.MethodDelete, "/invite", "", 200)
	request(http.MethodGet, "/visit?token="+token, "", 404)
	if string(request(http.MethodGet, "/me", "", 200)["furniture"]) != next {
		t.Fatal("revoking invite removed furniture")
	}
}
