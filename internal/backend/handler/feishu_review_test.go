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
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/config"
	"tarsgo-backend/service/assignment"
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
	} else if handler.cfg.EncryptKey != "" {
		const timestamp = "1794000000"
		const nonce = "test-nonce"
		c.Request.Header.Set("X-Lark-Request-Timestamp", timestamp)
		c.Request.Header.Set("X-Lark-Request-Nonce", nonce)
		c.Request.Header.Set("X-Lark-Signature", feishuCallbackSignature(timestamp, nonce, handler.cfg.EncryptKey, payload))
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
	if status != http.StatusUnauthorized {
		t.Fatalf("challenge with invalid verification token status=%d body=%#v", status, result)
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
		{"85", "passed", "submit_review", "on_tester", "review"},
	} {
		status, body := callFeishu(t, testFeishuHandler(), callbackAction(tc.score, tc.decision, tc.action, tc.unionID, tc.kind), nil)
		if status != http.StatusOK || body["toast"].(map[string]any)["type"] != "error" {
			t.Fatalf("invalid callback (%+v) status=%d body=%#v", tc, status, body)
		}
	}

}

func TestFeishuEncryptedCallbackRejectsInvalidSignature(t *testing.T) {
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
	if status != http.StatusUnauthorized {
		t.Fatalf("encrypted callback status=%d body=%#v", status, result)
	}
}

func TestFeishuCallbackAcceptsValidSignatureAndPilotOperator(t *testing.T) {
	h := testFeishuHandler()
	h.cfg.EncryptKey = "secret-encrypt-key"
	plain, err := json.Marshal(callbackAction("90", "passed", "submit_review", "on_tester", "test"))
	if err != nil {
		t.Fatal(err)
	}
	status, result := callFeishu(t, h, encryptFeishuTestPayload(t, plain, h.cfg.EncryptKey), nil)
	if status != http.StatusOK || result["toast"].(map[string]any)["type"] != "success" {
		t.Fatalf("authenticated callback status=%d body=%#v", status, result)
	}
}

func TestFeishuEncryptedCallbackRejectsInvalidVerificationToken(t *testing.T) {
	h := testFeishuHandler()
	h.cfg.EncryptKey = "secret-encrypt-key"
	event := callbackAction("90", "passed", "submit_review", "on_tester", "test")
	event["header"].(map[string]any)["token"] = "wrong"
	plain, err := json.Marshal(event)
	if err != nil {
		t.Fatal(err)
	}
	status, body := callFeishu(t, h, encryptFeishuTestPayload(t, plain, h.cfg.EncryptKey), nil)
	if status != http.StatusUnauthorized {
		t.Fatalf("encrypted callback with an invalid verification token was accepted: %d %#v", status, body)
	}
}

func TestFeishuCallbackRejectsInvalidTokenAndAppID(t *testing.T) {
	h := testFeishuHandler()
	event := callbackAction("86", "passed", "submit_review", "on_other", "test")
	event["header"].(map[string]any)["token"] = "wrong"
	event["header"].(map[string]any)["app_id"] = "wrong"
	event["header"].(map[string]any)["create_time"] = "1"
	status, result := callFeishu(t, h, event, http.Header{})
	if status != http.StatusUnauthorized {
		t.Fatalf("invalid plaintext callback accepted: %d %#v", status, result)
	}
	h.cfg.EncryptKey = "encrypt-key"
	raw, _ := json.Marshal(event)
	status, result = callFeishu(t, h, encryptFeishuTestPayload(t, raw, h.cfg.EncryptKey), http.Header{})
	if status != http.StatusUnauthorized {
		t.Fatalf("missing encrypted callback signature accepted: %d %#v", status, result)
	}
}

func TestFeishuCallbackRequiresPilotOperatorIdentity(t *testing.T) {
	event := callbackAction("86", "passed", "submit_review", "on_other", "test")
	status, result := callFeishu(t, testFeishuHandler(), event, nil)
	if status != http.StatusUnauthorized {
		t.Fatalf("non-pilot Feishu operator accepted: %d %#v", status, result)
	}
}

