package email

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"tarsgo-backend/config"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestSendEmailAPIContractAndInlineImage(t *testing.T) {
	sender := NewSender(config.EmailConfig{APIKey: "test-key", From: "吉甲大师 <noreply@jijiamaster.com>"})
	sender.client.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://api.resend.com/emails" || r.Method != "POST" || r.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatal("incorrect email API request")
		}
		var body struct {
			From        string   `json:"from"`
			To          []string `json:"to"`
			Subject     string   `json:"subject"`
			HTML        string   `json:"html"`
			Attachments []struct {
				Content   string `json:"content"`
				ContentID string `json:"content_id"`
			} `json:"attachments"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body.From != sender.cfg.From || len(body.To) != 1 || body.To[0] != "receiver@example.com" || body.Subject != "中文测试" {
			t.Fatal("sender, recipient or Unicode subject lost")
		}
		if strings.Contains(body.HTML, "<script>") || !strings.Contains(body.HTML, "&lt;script&gt;") || !strings.Contains(body.HTML, "cid:admission-image") {
			t.Fatal("invalid inline HTML")
		}
		if len(body.Attachments) != 1 || body.Attachments[0].Content != "aW1hZ2U=" || body.Attachments[0].ContentID != "admission-image" {
			t.Fatal("invalid inline attachment")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"id":"test-id"}`))}, nil
	})
	err := sender.SendEmail(context.Background(), Message{To: "receiver@example.com", Subject: "中文测试", Text: "<script>内容</script>", InlineImage: []byte("image"), InlineImageType: "image/png"})
	if err != nil {
		t.Fatal(err)
	}
}

func TestSenderUsesConfiguredEndpoint(t *testing.T) {
	var received bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received = true
		if r.URL.Path != "/emails" {
			t.Errorf("request path = %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"captured"}`))
	}))
	defer server.Close()

	sender := NewSender(config.EmailConfig{APIKey: "test-key", APIURL: server.URL + "/emails", From: "noreply@tarsgo.test"})
	if err := sender.SendEmail(context.Background(), Message{To: "candidate@tarsgo.test", Subject: "test", Text: "test"}); err != nil {
		t.Fatalf("SendEmail returned error: %v", err)
	}
	if !received {
		t.Fatal("configured email endpoint did not receive the message")
	}
}

func TestProviderFailureIsSafeAndDoesNotRetry(t *testing.T) {
	var logs bytes.Buffer
	previous := log.Writer()
	log.SetOutput(&logs)
	defer log.SetOutput(previous)
	sender := NewSender(config.EmailConfig{APIKey: "private-key", From: "noreply@jijiamaster.com"})
	calls := 0
	sender.client.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 429, Body: io.NopCloser(strings.NewReader(`{"name":"daily_quota_exceeded","message":"private-key confidential body receiver@example.com"}`))}, nil
	})
	err := sender.SendEmail(context.Background(), Message{To: "receiver@example.com", Subject: "test", Text: "confidential body"})
	if err == nil || !strings.Contains(err.Error(), "额度或速率受限") || calls != 1 {
		t.Fatal("quota failure was not reported directly")
	}
	for _, secret := range []string{"private-key", "confidential body", "receiver@example.com"} {
		if strings.Contains(logs.String()+err.Error(), secret) {
			t.Fatal("sensitive data exposed")
		}
	}
}

func TestCanceledContextReachesTransport(t *testing.T) {
	sender := NewSender(config.EmailConfig{APIKey: "test-key", From: "noreply@jijiamaster.com"})
	sender.client.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) { return nil, r.Context().Err() })
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := sender.SendEmail(ctx, Message{To: "receiver@example.com", Text: "test"}); err == nil {
		t.Fatal("canceled send succeeded")
	}
}
