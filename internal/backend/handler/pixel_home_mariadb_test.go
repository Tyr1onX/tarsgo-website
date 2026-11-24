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
	h := NewPixelHomeHandler(tx)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set("sessionUser", &auth.SessionUser{ID: user.ID}); c.Next() })
	r.GET("/me", h.Mine)
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
			Data map[string]json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		return response.Data
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
	request(http.MethodPut, "/me", `{"furniture":`+next+`}`, 200)
	request(http.MethodPut, "/me", `{"furniture":[{"kind":"desk","x":4,"y":8},{"kind":"chair","x":5,"y":9}]}`, 400)
	if string(request(http.MethodGet, "/visit?token="+token, "", 200)["furniture"]) != next {
		t.Fatal("invite must preserve updated layout")
	}
	var home model.PixelHome
	if err := tx.Where("user_id = ?", user.ID).First(&home).Error; err != nil || len(home.InviteHash) != 64 || home.InviteHash == token {
		t.Fatal("invite must store only its hash")
	}
	request(http.MethodDelete, "/invite", "", 200)
	request(http.MethodGet, "/visit?token="+token, "", 404)
	if string(request(http.MethodGet, "/me", "", 200)["furniture"]) != next {
		t.Fatal("revoking invite removed furniture")
	}
}