func feishuCallbackSignature(timestamp, nonce, key string, body []byte) string {
	content := append([]byte(timestamp+nonce+key), body...)
	hash := sha256.Sum256(content)
	return fmt.Sprintf("%x", hash)
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

func TestFeishuSubmissionMessagesUsePrivateRecipientAndOriginalNames(t *testing.T) {
	h := testFeishuHandler()
	var calls []string
	pdf := []byte("%PDF-test")
	png := []byte("\x89PNG\r\n\x1a\nimage")
	docx := []byte("docx content")
	zip := []byte("zip content")
	fileContents := map[string][]byte{
		"测试说明.pdf":  pdf,
		"现场图片.png":  png,
		"编辑练习.docx": docx,
		"附件包.zip":   zip,
	}
	fileKeys := map[string]string{
		"file_test_pdf":  "测试说明.pdf",
		"file_test_docx": "编辑练习.docx",
		"file_test_zip":  "附件包.zip",
	}
	h.client = &http.Client{Transport: feishuTransportFunc(func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/open-apis/auth/v3/tenant_access_token/internal":
			calls = append(calls, "token")
			return testFeishuHTTPResponse(`{"code":0,"tenant_access_token":"token"}`), nil
		case "/open-apis/im/v1/files":
			if err := req.ParseMultipartForm(1 << 20); err != nil {
				t.Fatal(err)
			}
			name := req.FormValue("file_name")
			wantTypes := map[string]string{"测试说明.pdf": "pdf", "编辑练习.docx": "stream", "附件包.zip": "stream"}
			if req.FormValue("file_type") != wantTypes[name] {
				t.Errorf("wrong file metadata: %#v", req.MultipartForm.Value)
			}
			file, header, err := req.FormFile("file")
			if err != nil {
				t.Fatal(err)
			}
			defer file.Close()
			if header.Filename != name {
				t.Errorf("original file name lost: got %s, want %s", header.Filename, name)
			}
			actual, err := io.ReadAll(file)
			if err != nil || !bytes.Equal(actual, fileContents[name]) {
				t.Errorf("uploaded file %s content changed: len=%d err=%v", name, len(actual), err)
			}
			key := "file_test_pdf"
			switch name {
			case "编辑练习.docx":
				key = "file_test_docx"
			case "附件包.zip":
				key = "file_test_zip"
			}
			calls = append(calls, "upload-"+strings.TrimPrefix(filepath.Ext(name), "."))
			return testFeishuHTTPResponse(fmt.Sprintf(`{"code":0,"data":{"file_key":%q}}`, key)), nil
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
			actual, err := io.ReadAll(file)
			if err != nil || !bytes.Equal(actual, png) {
				t.Errorf("image content changed: len=%d err=%v", len(actual), err)
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
			case "text":
				if content["text"] != "作业 #31 · 提交 #82\n附件按下列顺序发送：测试说明.pdf、现场图片.png、编辑练习.docx、附件包.zip" {
					t.Errorf("wrong attachment context marker: %#v", content)
				}
			case "file":
				fileName, ok := fileKeys[content["file_key"].(string)]
				if !ok {
					t.Errorf("bad file message: %#v", content)
				}
				calls = append(calls, "file-"+strings.TrimPrefix(filepath.Ext(fileName), "."))
			case "image":
				if content["image_key"] != "image_test" {
					t.Errorf("bad image message: %#v", content)
				}
			case "interactive":
				if content["schema"] != "2.0" {
					t.Errorf("bad review card: %#v", content)
				}
				header := content["header"].(map[string]any)
				if header["title"].(map[string]any)["content"] != "机器人组 · 新手作业" {
					t.Errorf("card is missing assignment and group: %#v", header)
				}
				elements := content["body"].(map[string]any)["elements"].([]any)
				info := elements[0].(map[string]any)["content"].(string)
				for _, expected := range []string{"作业 #31 · 提交 #82", "提交人：联调成员", "第 2 次提交", "2026-11-06 09:30", "测试说明.pdf、现场图片.png、编辑练习.docx、附件包.zip"} {
					if !strings.Contains(info, expected) {
						t.Errorf("card is missing %q: %s", expected, info)
					}
				}
				if len(elements) != 2 {
					t.Errorf("successful attachments must not show website links: %#v", elements)
				}
				form := elements[1].(map[string]any)["elements"].([]any)
				value := form[len(form)-1].(map[string]any)["behaviors"].([]any)[0].(map[string]any)["value"].(map[string]any)
				if value["submission_id"] != float64(82) {
					t.Errorf("card callback is not tied to this submission: %#v", value)
				}
			default:
				t.Errorf("unexpected message type: %s", payload.MsgType)
			}
			if payload.MsgType == "text" {
				calls = append(calls, "marker")
			} else if payload.MsgType == "image" {
				calls = append(calls, "image")
			} else if payload.MsgType == "interactive" {
				calls = append(calls, "interactive")
			}
			return testFeishuHTTPResponse(`{"code":0,"data":{"message_id":"om_test"}}`), nil
		}
		return nil, errors.New("unexpected request")
	})}
	ctx := context.Background()
	if _, err := h.tenantToken(ctx); err != nil {
		t.Fatal(err)
	}
	item := assignment.AssignmentView{ID: 31, GroupName: "机器人组", Title: "新手作业"}
	member := assignment.AssignmentMemberView{Name: "联调成员"}
	submission := assignment.SubmissionView{
		ID: 82, Attempt: 2, SubmittedAt: time.Date(2026, 11, 6, 1, 30, 0, 0, time.UTC),
		Files: []assignment.FileView{
			{ID: 1001, FileName: "测试说明.pdf", Size: int64(len(pdf)), ContentType: "application/octet-stream"},
			{ID: 1002, FileName: "现场图片.png", Size: int64(len(png)), ContentType: "application/octet-stream"},
			{ID: 1003, FileName: "编辑练习.docx", Size: int64(len(docx)), ContentType: "application/octet-stream"},
			{ID: 1004, FileName: "附件包.zip", Size: int64(len(zip)), ContentType: "application/octet-stream"},
		},
	}
	contents := map[uint64]*assignment.Download{
		1001: {FileName: "测试说明.pdf", Content: pdf},
		1002: {FileName: "现场图片.png", Content: png},
		1003: {FileName: "编辑练习.docx", Content: docx},
		1004: {FileName: "附件包.zip", Content: zip},
	}
	openFile := func(_ context.Context, actor assignment.Actor, fileID uint64) (*assignment.Download, error) {
		if actor.ID != 77 || actor.RoleName != "admin" {
			t.Errorf("attachment was opened outside the configured reviewer identity: %+v", actor)
		}
		return contents[fileID], nil
	}
	if err := h.sendSubmissionReview(ctx, "token", assignment.Actor{ID: 77, RoleName: "admin"}, item, member, &submission, openFile); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(calls, ","); got != "token,marker,upload-pdf,file-pdf,upload-image,image,upload-docx,file-docx,upload-zip,file-zip,interactive" {
		t.Fatalf("wrong upload/message order: %s", got)
	}
}

