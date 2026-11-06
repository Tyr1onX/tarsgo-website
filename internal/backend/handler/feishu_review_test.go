package handler

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/config"
)

func testFeishuHandler() *FeishuReviewHandler {
	return NewFeishuReviewHandler(config.FeishuConfig{
		AppID: "cli_test", AppSecret: "secret", VerificationToken: "verification",
		TesterUnionID: "on_tester",
	}, nil, nil)
}

func callFeishu(t *testing.T, handler *FeishuReviewHandler, body any, headers http.Header) (int, map[string]any) {
	t.Helper()
	payload, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/integrations/feishu/card-action", bytes.NewReader(payload))
	if headers != nil {
		c.Request.Header = headers
	}
	handler.Callback(c)
	c.Writer.WriteHeaderNow()
	var result map[string]any
	if recorder.Body.Len() > 0 {
		if err := json.Unmarshal(recorder.Body.Bytes(), &result); err != nil {
			t.Fatalf("decode response: %v", err)
		}
	}
	return recorder.Code, result
}

func callbackAction(score, decision, name, unionID, kind string) map[string]any {
	return map[string]any{
		"schema": "2.0",
		"header": map[string]any{"token": "verification", "app_id": "cli_test", "event_type": "card.action.trigger"},
		"event": map[string]any{
			"operator": map[string]any{"union_id": unionID},
			"action": map[string]any{
				"name": name, "value": map[string]any{"kind": kind},
				"form_value": map[string]string{"score": score, "decision": decision, "comment": "试点评语"},
			},
		},
	}
}

func TestFeishuURLVerificationRequiresToken(t *testing.T) {
	h := testFeishuHandler()
	status, result := callFeishu(t, h, map[string]string{"type": "url_verification", "challenge": "hello", "token": "verification"}, nil)
	if status != http.StatusOK || result["challenge"] != "hello" {
		t.Fatalf("url verification status=%d body=%#v", status, result)
	}
	status, _ = callFeishu(t, h, map[string]string{"type": "url_verification", "challenge": "hello", "token": "wrong"}, nil)
	if status != http.StatusUnauthorized {
		t.Fatalf("bad challenge token status=%d", status)
	}
}

func TestFeishuEncryptedURLVerificationRequiresToken(t *testing.T) {
	key := "secret-encrypt-key"
	h := testFeishuHandler()
	h.cfg.EncryptKey = key

	for _, tc := range []struct {
		name  string
		token string
		want  int
	}{
		{name: "valid token", token: "verification", want: http.StatusOK},
		{name: "invalid token", token: "wrong", want: http.StatusUnauthorized},
	} {
		t.Run(tc.name, func(t *testing.T) {
			plain, err := json.Marshal(map[string]string{
				"type": "url_verification", "challenge": "challenge-value", "token": tc.token,
			})
			if err != nil {
				t.Fatal(err)
			}
			body := encryptFeishuTestPayload(t, plain, key)
			status, result := callFeishu(t, h, body, nil)
			if status != tc.want {
				t.Fatalf("status=%d, want %d; body=%#v", status, tc.want, result)
			}
			if tc.want == http.StatusOK && result["challenge"] != "challenge-value" {
				t.Fatalf("challenge=%#v", result["challenge"])
			}
		})
	}
}

func encryptFeishuTestPayload(t *testing.T, plain []byte, key string) map[string]string {
	t.Helper()
	blockKey := sha256.Sum256([]byte(key))
	block, err := aes.NewCipher(blockKey[:])
	if err != nil {
		t.Fatal(err)
	}
	padding := aes.BlockSize - len(plain)%aes.BlockSize
	plain = append(append([]byte(nil), plain...), bytes.Repeat([]byte{byte(padding)}, padding)...)
	iv := bytes.Repeat([]byte{3}, aes.BlockSize)
	encrypted := make([]byte, len(plain))
	cipher.NewCBCEncrypter(block, iv).CryptBlocks(encrypted, plain)
	return map[string]string{"encrypt": base64.StdEncoding.EncodeToString(append(iv, encrypted...))}
}

