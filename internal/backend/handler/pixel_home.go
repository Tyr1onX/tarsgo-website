package handler

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
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
	Kind string `json:"kind"`
	X    int    `json:"x"`
	Y    int    `json:"y"`
}

type pixelFurnitureInput struct {
	Furniture []pixelFurniture `json:"furniture"`
}

func validatePixelFurniture(items []pixelFurniture) bool {
	if len(items) > 24 {
		return false
	}
	type rect struct{ x, y, w, h int }
	occupied := make([]rect, 0, len(items))
	for _, item := range items {
		w, h := 0, 0
		switch item.Kind {
		case "desk":
			w, h = 3, 2
		case "chair", "plant", "lamp":
			w, h = 1, 1
		case "shelf":
			w, h = 2, 1
		default:
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
	var home model.PixelHome
	err := h.db.WithContext(c.Request.Context()).Where("user_id = ?", user.ID).First(&home).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		writeAPI(c, http.StatusOK, "研究室尚未布置", gin.H{"furniture": []pixelFurniture{}, "inviteActive": false})
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
	writeAPI(c, http.StatusOK, "研究室加载成功", gin.H{"furniture": items, "inviteActive": home.InviteHash != ""})
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
	home := model.PixelHome{UserID: user.ID, Layout: string(layout), UpdatedAt: time.Now().UTC()}
	result := h.db.WithContext(c.Request.Context()).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"layout", "updated_at"}),
	}).Create(&home)
	if result.Error != nil {
		writeAPIError(c, http.StatusInternalServerError, "研究室保存失败")
		return
	}
	writeAPI(c, http.StatusOK, "研究室已保存", gin.H{"furniture": input.Furniture})
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
		Columns: []clause.Column{{Name: "user_id"}},
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
	writeAPI(c, http.StatusOK, "只读参观", gin.H{"furniture": items})
}
