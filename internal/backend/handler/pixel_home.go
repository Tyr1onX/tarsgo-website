package handler

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/middleware"
	"tarsgo-backend/model"
)

type PixelHomeHandler struct{ db *gorm.DB }

func NewPixelHomeHandler(db *gorm.DB) *PixelHomeHandler { return &PixelHomeHandler{db: db} }

type pixelFurniture struct {
	ID   string `json:"id,omitempty"`
	Kind string `json:"kind"`
	X    int    `json:"x"`
	Y    int    `json:"y"`
}

type pixelFurnitureInput struct {
	Furniture []pixelFurniture `json:"furniture"`
	Revision  uint64           `json:"revision"`
	ShowPet   bool             `json:"showPet"`
}

var facilityIDPattern = regexp.MustCompile(`^[a-z0-9-]{1,64}$`)

func furnitureID(f pixelFurniture) string {
	if f.ID != "" {
		return f.ID
	}
	return fmt.Sprintf("furniture-%s-%d-%d", f.Kind, f.X, f.Y)
}
func pixelFurnitureSize(kind string) (int, int) {
	switch kind {
	case "desk", "aquarium-large":
		return 3, 2
	case "shelf", "cabinet", "aquarium-small", "pet-bed":
		return 2, 1
	case "chair", "plant", "lamp", "pedestal", "table-display":
		return 1, 1
	}
	return 0, 0
}

func legacyFurniture(kind string) bool {
	switch kind {
	case "desk", "chair", "plant", "lamp", "shelf":
		return true
	}
	return false
}
func furnitureBlocksEntry(item pixelFurniture) bool {
	w, h := pixelFurnitureSize(item.Kind)
	return item.X < 21 && item.X+w > 15 && item.Y+h > 18
}
func validatePixelFurniture(items []pixelFurniture) bool {
	if len(items) > 24 {
		return false
	}
	type rect struct{ x, y, w, h int }
	occupied := make([]rect, 0, len(items))
	ids := map[string]bool{}
	for _, item := range items {
		w, h := pixelFurnitureSize(item.Kind)
		if w == 0 || (item.ID != "" && !facilityIDPattern.MatchString(item.ID)) || (item.ID == "" && !legacyFurniture(item.Kind)) {
			return false
		}
		id := furnitureID(item)
		if ids[id] {
			return false
		}
		ids[id] = true
		if item.ID != "" && furnitureBlocksEntry(item) {
			return false
		}
		if item.X < 2 || item.X+w > 34 || item.Y < 7 || item.Y+h > 20 {
			return false
		}
		for _, existing := range occupied {
			if item.X < existing.x+existing.w && item.X+w > existing.x &&
				item.Y < existing.y+existing.h && item.Y+h > existing.y {
				return false
			}
		}
		occupied = append(occupied, rect{item.X, item.Y, w, h})
	}
	return true
}

func (h *PixelHomeHandler) Mine(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	rows, achievementErr := h.achievements(c, user.ID, false)
	if achievementErr != nil {
		writeAPIError(c, http.StatusInternalServerError, "成果加载失败")
		return
	}
	var home model.PixelHome
	err := h.db.WithContext(c.Request.Context()).Where("user_id = ?", user.ID).First(&home).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		writeAPI(c, http.StatusOK, "研究室尚未布置", gin.H{"furniture": []pixelFurniture{}, "inviteActive": false, "achievements": rows, "plants": []model.PixelPlant{}, "displays": []model.PixelDisplay{}, "revision": uint64(0), "showPet": false})
		return
	}
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "研究室加载失败")
		return
	}
	var items []pixelFurniture
	if err := json.Unmarshal([]byte(home.Layout), &items); err != nil {
		writeAPIError(c, http.StatusInternalServerError, "研究室布局损坏")
		return
	}
	if items == nil {
		items = []pixelFurniture{}
	}
	plants, err := h.studyPlants(c, user.ID)
	if err != nil {
		writeAPIError(c, 500, "植物加载失败")
		return
	}
	displays, err := pixelDisplays(h.db.WithContext(c.Request.Context()), user.ID)
	if err != nil {
		writeAPIError(c, 500, "展品加载失败")
		return
	}

	writeAPI(c, http.StatusOK, "研究室加载成功", gin.H{"furniture": items, "inviteActive": home.InviteHash != "", "achievements": rows, "plants": plants, "displays": displays, "revision": home.LayoutRevision, "showPet": home.ShowPet})
}

