package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"tarsgo-backend/model"
	"tarsgo-backend/service/assignment"
)

// Synthetic input with the same aggregate length and character classes as the
// production failure; no production timestamp or payload was retained.
const opaqueFeishuTimestamp = "2026-11-08 12:33:40.000000000 +0000 UTC m=+123456.123456789"

func TestFeishuCallbackAuthenticatesTimestampVerbatim(t *testing.T) {
	for _, encrypted := range []bool{false, true} {
		h := testFeishuHandler()
		payload, _ := json.Marshal(callbackAction("review", "submit_review"))
		if encrypted {
			payload, _ = json.Marshal(encryptFeishuTestPayload(t, payload, h.cfg.EncryptKey))
		}
		for _, timestamp := range []string{opaqueFeishuTimestamp, "1700000000"} {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/api/integrations/feishu/card-action", nil)
			c.Request.Header.Set("X-Lark-Request-Timestamp", timestamp)
			c.Request.Header.Set("X-Lark-Request-Nonce", "test-nonce")
			c.Request.Header.Set("X-Lark-Signature", feishuCallbackSignature(timestamp, "test-nonce", h.cfg.EncryptKey, payload))
			decoded, err := h.authenticateAndDecodeFeishuCallback(c, payload)
			if err != nil || !bytes.Contains(decoded, []byte(`"event_type":"card.action.trigger"`)) {
				t.Fatalf("signed timestamp rejected: encrypted=%t decoded=%q err=%v", encrypted, decoded, err)
			}
			// Normalizing the header would authenticate altered input incorrectly.
			c.Request.Header.Set("X-Lark-Request-Timestamp", timestamp+" ")
			if _, err := h.authenticateAndDecodeFeishuCallback(c, payload); err == nil || err.Error() != "invalid Feishu callback signature" {
				t.Fatalf("changed timestamp was not rejected by signature check: %v", err)
			}
		}
	}
}

func TestFeishuOpaqueTimestampPreservesCallbackAuthentication(t *testing.T) {
	for _, tc := range []struct{ name, change, want string }{
		{"missing timestamp", "timestamp", "missing Feishu callback signature"},
		{"missing nonce", "nonce", "missing Feishu callback signature"},
		{"missing signature", "signature", "missing Feishu callback signature"},
		{"bad signature", "bad-signature", "invalid Feishu callback signature"},
		{"wrong token", "token", "invalid Feishu verification token"},
		{"wrong app", "app_id", "invalid Feishu app id"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := testFeishuHandler()
			event := callbackAction("review", "submit_review")
			if tc.change == "token" || tc.change == "app_id" {
				event["header"].(map[string]any)[tc.change] = "wrong"
			}
			payload, _ := json.Marshal(event)
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/api/integrations/feishu/card-action", nil)
			c.Request.Header.Set("X-Lark-Request-Timestamp", opaqueFeishuTimestamp)
			c.Request.Header.Set("X-Lark-Request-Nonce", "test-nonce")
			c.Request.Header.Set("X-Lark-Signature", feishuCallbackSignature(opaqueFeishuTimestamp, "test-nonce", h.cfg.EncryptKey, payload))
			switch tc.change {
			case "timestamp":
				c.Request.Header.Del("X-Lark-Request-Timestamp")
			case "nonce":
				c.Request.Header.Del("X-Lark-Request-Nonce")
			case "signature":
				c.Request.Header.Del("X-Lark-Signature")
			case "bad-signature":
				c.Request.Header.Set("X-Lark-Signature", "bad")
			}
			if _, err := h.authenticateAndDecodeFeishuCallback(c, payload); err == nil || err.Error() != tc.want {
				t.Fatalf("err=%v, want %q", err, tc.want)
			}
			status, _ := callFeishu(t, h, event, c.Request.Header)
			if status != http.StatusUnauthorized {
				t.Fatalf("unauthenticated callback status=%d, want 401", status)
			}
		})
	}
}

func TestFeishuOpaqueTimestampDoesNotBypassAdministratorPermission(t *testing.T) {
	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true})
	if err != nil {
		t.Fatal(err)
	}
	mock.ExpectQuery("SELECT .* FROM `users` WHERE feishu_open_id = \\? ORDER BY `users`.`id` LIMIT \\?").
		WithArgs("ou_operator", 1).WillReturnRows(sqlmock.NewRows([]string{"id", "role_id", "status"}).AddRow(8, 3, model.UserStatusEnabled))
	mock.ExpectQuery("SELECT .* FROM `roles` WHERE `roles`.`id` = \\?").
		WithArgs(3).WillReturnRows(sqlmock.NewRows([]string{"id", "name"}).AddRow(3, model.RoleNameUser))
	h := testFeishuHandler()
	h.db, h.assignments = db, assignment.NewService(db)
	event := callbackAction("review", "submit_review")
	payload, _ := json.Marshal(event)
	headers := http.Header{}
	headers.Set("X-Lark-Request-Timestamp", opaqueFeishuTimestamp)
	headers.Set("X-Lark-Request-Nonce", "test-nonce")
	headers.Set("X-Lark-Signature", feishuCallbackSignature(opaqueFeishuTimestamp, "test-nonce", h.cfg.EncryptKey, payload))
	status, _ := callFeishu(t, h, event, headers)
	if status != http.StatusUnauthorized {
		t.Fatalf("non-admin callback status=%d, want 401", status)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
