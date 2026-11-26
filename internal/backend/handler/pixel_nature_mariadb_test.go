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

func TestMariaDBPixelNature(t *testing.T) {
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
	const owner, other = 9019701, 9019702
	for _, m := range []any{&model.PixelGather{}, &model.PixelPlant{}, &model.PixelFoodUse{}, &model.PixelItem{}, &model.PixelHome{}} {
		if err = db.Where("user_id IN ?", []int{owner, other}).Delete(m).Error; err != nil {
			t.Fatal(err)
		}
	}
	h := NewPixelHomeHandler(db)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		if c.GetHeader("X-Fixture") == "guest" {
			return
		}
		id := uint64(owner)
		if c.GetHeader("X-Fixture") == "other" {
			id = other
		}
		c.Set("sessionUser", &auth.SessionUser{ID: id})
	})
	r.POST("/collect", h.Collect)
	r.GET("/gathered", h.Gathered)
	r.POST("/sow", h.Sow)
	r.POST("/plant", h.Plant)
	r.POST("/combine", h.Combine)
	r.GET("/items", h.Items)
	r.GET("/me", h.Mine)
	r.PUT("/me", h.Save)
	r.POST("/invite", h.Invite)
	r.GET("/visit", h.Visit)
	request := func(method, path, body, account string) (int, json.RawMessage) {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Fixture", account)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		var response struct{ Data json.RawMessage }
		if e := json.Unmarshal(rec.Body.Bytes(), &response); e != nil {
			t.Error(e)
		}
		return rec.Code, response.Data
	}
	body := func(fields string) string { return fmt.Sprintf(`{"owner":%d,%s}`, owner, fields) }
	expect := func(method, path, body, account string, want int) json.RawMessage {
		t.Helper()
		code, data := request(method, path, body, account)
		if code != want {
			t.Fatalf("%s %s status=%d want=%d data=%s", method, path, code, want, data)
		}
		return data
	}
	collect := func(id string, revision int, source string) string {
		return body(fmt.Sprintf(`"id":%q,"revision":%d,"target":%q`, id, revision, source))
	}
	assertItem := func(id string, quantity, revision uint64) {
		t.Helper()
		var row model.PixelItem
		if e := db.Where("user_id = ? AND item_id = ?", owner, id).Take(&row).Error; e != nil || row.Quantity != quantity || row.Revision != revision {
			t.Fatalf("inventory %s: %+v %v", id, row, e)
		}
	}
	race := func(path, body string, wantSuccess int) {
		t.Helper()
		var wg sync.WaitGroup
		codes := make(chan int, 6)
		for i := 0; i < 6; i++ {
			wg.Add(1)
			go func() { defer wg.Done(); s, _ := request("POST", path, body, ""); codes <- s }()
		}
		wg.Wait()
		close(codes)
		success := 0
		for s := range codes {
			if s == 200 {
				success++
			} else if s != 409 {
				t.Errorf("race %s unexpected %d", path, s)
			}
		}
		if success != wantSuccess {
			t.Fatalf("race %s got %d successes, expected %d", path, success, wantSuccess)
		}
	}
	t.Run("source revision cooldown and account isolation", func(t *testing.T) {
		a := collect("daisy-seed", 0, "daisy-seed:0")
		expect("POST", "/collect", a, "guest", 401)
		expect("POST", "/collect", a, "other", 400)
		expect("POST", "/collect", collect("daisy-seed", 0, "pinecone:0"), "", 400)
		expect("POST", "/collect", collect("flowerpot", 0, "flowerpot:0"), "", 400)
		race("/collect", a, 1)
		assertItem("daisy-seed", 1, 1)
		expect("POST", "/collect", collect("daisy-seed", 1, "daisy-seed:0"), "", 409)
		expect("POST", "/collect", collect("daisy-seed", 0, "daisy-seed:1"), "", 409)
		expect("POST", "/collect", collect("daisy-seed", 1, "daisy-seed:1"), "", 200)
		assertItem("daisy-seed", 2, 2)
		var rows []model.PixelGather
		if e := json.Unmarshal(expect("GET", "/gathered", "", "", 200), &rows); e != nil || len(rows) != 2 {
			t.Fatal("gather cooldown", rows, e)
		}
		if string(expect("GET", "/gathered", "", "other", 200)) != "[]" {
			t.Fatal("cooldown leaked")
		}
		if e := db.Model(&model.PixelGather{}).Where("user_id = ?", owner).Update("next_at", time.Now().UnixMilli()-1).Error; e != nil {
			t.Fatal(e)
		}
		expect("POST", "/collect", collect("daisy-seed", 2, "daisy-seed:0"), "", 409)
		assertItem("daisy-seed", 2, 2)
	})
	t.Run("study sow water move harvest replay and visitor isolation", func(t *testing.T) {
		expect("PUT", "/me", `{"furniture":[{"kind":"desk","x":4,"y":8}]}`, "", 200)
		sow := body(`"id":"daisy-seed","revision":2,"mode":"study","x":8,"y":9`)
		expect("POST", "/sow", body(`"id":"daisy-seed","revision":2,"mode":"study","x":4,"y":8`), "", 409)
		race("/sow", sow, 6)
		assertItem("daisy-seed", 1, 3)
		expect("POST", "/sow", body(`"id":"daisy-seed","revision":2,"mode":"study","x":9,"y":9`), "", 409)
		id := "daisy-seed:2"
		plant := func(mode string, revision int, x, y int) string {
			return body(fmt.Sprintf(`"id":%q,"mode":%q,"revision":%d,"x":%d,"y":%d`, id, mode, revision, x, y))
		}
		expect("POST", "/plant", plant("water", 1, 0, 0), "other", 400)
		expect("POST", "/plant", fmt.Sprintf(`{"owner":%d,"id":%q,"mode":"water","revision":1}`, other, id), "other", 409)
		expect("POST", "/plant", plant("harvest", 1, 0, 0), "", 409)
		race("/plant", plant("water", 1, 0, 0), 6)
		var saved model.PixelPlant
		if e := db.Where("user_id = ? AND id = ?", owner, id).Take(&saved).Error; e != nil || saved.WateredAt <= 0 || saved.Revision != 2 {
			t.Fatal("water persistence", saved, e)
		}
		expect("POST", "/plant", plant("move", 2, 4, 8), "", 409)
		race("/plant", plant("move", 2, 10, 10), 6)
		expect("POST", "/plant", plant("move", 2, 11, 10), "", 409)
		expect("PUT", "/me", `{"furniture":[{"kind":"chair","x":10,"y":10}]}`, "", 409)
		var home struct {
			Furniture []pixelFurniture
			Plants    []model.PixelPlant
		}
		if e := json.Unmarshal(expect("GET", "/me", "", "", 200), &home); e != nil || len(home.Furniture) != 1 || len(home.Plants) != 1 || home.Plants[0].X != 10 || home.Plants[0].WateredAt != saved.WateredAt {
			t.Fatal("study reload", home, e)
		}
		var invite struct{ Token string }
		if e := json.Unmarshal(expect("POST", "/invite", "", "", 200), &invite); e != nil || invite.Token == "" {
			t.Fatal("invite", e)
		}
		var guest struct{ Plants []model.PixelPlant }
		if e := json.Unmarshal(expect("GET", "/visit?token="+invite.Token, "", "guest", 200), &guest); e != nil || len(guest.Plants) != 1 || guest.Plants[0].X != 10 {
			t.Fatal("visitor", guest, e)
		}
		expect("POST", "/plant", plant("water", 3, 0, 0), "guest", 401)
		expect("POST", "/plant", plant("harvest", 3, 0, 0), "", 409)
		if e := db.Model(&model.PixelPlant{}).Where("user_id = ? AND id = ?", owner, id).Update("watered_at", time.Now().UnixMilli()-plantBloomMillis-10).Error; e != nil {
			t.Fatal(e)
		}
		race("/plant", plant("harvest", 3, 0, 0), 6)
		assertItem("daisy-flower", 1, 1)
		expect("POST", "/sow", sow, "", 409)
		if e := json.Unmarshal(expect("GET", "/me", "", "", 200), &home); e != nil || len(home.Plants) != 0 || len(home.Furniture) != 1 {
			t.Fatal("harvest reload", home, e)
		}
		public := body(`"id":"daisy-seed","revision":3,"mode":"public","x":60,"y":62`)
		race("/sow", public, 6)
		assertItem("daisy-seed", 0, 4)
		var n int64
		if e := db.Model(&model.PixelPlant{}).Where("user_id = ? AND harvested = ?", owner, false).Count(&n).Error; e != nil || n != 0 {
			t.Fatal("public plant persisted", n, e)
		}
	})
	t.Run("workbench conversion and replay", func(t *testing.T) {
		if e := db.Create(&model.PixelItem{UserID: owner, ItemID: "wrench", Quantity: 1, Revision: 1}).Error; e != nil {
			t.Fatal(e)
		}
		repair := body(`"id":"wrench","revision":1,"target":"workbench"`)
		expect("POST", "/combine", repair, "other", 400)
		race("/combine", repair, 6)
		assertItem("wrench", 0, 2)
		assertItem("clean-wrench", 1, 1)
		expect("POST", "/combine", body(`"id":"wrench","revision":2,"target":"workbench"`), "", 409)
		if string(expect("GET", "/items", "", "other", 200)) != "[]" {
			t.Fatal("inventory leaked")
		}
		expect("POST", "/collect", collect("pinecone", 0, "pinecone:0"), "", 200)
		race("/combine", body(`"id":"pinecone","revision":1,"target":"open"`), 6)
		assertItem("pinecone", 0, 2)
		assertItem("pine-nut", 1, 1)
	})
}