func TestFeishuPreviewCardCallbackDoesNotTouchDatabase(t *testing.T) {
	h := testFeishuHandler() // database and assignment service are deliberately nil
	for _, score := range []string{"0", "100"} {
		status, result := callFeishu(t, h, callbackAction(score, "passed", "submit_review", "on_tester", "test"), nil)
		if status != http.StatusOK {
			t.Fatalf("preview %s status=%d", score, status)
		}
		toast := result["toast"].(map[string]any)
		if toast["type"] != "success" {
			t.Fatalf("preview %s rejected: %#v", score, result)
		}
		card := result["card"].(map[string]any)["data"].(map[string]any)
		elements := card["body"].(map[string]any)["elements"].([]any)
		if len(elements) != 1 || elements[0].(map[string]any)["tag"] != "markdown" {
			t.Fatalf("preview did not replace form after submission: %#v", card)
		}
	}
}

func TestFeishuCallbackRejectsInvalidActions(t *testing.T) {
	for _, tc := range []struct {
		score, decision, action, unionID, kind string
	}{
		{"101", "passed", "submit_review", "on_tester", "test"},
		{"-1", "passed", "submit_review", "on_tester", "test"},
		{"1.5", "passed", "submit_review", "on_tester", "test"},
		{"", "passed", "submit_review", "on_tester", "test"},
		{"85", "invalid", "submit_review", "on_tester", "test"},
		{"85", "passed", "invalid", "on_tester", "test"},
		{"85", "passed", "submit_review", "on_other", "test"},
		{"85", "passed", "submit_review", "on_tester", "review"},
	} {
		status, body := callFeishu(t, testFeishuHandler(), callbackAction(tc.score, tc.decision, tc.action, tc.unionID, tc.kind), nil)
		if status != http.StatusOK || body["toast"].(map[string]any)["type"] != "error" {
			t.Fatalf("invalid callback (%+v) status=%d body=%#v", tc, status, body)
		}
	}
	for _, bad := range []string{"wrong", ""} {
		event := callbackAction("85", "passed", "submit_review", "on_tester", "test")
		event["header"].(map[string]any)["token"] = bad
		status, _ := callFeishu(t, testFeishuHandler(), event, nil)
		if status != http.StatusUnauthorized {
			t.Fatalf("bad token %q accepted: %d", bad, status)
		}
	}
}

func TestFeishuSignatureValidatesRawBodyAndFreshness(t *testing.T) {
	key := "secret-encrypt-key"
	raw := []byte(`{"test":true}`)
	now := time.Unix(1700000000, 0)
	ts := "1700000000"
	nonce := "abc"
	digest := sha256.Sum256(append([]byte(ts+nonce+key), raw...))
	headers := http.Header{
		"X-Lark-Request-Timestamp": []string{ts},
		"X-Lark-Request-Nonce":     []string{nonce},
		"X-Lark-Signature":         []string{hex.EncodeToString(digest[:])},
	}
	if !verifyFeishuSignature(headers, raw, key, now) {
		t.Fatal("correct signature rejected")
	}
	if verifyFeishuSignature(headers, []byte(`{"test":false}`), key, now) {
		t.Fatal("modified body accepted")
	}
	if verifyFeishuSignature(headers, raw, key, now.Add(6*time.Minute)) {
		t.Fatal("stale callback accepted")
	}
}

func TestFeishuEncryptedCallback(t *testing.T) {
	key := "secret-encrypt-key"
	raw, _ := json.Marshal(callbackAction("100", "needs_redo", "submit_review", "on_tester", "test"))
	blockKey := sha256.Sum256([]byte(key))
	block, err := aes.NewCipher(blockKey[:])
	if err != nil {
		t.Fatal(err)
	}
	padding := aes.BlockSize - len(raw)%aes.BlockSize
	plain := append(append([]byte(nil), raw...), bytes.Repeat([]byte{byte(padding)}, padding)...)
	iv := bytes.Repeat([]byte{3}, aes.BlockSize)
	encrypted := make([]byte, len(plain))
	cipher.NewCBCEncrypter(block, iv).CryptBlocks(encrypted, plain)
	body := map[string]string{"encrypt": base64.StdEncoding.EncodeToString(append(iv, encrypted...))}
	bodyJSON, _ := json.Marshal(body)
	now := time.Now()
	ts := strconvFormatInt(now.Unix())
	digest := sha256.Sum256(append([]byte(ts+"nonce"+key), bodyJSON...))
	headers := http.Header{
		"X-Lark-Request-Timestamp": []string{ts},
		"X-Lark-Request-Nonce":     []string{"nonce"},
		"X-Lark-Signature":         []string{hex.EncodeToString(digest[:])},
	}
	h := testFeishuHandler()
	h.cfg.EncryptKey = key
	status, result := callFeishu(t, h, body, headers)
	if status != 200 || result["toast"].(map[string]any)["type"] != "success" {
		t.Fatalf("encrypted callback status=%d body=%#v", status, result)
	}
	headers.Set("X-Lark-Signature", "invalid")
	status, _ = callFeishu(t, h, body, headers)
	if status != 401 {
		t.Fatalf("invalid signed request status=%d", status)
	}
}

