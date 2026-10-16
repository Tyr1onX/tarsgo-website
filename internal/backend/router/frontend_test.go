package router

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/gin-gonic/gin"
)

func TestFrontendFallbackServesIndexForClientRoutes(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	registerFrontendFallback(engine, fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("<html>spa</html>")},
	}, true)

	request := httptest.NewRequest(http.MethodGet, "/dashboard/admin", nil)
	request.Header.Set("Accept", "text/html")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}
	if body := recorder.Body.String(); !strings.Contains(body, "spa") {
		t.Fatalf("expected index body, got %q", body)
	}
	if cacheControl := recorder.Header().Get("Cache-Control"); cacheControl != "no-cache" {
		t.Fatalf("expected no-cache header, got %q", cacheControl)
	}
}

func TestFrontendFallbackServesStaticAssets(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	registerFrontendFallback(engine, fstest.MapFS{
		"index.html":                            &fstest.MapFile{Data: []byte("<html>spa</html>")},
		"assets/app-4f9a2e01.js":                &fstest.MapFile{Data: []byte("console.log('ok')")},
		"assets/images/about-640-381e0fa8.webp": &fstest.MapFile{Data: []byte("webp")},
		"media/logo.png":                        &fstest.MapFile{Data: []byte("png")},
	}, true)

	request := httptest.NewRequest(http.MethodGet, "/assets/app-4f9a2e01.js", nil)
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}
	if body := recorder.Body.String(); !strings.Contains(body, "console.log") {
		t.Fatalf("expected asset body, got %q", body)
	}
	if cacheControl := recorder.Header().Get("Cache-Control"); cacheControl != "public, max-age=31536000, immutable" {
		t.Fatalf("unexpected cache-control header: %q", cacheControl)
	}
}

func TestFrontendFallbackRevalidatesStableAssetURLs(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	modTime := time.Date(2026, time.October, 15, 5, 26, 2, 0, time.UTC)
	engine := gin.New()
	registerFrontendFallback(engine, fstest.MapFS{
		"index.html":                          &fstest.MapFile{Data: []byte("<html>spa</html>")},
		"assets/app.js":                       &fstest.MapFile{Data: []byte("console.log('ok')")},
		"assets/images/Robot/hero-robot.webp": &fstest.MapFile{Data: []byte("webp"), ModTime: modTime},
		"assets/images/Home/Responsive/about-1280-8e5963df.webp": &fstest.MapFile{Data: []byte("hashed webp")},
	}, true)

	for _, assetPath := range []string{
		"/assets/app.js",
		"/assets/images/Robot/hero-robot.webp",
	} {
		t.Run(assetPath, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, assetPath, nil)
			recorder := httptest.NewRecorder()
			engine.ServeHTTP(recorder, request)

			if recorder.Code != http.StatusOK {
				t.Fatalf("expected status 200, got %d", recorder.Code)
			}
			if got := recorder.Header().Get("Cache-Control"); got != "no-cache" {
				t.Fatalf("Cache-Control = %q, want no-cache for stable URL", got)
			}
		})
	}

	request := httptest.NewRequest(http.MethodGet, "/assets/images/Robot/hero-robot.webp", nil)
	request.Header.Set("If-Modified-Since", modTime.Format(http.TimeFormat))
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotModified {
		t.Fatalf("expected conditional request status 304, got %d", recorder.Code)
	}
	if got := recorder.Header().Get("Cache-Control"); got != "no-cache" {
		t.Fatalf("Cache-Control = %q, want no-cache on 304 response", got)
	}

	request = httptest.NewRequest(http.MethodGet, "/assets/images/Home/Responsive/about-1280-8e5963df.webp", nil)
	recorder = httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200 for fingerprinted nested asset, got %d", recorder.Code)
	}
	if got := recorder.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Fatalf("Cache-Control = %q, want immutable for fingerprinted nested asset", got)
	}
}

func TestFrontendFallbackDoesNotInterceptAPIRequests(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	registerFrontendFallback(engine, fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("<html>spa</html>")},
	}, true)

	request := httptest.NewRequest(http.MethodGet, "/api/missing", nil)
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d", recorder.Code)
	}
	body, err := io.ReadAll(recorder.Body)
	if err != nil {
		t.Fatalf("read response body: %v", err)
	}
	if strings.Contains(string(body), "spa") {
		t.Fatalf("expected api 404 response, got %q", string(body))
	}
}

func TestFrontendFallbackDoesNotServeIndexForMissingAsset(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	registerFrontendFallback(engine, fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("<html>spa</html>")},
	}, true)

	request := httptest.NewRequest(http.MethodGet, "/assets/missing.js", nil)
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d", recorder.Code)
	}
	if body := recorder.Body.String(); strings.Contains(body, "spa") {
		t.Fatalf("expected asset 404, got %q", body)
	}
}

func TestFrontendFallbackDoesNotInterceptReservedServerPaths(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	registerFrontendFallback(engine, fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("<html>spa</html>")},
	}, true)

	request := httptest.NewRequest(http.MethodGet, "/upload/missing", nil)
	request.Header.Set("Accept", "text/html")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d", recorder.Code)
	}
	if body := recorder.Body.String(); strings.Contains(body, "spa") {
		t.Fatalf("expected reserved path 404, got %q", body)
	}
}
