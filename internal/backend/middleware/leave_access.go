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

// RequireLeaveAccess protects leave-workbench APIs. Only super administrators
// bypass member access for oversight; regular admins require manual grants.
func RequireLeaveAccess(reader leaveAccessReader) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := CurrentSessionUser(c)
		if !ok || user == nil {
			writeAPIError(c, http.StatusUnauthorized, "未登录")
			c.Abort()
			return
		}
		if user.Role.Name == model.RoleNameSuperAdmin {
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
			writeAPIError(c, http.StatusForbidden, "请假工作台尚未授权或本次权限已使用")
			c.Abort()
			return
		}
		c.Next()
	}
}
