package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"tarsgo-backend/middleware"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"tarsgo-backend/model"
)

const plantBloomMillis = 24000

var errPlantPosition = errors.New("这个位置不能种植")
var errPlantGrowing = errors.New("植物还没有开花")
var errSourceCooling = errors.New("这处物件还没有重新出现")

func flowerFor(seed string) string {
	switch seed {
	case "daisy-seed":
		return "daisy-flower"
	case "cornflower-seed":
		return "cornflower-flower"
	}
	return ""
}

func grantPixelItem(tx *gorm.DB, owner uint64, id string) error {
	return tx.Clauses(clause.OnConflict{DoUpdates: clause.Assignments(map[string]any{"quantity": gorm.Expr("quantity + 1"), "revision": gorm.Expr("revision + 1")})}).Create(&model.PixelItem{UserID: owner, ItemID: id, Quantity: 1, Revision: 1}).Error
}

// A consumed revision is unique across feeding, sowing and repair. The callback
// runs once, in the same transaction as the inventory debit and receipt.
func consumePixelItem(tx *gorm.DB, a pixelItemAction, kind, target string, use func() error) error {
	if _, err := lockPixelHome(tx, a.Owner); err != nil {
		return err
	}
	var row model.PixelItem
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ? AND item_id = ?", a.Owner, a.ID).Take(&row).Error; err != nil {
		return err
	}
	var receipt model.PixelFoodUse
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ? AND item_id = ? AND revision = ?", a.Owner, a.ID, a.Revision).Take(&receipt).Error
	if err == nil {
		if receipt.Species == kind && receipt.Target == target {
			return nil
		}
		return errPixelChanged
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	available, err := pixelAvailable(tx, row)
	if err != nil {
		return err
	}
	if a.Revision == 0 || row.Revision != a.Revision || available == 0 {
		return errPixelChanged
	}
	if err = use(); err != nil {
		return err
	}
	if err = tx.Model(&row).Updates(map[string]any{"quantity": gorm.Expr("quantity - 1"), "revision": gorm.Expr("revision + 1")}).Error; err != nil {
		return err
	}
	return tx.Create(&model.PixelFoodUse{UserID: a.Owner, ItemID: a.ID, Revision: a.Revision, Species: kind, Target: target}).Error
}

func natureResult(c *gin.Context, err error, data any) {
	switch {
	case errors.Is(err, errPixelChanged), errors.Is(err, gorm.ErrRecordNotFound):
		writeAPIError(c, 409, errPixelChanged.Error())
	case errors.Is(err, errPlantPosition), errors.Is(err, errPlantGrowing), errors.Is(err, errSourceCooling):
		writeAPIError(c, 409, err.Error())
	case err != nil:
		writeAPIError(c, 500, "操作未确认，请重试")
	default:
		writeAPI(c, 200, "操作成功", data)
	}
}

func (h *PixelHomeHandler) Combine(c *gin.Context) {
	a, ok := pixelAction(c)
	if !ok {
		return
	}
	var output string
	switch {
	case a.ID == "wrench" && a.Target == "workbench":
		output = "clean-wrench"
	case a.ID == "wheel" && a.Target == "workbench":
		output = "clean-wheel"
	case a.ID == "pinecone" && a.Target == "open":
		output = "pine-nut"
	default:
		writeAPIError(c, 400, "不能这样组合")
		return
	}
	err := h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		return consumePixelItem(tx, a, "combine", a.Target, func() error { return grantPixelItem(tx, a.Owner, output) })
	})
	natureResult(c, err, gin.H{"id": output})
}

// Lock the study layout row before checking either furniture or plants. Both
// writes take this lock, so concurrent tabs cannot create overlapping objects.
func lockPixelHome(tx *gorm.DB, owner uint64) (model.PixelHome, error) {
	home := model.PixelHome{UserID: owner, Layout: "[]", UpdatedAt: time.Now().UTC()}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&home).Error; err != nil {
		return home, err
	}
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", owner).Take(&home).Error
	return home, err
}

func plantFitsFurniture(x, y int, furniture []pixelFurniture) bool {
	if x < 2 || x >= 34 || y < 7 || y >= 19 || (x >= 15 && x <= 20 && y >= 18) {
		return false
	}
	for _, f := range furniture {
		w, h := pixelFurnitureSize(f.Kind)
		if x >= f.X && x < f.X+w && y >= f.Y && y < f.Y+h {
			return false
		}
	}
	return true
}
func studyPlantFits(tx *gorm.DB, home model.PixelHome, x, y int, except string) error {
	var furniture []pixelFurniture
	if err := json.Unmarshal([]byte(home.Layout), &furniture); err != nil {
		return err
	}
	if !plantFitsFurniture(x, y, furniture) {
		return errPlantPosition
	}
	var plants []model.PixelPlant
	if err := tx.Where("user_id = ? AND harvested = ?", home.UserID, false).Find(&plants).Error; err != nil {
		return err
	}
	count := 0
	for _, p := range plants {
		if p.ID == except {
			continue
		}
		count++
		if p.X == x && p.Y == y {
			return errPlantPosition
		}
	}
	if count >= 24 {
		return errPlantPosition
	}
	return nil
}