func TestFeishuHEICUsesImageUploadAndMessage(t *testing.T) {
	h := testFeishuHandler()
	image := []byte("HEIC test image")
	var calls []string
	h.client = &http.Client{Transport: feishuTransportFunc(func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/open-apis/im/v1/images":
			if err := req.ParseMultipartForm(1 << 20); err != nil {
				t.Fatal(err)
			}
			if req.FormValue("image_type") != "message" {
				t.Errorf("image_type = %q, want message", req.FormValue("image_type"))
			}
			file, header, err := req.FormFile("image")
			if err != nil {
				t.Fatal(err)
			}
			defer file.Close()
			actual, err := io.ReadAll(file)
			if err != nil || header.Filename != "scan.heic" || !bytes.Equal(actual, image) {
				t.Errorf("HEIC upload changed: filename=%q bytes=%d err=%v", header.Filename, len(actual), err)
			}
			calls = append(calls, "upload")
			return testFeishuHTTPResponse(`{"code":0,"data":{"image_key":"image_heic"}}`), nil
		case "/open-apis/im/v1/messages":
			var payload struct {
				ReceiveID string `json:"receive_id"`
				MsgType   string `json:"msg_type"`
				Content   string `json:"content"`
			}
			if err := json.NewDecoder(req.Body).Decode(&payload); err != nil {
				t.Fatal(err)
			}
			var content map[string]string
			if err := json.Unmarshal([]byte(payload.Content), &content); err != nil {
				t.Fatal(err)
			}
			if payload.ReceiveID != "on_tester" || payload.MsgType != "image" || content["image_key"] != "image_heic" {
				t.Errorf("unexpected image message: %+v content=%#v", payload, content)
			}
			calls = append(calls, "message")
			return testFeishuHTTPResponse(`{"code":0,"data":{"message_id":"om_test"}}`), nil
		default:
			return nil, fmt.Errorf("unexpected request %s", req.URL.Path)
		}
	})}

	file := assignment.FileView{ID: 1, FileName: "scan.heic", Size: int64(len(image))}
	download := &assignment.Download{FileName: file.FileName, Content: image}
	if err := h.sendSubmissionFileContent(context.Background(), "token", 82, file, download); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(calls, ","); got != "upload,message" {
		t.Fatalf("HEIC path calls = %s, want upload then image message", got)
	}
}

