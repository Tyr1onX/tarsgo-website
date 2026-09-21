package middleware

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"tarsgo-backend/model"
)

// AuditAdministrativeActions records mutating /api/admin requests after they complete.
// It deliberately stores no request body or secrets.
func AuditAdministrativeActions(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		if db == nil || !strings.HasPrefix(c.Request.URL.Path, "/api/admin") {
			return
		}
		switch c.Request.Method {
		case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		default:
			return
		}
		var actorID *uint64
		if user, ok := CurrentSessionUser(c); ok && user != nil && user.ID != 0 {
			id := user.ID
			actorID = &id
		}
		metadata, _ := json.Marshal(gin.H{"query": c.Request.URL.RawQuery})
		_ = db.WithContext(c.Request.Context()).Create(&model.AuditLog{
			ActorID:   actorID,
			Action:    c.Request.Method + " " + c.Request.URL.Path,
			Method:    c.Request.Method,
			Path:      c.Request.URL.Path,
			Status:    c.Writer.Status(),
			IPAddress: c.ClientIP(),
			Metadata:  string(metadata),
		}).Error
	}
}