func (h *PixelHomeHandler) Sow(c *gin.Context) {
	a, ok := pixelAction(c)
	if !ok {
		return
	}
	if flowerFor(a.ID) == "" || (a.Mode != "study" && a.Mode != "public") || a.X < 1 || a.X >= 143 || a.Y < 1 || a.Y >= 95 {
		writeAPIError(c, 400, "请选择种子及合法位置")
		return
	}
	id := fmt.Sprintf("%s:%d", a.ID, a.Revision)
	target := fmt.Sprintf("%s:%d:%d", a.Mode, a.X, a.Y)
	plant := model.PixelPlant{UserID: a.Owner, ID: id, Seed: a.ID, X: a.X, Y: a.Y, Revision: 1}
	err := h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		var home model.PixelHome
		if a.Mode == "study" {
			var e error
			home, e = lockPixelHome(tx, a.Owner)
			if e != nil {
				return e
			}
		}
		err := consumePixelItem(tx, a, "sow", target, func() error {
			if a.Mode == "public" {
				return nil
			}
			if e := studyPlantFits(tx, home, a.X, a.Y, ""); e != nil {
				return e
			}
			return tx.Create(&plant).Error
		})
		if err != nil || a.Mode == "public" {
			return err
		}
		if err := tx.Where("user_id = ? AND id = ?", a.Owner, id).Take(&plant).Error; err != nil {
			return err
		}
		if plant.Harvested {
			return errPixelChanged
		}
		return nil
	})
	natureResult(c, err, plant)
}

func (h *PixelHomeHandler) Plant(c *gin.Context) {
	a, ok := pixelAction(c)
	if !ok {
		return
	}
	if a.Mode != "water" && a.Mode != "move" && a.Mode != "harvest" {
		writeAPIError(c, 400, "请选择植物操作")
		return
	}
	var plant model.PixelPlant
	err := h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		home, e := lockPixelHome(tx, a.Owner)
		if e != nil {
			return e
		}
		if e = tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ? AND id = ?", a.Owner, a.ID).Take(&plant).Error; e != nil {
			return e
		}
		if a.Mode == "harvest" && plant.Harvested {
			return nil
		}
		if plant.Harvested {
			return errPixelChanged
		}
		if a.Mode == "water" && plant.WateredAt > 0 {
			return nil
		}
		if a.Mode == "move" && plant.X == a.X && plant.Y == a.Y {
			return nil
		}
		if plant.Revision != a.Revision {
			return errPixelChanged
		}
		plant.Revision++
		switch a.Mode {
		case "water":
			plant.WateredAt = time.Now().UnixMilli()
		case "move":
			if e = studyPlantFits(tx, home, a.X, a.Y, plant.ID); e != nil {
				return e
			}
			plant.X, plant.Y = a.X, a.Y
		case "harvest":
			if plant.WateredAt == 0 || time.Now().UnixMilli()-plant.WateredAt < plantBloomMillis {
				return errPlantGrowing
			}
			plant.Harvested = true
			if e = grantPixelItem(tx, a.Owner, flowerFor(plant.Seed)); e != nil {
				return e
			}
		}
		return tx.Save(&plant).Error
	})
	natureResult(c, err, plant)
}

// Source cooldown and inventory update commit together. Supply bowls are
// replenishable immediately after feeding; natural objects regrow after 12 s.
func (h *PixelHomeHandler) Collect(c *gin.Context) {
	a, ok := pixelAction(c)
	if !ok {
		return
	}
	var limit uint64
	var delay int64
	for _, item := range fishingCatalog {
		if item.ID != a.ID || item.Gather == 0 {
			continue
		}
		for i := range item.Sources {
			if a.Target == fmt.Sprintf("%s:%d", item.ID, i) {
				limit = item.Gather
			}
		}
	}
	if limit == 0 {
		writeAPIError(c, 400, "请选择可采集物品")
		return
	}
	if a.ID != "cat-food" && a.ID != "dog-food" && a.ID != "fish-pellets" {
		delay = 12000
	}
	nextAt := time.Now().UnixMilli() + delay
	err := h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		source := model.PixelGather{UserID: a.Owner, Source: a.Target}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&source).Error; err != nil {
			return err
		}
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ? AND source = ?", a.Owner, a.Target).Take(&source).Error; err != nil {
			return err
		}
		if source.NextAt > time.Now().UnixMilli() {
			nextAt = source.NextAt
			return errSourceCooling
		}
		var result *gorm.DB
		if a.Revision == 0 {
			result = tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&model.PixelItem{UserID: a.Owner, ItemID: a.ID, Quantity: 1, Revision: 1})
		} else {
			result = tx.Model(&model.PixelItem{}).Where("user_id = ? AND item_id = ? AND revision = ? AND quantity < ?", a.Owner, a.ID, a.Revision, limit).Updates(map[string]any{"quantity": gorm.Expr("quantity + 1"), "revision": gorm.Expr("revision + 1")})
		}
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return errPixelChanged
		}
		return tx.Model(&source).Update("next_at", nextAt).Error
	})
	natureResult(c, err, gin.H{"nextAt": nextAt})
}
func (h *PixelHomeHandler) Gathered(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok {
		writeAPIError(c, 401, "请先登录")
		return
	}
	rows := []model.PixelGather{}
	if err := h.db.WithContext(c.Request.Context()).Where("user_id = ? AND next_at > ?", user.ID, time.Now().UnixMilli()).Find(&rows).Error; err != nil {
		writeAPIError(c, 500, "采集状态读取失败")
		return
	}
	writeAPI(c, 200, "采集状态", rows)
}
