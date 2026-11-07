package handler

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"tarsgo-backend/config"
	"tarsgo-backend/model"
	"tarsgo-backend/service/assignment"
)

func testFeishuHandler() *FeishuReviewHandler {
	return NewFeishuReviewHandler(config.FeishuConfig{
		AppID: "cli_test", AppSecret: "secret", EncryptKey: "encrypt-key", VerificationToken: "verification",
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
		timestamp := fmt.Sprint(time.Now().Unix())
		nonce := "test-nonce"
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

func callbackAction(kind, action string) map[string]any {
	return map[string]any{
		"schema": "2.0",
		"header": map[string]any{"token": "verification", "app_id": "cli_test", "event_type": "card.action.trigger"},
		"event": map[string]any{
			"operator": map[string]any{"open_id": "ou_operator"},
			"action":   map[string]any{"name": action, "value": map[string]any{"kind": kind}},
		},
	}
}

func TestFeishuURLVerificationRequiresMatchingConfiguredToken(t *testing.T) {
	h := testFeishuHandler()
	for _, tc := range []struct {
		name  string
		token string
		want  int
	}{
		{name: "valid", token: "verification", want: http.StatusOK},
		{name: "missing", token: "", want: http.StatusUnauthorized},
		{name: "wrong", token: "wrong", want: http.StatusUnauthorized},
	} {
		t.Run(tc.name, func(t *testing.T) {
			status, body := callFeishu(t, h, map[string]string{"type": "url_verification", "challenge": "challenge", "token": tc.token}, nil)
			if status != tc.want {
				t.Fatalf("status=%d body=%#v, want %d", status, body, tc.want)
			}
			if status == http.StatusOK && body["challenge"] != "challenge" {
				t.Fatalf("challenge response=%#v", body)
			}
		})
	}
}

func TestFeishuEncryptedURLVerificationUsesTheConfiguredKey(t *testing.T) {
	h := testFeishuHandler()
	plain, err := json.Marshal(map[string]string{"type": "url_verification", "challenge": "encrypted-challenge", "token": "verification"})
	if err != nil {
		t.Fatal(err)
	}
	status, body := callFeishu(t, h, encryptFeishuTestPayload(t, plain, h.cfg.EncryptKey), nil)
	if status != http.StatusOK || body["challenge"] != "encrypted-challenge" {
		t.Fatalf("status=%d body=%#v", status, body)
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

func TestFeishuBusinessCallbackRequiresFreshValidSignature(t *testing.T) {
	h := testFeishuHandler()
	payload, _ := json.Marshal(callbackAction("review", "submit_review"))
	for _, tc := range []struct {
		name      string
		timestamp string
		signature string
		want      int
	}{
		{name: "missing headers", want: http.StatusUnauthorized},
		{name: "bad signature", timestamp: fmt.Sprint(time.Now().Unix()), signature: "bad", want: http.StatusUnauthorized},
		{name: "stale signature", timestamp: "1700000000", signature: "irrelevant", want: http.StatusUnauthorized},
	} {
		t.Run(tc.name, func(t *testing.T) {
			headers := http.Header{}
			if tc.timestamp != "" {
				headers.Set("X-Lark-Request-Timestamp", tc.timestamp)
				headers.Set("X-Lark-Request-Nonce", "nonce")
				headers.Set("X-Lark-Signature", tc.signature)
			}
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodPost, "/api/integrations/feishu/card-action", bytes.NewReader(payload))
			c.Request.Header = headers
			h.Callback(c)
			c.Writer.WriteHeaderNow()
			if recorder.Code != tc.want {
				t.Fatalf("callback status=%d, want %d", recorder.Code, tc.want)
			}
		})
	}
}

func TestFeishuCardActionsAreSeparatedByWorkflowKind(t *testing.T) {
	for _, tc := range []struct {
		kind, action string
		want         bool
	}{
		{"publish", "publish_assignment", true},
		{"review", "submit_review", true},
		{"next_review", "review_next", true},
		{"next_review", "submit_review", false},
		{"review", "publish_assignment", false},
		{"unknown", "submit_review", false},
	} {
		if got := feishuCardActionSupported(tc.kind, tc.action); got != tc.want {
			t.Errorf("kind=%q action=%q got=%t want=%t", tc.kind, tc.action, got, tc.want)
		}
	}
}

func TestFeishuReviewCardIsSentOnlyToTheClickingOperator(t *testing.T) {
	h := testFeishuHandler()
	h.client = &http.Client{Transport: feishuTransportFunc(func(req *http.Request) (*http.Response, error) {
		if req.Method != http.MethodPost || req.URL.Path != "/open-apis/im/v1/messages" {
			t.Fatalf("unexpected request %s %s", req.Method, req.URL)
		}
		if req.URL.Query().Get("receive_id_type") != "open_id" {
			t.Fatalf("recipient type=%q, want app-scoped open_id", req.URL.Query().Get("receive_id_type"))
		}
		var message struct {
			ReceiveID string `json:"receive_id"`
			MsgType   string `json:"msg_type"`
			Content   string `json:"content"`
		}
		if err := json.NewDecoder(req.Body).Decode(&message); err != nil {
			t.Fatal(err)
		}
		if message.ReceiveID != "ou_clicking_trainer" || message.MsgType != "interactive" {
			t.Fatalf("message recipient/type=%q/%q", message.ReceiveID, message.MsgType)
		}
		var card map[string]any
		if err := json.Unmarshal([]byte(message.Content), &card); err != nil {
			t.Fatal(err)
		}
		header := card["header"].(map[string]any)["title"].(map[string]any)["content"]
		if header != "视觉组 · 新人作业" {
			t.Fatalf("card header=%v", header)
		}
		elements := card["body"].(map[string]any)["elements"].([]any)
		info := elements[0].(map[string]any)["content"].(string)
		for _, want := range []string{"作业 #9 · 提交 #44", "提交人：测试成员", "第 2 次提交", "现场图.png"} {
			if !strings.Contains(info, want) {
				t.Errorf("card info missing %q: %s", want, info)
			}
		}
		form := elements[1].(map[string]any)["elements"].([]any)
		action := form[len(form)-1].(map[string]any)["behaviors"].([]any)[0].(map[string]any)["value"].(map[string]any)
		if action["kind"] != "review" || action["submission_id"] != float64(44) || action["group_id"] != float64(9) {
			t.Fatalf("card action does not contain the site submission/group ids: %#v", action)
		}
		return testFeishuHTTPResponse(`{"code":0,"data":{"message_id":"om_review"}}`), nil
	})}

	item := assignment.AssignmentView{ID: 9, GroupID: 9, GroupName: "视觉组", Title: "新人作业"}
	member := assignment.AssignmentMemberView{Name: "测试成员"}
	submission := &assignment.SubmissionView{
		ID: 44, Attempt: 2, SubmittedAt: time.Date(2026, 11, 6, 1, 30, 0, 0, time.UTC),
		Files: []assignment.FileView{{FileName: "现场图.png"}},
	}
	if err := h.sendSubmissionReviewCard(context.Background(), "token", "ou_clicking_trainer", item, member, submission); err != nil {
		t.Fatal(err)
	}
}

func TestFeishuReviewCompletionOffersNextSubmissionInTheSameGroup(t *testing.T) {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	feishuReviewCompleted(c, "批改已保存", 88, model.AssignmentReviewPassed, "通过", 7)
	var result map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	card := result["card"].(map[string]any)["data"].(map[string]any)
	elements := card["body"].(map[string]any)["elements"].([]any)
	if len(elements) != 2 || elements[1].(map[string]any)["text"].(map[string]any)["content"] != "批改下一份" {
		t.Fatalf("completion card does not provide next-review action: %#v", card)
	}
	action := elements[1].(map[string]any)["behaviors"].([]any)[0].(map[string]any)["value"].(map[string]any)
	if action["kind"] != "next_review" || action["group_id"] != float64(7) {
		t.Fatalf("next review action lost current group: %#v", action)
	}
}

func TestBitableWorkflowTriggerRejectsMissingOrWrongToken(t *testing.T) {
	h := testFeishuHandler()
	h.cfg.BitableAppToken = "base"
	h.cfg.BitableTableID = "table"
	for _, token := range []string{"", "wrong"} {
		recorder := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(recorder)
		c.Request = httptest.NewRequest(http.MethodPost, "/api/integrations/feishu/bitable/review-card", strings.NewReader(`{"submission_id":"44","operator":{"id":"ou_user"}}`))
		c.Request.Header.Set("X-Bitable-Workflow-Token", token)
		h.BitableReviewCardTrigger(c)
		c.Writer.WriteHeaderNow()
		if recorder.Code != http.StatusUnauthorized {
			t.Fatalf("workflow token %q accepted with status %d", token, recorder.Code)
		}
	}
}

func TestWorkflowOperatorIdentityAndSubmissionIDParsing(t *testing.T) {
	for _, raw := range []string{`{"open_id":"ou_one"}`, `{"id":"ou_two","name":"Trainer"}`, `"ou_three"`} {
		if got := workflowOperatorOpenID(json.RawMessage(raw)); !strings.HasPrefix(got, "ou_") {
			t.Errorf("operator open_id not found in %s: %q", raw, got)
		}
	}
	for _, tc := range []struct {
		raw  string
		want uint64
	}{{`"123"`, 123}, {`123`, 123}, {`123.0`, 123}, {`"123.0"`, 123}, {`1.23`, 0}, {`"bad"`, 0}, {`null`, 0}} {
		if got := parseWorkflowSubmissionID(json.RawMessage(tc.raw)); got != tc.want {
			t.Errorf("parse %s=%d want %d", tc.raw, got, tc.want)
		}
	}
}

func TestFeishuBindingCodeRejectsTamperingBeforeDatabaseLookup(t *testing.T) {
	h := testFeishuHandler()
	code, err := h.newFeishuLinkCode(972)
	if err != nil || code == "" {
		t.Fatalf("create link code=%q err=%v", code, err)
	}
	user, err := h.consumeFeishuLinkCode(context.Background(), "ou_trainer", code+"x")
	if err == nil || user != nil {
		t.Fatalf("tampered binding code was accepted: user=%#v err=%v", user, err)
	}
}

func TestSubmissionSyncDoesNotSendPrivateNotice(t *testing.T) {
	h := testFeishuHandler()
	// Without Bitable coordinates the post-commit path is intentionally a no-op;
	// there is no longer a per-submission DM/card notification path.
	if err := h.SyncSubmission(context.Background(), 99); err != nil {
		t.Fatalf("submission notice unexpectedly attempted DB or Feishu calls: %v", err)
	}
}

func TestSystemAssignmentActorUsesEnabledSuperAdminID(t *testing.T) {
	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	defer sqlDB.Close()
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true})
	if err != nil {
		t.Fatalf("open GORM over SQL mock: %v", err)
	}
	mock.ExpectQuery(regexp.QuoteMeta("SELECT users.id FROM `users` JOIN roles ON roles.id = users.role_id WHERE roles.name = ? AND users.status = ? ORDER BY users.id ASC,`users`.`id` LIMIT ?")).
		WithArgs(model.RoleNameSuperAdmin, model.UserStatusEnabled, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(uint64(42)))

	h := testFeishuHandler()
	h.db = db
	actor, err := h.systemAssignmentActor(context.Background())
	if err != nil {
		t.Fatalf("resolve system assignment actor: %v", err)
	}
	if actor.ID != 42 || actor.RoleName != model.RoleNameSuperAdmin {
		t.Fatalf("system assignment actor=%#v", actor)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
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

func testFeishuHTTPResponse(body string) *http.Response {
	return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}
}
