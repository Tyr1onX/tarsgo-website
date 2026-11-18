package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/service/auth"
	"tarsgo-backend/service/privatefile"
)

type trainingDocumentMemoryStore map[string]string

func (s trainingDocumentMemoryStore) Get(_ context.Context, key string) (string, error) {
	return s[key], nil
}
func (s trainingDocumentMemoryStore) Set(_ context.Context, key, value string) error {
	s[key] = value
	return nil
}

func trainingDocumentRequest(t *testing.T, url, markdown string, image []byte, token string) *http.Request {
	t.Helper()
	var payload bytes.Buffer
	writer := multipart.NewWriter(&payload)
	if err := writer.WriteField("body", markdown); err != nil { t.Fatal(err) }
	tokens := []string{}
	if image != nil {
		part, err := writer.CreateFormFile("files", "test.png")
		if err != nil { t.Fatal(err) }
		if _, err := part.Write(image); err != nil { t.Fatal(err) }
		tokens = append(tokens, token)
	}
	encoded, _ := json.Marshal(tokens)
	if err := writer.WriteField("uploadTokens", string(encoded)); err != nil { t.Fatal(err) }
	if err := writer.Close(); err != nil { t.Fatal(err) }
	request := httptest.NewRequest(http.MethodPut, url, &payload)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	return request
}

func TestTrainingDocumentSaveAndReload(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := trainingDocumentMemoryStore{}
	files, err := privatefile.NewStore(t.TempDir())
	if err != nil { t.Fatal(err) }
	handler := NewTrainingDocumentHandler(store, files)
	router := gin.New()
	router.PUT("/docs/:slug", func(c *gin.Context) {
		c.Set("sessionUser", &auth.SessionUser{ID: 42, Role: auth.SessionRole{Name: "super_admin"}})
	}, handler.Save)
	router.GET("/docs/:slug", handler.Get)

	save := httptest.NewRecorder()
	router.ServeHTTP(save, trainingDocumentRequest(t, "/docs/git", "# 修改后的 Git 教程", nil, ""))
	if save.Code != http.StatusOK || store["training_document_git"] != "# 修改后的 Git 教程" {
		t.Fatalf("document save failed: status=%d body=%s store=%#v", save.Code, save.Body.String(), store)
	}
	read := httptest.NewRecorder()
	router.ServeHTTP(read, httptest.NewRequest(http.MethodGet, "/docs/git", nil))
	if read.Code != http.StatusOK || !strings.Contains(read.Body.String(), "# 修改后的 Git 教程") {
		t.Fatalf("saved document cannot be read: status=%d body=%s", read.Code, read.Body.String())
	}
	unknown := httptest.NewRecorder()
	router.ServeHTTP(unknown, trainingDocumentRequest(t, "/docs/unknown", "# bad", nil, ""))
	if unknown.Code != http.StatusNotFound {
		t.Fatalf("unexpected unknown slug status: %d", unknown.Code)
	}
}

func TestTrainingDocumentUploadPersistsImageAndRejectsUnknownToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := trainingDocumentMemoryStore{}
	files, err := privatefile.NewStore(t.TempDir())
	if err != nil { t.Fatal(err) }
	handler := NewTrainingDocumentHandler(store, files)
	router := gin.New()
	router.PUT("/docs/:slug", func(c *gin.Context) {
		c.Set("sessionUser", &auth.SessionUser{ID: 42, Role: auth.SessionRole{Name: "super_admin"}})
	}, handler.Save)
	router.GET("/api/training-documents/images/:scope/:owner/:filename", handler.Image)

	// A minimal PNG header is enough to exercise server-side content-type validation.
	png := append([]byte{137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82}, bytes.Repeat([]byte{0}, 24)...)
	token := "image_example_1234567890"
	bad := httptest.NewRecorder()
	router.ServeHTTP(bad, trainingDocumentRequest(t, "/docs/git", "![图](community-upload://another_token_123456789)", png, token))
	if bad.Code != http.StatusBadRequest || len(store) != 0 {
		t.Fatalf("dangling reference accepted: status=%d body=%s", bad.Code, bad.Body.String())
	}

	ok := httptest.NewRecorder()
	router.ServeHTTP(ok, trainingDocumentRequest(t, "/docs/git", "![图](community-upload://"+token+")", png, token))
	if ok.Code != http.StatusOK {
		t.Fatalf("image upload failed: status=%d body=%s", ok.Code, ok.Body.String())
	}
	markdown := store["training_document_git"]
	prefix := "/api/training-documents/images/2/42/"
	if !strings.Contains(markdown, prefix) || strings.Contains(markdown, "community-upload://") {
		t.Fatalf("image URL not persisted: %q", markdown)
	}
	url := strings.Split(strings.Split(markdown, "(")[1], ")")[0]
	read := httptest.NewRecorder()
	router.ServeHTTP(read, httptest.NewRequest(http.MethodGet, url, nil))
	if read.Code != http.StatusOK || !bytes.Equal(read.Body.Bytes(), png) {
		t.Fatalf("persisted image inaccessible: status=%d body=%q", read.Code, read.Body.String())
	}
	if !strings.HasSuffix(filepath.Ext(url), ".png") {
		t.Fatalf("unexpected image extension: %q", url)
	}
}
