package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/config"
)

func TestPausedTrainingAPIsAreUnregisteredAndOpenWorkflowsRemain(t *testing.T) {
	sqlDB, _, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true})
	if err != nil {
		t.Fatalf("open GORM over SQL mock: %v", err)
	}

	engine := New(&config.Config{
		App:  config.AppConfig{Env: "test", GinMode: "test"},
		Auth: config.AuthConfig{JWTSecret: strings.Repeat("a", 32)},
	}, db)
	routes := make(map[string]bool)
	for _, route := range engine.Routes() {
		routes[route.Method+" "+route.Path] = true
	}

	pausedPrefixes := []string{
		"/api/practice-projects", "/api/practice-files", "/api/questions", "/api/question-files",
		"/api/skills", "/api/capabilities", "/api/growth", "/api/expedition",
		"/api/admin/practice-projects", "/api/admin/questions", "/api/admin/skills",
		"/api/admin/capabilities", "/api/admin/cultivation", "/api/admin/expedition",
	}
	for route := range routes {
		for _, prefix := range pausedPrefixes {
			if strings.HasPrefix(route, "GET "+prefix) || strings.HasPrefix(route, "POST "+prefix) ||
				strings.HasPrefix(route, "PUT "+prefix) || strings.HasPrefix(route, "PATCH "+prefix) ||
				strings.HasPrefix(route, "DELETE "+prefix) {
				t.Errorf("paused feature API is still registered: %s", route)
			}
		}
	}

	for _, route := range []string{
		"GET /api/assignments",
		"POST /api/assignments/:id/submissions",
		"GET /api/admin/assignments",
		"POST /api/admin/assignments",
		"POST /api/admin/assignments/submissions/:id/reviews",
		"GET /api/admin/timetable-availability/cleanup",
		"POST /api/admin/timetable-availability/cleanup",
		"GET /api/admin/timetable-availability/week",
		"GET /api/weekly-reports",
		"GET /api/work-manual/operations",
		"GET /api/work-manual/operations/templates/campus-network-window-application.doc",
		"GET /api/me/co-builder-badge",
		"GET /api/admin/users/:id/co-builder-badge",
		"POST /api/admin/users/:id/co-builder-badge/contributions",
		"DELETE /api/admin/users/:id/co-builder-badge/contributions/:contributionID",
		"GET /api/leave/access",
		"GET /api/leave/profile",
		"PUT /api/leave/profile",
		"GET /api/admin/leave/access-requests",
		"PATCH /api/admin/leave/access-requests/:id",
		"GET /api/admin/registrations",
		"GET /api/admin/organization-preview",
	} {
		if !routes[route] {
			t.Errorf("open workflow API was unexpectedly removed: %s", route)
		}
	}

	// Moving profile editing into personal settings must not expose unauthenticated
	// student identifiers or accidentally open leave-document generation.
	for _, endpoint := range []struct{ method, path string }{
		{http.MethodGet, "/api/leave/profile"},
		{http.MethodPut, "/api/leave/profile"},
		{http.MethodPost, "/api/daily-leave/self-service/document"},
		{http.MethodGet, "/api/work-manual/operations"},
		{http.MethodGet, "/api/admin/organization-preview"},
		{http.MethodGet, "/api/work-manual/operations/templates/campus-network-window-application.doc"},
		{http.MethodGet, "/api/me/co-builder-badge"},
		{http.MethodGet, "/api/admin/users/12/co-builder-badge"},
		{http.MethodPost, "/api/admin/users/12/co-builder-badge/contributions"},
		{http.MethodDelete, "/api/admin/users/12/co-builder-badge/contributions/3"},
	} {
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, httptest.NewRequest(endpoint.method, endpoint.path, nil))
		if response.Code != http.StatusUnauthorized {
			t.Errorf("%s %s without session returned %d, want 401", endpoint.method, endpoint.path, response.Code)
		}
	}
}
