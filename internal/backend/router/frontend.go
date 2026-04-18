package router

import (
	"io"
	"io/fs"
	"net/http"
	"path"
	"strings"

	"github.com/gin-gonic/gin"
)

func registerFrontendFallback(engine *gin.Engine, frontendFS fs.FS, enabled bool) {
	engine.NoRoute(func(c *gin.Context) {
		if isAPIPath(c.Request.URL.Path) {
			c.JSON(http.StatusNotFound, gin.H{
				"code":    http.StatusNotFound,
				"message": "接口不存在",
				"data":    nil,
			})
			return
		}

		if isReservedServerPath(c.Request.URL.Path) {
			c.Status(http.StatusNotFound)
			return
		}

		if !enabled || !isFrontendMethod(c.Request.Method) {
			c.Status(http.StatusNotFound)
			return
		}

		serveFrontendAsset(c, frontendFS)
	})
}

func serveFrontendAsset(c *gin.Context, frontendFS fs.FS) {
	assetPath := cleanFrontendPath(c.Request.URL.Path)
	if serveFrontendFile(c, frontendFS, assetPath) {
		return
	}

	if shouldServeIndex(c.Request, assetPath) && serveFrontendFile(c, frontendFS, "index.html") {
		return
	}

	c.Status(http.StatusNotFound)
}

func serveFrontendFile(c *gin.Context, frontendFS fs.FS, name string) bool {
	file, err := frontendFS.Open(name)
	if err != nil {
		return false
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil || stat.IsDir() {
		return false
	}

	setFrontendCacheHeader(c, name)

	reader, ok := file.(io.ReadSeeker)
	if !ok {
		data, err := fs.ReadFile(frontendFS, name)
		if err != nil {
			return false
		}
		c.Data(http.StatusOK, http.DetectContentType(data), data)
		return true
	}

	http.ServeContent(c.Writer, c.Request, stat.Name(), stat.ModTime(), reader)
	return true
}

func cleanFrontendPath(requestPath string) string {
	cleaned := path.Clean("/" + strings.TrimPrefix(requestPath, "/"))
	if cleaned == "/" {
		return "index.html"
	}
	return strings.TrimPrefix(cleaned, "/")
}

func shouldServeIndex(request *http.Request, assetPath string) bool {
	if path.Ext(assetPath) != "" || isStaticAssetPath(assetPath) {
		return false
	}

	accept := request.Header.Get("Accept")
	return accept == "" || strings.Contains(accept, "text/html") || strings.Contains(accept, "*/*")
}

func isFrontendMethod(method string) bool {
	return method == http.MethodGet || method == http.MethodHead
}

func isAPIPath(requestPath string) bool {
	cleaned := path.Clean("/" + strings.TrimPrefix(requestPath, "/"))
	return cleaned == "/api" || strings.HasPrefix(cleaned, "/api/")
}

func isReservedServerPath(requestPath string) bool {
	cleaned := path.Clean("/" + strings.TrimPrefix(requestPath, "/"))
	return cleaned == "/healthz" ||
		strings.HasPrefix(cleaned, "/healthz/") ||
		cleaned == "/upload" ||
		strings.HasPrefix(cleaned, "/upload/")
}

func isStaticAssetPath(assetPath string) bool {
	return assetPath == "assets" ||
		strings.HasPrefix(assetPath, "assets/") ||
		assetPath == "media" ||
		strings.HasPrefix(assetPath, "media/")
}

func setFrontendCacheHeader(c *gin.Context, name string) {
	if strings.HasPrefix(name, "assets/") {
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		return
	}

	c.Header("Cache-Control", "no-cache")
}
