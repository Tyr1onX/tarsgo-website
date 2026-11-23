package handler

import (
 "crypto/rand"
 "crypto/sha256"
 "encoding/base64"
 "encoding/hex"
 "encoding/json"
 "net/http"

 "github.com/gin-gonic/gin"
 "gorm.io/gorm"
 "tarsgo-backend/middleware"
 "tarsgo-backend/model"
)

type PixelStudyHandler struct { db *gorm.DB }
func NewPixelStudyHandler(db *gorm.DB) *PixelStudyHandler { return &PixelStudyHandler{db: db} }

type PixelFurniture struct {
 Kind string `json:"kind"`
 X int `json:"x"`
 Y int `json:"y"`
 Rotation int `json:"rotation"`
}
type pixelStudyWrite struct {
 Items []PixelFurniture `json:"items"`
 Revision uint64 `json:"revision"`
}

func validPixelFurniture(items []PixelFurniture) bool {
 if len(items) > 24 { return false }
 catalog := map[string]bool{"desk":true, "chair":true, "bookshelf":true, "lamp":true, "plant":true, "terminal":true}
 occupied := map[[2]int]bool{}
 for _, f := range items {
  if !catalog[f.Kind] || f.X < 2 || f.X > 17 || f.Y < 5 || f.Y > 13 || f.Rotation < 0 || f.Rotation > 3 { return false }
  if f.Y >= 12 && f.X >= 8 && f.X <= 12 { return false } // doorway stays unobstructed
  cell := [2]int{f.X,f.Y}
  if occupied[cell] { return false }
  occupied[cell] = true
 }
 return true
}
func (h *PixelStudyHandler) Mine(c *gin.Context) {
 user, ok := middleware.CurrentSessionUser(c); if !ok { c.AbortWithStatus(http.StatusUnauthorized); return }
 var study model.PixelStudy
 err := h.db.WithContext(c.Request.Context()).Where("user_id = ?",user.ID).First(&study).Error
 if err != nil && err != gorm.ErrRecordNotFound { pixelStudyFailure(c); return }
 if err == gorm.ErrRecordNotFound { c.JSON(http.StatusOK,gin.H{"code":200,"data":gin.H{"items":[]PixelFurniture{},"revision":uint64(0),"hasInvite":false}}); return }
 var items []PixelFurniture
 if json.Unmarshal([]byte(study.Furniture),&items)!=nil { pixelStudyFailure(c); return }
 c.JSON(http.StatusOK,gin.H{"code":200,"data":gin.H{"items":items,"revision":study.Revision,"hasInvite":study.InviteHash!=nil}})
}
func (h *PixelStudyHandler) Save(c *gin.Context) {
 user, ok := middleware.CurrentSessionUser(c); if !ok { c.AbortWithStatus(http.StatusUnauthorized); return }
 var req pixelStudyWrite
 if c.ShouldBindJSON(&req)!=nil || !validPixelFurniture(req.Items) { pixelStudyInvalid(c); return }
 if req.Items==nil { req.Items=[]PixelFurniture{} }
 bytes,err:=json.Marshal(req.Items);if err!=nil { pixelStudyFailure(c); return }
 db:=h.db.WithContext(c.Request.Context())
 if req.Revision==0 {
  study:=model.PixelStudy{UserID:user.ID,Furniture:string(bytes),Revision:1}
  if err:=db.Create(&study).Error;err!=nil { pixelStudyConflict(c);return }
  c.JSON(200,gin.H{"code":200,"data":gin.H{"revision":1}});return
 }
 updated:=db.Model(&model.PixelStudy{}).Where("user_id = ? AND revision = ?",user.ID,req.Revision).
  Updates(map[string]any{"furniture":string(bytes),"revision":req.Revision+1})
 if updated.Error!=nil { pixelStudyFailure(c);return }
 if updated.RowsAffected==0 { pixelStudyConflict(c);return }
 c.JSON(200,gin.H{"code":200,"data":gin.H{"revision":req.Revision+1}})
}
func (h *PixelStudyHandler) Invite(c *gin.Context) {
 user, ok := middleware.CurrentSessionUser(c); if !ok { c.AbortWithStatus(http.StatusUnauthorized); return }
 raw:=make([]byte,32)
 if _,err:=rand.Read(raw);err!=nil { pixelStudyFailure(c);return }
 token:=base64.RawURLEncoding.EncodeToString(raw)
 digest:=sha256.Sum256([]byte(token));hash:=hex.EncodeToString(digest[:])
 db:=h.db.WithContext(c.Request.Context())
 result:=db.Model(&model.PixelStudy{}).Where("user_id = ?",user.ID).Update("invite_hash",hash)
 if result.Error!=nil { pixelStudyFailure(c);return }
 if result.RowsAffected==0 { c.JSON(404,gin.H{"code":404,"message":"请先保存研究室布局"});return }
 c.JSON(200,gin.H{"code":200,"data":gin.H{"token":token}})
}
func (h *PixelStudyHandler) Revoke(c *gin.Context) {
 user, ok := middleware.CurrentSessionUser(c); if !ok { c.AbortWithStatus(http.StatusUnauthorized); return }
 if err:=h.db.WithContext(c.Request.Context()).Model(&model.PixelStudy{}).Where("user_id = ?",user.ID).Update("invite_hash",nil).Error;err!=nil { pixelStudyFailure(c);return }
 c.JSON(200,gin.H{"code":200,"data":gin.H{"revoked":true}})
}
func (h *PixelStudyHandler) Visit(c *gin.Context) {
 token:=c.Param("token")
 if len(token)!=43 { c.JSON(404,gin.H{"code":404,"message":"邀请无效或已撤销"});return }
 digest:=sha256.Sum256([]byte(token))
 var study model.PixelStudy
 if err:=h.db.WithContext(c.Request.Context()).Where("invite_hash = ?",hex.EncodeToString(digest[:])).First(&study).Error;err!=nil {
  c.JSON(404,gin.H{"code":404,"message":"邀请无效或已撤销"});return
 }
 var items []PixelFurniture
 if json.Unmarshal([]byte(study.Furniture),&items)!=nil { pixelStudyFailure(c);return }
 c.JSON(200,gin.H{"code":200,"data":gin.H{"items":items,"revision":study.Revision}})
}
func pixelStudyInvalid(c *gin.Context){c.JSON(400,gin.H{"code":400,"message":"家具布局不合法"})}
func pixelStudyConflict(c *gin.Context){c.JSON(409,gin.H{"code":409,"message":"研究室已更新，请重新加载"})}
func pixelStudyFailure(c *gin.Context){c.JSON(500,gin.H{"code":500,"message":"研究室暂时无法保存"})}
