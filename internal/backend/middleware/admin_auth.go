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

type sessionRenewer interface {
	RenewAccountSession(ctx context.Context, sessionToken, vaultToken string) (*auth.SessionRenewal, error)
}

type currentUserRenewalResolver interface {
	CurrentUserAndRenewal(ctx context.Context, sessionToken, vaultToken string) (*auth.CurrentUserRenewalResult, error)
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

		user, authErr, renewErr := currentUserAndRenewSession(c, service, token)
		if authErr != nil {
			var serviceErr *auth.ServiceError
			if errors.As(authErr, &serviceErr) {
				if serviceErr.Status == http.StatusUnauthorized || serviceErr.Status == http.StatusForbidden {
					clearAuthCookie(c, service)
					c.Next()
					return
				}
				logSessionServerError(c, "optional session lookup", authErr, serviceErr.Status)
				writeAPIError(c, serviceErr.Status, serviceErr.Message)
				c.Abort()
				return
			}
			logSessionServerError(c, "optional session lookup", authErr, http.StatusInternalServerError)
			writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
			c.Abort()
			return
		}

		if renewErr != nil {
			var serviceErr *auth.ServiceError
			if errors.As(renewErr, &serviceErr) && (serviceErr.Status == http.StatusUnauthorized || serviceErr.Status == http.StatusForbidden) {
				clearAuthCookie(c, service)
				c.Next()
				return
			}
			logSessionServerError(c, "optional session renewal", renewErr, http.StatusInternalServerError)
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

		user, authErr, renewErr := currentUserAndRenewSession(c, service, token)
		if authErr != nil {
			var serviceErr *auth.ServiceError
			if errors.As(authErr, &serviceErr) {
				if serviceErr.Status == http.StatusUnauthorized || serviceErr.Status == http.StatusForbidden {
					clearAuthCookie(c, service)
				}
				logSessionServerError(c, "session lookup", authErr, serviceErr.Status)
				writeAPIError(c, serviceErr.Status, serviceErr.Message)
				c.Abort()
				return
			}

			logSessionServerError(c, "session lookup", authErr, http.StatusInternalServerError)
			writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
			c.Abort()
			return
		}

		if renewErr != nil {
			var serviceErr *auth.ServiceError
			if errors.As(renewErr, &serviceErr) && (serviceErr.Status == http.StatusUnauthorized || serviceErr.Status == http.StatusForbidden) {
				clearAuthCookie(c, service)
				writeAPIError(c, serviceErr.Status, serviceErr.Message)
				c.Abort()
				return
			}
			logSessionServerError(c, "session renewal", renewErr, http.StatusInternalServerError)
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
				logSessionServerError(c, "admin session lookup", err, serviceErr.Status)
				writeAPIError(c, serviceErr.Status, serviceErr.Message)
				c.Abort()
				return
			}

			logSessionServerError(c, "admin session lookup", err, http.StatusInternalServerError)
			writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
			c.Abort()
			return
		}

		if user.Role.Name != model.RoleNameAdmin && user.Role.Name != model.RoleNameSuperAdmin {
			writeAPIError(c, http.StatusForbidden, "当前账号无管理员权限")
			c.Abort()
			return
		}

		if renewErr := renewSessionCookies(c, service, token); renewErr != nil {
			var serviceErr *auth.ServiceError
			if errors.As(renewErr, &serviceErr) && (serviceErr.Status == http.StatusUnauthorized || serviceErr.Status == http.StatusForbidden) {
				clearAuthCookie(c, service)
				writeAPIError(c, serviceErr.Status, serviceErr.Message)
				c.Abort()
				return
			}
			logSessionServerError(c, "admin session renewal", renewErr, http.StatusInternalServerError)
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
				logSessionServerError(c, "super-admin session lookup", err, serviceErr.Status)
				writeAPIError(c, serviceErr.Status, serviceErr.Message)
				c.Abort()
				return
			}

			logSessionServerError(c, "super-admin session lookup", err, http.StatusInternalServerError)
			writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
			c.Abort()
			return
		}

		if user.Role.Name != model.RoleNameSuperAdmin {
			writeAPIError(c, http.StatusForbidden, "当前账号无系统配置权限")
			c.Abort()
			return
		}

		if renewErr := renewSessionCookies(c, service, token); renewErr != nil {
			var serviceErr *auth.ServiceError
			if errors.As(renewErr, &serviceErr) && (serviceErr.Status == http.StatusUnauthorized || serviceErr.Status == http.StatusForbidden) {
				clearAuthCookie(c, service)
				writeAPIError(c, serviceErr.Status, serviceErr.Message)
				c.Abort()
				return
			}
			logSessionServerError(c, "super-admin session renewal", renewErr, http.StatusInternalServerError)
		}
		c.Set(sessionUserContextKey, user)
		c.Next()
	}
}

func renewSessionCookies(c *gin.Context, service sessionReader, sessionToken string) error {
	renewer, ok := service.(sessionRenewer)
	if !ok {
		return nil
	}
	vaultToken, _ := c.Cookie(auth.AccountVaultCookieName)
	renewal, err := renewer.RenewAccountSession(c.Request.Context(), sessionToken, vaultToken)
	if err != nil || renewal == nil {
		return err
	}
	applySessionRenewalCookies(c, service, sessionToken, vaultToken, renewal)
	return nil
}

func currentUserAndRenewSession(c *gin.Context, service sessionReader, sessionToken string) (*auth.SessionUser, error, error) {
	vaultToken, _ := c.Cookie(auth.AccountVaultCookieName)
	if resolver, ok := service.(currentUserRenewalResolver); ok {
		result, err := resolver.CurrentUserAndRenewal(c.Request.Context(), sessionToken, vaultToken)
		if err != nil {
			return nil, err, nil
		}
		if result == nil || result.User == nil {
			return nil, &auth.ServiceError{Status: http.StatusInternalServerError, Message: "加载当前用户失败"}, nil
		}
		if result.RenewalError == nil && result.Renewal != nil {
			applySessionRenewalCookies(c, service, sessionToken, vaultToken, result.Renewal)
		}
		return result.User, nil, result.RenewalError
	}
	user, err := service.CurrentUser(c.Request.Context(), sessionToken)
	if err != nil {
		return nil, err, nil
	}
	return user, nil, renewSessionCookies(c, service, sessionToken)
}

func applySessionRenewalCookies(c *gin.Context, service sessionReader, sessionToken, vaultToken string, renewal *auth.SessionRenewal) {
	if renewal.AuthRenewed && renewal.AuthCookieMaxAgeSeconds > 0 {
		c.SetSameSite(service.CookieSameSite())
		c.SetCookie(service.CookieName(), sessionToken, renewal.AuthCookieMaxAgeSeconds, "/", "", service.CookieSecure(), true)
	}
	if renewal.VaultRenewed && renewal.VaultCookieMaxAgeSeconds > 0 && strings.TrimSpace(vaultToken) != "" {
		c.SetSameSite(service.CookieSameSite())
		c.SetCookie(auth.AccountVaultCookieName, vaultToken, renewal.VaultCookieMaxAgeSeconds, "/", "", service.CookieSecure(), true)
	}
}

func logSessionServerError(c *gin.Context, operation string, err error, status int) {
	if status >= http.StatusInternalServerError {
		LogInternalError(c, operation, status, err)
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
