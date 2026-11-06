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
	if err := h.sendCard(context.Background(), feishuReviewCard("test", "preview", "test", 0, nil)); err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatalf("calls=%d, want 2", calls)
	}
}

func TestFeishuSubmissionCardOnlyLinksFailedAttachments(t *testing.T) {
	files := []assignment.FileView{{ID: 15, FileName: "test.pdf", DownloadURL: "/api/assignment-files/15"}}
	card := feishuReviewCard("运营组 · 测试作业", "提交人：联调成员\n第 2 次提交\n附件：test.pdf、photo.png", "review", 77, files)
	elements := card["body"].(map[string]any)["elements"].([]any)
	if len(elements) != 3 {
		t.Fatalf("card elements=%d, want description, failed file link and review form", len(elements))
	}
	info := elements[0].(map[string]any)["content"].(string)
	if !strings.Contains(info, "test.pdf、photo.png") || !strings.Contains(info, "第 2 次提交") {
		t.Fatalf("missing attachment names or attempt: %s", info)
	}
	file := elements[1].(map[string]any)
	if file["text"].(map[string]any)["content"] != "附件发送失败，网站下载 · test.pdf" ||
		file["behaviors"].([]any)[0].(map[string]any)["default_url"] != "https://jijiamaster.com/api/assignment-files/15" {
		t.Fatalf("wrong fallback link: %#v", file)
	}
	form := elements[2].(map[string]any)["elements"].([]any)
	action := form[len(form)-1].(map[string]any)["behaviors"].([]any)[0].(map[string]any)["value"].(map[string]any)
	if action["kind"] != "review" || action["submission_id"] != uint64(77) {
		t.Fatalf("wrong grading callback: %#v", action)
	}
	successCard := feishuReviewCard("作业", "附件：test.pdf", "review", 77, nil)
	if len(successCard["body"].(map[string]any)["elements"].([]any)) != 2 {
		t.Fatal("successful delivery must not show website links")
	}
}