func TestFeishuUploadFailureIncludesPlatformCode(t *testing.T) {
	h := testFeishuHandler()
	h.client = &http.Client{Transport: feishuTransportFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusBadRequest, Body: io.NopCloser(strings.NewReader(`{"code":99991672,"msg":"private diagnostic detail"}`))}, nil
	})}
	_, err := h.uploadFeishuFile(context.Background(), "token", "test.pdf", []byte("pdf"), false, "pdf")
	if err == nil || err.Error() != "Feishu upload HTTP 400, code=99991672" {
		t.Fatalf("upload error = %v; want status and platform error code without diagnostic text", err)
	}
}

func TestFeishuUploadFailureDoesNotStopCard(t *testing.T) {
	h := testFeishuHandler()
	var calls []string
	h.client = &http.Client{Transport: feishuTransportFunc(func(req *http.Request) (*http.Response, error) {
		if req.URL.Path == "/open-apis/im/v1/files" {
			calls = append(calls, "upload-failed")
			return &http.Response{StatusCode: http.StatusRequestEntityTooLarge, Body: io.NopCloser(strings.NewReader(""))}, nil
		}
		if req.URL.Path == "/open-apis/im/v1/images" {
			calls = append(calls, "upload-image")
			return testFeishuHTTPResponse(`{"code":0,"data":{"image_key":"image_ok"}}`), nil
		}
		if req.URL.Path == "/open-apis/im/v1/messages" {
			var payload struct {
				MsgType string `json:"msg_type"`
				Content string `json:"content"`
			}
			if err := json.NewDecoder(req.Body).Decode(&payload); err != nil {
				t.Fatal(err)
			}
			var content map[string]any
			if err := json.Unmarshal([]byte(payload.Content), &content); err != nil {
				t.Fatal(err)
			}
			switch payload.MsgType {
			case "text":
				calls = append(calls, "marker")
			case "image":
				if content["image_key"] != "image_ok" {
					t.Errorf("second attachment was not sent after first upload failed: %#v", content)
				}
				calls = append(calls, "image")
			case "interactive":
				elements := content["body"].(map[string]any)["elements"].([]any)
				if len(elements) != 3 {
					t.Fatalf("only failed attachment should have a website link: %#v", elements)
				}
				link := elements[1].(map[string]any)
				if link["text"].(map[string]any)["content"] != "附件发送失败，网站下载 · 失败.pdf" {
					t.Errorf("wrong failed-file fallback: %#v", link)
				}
				calls = append(calls, "interactive")
			default:
				t.Errorf("unexpected message type: %s", payload.MsgType)
			}
			return testFeishuHTTPResponse(`{"code":0,"data":{"message_id":"om_card"}}`), nil
		}
		return nil, errors.New("unexpected request")
	})}
	ctx := context.Background()
	pdf := []byte("%PDF-failure")
	png := []byte("\x89PNG\r\n\x1a\nimage")
	item := assignment.AssignmentView{ID: 31, GroupName: "机器人组", Title: "新手作业"}
	member := assignment.AssignmentMemberView{Name: "联调成员"}
	submission := assignment.SubmissionView{ID: 82, Attempt: 1, SubmittedAt: time.Date(2026, 11, 6, 1, 30, 0, 0, time.UTC), Files: []assignment.FileView{
		{ID: 1003, FileName: "失败.pdf", Size: int64(len(pdf))},
		{ID: 1004, FileName: "后续图片.png", Size: int64(len(png))},
	}}
	contents := map[uint64]*assignment.Download{
		1003: {FileName: "失败.pdf", Content: pdf},
		1004: {FileName: "后续图片.png", Content: png},
	}
	if err := h.sendSubmissionReview(ctx, "token", assignment.Actor{ID: 77, RoleName: "admin"}, item, member, &submission, func(_ context.Context, _ assignment.Actor, fileID uint64) (*assignment.Download, error) {
		return contents[fileID], nil
	}); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(calls, ","); got != "marker,upload-failed,upload-image,image,interactive" {
		t.Fatalf("failed attachment stopped later messages or card: %s", got)
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