func (h *PixelHomeHandler) Save(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8192)
	var input pixelFurnitureInput
	if err := c.ShouldBindJSON(&input); err != nil || !validatePixelFurniture(input.Furniture) {
		writeAPIError(c, http.StatusBadRequest, "家具类型、位置或数量不合法")
		return
	}
	if input.Furniture == nil {
		input.Furniture = []pixelFurniture{}
	}
	layout, err := json.Marshal(input.Furniture)
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "家具布局不合法")
		return
	}
	err = h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		home, e := lockPixelHome(tx, user.ID)
		if e != nil {
			return e
		}
		if home.LayoutRevision != input.Revision {
			return errPixelChanged
		}
		var prior []pixelFurniture
		if e = json.Unmarshal([]byte(home.Layout), &prior); e != nil {
			return e
		}
		for _, f := range input.Furniture {
			if !furnitureBlocksEntry(f) {
				continue
			}
			// Only an unchanged historical piece may retain its old footprint.
			found := false
			for _, old := range prior {
				if old == f {
					found = true
					break
				}
			}
			if !found {
				return errPlantPosition
			}
		}
		var plants []model.PixelPlant
		if e = tx.Where("user_id = ? AND harvested = ?", user.ID, false).Find(&plants).Error; e != nil {
			return e
		}
		for _, p := range plants {
			if !plantFitsFurniture(p.X, p.Y, input.Furniture) {
				return errPlantPosition
			}
		}
		if e = prunePixelDisplays(tx, user.ID, input.Furniture); e != nil {
			return e
		}
		return tx.Model(&home).Updates(map[string]any{"layout": string(layout), "layout_revision": gorm.Expr("layout_revision + 1"), "show_pet": input.ShowPet, "updated_at": time.Now().UTC()}).Error
	})
	if errors.Is(err, errPixelChanged) {
		writeAPIError(c, 409, "布局已在其他页面更新，请重新进入研究室")
		return
	}
	if errors.Is(err, errPlantPosition) {
		writeAPIError(c, 409, "家具不能覆盖植物或堵住入口")
		return
	}
	if err != nil {
		writeAPIError(c, 500, "研究室保存失败")
		return
	}
	writeAPI(c, http.StatusOK, "研究室已保存", gin.H{"furniture": input.Furniture, "revision": input.Revision + 1})
}

func (h *PixelHomeHandler) Invite(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		writeAPIError(c, http.StatusInternalServerError, "邀请链接生成失败")
		return
	}
	token := base64.RawURLEncoding.EncodeToString(bytes)
	hash := sha256.Sum256([]byte(token))
	home := model.PixelHome{UserID: user.ID, Layout: "[]",
		InviteHash: hex.EncodeToString(hash[:]), UpdatedAt: time.Now().UTC()}
	err := h.db.WithContext(c.Request.Context()).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"invite_hash", "updated_at"}),
	}).Create(&home).Error
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "邀请链接生成失败")
		return
	}
	writeAPI(c, http.StatusOK, "只读邀请已创建", gin.H{"token": token})
}

func (h *PixelHomeHandler) Revoke(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	if err := h.db.WithContext(c.Request.Context()).Model(&model.PixelHome{}).
		Where("user_id = ?", user.ID).Updates(map[string]any{
		"invite_hash": "", "updated_at": time.Now().UTC(),
	}).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "撤销邀请失败")
		return
	}
	writeAPI(c, http.StatusOK, "邀请已撤销", gin.H{"inviteActive": false})
}

// The token stays in the URL query, not the access-log path; only its hash is stored.
func (h *PixelHomeHandler) Visit(c *gin.Context) {
	token := c.Query("token")
	decoded, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil || len(decoded) != 32 || len(token) != 43 {
		writeAPIError(c, http.StatusNotFound, "邀请不存在或已失效")
		return
	}
	hash := sha256.Sum256([]byte(token))
	var home model.PixelHome
	err = h.db.WithContext(c.Request.Context()).Where("invite_hash = ?", hex.EncodeToString(hash[:])).First(&home).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		writeAPIError(c, http.StatusNotFound, "邀请不存在或已失效")
		return
	}
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "研究室加载失败")
		return
	}
	var items []pixelFurniture
	if err := json.Unmarshal([]byte(home.Layout), &items); err != nil {
		writeAPIError(c, http.StatusInternalServerError, "研究室布局损坏")
		return
	}
	if items == nil {
		items = []pixelFurniture{}
	}
	rows, achievementErr := h.achievements(c, home.UserID, true)
	if achievementErr != nil {
		writeAPIError(c, http.StatusInternalServerError, "成果加载失败")
		return
	}
	plants, err := h.studyPlants(c, home.UserID)
	if err != nil {
		writeAPIError(c, 500, "植物加载失败")
		return
	}
	displays, err := pixelDisplays(h.db.WithContext(c.Request.Context()), home.UserID)
	if err != nil {
		writeAPIError(c, 500, "展品加载失败")
		return
	}

	var publicPet any
	if home.ShowPet {
		var pet model.PixelPet
		err = h.db.WithContext(c.Request.Context()).Where("user_id = ? AND mode = ?", home.UserID, "home").Take(&pet).Error
		if err == nil {
			publicPet = gin.H{"species": pet.Species, "variant": pet.Variant, "name": pet.Name}
		}
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			writeAPIError(c, 500, "宠物加载失败")
			return
		}
	}
	writeAPI(c, http.StatusOK, "只读参观", gin.H{"furniture": items, "achievements": rows, "plants": plants, "displays": displays, "pet": publicPet})
}