func TestFeishuFileMessagesUsePrivateRecipientAndOriginalNames(t *testing.T) {
	h := testFeishuHandler()
	var calls []string
	h.client = &http.Client{Transport: feishuTransportFunc(func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/open-apis/im/v1/files":
			if err := req.ParseMultipartForm(1 << 20); err != nil {
				t.Fatal(err)
			}
			if req.FormValue("file_type") != "pdf" || req.FormValue("file_name") != "测试说明.pdf" {
				t.Errorf("wrong file metadata: %#v", req.MultipartForm.Value)
			}
			file, header, err := req.FormFile("file")
			if err != nil {
				t.Fatal(err)
			}
			defer file.Close()
			if header.Filename != "测试说明.pdf" {
				t.Errorf("original file name lost: %s", header.Filename)
			}
			b, _ := io.ReadAll(file)
			if string(b) != "%PDF-test" {
				t.Errorf("file content changed: %q", b)
			}
			calls = append(calls, "upload-pdf")
			return testFeishuHTTPResponse(`{"code":0,"data":{"file_key":"file_test"}}`), nil
		case "/open-apis/im/v1/images":
			if err := req.ParseMultipartForm(1 << 20); err != nil {
				t.Fatal(err)
			}
			if req.FormValue("image_type") != "message" {
				t.Errorf("wrong image_type: %s", req.FormValue("image_type"))
			}
			file, header, err := req.FormFile("image")
			if err != nil {
				t.Fatal(err)
			}
			defer file.Close()
			if header.Filename != "现场图片.png" {
				t.Errorf("image name lost: %s", header.Filename)
			}
			calls = append(calls, "upload-image")
			return testFeishuHTTPResponse(`{"code":0,"data":{"image_key":"image_test"}}`), nil
		case "/open-apis/im/v1/messages":
			if req.URL.Query().Get("receive_id_type") != "union_id" || req.Header.Get("Authorization") != "Bearer token" {
				t.Errorf("wrong recipient type or token: %s", req.URL)
			}
			var payload struct {
				ReceiveID string `json:"receive_id"`
				MsgType   string `json:"msg_type"`
				Content   string `json:"content"`
			}
			if err := json.NewDecoder(req.Body).Decode(&payload); err != nil {
				t.Fatal(err)
			}
			if payload.ReceiveID != "on_tester" {
				t.Errorf("sent to unexpected recipient: %s", payload.ReceiveID)
			}
			var content map[string]any
			if err := json.Unmarshal([]byte(payload.Content), &content); err != nil {
				t.Fatal(err)
			}
			switch payload.MsgType {
			case "file":
				if content["file_key"] != "file_test" {
					t.Errorf("bad file message: %#v", content)
				}
			case "image":
				if content["image_key"] != "image_test" {
					t.Errorf("bad image message: %#v", content)
				}
			case "interactive":
				if content["schema"] != "2.0" {
					t.Errorf("bad review card: %#v", content)
				}
			default:
				t.Errorf("unexpected message type: %s", payload.MsgType)
			}
			calls = append(calls, payload.MsgType)
			return testFeishuHTTPResponse(`{"code":0,"data":{"message_id":"om_test"}}`), nil
		}
		return nil, errors.New("unexpected request")
	})}
	ctx := context.Background()
	pdfKey, err := h.uploadFeishuFile(ctx, "token", "测试说明.pdf", []byte("%PDF-test"), false, "pdf")
	if err != nil {
		t.Fatal(err)
	}
	if err := h.sendMessage(ctx, "token", "file", map[string]string{"file_key": pdfKey}); err != nil {
		t.Fatal(err)
	}
	imageKey, err := h.uploadFeishuFile(ctx, "token", "现场图片.png", []byte("PNG-test"), true, "")
	if err != nil {
		t.Fatal(err)
	}
	if err := h.sendMessage(ctx, "token", "image", map[string]string{"image_key": imageKey}); err != nil {
		t.Fatal(err)
	}
	if err := h.sendMessage(ctx, "token", "interactive", feishuReviewCard("作业", "附件：测试说明.pdf、现场图片.png", "review", 77, nil)); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(calls, ","); got != "upload-pdf,file,upload-image,image,interactive" {
		t.Fatalf("wrong upload/message order: %s", got)
	}
}

func TestFeishuUploadFailureDoesNotStopCard(t *testing.T) {
	h := testFeishuHandler()
	cardSent := false
	h.client = &http.Client{Transport: feishuTransportFunc(func(req *http.Request) (*http.Response, error) {
		if req.URL.Path == "/open-apis/im/v1/files" {
			return &http.Response{StatusCode: http.StatusRequestEntityTooLarge, Body: io.NopCloser(strings.NewReader(""))}, nil
		}
		if req.URL.Path == "/open-apis/im/v1/messages" {
			cardSent = true
			var payload struct {
				MsgType string `json:"msg_type"`
			}
			if err := json.NewDecoder(req.Body).Decode(&payload); err != nil {
				t.Fatal(err)
			}
			if payload.MsgType != "interactive" {
				t.Fatalf("wrong fallback message: %s", payload.MsgType)
			}
			return testFeishuHTTPResponse(`{"code":0,"data":{"message_id":"om_card"}}`), nil
		}
		return nil, errors.New("unexpected request")
	})}
	ctx := context.Background()
	if _, err := h.uploadFeishuFile(ctx, "token", "失败.pdf", []byte("pdf"), false, "pdf"); err == nil {
		t.Fatal("expected upload error")
	}
	failed := []assignment.FileView{{ID: 19, FileName: "失败.pdf"}}
	if err := h.sendMessage(ctx, "token", "interactive", feishuReviewCard("作业", "附件：失败.pdf", "review", 77, failed)); err != nil {
		t.Fatal(err)
	}
	if !cardSent {
		t.Fatal("failed attachment must not suppress review card")
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