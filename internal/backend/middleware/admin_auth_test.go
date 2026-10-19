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
	err  error
}

func (r roleSessionReader) CurrentUser(context.Context, string) (*auth.SessionUser, error) {
	if r.err != nil {
		return nil, r.err
	}
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

type leaveAccessStub struct {
	allowed bool
	err     error
	userID  uint64
}

func (s *leaveAccessStub) HasLeaveAccess(_ context.Context, userID uint64) (bool, error) {
	s.userID = userID
	return s.allowed, s.err
}

func TestLeaveAccessProtectsMemberRoutesAndPreservesAdminAccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	request := func(role string, reader *leaveAccessStub) int {
		engine := gin.New()
		session := roleSessionReader{role: role}
		engine.GET("/leave", RequireAuthenticated(session), RequireLeaveAccess(reader), func(c *gin.Context) { c.Status(http.StatusNoContent) })
		req := httptest.NewRequest(http.MethodGet, "/leave", nil)
		req.AddCookie(&http.Cookie{Name: "session", Value: "test-token"})
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, req)
		return response.Code
	}

	denied := &leaveAccessStub{}
	if got := request("user", denied); got != http.StatusForbidden || denied.userID != 10 {
		t.Fatalf("unapproved member route status=%d userID=%d, want 403 for user 10", got, denied.userID)
	}
	approved := &leaveAccessStub{allowed: true}
	if got := request("user", approved); got != http.StatusNoContent || approved.userID != 10 {
		t.Fatalf("approved member route status=%d userID=%d, want 204 for user 10", got, approved.userID)
	}
	admin := &leaveAccessStub{}
	if got := request("admin", admin); got != http.StatusNoContent {
		t.Fatalf("admin route status=%d, want 204", got)
	}
	if admin.userID != 0 {
		t.Fatalf("admin leave access should bypass the member grant lookup, got userID=%d", admin.userID)
	}
	failedClosed := &leaveAccessStub{err: context.DeadlineExceeded}
	if got := request("user", failedClosed); got != http.StatusInternalServerError {
		t.Fatalf("access store error status=%d, want 500", got)
	}
}

func TestOptionalAuthenticationAllowsVisitorsAndAttachesOnlyAValidSession(t *testing.T) {
	gin.SetMode(gin.TestMode)
	reader := roleSessionReader{role: "user"}
	engine := gin.New()
	engine.GET("/public", OptionalAuthenticated(reader), func(c *gin.Context) {
		user, ok := CurrentSessionUser(c)
		if ok && user.ID != 10 {
			t.Errorf("unexpected attached identity: %#v", user)
		}
		if ok {
			c.Header("X-Authenticated", "true")
		}
		c.Status(http.StatusNoContent)
	})

	visitor := httptest.NewRecorder()
	engine.ServeHTTP(visitor, httptest.NewRequest(http.MethodGet, "/public", nil))
	if visitor.Code != http.StatusNoContent || visitor.Header().Get("X-Authenticated") != "" {
		t.Fatalf("visitor request status=%d headers=%v", visitor.Code, visitor.Header())
	}

	loggedInRequest := httptest.NewRequest(http.MethodGet, "/public", nil)
	loggedInRequest.AddCookie(&http.Cookie{Name: "session", Value: "token"})
	loggedIn := httptest.NewRecorder()
	engine.ServeHTTP(loggedIn, loggedInRequest)
	if loggedIn.Code != http.StatusNoContent || loggedIn.Header().Get("X-Authenticated") != "true" {
		t.Fatalf("authenticated request status=%d headers=%v", loggedIn.Code, loggedIn.Header())
	}
}

func TestOptionalAuthenticationDoesNotBlockVisitorForExpiredSession(t *testing.T) {
	gin.SetMode(gin.TestMode)
	reader := roleSessionReader{err: &auth.ServiceError{Status: http.StatusUnauthorized, Message: "expired"}}
	engine := gin.New()
	engine.GET("/public", OptionalAuthenticated(reader), func(c *gin.Context) { c.Status(http.StatusNoContent) })
	request := httptest.NewRequest(http.MethodGet, "/public", nil)
	request.AddCookie(&http.Cookie{Name: "session", Value: "expired-token"})
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, request)
	if response.Code != http.StatusNoContent {
		t.Fatalf("expired optional session should continue as visitor, got %d", response.Code)
	}
	if response.Header().Get("Set-Cookie") == "" {
		t.Fatal("expired cookie should be cleared")
	}
}

func TestOptionalAuthenticationFailsClosedOnSessionStoreErrors(t *testing.T) {
	gin.SetMode(gin.TestMode)
	reader := roleSessionReader{err: context.DeadlineExceeded}
	engine := gin.New()
	engine.GET("/public", OptionalAuthenticated(reader), func(c *gin.Context) { c.Status(http.StatusNoContent) })
	request := httptest.NewRequest(http.MethodGet, "/public", nil)
	request.AddCookie(&http.Cookie{Name: "session", Value: "token"})
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, request)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("session store errors should fail closed, got %d", response.Code)
	}
}
