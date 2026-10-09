package testmailbox

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMailboxAcceptsOnlyMarkedTestRecipients(t *testing.T) {
	path := filepath.Join(t.TempDir(), "mail.jsonl")
	handler, err := Handler(path, "secret-token")
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		to       string
		wantCode int
	}{{"person@tarsgo.test", http.StatusOK}, {"person@example.com", http.StatusUnprocessableEntity}} {
		request := httptest.NewRequest(http.MethodPost, "/emails", strings.NewReader(`{"to":["`+test.to+`"],"subject":"test"}`))
		request.Header.Set("Authorization", "Bearer secret-token")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != test.wantCode {
			t.Fatalf("recipient %q response = %d, want %d", test.to, response.Code, test.wantCode)
		}
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0600 {
		t.Fatalf("mailbox store mode = %o, want 600", info.Mode().Perm())
	}
}

func TestMailboxInboxRequiresAuthAndEscapesHTML(t *testing.T) {
	handler, err := Handler(filepath.Join(t.TempDir(), "mail.jsonl"), "secret-token")
	if err != nil {
		t.Fatal(err)
	}
	unauthorized := httptest.NewRecorder()
	handler.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/api/messages", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized inbox status = %d", unauthorized.Code)
	}
	request := httptest.NewRequest(http.MethodPost, "/emails", strings.NewReader(`{"to":["candidate@tarsgo.test"],"subject":"<script>bad</script>","text":"<img src=x>"}`))
	request.Header.Set("Authorization", "Bearer secret-token")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("test email capture status = %d", response.Code)
	}
	request = httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte("inbox:secret-token")))
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || strings.Contains(response.Body.String(), "<script>bad</script>") || !strings.Contains(response.Body.String(), "&lt;script&gt;bad&lt;/script&gt;") {
		t.Fatal("inbox must render captured content as escaped text")
	}
}
