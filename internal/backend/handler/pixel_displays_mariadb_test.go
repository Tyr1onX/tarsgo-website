package handler

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"tarsgo-backend/model"
	"tarsgo-backend/service/auth"
)

func TestMariaDBPixelCollections(t *testing.T) {
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
	const owner, other = 9019801, 9019802
	cleanup := func() {
		for _, m := range []any{&model.PixelDisplay{}, &model.PixelItem{}, &model.PixelHome{}, &model.PixelPlant{}, &model.PixelPet{}, &model.PixelFoodUse{}, &model.PixelAchievement{}} {
			if err := db.Where("user_id IN ?", []int{owner, other}).Delete(m).Error; err != nil {
				t.Error(err)
			}
		}
	}
	cleanup()
	t.Cleanup(cleanup)
	h := NewPixelHomeHandler(db)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		id := uint64(owner)
		switch c.GetHeader("X-Fixture") {
		case "guest":
			return
		case "other":
			id = other
		}
		c.Set("sessionUser", &auth.SessionUser{ID: id})
	})
	r.GET("/me", h.Mine)
	r.PUT("/me", h.Save)
	r.POST("/display", h.DisplayItem)
	r.GET("/items", h.Items)
	r.POST("/release", h.Release)
	r.POST("/combine", h.Combine)
	r.POST("/invite", h.Invite)
	r.GET("/visit", h.Visit)
	r.DELETE("/invite", h.Revoke)
	r.POST("/earn", h.Earn)
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
	expect := func(method, path, body, account string, want int) json.RawMessage {
		t.Helper()
		status, data := request(method, path, body, account)
		if status != want {
			t.Fatalf("%s %s %s got %d want %d %s", method, path, body, status, want, data)
		}
		return data
	}
	action := func(id, target, mode string, slot int, rev uint64) string {
		return fmt.Sprintf(`{"owner":%d,"id":%q,"target":%q,"mode":%q,"slot":%d,"revision":%d}`, owner, id, target, mode, slot, rev)
	}
	type inventoryRow struct {
		model.PixelItem
		Available uint64
		Displayed uint64
	}
	inventory := func(id string) inventoryRow {
		t.Helper()
		var rows []inventoryRow
		if err := json.Unmarshal(expect("GET", "/items", "", "", 200), &rows); err != nil {
			t.Fatal(err)
		}
		for _, r := range rows {
			if r.ItemID == id {
				return r
			}
		}
		t.Fatalf("missing %s", id)
		return inventoryRow{}
	}
	expect("PUT", "/me", `{"furniture":[{"kind":"desk","x":4,"y":8},{"id":"tank","kind":"aquarium-large","x":10,"y":11},{"id":"cabinet","kind":"cabinet","x":14,"y":11}]}`, "", 200)
	expect("PUT", "/me", `{"revision":0,"furniture":[]}`, "", 409)
	for _, id := range []string{"crucian", "wrench", "weed"} {
		if err := db.Create(&model.PixelItem{UserID: owner, ItemID: id, Quantity: 1, Revision: 1}).Error; err != nil {
			t.Fatal(err)
		}
	}
	expect("POST", "/display", action("crucian", "tank", "place", 0, 1), "guest", 401)
	expect("POST", "/display", action("crucian", "tank", "place", 0, 1), "other", 400)
	expect("POST", "/display", action("crucian", "cabinet", "place", 0, 1), "", 409)
	var wg sync.WaitGroup
	statuses := make(chan int, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(slot int) {
			defer wg.Done()
			s, _ := request("POST", "/display", action("crucian", "tank", "place", slot, 1), "")
			statuses <- s
		}(i)
	}
	wg.Wait()
	close(statuses)
	counts := map[int]int{}
	for s := range statuses {
		counts[s]++
	}
	if counts[200] != 1 || counts[409] != 1 {
		t.Fatal("concurrent placement", counts)
	}
	fish := inventory("crucian")
	if fish.Quantity != 1 || fish.Available != 0 || fish.Displayed != 1 || fish.Revision != 2 {
		t.Fatal("reservation", fish)
	}
	expect("POST", "/release", action("crucian", "", "", 0, 2), "", 409)
	var displays []model.PixelDisplay
	if err := db.Where("user_id = ?", owner).Find(&displays).Error; err != nil || len(displays) != 1 {
		t.Fatal(displays, err)
	}
	slot := displays[0].Slot
	expect("POST", "/display", action("weed", "tank", "place", 4, 1), "", 200)
	expect("POST", "/display", action("wrench", "furniture-desk-4-8", "place", 0, 1), "", 200)
	expect("POST", "/combine", action("wrench", "workbench", "", 0, 2), "", 409)
	expect("PUT", "/me", `{"revision":1,"showPet":true,"furniture":[{"id":"furniture-desk-4-8","kind":"desk","x":5,"y":8},{"id":"tank","kind":"aquarium-large","x":11,"y":11},{"id":"cabinet","kind":"cabinet","x":15,"y":11}]}`, "", 200)
	if err := db.Create(&model.PixelPet{UserID: owner, Name: "小七", Species: "cat", Variant: "orange", Mode: "home", Revision: 1}).Error; err != nil {
		t.Fatal(err)
	}
	var invitation struct{ Token string }
	if err := json.Unmarshal(expect("POST", "/invite", "", "", 200), &invitation); err != nil {
		t.Fatal(err)
	}
	data := expect("GET", "/visit?token="+invitation.Token, "", "guest", 200)
	var guest struct {
		Displays []model.PixelDisplay
		Pet      map[string]any
	}
	if err := json.Unmarshal(data, &guest); err != nil || len(guest.Displays) != 3 || guest.Pet["name"] != "小七" {
		t.Fatal("public snapshot", string(data), err)
	}
	if strings.Contains(string(data), `"quantity"`) || strings.Contains(string(data), `"available"`) || strings.Contains(string(data), `"showPet"`) {
		t.Fatal("private state leaked", string(data))
	}
	if string(expect("GET", "/items", "", "other", 200)) != "[]" {
		t.Fatal("cross account inventory")
	}
	expect("POST", "/display", action("crucian", "tank", "take", slot, 2), "", 200)
	if fish = inventory("crucian"); fish.Available != 1 || fish.Displayed != 0 || fish.Quantity != 1 {
		t.Fatal("take", fish)
	}
	expect("POST", "/display", action("crucian", "tank", "place", slot, 3), "", 200)
	expect("POST", "/display", action("crucian", "tank", "release", slot, 4), "", 200)
	expect("POST", "/display", action("crucian", "tank", "release", slot, 4), "", 409)
	if fish = inventory("crucian"); fish.Quantity != 0 || fish.Available != 0 || fish.Displayed != 0 {
		t.Fatal("release", fish)
	}
	expect("PUT", "/me", `{"revision":2,"furniture":[]}`, "", 200)
	for _, id := range []string{"wrench", "weed"} {
		row := inventory(id)
		if row.Quantity != 1 || row.Available != 1 || row.Displayed != 0 {
			t.Fatal("delete restored", row)
		}
	}
	data = expect("GET", "/visit?token="+invitation.Token, "", "guest", 200)
	if !strings.Contains(string(data), `"pet":null`) {
		t.Fatal("pet privacy", string(data))
	}
	expect("POST", "/combine", action("wrench", "workbench", "", 0, 2), "", 200)
	expect("POST", "/earn", `{"id":"assembly-guodong"}`, "", 200)
	expect("POST", "/earn", `{"id":"assembly-guodong"}`, "", 200)
	if row := inventory("robot-model"); row.Quantity != 1 || row.Available != 1 {
		t.Fatal("robot model duplicated", row)
	}
	expect("DELETE", "/invite", "", "", 200)
	expect("GET", "/visit?token="+invitation.Token, "", "guest", 404)
}