func TestEncryptedCardNoSignatureHeaders(t *testing.T) {
	key := "test-key-only"
	h := testFeishuHandler()
	h.cfg.EncryptKey = key
	event := callbackAction("86", "passed", "submit_review", "on_tester", "test")
	event["header"].(map[string]any)["create_time"] = strconv.FormatInt(time.Now().UnixMicro(), 10)
	raw, _ := json.Marshal(event)
	body := encryptFeishuTestPayload(t, raw, key)
	status, response := callFeishu(t, h, body, nil)
	if status != 200 || response["toast"].(map[string]any)["type"] != "success" {
		t.Fatalf("expected simulated score response, got %d: %#v", status, response)
	}
	header := event["header"].(map[string]any)
	for _, offset := range []time.Duration{-6 * time.Minute, 6 * time.Minute} {
		header["create_time"] = strconv.FormatInt(time.Now().Add(offset).UnixMicro(), 10)
		stale, _ := json.Marshal(event)
		status, _ = callFeishu(t, h, encryptFeishuTestPayload(t, stale, key), nil)
		if status != http.StatusUnauthorized {
			t.Fatalf("stale callback accepted: %d", status)
		}
	}
	header["create_time"] = strconv.FormatInt(time.Now().UnixMicro(), 10)
	header["token"] = "invalid"
	invalid, _ := json.Marshal(event)
	status, _ = callFeishu(t, h, encryptFeishuTestPayload(t, invalid, key), nil)
	if status != http.StatusUnauthorized {
		t.Fatalf("incorrect token accepted: %d", status)
	}
	header["token"] = "verification"
	fresh, _ := json.Marshal(event)
	partial := http.Header{"X-Lark-Request-Timestamp": []string{strconv.FormatInt(time.Now().Unix(), 10)}}
	status, _ = callFeishu(t, h, encryptFeishuTestPayload(t, fresh, key), partial)
	if status != http.StatusUnauthorized {
		t.Fatalf("incomplete signature accepted: %d", status)
	}
}

func strconvFormatInt(v int64) string { return strconv.FormatInt(v, 10) }

type feishuTransportFunc func(*http.Request) (*http.Response, error)

func (f feishuTransportFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestFeishuCardSendUsesBotAndOnlyTester(t *testing.T) {
	h := testFeishuHandler()
	calls := 0
	h.client = &http.Client{Transport: feishuTransportFunc(func(req *http.Request) (*http.Response, error) {
		calls++
		switch calls {
		case 1:
			if !strings.Contains(req.URL.Path, "tenant_access_token/internal") {
				t.Errorf("wrong token URL: %s", req.URL)
			}
			return testFeishuHTTPResponse(`{"code":0,"tenant_access_token":"token"}`), nil
		case 2:
			if req.URL.Query().Get("receive_id_type") != "union_id" || req.Header.Get("Authorization") != "Bearer token" {
				t.Errorf("invalid message authorization: %s", req.URL)
			}
			var msg struct {
				ReceiveID string `json:"receive_id"`
				MsgType   string `json:"msg_type"`
				Content   string `json:"content"`
			}
			payload, _ := io.ReadAll(req.Body)
			if err := json.Unmarshal(payload, &msg); err != nil {
				t.Error(err)
			}
			if msg.ReceiveID != "on_tester" || msg.MsgType != "interactive" {
				t.Errorf("unexpected message payload: %+v", msg)
			}
			var card map[string]any
			if err := json.Unmarshal([]byte(msg.Content), &card); err != nil {
				t.Error(err)
			}
			if card["schema"] != "2.0" {
				t.Errorf("not a v2 card: %#v", card)
			}
			return testFeishuHTTPResponse(`{"code":0,"data":{"message_id":"om_test"}}`), nil
		default:
			return nil, errors.New("unexpected Feishu request")
		}
	})}
	if err := h.sendCard(context.Background(), feishuReviewCard("test", "preview", "test", 0, nil)); err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatalf("calls=%d, want 2", calls)
	}
}

func testFeishuHTTPResponse(body string) *http.Response {
	return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}
}
