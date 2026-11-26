package handler

import (
	"errors"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"tarsgo-backend/middleware"
	"tarsgo-backend/model"
)

var errPixelChanged = errors.New("背包或宠物已更新，请重新选择")

func pixelFood(id string) (fishingItem, bool) {
	for _, item := range fishingCatalog {
		if item.ID == id && item.Kind == "food" && len(item.Feeds) > 0 {
			return item, true
		}
	}
	return fishingItem{}, false
}

// Each virtual food can be replenished when its previous portion has been used.
// The same inventory revision cannot be collected again after a later use.
func (h *PixelHomeHandler) CollectFood(c *gin.Context) {
	a, ok := pixelAction(c)
	if !ok {
		return
	}
	if _, ok := pixelFood(a.ID); !ok {
		writeAPIError(c, 400, "请选择动物食物")
		return
	}
	db := h.db.WithContext(c.Request.Context())
	var result *gorm.DB
	if a.Revision == 0 {
		result = db.Clauses(clause.OnConflict{DoNothing: true}).Create(&model.PixelItem{UserID: a.Owner, ItemID: a.ID, Quantity: 1, Revision: 1})
	} else {
		result = db.Model(&model.PixelItem{}).Where("user_id = ? AND item_id = ? AND revision = ? AND quantity = 0", a.Owner, a.ID, a.Revision).Updates(map[string]any{"quantity": 1, "revision": gorm.Expr("revision + 1")})
	}
	if result.Error != nil {
		writeAPIError(c, 500, "食物领取未确认，请查看背包")
		return
	}
	if result.RowsAffected == 0 {
		writeAPIError(c, 409, errPixelChanged.Error())
		return
	}
	writeAPI(c, 200, "已收入背包", nil)
}

func (h *PixelHomeHandler) Feed(c *gin.Context) {
	a, ok := pixelAction(c)
	if !ok {
		return
	}
	item, ok := pixelFood(a.ID)
	if !ok || !slices.Contains(item.Feeds, a.Species) || a.Revision == 0 ||
		len(a.Target) > 64 || (a.Target != "companion" && !strings.HasPrefix(a.Target, a.Species+"-")) {
		writeAPIError(c, 400, "请选择适合这只动物的食物")
		return
	}
	err := h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		var row model.PixelItem
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ? AND item_id = ?", a.Owner, a.ID).Take(&row).Error; err != nil {
			return err
		}
		var receipt model.PixelFoodUse
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ? AND item_id = ? AND revision = ?", a.Owner, a.ID, a.Revision).Take(&receipt).Error
		if err == nil {
			if receipt.Species == a.Species && receipt.Target == a.Target {
				return nil
			}
			return errPixelChanged
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if row.Revision != a.Revision || row.Quantity == 0 {
			return errPixelChanged
		}
		if a.Target == "companion" {
			var pet model.PixelPet
			if err := tx.Where("user_id = ? AND species = ?", a.Owner, a.Species).Take(&pet).Error; err != nil {
				return err
			}
		}
		if err := tx.Model(&row).Updates(map[string]any{"quantity": gorm.Expr("quantity - 1"), "revision": gorm.Expr("revision + 1")}).Error; err != nil {
			return err
		}
		return tx.Create(&model.PixelFoodUse{UserID: a.Owner, ItemID: a.ID, Revision: a.Revision, Species: a.Species, Target: a.Target}).Error
	})
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound), errors.Is(err, errPixelChanged):
		writeAPIError(c, 409, errPixelChanged.Error())
	case err != nil:
		writeAPIError(c, 500, "喂食未确认，请重试")
	default:
		writeAPI(c, 200, "已使用食物", nil)
	}
}

func validPetName(name string) bool {
	return name != "" && utf8.RuneCountInString(name) <= 16 && !strings.ContainsFunc(name, unicode.IsControl)
}

func validPetVariant(species, variant string) bool {
	return species == "cat" && (variant == "orange" || variant == "tuxedo") || species == "dog" && variant == "small"
}

func (h *PixelHomeHandler) Pet(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok {
		writeAPIError(c, 401, "请先登录")
		return
	}
	var pet model.PixelPet
	err := h.db.WithContext(c.Request.Context()).Where("user_id = ?", user.ID).Take(&pet).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		writeAPI(c, 200, "尚未领养", nil)
		return
	}
	if err != nil {
		writeAPIError(c, 500, "宠物读取失败")
		return
	}
	writeAPI(c, 200, "校园宠物", pet)
}

func (h *PixelHomeHandler) AdoptPet(c *gin.Context) {
	a, ok := pixelAction(c)
	if !ok {
		return
	}
	a.Name = strings.TrimSpace(a.Name)
	if !validPetVariant(a.Species, a.Variant) || !validPetName(a.Name) {
		writeAPIError(c, 400, "请选择校园宠物并输入名称（1至16字）")
		return
	}
	db := h.db.WithContext(c.Request.Context())
	pet := model.PixelPet{UserID: a.Owner, Species: a.Species, Variant: a.Variant, Name: a.Name, Mode: "follow", Revision: 1}
	if err := db.Clauses(clause.OnConflict{DoNothing: true}).Create(&pet).Error; err != nil {
		writeAPIError(c, 500, "领养未确认，请重试")
		return
	}
	if err := db.Where("user_id = ?", a.Owner).Take(&pet).Error; err != nil {
		writeAPIError(c, 500, "领养未确认，请重试")
		return
	}
	if pet.Species != a.Species || pet.Variant != a.Variant || pet.Name != a.Name {
		writeAPIError(c, 409, "你已经有一只校园宠物")
		return
	}
	writeAPI(c, 200, "领养成功", pet)
}

func (h *PixelHomeHandler) SavePet(c *gin.Context) {
	a, ok := pixelAction(c)
	if !ok {
		return
	}
	a.Name = strings.TrimSpace(a.Name)
	if !validPetName(a.Name) || (a.Mode != "follow" && a.Mode != "home") {
		writeAPIError(c, 400, "宠物信息不正确")
		return
	}
	db := h.db.WithContext(c.Request.Context())
	result := db.Model(&model.PixelPet{}).Where("user_id = ? AND revision = ?", a.Owner, a.Revision).Updates(map[string]any{"name": a.Name, "mode": a.Mode, "revision": gorm.Expr("revision + 1")})
	if result.Error != nil {
		writeAPIError(c, 500, "宠物信息保存未确认")
		return
	}
	if result.RowsAffected == 0 {
		writeAPIError(c, 409, errPixelChanged.Error())
		return
	}
	var pet model.PixelPet
	if err := db.Where("user_id = ?", a.Owner).Take(&pet).Error; err != nil {
		writeAPIError(c, 500, "宠物读取失败")
		return
	}
	writeAPI(c, 200, "已保存", pet)
}
