package handler

import (
	"crypto/rand"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"tarsgo-backend/middleware"
	"tarsgo-backend/model"
)

//go:embed pixelassets/items.json
var pixelCatalogJSON []byte

type fishingItem struct {
	ID      string
	Kind    string
	Ponds   []int
	Feeds   []string
	Gather  uint64
	Sources []struct {
		X, Y   float64
		Season string
	}
}

var fishingCatalog = func() []fishingItem {
	var items []fishingItem
	if err := json.Unmarshal(pixelCatalogJSON, &items); err != nil {
		panic(err)
	}
	return items
}()

func fishingPool(pond int) []string {
	var choices []string
	for _, item := range fishingCatalog {
		for _, water := range item.Ponds {
			if water == pond {
				choices = append(choices, item.ID)
				break
			}
		}
	}
	return choices
}

type pixelItemAction struct {
	Owner    uint64 `json:"owner"`
	Pond     *int   `json:"pond"`
	Token    string `json:"token"`
	ID       string `json:"id"`
	Revision uint64 `json:"revision"`
	Species  string `json:"species"`
	Target   string `json:"target"`
	Variant  string `json:"variant"`
	Name     string `json:"name"`
	Mode     string `json:"mode"`
	Slot     int    `json:"slot"`
	X        int    `json:"x"`
	Y        int    `json:"y"`
}

func pixelAction(c *gin.Context) (pixelItemAction, bool) {
	var a pixelItemAction
	user, ok := middleware.CurrentSessionUser(c)
	if !ok {
		writeAPIError(c, 401, "请先登录")
		return a, false
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
	if c.ShouldBindJSON(&a) != nil || a.Owner != user.ID {
		writeAPIError(c, 400, "请刷新当前账号后再试")
		return a, false
	}
	return a, true
}

func (h *PixelHomeHandler) Items(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok {
		writeAPIError(c, 401, "请先登录")
		return
	}
	type itemView struct {
		model.PixelItem
		Displayed uint64 `json:"displayed"`
		Available uint64 `json:"available" gorm:"-"`
	}
	views := []itemView{}
	if err := h.db.WithContext(c.Request.Context()).Table("pixel_items").Select("pixel_items.*, (SELECT COUNT(*) FROM pixel_displays WHERE pixel_displays.user_id = pixel_items.user_id AND pixel_displays.item_id = pixel_items.item_id) AS displayed").Where("pixel_items.user_id = ?", user.ID).Order("item_id").Scan(&views).Error; err != nil {
		writeAPIError(c, 500, "背包读取失败")
		return
	}
	for i := range views {
		if views[i].Displayed > views[i].Quantity {
			writeAPIError(c, 500, "收藏状态异常")
			return
		}
		views[i].Available = views[i].Quantity - views[i].Displayed
	}
	writeAPI(c, 200, "背包", views)
}

func (h *PixelHomeHandler) Cast(c *gin.Context) {
	a, ok := pixelAction(c)
	if !ok {
		return
	}
	if a.Pond == nil || len(fishingPool(*a.Pond)) == 0 {
		writeAPIError(c, 400, "请选择校园水域")
		return
	}
	var token [16]byte
	if _, err := rand.Read(token[:]); err != nil {
		writeAPIError(c, 500, "抛竿失败")
		return
	}
	row := model.PixelCast{UserID: a.Owner, Token: hex.EncodeToString(token[:]), Pond: *a.Pond, ReadyAt: time.Now().UnixMilli() + 1800}
	if err := h.db.WithContext(c.Request.Context()).Clauses(clause.OnConflict{DoUpdates: clause.AssignmentColumns([]string{"token", "pond", "ready_at", "catch_id"})}).Create(&row).Error; err != nil {
		writeAPIError(c, 500, "抛竿失败")
		return
	}
	writeAPI(c, 200, "已抛竿", gin.H{"token": row.Token})
}

var errEarlyCast = errors.New("鱼还未咬钩")

func (h *PixelHomeHandler) Reel(c *gin.Context) {
	a, ok := pixelAction(c)
	if !ok {
		return
	}
	var caught string
	var first bool
	err := h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		var cast model.PixelCast
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ? AND token = ?", a.Owner, a.Token).Take(&cast).Error; err != nil {
			return err
		}
		if cast.CatchID != "" {
			caught = cast.CatchID
			return nil
		}
		if time.Now().UnixMilli() < cast.ReadyAt {
			return errEarlyCast
		}
		choices := fishingPool(cast.Pond)
		index, err := rand.Int(rand.Reader, big.NewInt(int64(len(choices))))
		if err != nil {
			return err
		}
		caught = choices[index.Int64()]
		row := model.PixelItem{UserID: a.Owner, ItemID: caught, Quantity: 1, Revision: 1}
		result := tx.Clauses(clause.OnConflict{DoUpdates: clause.Assignments(map[string]any{"quantity": gorm.Expr("quantity + 1"), "revision": gorm.Expr("revision + 1")})}).Create(&row)
		if result.Error != nil {
			return result.Error
		}
		// MariaDB returns one affected row for insert and two for an updated stack.
		first = result.RowsAffected == 1
		return tx.Model(&cast).Update("catch_id", caught).Error
	})
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		writeAPIError(c, 409, "本次抛竿已结束，请重新抛竿")
	case errors.Is(err, errEarlyCast):
		writeAPIError(c, 425, errEarlyCast.Error())
	case err != nil:
		writeAPIError(c, 500, "收竿未确认，请重试")
	default:
		writeAPI(c, 200, "已收入背包", gin.H{"id": caught, "first": first})
	}
}

func (h *PixelHomeHandler) Release(c *gin.Context) {
	a, ok := pixelAction(c)
	if !ok {
		return
	}
	for _, item := range fishingCatalog {
		if item.ID != a.ID || item.Kind != "fish" {
			continue
		}
		err := h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
			if _, err := lockPixelHome(tx, a.Owner); err != nil {
				return err
			}
			row, err := lockPixelItem(tx, a)
			if err != nil {
				return err
			}
			n, err := pixelAvailable(tx, row)
			if err != nil {
				return err
			}
			if n == 0 {
				return errPixelChanged
			}
			return tx.Model(&row).Updates(map[string]any{"quantity": gorm.Expr("quantity - 1"), "revision": gorm.Expr("revision + 1")}).Error
		})
		natureResult(c, err, nil)
		return
	}
	writeAPIError(c, 400, "只有鱼类可以放生")
}
