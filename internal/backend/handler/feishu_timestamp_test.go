package handler

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestFeishuInvalidTimestampDiagnosticIsRedacted(t *testing.T) {
	for _, tc := range []struct {
		name, timestamp, classes, category string
	}{
		{"fractional", "1700000000.125", "digit,dot", "syntax"},
		{"date", "2026-11-08T12:08:20Z", "digit,letter,sign,colon", "syntax"},
		{"overflow", "9223372036854775808", "digit", "range"},
		{"negative overflow", "-9223372036854775809", "digit,sign", "range"},
		{"non ascii", "１７００００００００", "non_ascii", "syntax"},
		{"whitespace", " 1700000000\t", "digit,space", "syntax"},
		{"log injection", "private-value\r\nkey=value", "letter,space,sign,other_ascii", "syntax"},
		{"long input", strings.Repeat("private", 1000), "letter", "syntax"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := testFeishuHandler()
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/api/integrations/feishu/card-action", nil)
			c.Request.Header.Set("X-Lark-Request-Timestamp", tc.timestamp)
			c.Request.Header.Set("X-Lark-Request-Nonce", "private-nonce")
			c.Request.Header.Set("X-Lark-Signature", "private-signature")
			decoded, err := h.authenticateAndDecodeFeishuCallback(c, []byte(`{"private":"body"}`))
			want := fmt.Sprintf("invalid Feishu callback timestamp length_bytes=%d character_types=%s parse_error=%s", len(tc.timestamp), tc.classes, tc.category)
			if err == nil || err.Error() != want || decoded != nil {
				t.Fatalf("decoded=%q error=%v, want only redacted metadata %q", decoded, err, want)
			}
			status, _ := callFeishu(t, h, callbackAction("review", "submit_review"), c.Request.Header)
			if status != http.StatusUnauthorized {
				t.Fatalf("invalid timestamp status=%d, want 401", status)
			}
		})
	}
}
