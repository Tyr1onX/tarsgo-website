package middleware

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/model"
	"tarsgo-backend/service/auth"
)

const sessionUserContextKey = "sessionUser"

type sessionReader interface {
	CurrentUser(ctx context.Context, token string) (*auth.SessionUser, error)
	CookieName() string
	CookieSecure() bool
	CookieSameSite() http.SameSite
}

// OptionalAuthenticated attaches a valid session when one is present while
// allowing public pages to continue as anonymous visitors.
func OptionalAuthenticated(service sessionReader) gin.HandlerFunc {
	return func(c *gin.Context) {
		token, err := c.Cookie(service.CookieName())
		if err != nil || strings.TrimSpace(token) == "" {
			c.Next()
			return
		}

		user, err := service.CurrentUser(c.Request.Context(), token)
		if err != nil {
			var serviceErr *auth.ServiceError
			if errors.As(err, &serviceErr) {
				if serviceErr.Status == http.StatusUnauthorized || serviceErr.Status == http.StatusForbidden {
					clearAuthCookie(c, service)
					c.Next()
					return
				}
				writeAPIError(c, serviceErr.Status, serviceErr.Message)
				c.Abort()
				return
			}
			writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
			c.Abort()
			return
		}

		c.Set(sessionUserContextKey, user)
		c.Next()
	}
}

func RequireAuthenticated(service sessionReader) gin.HandlerFunc {
	return func(c *gin.Context) {
		token, err := c.Cookie(service.CookieName())
		if err != nil || strings.TrimSpace(token) == "" {
			writeAPIError(c, http.StatusUnauthorized, "未登录")
			c.Abort()
			return
		}

		user, err := service.CurrentUser(c.Request.Context(), token)
		if err != nil {
			var serviceErr *auth.ServiceError
			if errors.As(err, &serviceErr) {
				if serviceErr.Status == http.StatusUnauthorized || serviceErr.Status == http.StatusForbidden {
					clearAuthCookie(c, service)
				}
				writeAPIError(c, serviceErr.Status, serviceErr.Message)
				c.Abort()
				return
			}

			writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
			c.Abort()
			return
		}

		c.Set(sessionUserContextKey, user)
		c.Next()
	}
}

func RequireAdmin(service sessionReader) gin.HandlerFunc {
	return func(c *gin.Context) {
		token, err := c.Cookie(service.CookieName())
		if err != nil || strings.TrimSpace(token) == "" {
			writeAPIError(c, http.StatusUnauthorized, "未登录")
			c.Abort()
			return
		}

		user, err := service.CurrentUser(c.Request.Context(), token)
		if err != nil {
			var serviceErr *auth.ServiceError
			if errors.As(err, &serviceErr) {
				if serviceErr.Status == http.StatusUnauthorized || serviceErr.Status == http.StatusForbidden {
					clearAuthCookie(c, service)
				}
				writeAPIError(c, serviceErr.Status, serviceErr.Message)
				c.Abort()
				return
			}

			writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
			c.Abort()
			return
		}

		if user.Role.Name != model.RoleNameAdmin && user.Role.Name != model.RoleNameSuperAdmin {
			writeAPIError(c, http.StatusForbidden, "当前账号无管理员权限")
			c.Abort()
			return
		}

		c.Set(sessionUserContextKey, user)
		c.Next()
	}
}

func RequireSuperAdmin(service sessionReader) gin.HandlerFunc {
	return func(c *gin.Context) {
		token, err := c.Cookie(service.CookieName())
		if err != nil || strings.TrimSpace(token) == "" {
			writeAPIError(c, http.StatusUnauthorized, "未登录")
			c.Abort()
			return
		}

		user, err := service.CurrentUser(c.Request.Context(), token)
		if err != nil {
			var serviceErr *auth.ServiceError
			if errors.As(err, &serviceErr) {
				if serviceErr.Status == http.StatusUnauthorized || serviceErr.Status == http.StatusForbidden {
					clearAuthCookie(c, service)
				}
				writeAPIError(c, serviceErr.Status, serviceErr.Message)
				c.Abort()
				return
			}

			writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
			c.Abort()
			return
		}

		if user.Role.Name != model.RoleNameSuperAdmin {
			writeAPIError(c, http.StatusForbidden, "当前账号无系统配置权限")
			c.Abort()
			return
		}

		c.Set(sessionUserContextKey, user)
		c.Next()
	}
}

func CurrentSessionUser(c *gin.Context) (*auth.SessionUser, bool) {
	value, ok := c.Get(sessionUserContextKey)
	if !ok {
		return nil, false
	}

	user, ok := value.(*auth.SessionUser)
	return user, ok
}

func clearAuthCookie(c *gin.Context, service sessionReader) {
	c.SetSameSite(service.CookieSameSite())
	c.SetCookie(service.CookieName(), "", -1, "/", "", service.CookieSecure(), true)
}

func writeAPIError(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{
		"code":    status,
		"message": message,
		"data":    nil,
	})
}
