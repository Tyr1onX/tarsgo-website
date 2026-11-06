package handler

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/config"
	"tarsgo-backend/service/assignment"
)

func testFeishuHandler() *FeishuReviewHandler {
	return NewFeishuReviewHandler(config.FeishuConfig{
		AppID: "cli_test", AppSecret: "secret",
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

func TestFeishuURLVerificationWithoutToken(t *testing.T) {
	h := testFeishuHandler()
	status, result := callFeishu(t, h, map[string]string{"type": "url_verification", "challenge": "hello", "token": "verification"}, nil)
	if status != http.StatusOK || result["challenge"] != "hello" {
		t.Fatalf("url verification status=%d body=%#v", status, result)
	}
	status, result = callFeishu(t, h, map[string]string{"type": "url_verification", "challenge": "hello", "token": "wrong"}, nil)
	if status != http.StatusOK || result["challenge"] != "hello" {
		t.Fatalf("challenge without token status=%d body=%#v", status, result)
	}
}

func TestFeishuEncryptedURLVerificationWithoutToken(t *testing.T) {
	key := "secret-encrypt-key"
	h := testFeishuHandler()
	h.cfg.EncryptKey = key

	for _, tc := range []struct {
		name  string
		token string
		want  int
	}{
		{name: "valid token", token: "verification", want: http.StatusOK},
		{name: "invalid token", token: "wrong", want: http.StatusOK},
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
		{"85", "passed", "submit_review", "on_tester", "review"},
	} {
		status, body := callFeishu(t, testFeishuHandler(), callbackAction(tc.score, tc.decision, tc.action, tc.unionID, tc.kind), nil)
		if status != http.StatusOK || body["toast"].(map[string]any)["type"] != "error" {
			t.Fatalf("invalid callback (%+v) status=%d body=%#v", tc, status, body)
		}
	}

}

func TestFeishuEncryptedCallbackWithoutAuthentication(t *testing.T) {
	key := "secret-encrypt-key"
	raw, _ := json.Marshal(callbackAction("100", "needs_redo", "submit_review", "on_other", "test"))
	body := encryptFeishuTestPayload(t, raw, key)
	h := testFeishuHandler()
	h.cfg.EncryptKey = key
	headers := http.Header{
		"X-Lark-Request-Timestamp": []string{"invalid"},
		"X-Lark-Signature":         []string{"invalid"},
	}
	status, result := callFeishu(t, h, body, headers)
	if status != 200 || result["toast"].(map[string]any)["type"] != "success" {
		t.Fatalf("encrypted callback status=%d body=%#v", status, result)
	}
}

func TestFeishuCallbackWithoutRequestAuthentication(t *testing.T) {
	h := testFeishuHandler()
	event := callbackAction("86", "passed", "submit_review", "on_other", "test")
	event["header"].(map[string]any)["token"] = "wrong"
	event["header"].(map[string]any)["app_id"] = "wrong"
	event["header"].(map[string]any)["create_time"] = "1"
	status, result := callFeishu(t, h, event, nil)
	if status != http.StatusOK || result["toast"].(map[string]any)["type"] != "success" {
		t.Fatalf("unauthenticated plaintext callback rejected: %d %#v", status, result)
	}
	h.cfg.EncryptKey = "encrypt-key"
	raw, _ := json.Marshal(event)
	status, result = callFeishu(t, h, encryptFeishuTestPayload(t, raw, h.cfg.EncryptKey), nil)
	if status != http.StatusOK || result["toast"].(map[string]any)["type"] != "success" {
		t.Fatalf("unauthenticated encrypted callback rejected: %d %#v", status, result)
	}
}

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
	if err := h.sendCard(context.Background(), feishuReviewCard("test", "preview", "test", 0, nil, nil)); err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatalf("calls=%d, want 2", calls)
	}
}

func TestFeishuSubmissionCardIncludesAttachmentLinks(t *testing.T) {
	assignmentID := uint64(42)
	card := feishuReviewCard("运营组 · 测试作业", "提交人：联调成员", "review", 77, &assignmentID,
		[]assignment.FileView{{ID: 15, FileName: "test.pdf", DownloadURL: "/api/assignment-files/15"}})
	elements := card["body"].(map[string]any)["elements"].([]any)
	if len(elements) != 4 {
		t.Fatalf("card elements=%d, want description, website link, file link and review form", len(elements))
	}
	website := elements[1].(map[string]any)["behaviors"].([]any)[0].(map[string]any)["default_url"]
	if website != "https://jijiamaster.com/dashboard/admin/training/submissions?assignmentId=42" {
		t.Fatalf("wrong website link: %v", website)
	}
	file := elements[2].(map[string]any)
	if file["text"].(map[string]any)["content"] != "查看附件 · test.pdf" ||
		file["behaviors"].([]any)[0].(map[string]any)["default_url"] != "https://jijiamaster.com/api/assignment-files/15" {
		t.Fatalf("wrong attachment button: %#v", file)
	}
	form := elements[3].(map[string]any)["elements"].([]any)
	action := form[len(form)-1].(map[string]any)["behaviors"].([]any)[0].(map[string]any)["value"].(map[string]any)
	if action["kind"] != "review" || action["submission_id"] != uint64(77) {
		t.Fatalf("wrong grading callback: %#v", action)
	}
}

func TestFeishuNotificationIsDisabledWithoutPilotConfiguration(t *testing.T) {
	h := testFeishuHandler()
	if err := h.NotifySubmission(context.Background(), 99); err != nil {
		t.Fatalf("disabled notification must not attempt database access: %v", err)
	}
}

func testFeishuHTTPResponse(body string) *http.Response {
	return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}
}