var pixelAchievementTitles = map[string]string{
	"assembly-guodong": "过洞步兵 · 装配纪念",
	"communication":    "通信诊断实验",
	"vision":           "视觉感知实验",
	"planning":         "自主导航实验",
	"training-guodong": "过洞步兵 · 微缩训练纪念",
	"history-2026":     "2026 赛季机器人纪念",
	"fish":             "吉甲水域 · 垂钓纪念",
}

type pixelAchievementView struct {
	model.PixelAchievement
	Title string `json:"title"`
}

func (h *PixelHomeHandler) achievements(c *gin.Context, userID uint64, displayedOnly bool) ([]pixelAchievementView, error) {
	var rows []model.PixelAchievement
	query := h.db.WithContext(c.Request.Context()).Where("user_id = ?", userID)
	if displayedOnly {
		query = query.Where("displayed = ?", true)
	}
	if err := query.Order("achievement_key").Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make([]pixelAchievementView, 0, len(rows))
	for _, row := range rows {
		if title, ok := pixelAchievementTitles[row.Key]; ok {
			result = append(result, pixelAchievementView{row, title})
		}
	}
	return result, nil
}
func (h *PixelHomeHandler) Achievements(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	rows, err := h.achievements(c, user.ID, false)
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "成果加载失败")
		return
	}
	writeAPI(c, http.StatusOK, "成果", rows)
}
func (h *PixelHomeHandler) Earn(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
	var input struct {
		ID string `json:"id"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		writeAPIError(c, http.StatusBadRequest, "成果不合法")
		return
	}
	if _, ok := pixelAchievementTitles[input.ID]; !ok {
		writeAPIError(c, http.StatusBadRequest, "成果不合法")
		return
	}
	row := model.PixelAchievement{UserID: user.ID, Key: input.ID, CreatedAt: time.Now().UTC()}
	if err := h.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error; err != nil {
			return err
		}
		if input.ID == "assembly-guodong" {
			return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&model.PixelItem{UserID: user.ID, ItemID: "robot-model", Quantity: 1, Revision: 1}).Error
		}
		return nil
	}); err != nil {
		writeAPIError(c, http.StatusInternalServerError, "成果保存失败")
		return
	}
	h.Achievements(c)
}
func (h *PixelHomeHandler) DisplayAchievement(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok {
		writeAPIError(c, http.StatusUnauthorized, "请先登录")
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
	var input struct {
		ID        string `json:"id"`
		Displayed *bool  `json:"displayed"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || input.Displayed == nil {
		writeAPIError(c, http.StatusBadRequest, "展示设置不合法")
		return
	}
	if _, ok := pixelAchievementTitles[input.ID]; !ok {
		writeAPIError(c, http.StatusBadRequest, "成果不合法")
		return
	}
	// Each known achievement has exactly one fixed wall display slot.
	// No client coordinates, user IDs or other people's records are accepted.
	var row model.PixelAchievement
	db := h.db.WithContext(c.Request.Context())
	err := db.Where("user_id = ? AND achievement_key = ?", user.ID, input.ID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		writeAPIError(c, http.StatusNotFound, "未获得该成果")
		return
	}
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "成果加载失败")
		return
	}
	if err = db.Model(&row).Update("displayed", *input.Displayed).Error; err != nil {
		writeAPIError(c, http.StatusInternalServerError, "展示保存失败")
		return
	}
	h.Achievements(c)
}

func (h *PixelHomeHandler) studyPlants(c *gin.Context, owner uint64) ([]model.PixelPlant, error) {
	rows := []model.PixelPlant{}
	err := h.db.WithContext(c.Request.Context()).Where("user_id = ? AND harvested = ?", owner, false).Order("id").Find(&rows).Error
	return rows, err
}
