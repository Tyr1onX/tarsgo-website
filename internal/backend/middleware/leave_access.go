package middleware

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"tarsgo-backend/model"
)

type leaveAccessReader interface {
	HasLeaveAccess(ctx context.Context, userID uint64) (bool, error)
}

// RequireLeaveAccess protects authenticated leave-workbench APIs. Administrators
// retain their existing access so they can review requests and manage records.
func RequireLeaveAccess(reader leaveAccessReader) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := CurrentSessionUser(c)
		if !ok || user == nil {
			writeAPIError(c, http.StatusUnauthorized, "未登录")
			c.Abort()
			return
		}
		if user.Role.Name == model.RoleNameAdmin || user.Role.Name == model.RoleNameSuperAdmin {
			c.Next()
			return
		}

		allowed, err := reader.HasLeaveAccess(c.Request.Context(), user.ID)
		if err != nil {
			writeAPIError(c, http.StatusInternalServerError, "检查请假权限失败")
			c.Abort()
			return
		}
		if !allowed {
			writeAPIError(c, http.StatusForbidden, "请假功能尚未开通")
			c.Abort()
			return
		}
		c.Next()
	}
}
