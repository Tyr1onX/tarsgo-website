package trainingqa

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func makeQuestionUpload(t *testing.T, name string, content []byte) *multipart.FileHeader {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	file, err := writer.CreateFormFile("files", name)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest("POST", "/", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	if err := request.ParseMultipartForm(1 << 20); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = request.MultipartForm.RemoveAll() })
	return request.MultipartForm.File["files"][0]
}

func TestQuestionUploadsAcceptOnlyImageSignatures(t *testing.T) {
	validPNG := []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0}
	if _, err := validateQuestionUploads([]*multipart.FileHeader{makeQuestionUpload(t, "trace.png", validPNG)}); err != nil {
		t.Fatalf("valid PNG upload was rejected: %v", err)
	}
	if _, err := validateQuestionUploads([]*multipart.FileHeader{makeQuestionUpload(t, "trace.png", []byte("not an image"))}); err == nil {
		t.Fatal("non-image content with a PNG extension was accepted")
	}
	if _, err := validateQuestionUploads([]*multipart.FileHeader{makeQuestionUpload(t, "script.svg", []byte("<svg></svg>"))}); err == nil {
		t.Fatal("SVG upload was accepted")
	}
}

func TestQuestionFileStoreUsesPrivateFilesAndRejectsTraversal(t *testing.T) {
	root := t.TempDir()
	store, err := newQuestionFileStore(root)
	if err != nil {
		t.Fatal(err)
	}
	file, err := store.save(context.Background(), 41, 8, questionUpload{
		header:   makeQuestionUpload(t, "截图.png", []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0}),
		fileName: "截图.png", contentType: "image/png",
	})
	if err != nil {
		t.Fatalf("save private image: %v", err)
	}
	path, err := store.resolve(file.storagePath)
	if err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm()&0o077 != 0 {
		t.Fatalf("stored image permissions = %o, want owner-only", info.Mode().Perm())
	}
	if _, err := store.resolve("../outside.png"); err == nil {
		t.Fatal("path traversal was accepted")
	}
	if _, err := os.Stat(filepath.Join(root, "41", "8")); err != nil {
		t.Fatalf("private question directory was not created: %v", err)
	}
}
