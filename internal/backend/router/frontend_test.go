package router

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

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
		"index.html":     &fstest.MapFile{Data: []byte("<html>spa</html>")},
		"assets/app.js":  &fstest.MapFile{Data: []byte("console.log('ok')")},
		"media/logo.png": &fstest.MapFile{Data: []byte("png")},
	}, true)

	request := httptest.NewRequest(http.MethodGet, "/assets/app.js", nil)
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
