package handler

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"tarsgo-backend/model"
	"tarsgo-backend/service/auth"
)

func TestMariaDBPixelFishing(t *testing.T) {
	dsn := os.Getenv("TARSGO_INTEGRATION_MYSQL_DSN")
	if dsn == "" {
		t.Skip("isolated MariaDB DSN not set")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("requires isolated MariaDB")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	// Synthetic account keys keep the simultaneous transactions independent of other fixtures.
	const owner, other = 9019501, 9019502
	for _, m := range []any{&model.PixelItem{}, &model.PixelCast{}} {
		if err := db.Where("user_id IN ?", []int{owner, other}).Delete(m).Error; err != nil {
			t.Fatal(err)
		}
	}
	h := NewPixelHomeHandler(db)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		id := uint64(owner)
		if c.GetHeader("X-Fixture") == "other" {
			id = other
		}
		c.Set("sessionUser", &auth.SessionUser{ID: id})
	})
	r.POST("/cast", h.Cast)
	r.POST("/reel", h.Reel)
	r.POST("/release", h.Release)
	r.GET("/items", h.Items)
	request := func(method, path, body, account string) (int, json.RawMessage) {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Fixture", account)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		var envelope struct{ Data json.RawMessage }
		if err := json.Unmarshal(rec.Body.Bytes(), &envelope); err != nil {
			t.Error(err)
		}
		return rec.Code, envelope.Data
	}
	castBody := fmt.Sprintf(`{"owner":%d,"pond":2}`, owner)
	if status, _ := request("POST", "/cast", castBody, "other"); status != 400 {
		t.Fatal("stale account action", status)
	}
	if status, _ := request("POST", "/cast", fmt.Sprintf(`{"owner":%d,"pond":52}`, owner), ""); status != 400 {
		t.Fatal("invalid pond", status)
	}
	status, body := request("POST", "/cast", castBody, "")
	var cast struct{ Token string }
	if status != 200 || json.Unmarshal(body, &cast) != nil || cast.Token == "" {
		t.Fatal("cast", status, string(body))
	}
	reelBody := fmt.Sprintf(`{"owner":%d,"token":%q}`, owner, cast.Token)
	if status, _ := request("POST", "/reel", reelBody, ""); status != 425 {
		t.Fatal("early reel", status)
	}
	if status, _ := request("POST", "/reel", fmt.Sprintf(`{"owner":%d,"token":%q}`, other, cast.Token), "other"); status != 409 {
		t.Fatal("foreign cast", status)
	}
	if err := db.Model(&model.PixelCast{}).Where("user_id = ?", owner).Update("ready_at", time.Now().UnixMilli()-1).Error; err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	for i := 0; i < 6; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if status, _ := request("POST", "/reel", reelBody, ""); status != 200 {
				t.Error("reel", status)
			}
		}()
	}
	wg.Wait()
	status, body = request("GET", "/items", "", "")
	var rows []model.PixelItem
	if status != 200 || json.Unmarshal(body, &rows) != nil || len(rows) != 1 || rows[0].Quantity != 1 {
		t.Fatal("reel replay", string(body))
	}
	if _, body = request("GET", "/items", "", "other"); string(body) != "[]" {
		t.Fatal("inventory isolation", string(body))
	}
	item := model.PixelItem{UserID: other, ItemID: "crucian", Quantity: 1, Revision: 1}
	if err := db.Create(&item).Error; err != nil {
		t.Fatal(err)
	}
	release := fmt.Sprintf(`{"owner":%d,"id":"crucian","revision":1}`, other)
	statuses := make(chan int, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); s, _ := request("POST", "/release", release, "other"); statuses <- s }()
	}
	wg.Wait()
	close(statuses)
	counts := map[int]int{}
	for s := range statuses {
		counts[s]++
	}
	if counts[200] != 1 || counts[409] != 1 {
		t.Fatal("release replay", counts)
	}
	if _, body = request("GET", "/items", "", "other"); json.Unmarshal(body, &rows) != nil || len(rows) != 1 || rows[0].Quantity != 0 || rows[0].Revision != 2 {
		t.Fatal("lost discovery", string(body))
	}
}
