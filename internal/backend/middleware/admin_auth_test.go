package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/service/auth"
)

type roleSessionReader struct {
	role string
}

func (r roleSessionReader) CurrentUser(context.Context, string) (*auth.SessionUser, error) {
	return &auth.SessionUser{ID: 10, Role: auth.SessionRole{Name: r.role}}, nil
}
func (roleSessionReader) CookieName() string            { return "session" }
func (roleSessionReader) CookieSecure() bool            { return false }
func (roleSessionReader) CookieSameSite() http.SameSite { return http.SameSiteLaxMode }

func TestAdminCanUseAdminRoutesButNotSuperAdminConfiguration(t *testing.T) {
	gin.SetMode(gin.TestMode)
	request := func(middleware gin.HandlerFunc) int {
		engine := gin.New()
		engine.GET("/admin/test", middleware, func(c *gin.Context) { c.Status(http.StatusNoContent) })
		req := httptest.NewRequest(http.MethodGet, "/admin/test", nil)
		req.AddCookie(&http.Cookie{Name: "session", Value: "test-token"})
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, req)
		return response.Code
	}
	admin := roleSessionReader{role: "admin"}
	if got := request(RequireAdmin(admin)); got != http.StatusNoContent {
		t.Fatalf("ordinary admin route status = %d, want %d", got, http.StatusNoContent)
	}
	if got := request(RequireSuperAdmin(admin)); got != http.StatusForbidden {
		t.Fatalf("ordinary admin configuration status = %d, want %d", got, http.StatusForbidden)
	}
	superAdmin := roleSessionReader{role: "super_admin"}
	if got := request(RequireSuperAdmin(superAdmin)); got != http.StatusNoContent {
		t.Fatalf("super admin configuration status = %d, want %d", got, http.StatusNoContent)
	}
}
