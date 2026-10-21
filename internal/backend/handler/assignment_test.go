package handler

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestParseAssignmentDueAtUsesBeijingWallClockForLocalInput(t *testing.T) {
	beijing := time.FixedZone("Asia/Shanghai", 8*60*60)
	localInput, err := parseAssignmentDueAt("2026-10-22T23:59")
	if err != nil {
		t.Fatalf("parse Beijing datetime-local value: %v", err)
	}
	want := time.Date(2026, 10, 22, 23, 59, 0, 0, beijing)
	if !localInput.Equal(want) || localInput.Location().String() != "Asia/Shanghai" {
		t.Fatalf("local input parsed as %s, want %s", localInput, want)
	}

	isoInput, err := parseAssignmentDueAt("2026-10-22T15:59:00Z")
	if err != nil || !isoInput.Equal(want) {
		t.Fatalf("UTC-converted browser input parsed as %s, %v; want %s", isoInput, err, want)
	}
}

func TestPublishWithMaterialsRejectsInterruptedMultipart(t *testing.T) {
	previousMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	defer gin.SetMode(previousMode)
	tempDir := t.TempDir()
	t.Setenv("TMPDIR", tempDir)

	body := new(bytes.Buffer)
	writer := multipart.NewWriter(body)
	if err := writer.WriteField("assignment", `{"groupId":1,"title":"interrupted","description":"interrupted","dueAt":"2026-10-22T15:59:00Z","isGroupWide":true}`); err != nil {
		t.Fatal("write assignment request field")
	}
	file, err := writer.CreateFormFile("files", "course.pdf")
	if err != nil {
		t.Fatal("write assignment material header")
	}
	if _, err := file.Write(bytes.Repeat([]byte("x"), 2<<20)); err != nil {
		t.Fatal("write interrupted assignment material")
	}
	// Deliberately omit writer.Close() to simulate a connection dropping before
	// the multipart closing boundary reaches the server.

	request := httptest.NewRequest(http.MethodPost, "/api/admin/assignments/publish", bytes.NewReader(body.Bytes()))
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = request
	NewAssignmentHandler(nil).PublishWithMaterials(context)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("interrupted upload status = %d, want 400: %s", response.Code, response.Body.String())
	}
	files, err := os.ReadDir(tempDir)
	if err != nil {
		t.Fatal("inspect multipart temp files")
	}
	if len(files) > 0 {
		t.Fatalf("interrupted upload left temporary files: %v", files)
	}
}
