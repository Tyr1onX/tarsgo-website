package handler

import (
	"encoding/json"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"tarsgo-backend/model"
)

func displaySlots(kind string) int {
	switch kind {
	case "aquarium-large":
		return 5
	case "aquarium-small", "shelf":
		return 2
	case "cabinet", "desk":
		return 3
	case "pedestal", "table-display":
		return 1
	}
	return 0
}

func displayAccepts(f pixelFurniture, id string) bool {
	for _, item := range fishingCatalog {
		if item.ID != id {
			continue
		}
		switch f.Kind {
		case "aquarium-large", "aquarium-small":
			return item.Kind == "fish" || id == "weed"
		case "pedestal":
			return item.Kind == "rm"
		default:
			return displaySlots(f.Kind) > 0 && (item.Kind == "rm" || item.Kind == "nature" || item.Kind == "keepsake" || item.Kind == "tool")
		}
	}
	return false
}

func pixelDisplays(db *gorm.DB, owner uint64) ([]model.PixelDisplay, error) {
	rows := []model.PixelDisplay{}
	err := db.Where("user_id = ?", owner).Order("facility_id, slot").Find(&rows).Error
	return rows, err
}

func pixelAvailable(tx *gorm.DB, row model.PixelItem) (uint64, error) {
	var n int64
	err := tx.Model(&model.PixelDisplay{}).Where("user_id = ? AND item_id = ?", row.UserID, row.ItemID).Count(&n).Error
	if err != nil {
		return 0, err
	}
	if uint64(n) > row.Quantity {
		return 0, errPixelChanged
	}
	return row.Quantity - uint64(n), nil
}

func lockPixelItem(tx *gorm.DB, a pixelItemAction) (model.PixelItem, error) {
	var row model.PixelItem
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ? AND item_id = ?", a.Owner, a.ID).Take(&row).Error
	if err == nil && (a.Revision == 0 || row.Revision != a.Revision) {
		err = errPixelChanged
	}
	return row, err
}

func prunePixelDisplays(tx *gorm.DB, owner uint64, furniture []pixelFurniture) error {
	rows, err := pixelDisplays(tx, owner)
	if err != nil {
		return err
	}
	byID := map[string]pixelFurniture{}
	for _, f := range furniture {
		byID[furnitureID(f)] = f
	}
	for _, row := range rows {
		f, ok := byID[row.FacilityID]
		if !ok || row.Slot >= displaySlots(f.Kind) || !displayAccepts(f, row.ItemID) {
			if err := tx.Delete(&row).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

func (h *PixelHomeHandler) DisplayItem(c *gin.Context) {
	a, ok := pixelAction(c)
	if !ok {
		return
	}
	if a.Mode != "place" && a.Mode != "take" && a.Mode != "release" {
		writeAPIError(c, 400, "请选择展品操作")
		return
	}
	err := h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		home, err := lockPixelHome(tx, a.Owner)
		if err != nil {
			return err
		}
		var furniture []pixelFurniture
		if err = json.Unmarshal([]byte(home.Layout), &furniture); err != nil {
			return err
		}
		var facility pixelFurniture
		for _, f := range furniture {
			if furnitureID(f) == a.Target {
				facility = f
				break
			}
		}
		if a.Slot < 0 || a.Slot >= displaySlots(facility.Kind) || !displayAccepts(facility, a.ID) {
			return errPixelChanged
		}
		row, err := lockPixelItem(tx, a)
		if err != nil {
			return err
		}
		d := model.PixelDisplay{UserID: a.Owner, FacilityID: a.Target, Slot: a.Slot, ItemID: a.ID}
		updates := map[string]any{"revision": gorm.Expr("revision + 1")}
		if a.Mode == "place" {
			n, err := pixelAvailable(tx, row)
			if err != nil {
				return err
			}
			if n == 0 {
				return errPixelChanged
			}
			var occupied int64
			if err := tx.Model(&model.PixelDisplay{}).Where("user_id = ? AND facility_id = ? AND slot = ?", a.Owner, a.Target, a.Slot).Count(&occupied).Error; err != nil {
				return err
			}
			if occupied != 0 {
				return errPixelChanged
			}
			if err := tx.Create(&d).Error; err != nil {
				return err
			}
		} else {
			if a.Mode == "release" {
				fish := false
				for _, i := range fishingCatalog {
					if i.ID == a.ID && i.Kind == "fish" {
						fish = true
						break
					}
				}
				if !fish || row.Quantity == 0 {
					return errPixelChanged
				}
				updates["quantity"] = gorm.Expr("quantity - 1")
			}
			result := tx.Where("item_id = ?", a.ID).Delete(&d)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return errPixelChanged
			}
		}
		return tx.Model(&row).Updates(updates).Error
	})
	natureResult(c, err, nil)
}
