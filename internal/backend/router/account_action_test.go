package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/config"
)

func TestAccountActionRequiresTrustedOriginAndRequestHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	cfg := &config.Config{
		App:  config.AppConfig{Env: "production"},
		CORS: config.CORSConfig{AllowedOrigins: []string{"https://workbench.example.test"}},
	}
	engine.POST("/account-action", requireAccountActionOrigin(cfg), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	testCases := []struct {
		name        string
		origin      string
		requestSite string
		header      string
		wantStatus  int
	}{
		{name: "same origin with action marker", origin: "https://workbench.example.test", requestSite: "same-origin", header: "1", wantStatus: http.StatusNoContent},
		{name: "trusted frontend behind api proxy", origin: "https://workbench.example.test", requestSite: "same-site", header: "1", wantStatus: http.StatusNoContent},
		{name: "missing action marker", origin: "https://workbench.example.test", requestSite: "same-origin", wantStatus: http.StatusForbidden},
		{name: "untrusted origin", origin: "https://attacker.example.test", requestSite: "cross-site", header: "1", wantStatus: http.StatusForbidden},
		{name: "cross-site fetch", origin: "https://workbench.example.test", requestSite: "cross-site", header: "1", wantStatus: http.StatusForbidden},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "http://api.internal/account-action", nil)
			request.Header.Set("Origin", tc.origin)
			request.Header.Set("Sec-Fetch-Site", tc.requestSite)
			request.Header.Set("X-Tarsgo-Account-Action", tc.header)
			request.Header.Set("X-Forwarded-Proto", "https")
			recorder := httptest.NewRecorder()
			engine.ServeHTTP(recorder, request)
			if recorder.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d; body=%s", recorder.Code, tc.wantStatus, recorder.Body.String())
			}
		})
	}
}

func TestDailySignalWritesRequireSameOrAllowedOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	cfg := &config.Config{
		App:  config.AppConfig{Env: "production"},
		CORS: config.CORSConfig{AllowedOrigins: []string{"https://workbench.example.test"}},
	}
	engine.POST("/daily-signal", requireSameOriginRequest(cfg), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	testCases := []struct {
		name        string
		origin      string
		requestSite string
		host        string
		wantStatus  int
	}{
		{name: "same origin", origin: "https://workbench.example.test", requestSite: "same-origin", host: "workbench.example.test", wantStatus: http.StatusNoContent},
		{name: "configured frontend behind api proxy", origin: "https://workbench.example.test", requestSite: "same-site", host: "api.internal", wantStatus: http.StatusNoContent},
		{name: "missing origin", requestSite: "same-origin", host: "workbench.example.test", wantStatus: http.StatusForbidden},
		{name: "untrusted cross site", origin: "https://attacker.example.test", requestSite: "cross-site", host: "workbench.example.test", wantStatus: http.StatusForbidden},
		{name: "same-origin header cannot claim cross-site fetch", origin: "https://workbench.example.test", requestSite: "cross-site", host: "api.internal", wantStatus: http.StatusForbidden},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "http://"+tc.host+"/daily-signal", nil)
			if tc.origin != "" {
				request.Header.Set("Origin", tc.origin)
			}
			request.Header.Set("Sec-Fetch-Site", tc.requestSite)
			if tc.host == "api.internal" {
				request.Header.Set("X-Forwarded-Proto", "https")
			}
			recorder := httptest.NewRecorder()
			engine.ServeHTTP(recorder, request)
			if recorder.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d; body=%s", recorder.Code, tc.wantStatus, recorder.Body.String())
			}
		})
	}
}
