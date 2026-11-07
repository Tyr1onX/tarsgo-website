package handler

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/service/assignment"
)

func TestFeishuAssignmentPublishCardIncludesRequiredSiteFields(t *testing.T) {
	card := feishuAssignmentPublishCard([]assignment.GroupOption{{ID: 17, Name: "视觉组"}}, "10000000-0000-4000-8000-000000000001")
	header := card["header"].(map[string]any)
	if header["title"].(map[string]any)["content"] != "发布网站作业" {
		t.Fatalf("unexpected card header: %#v", header)
	}
	elements := card["body"].(map[string]any)["elements"].([]any)
	form := elements[1].(map[string]any)
	fields := form["elements"].([]any)
	got := map[string]bool{}
	for _, field := range fields {
		field := field.(map[string]any)
		if name, ok := field["name"].(string); ok {
			got[name] = true
			if name == "description" || name == "attachment_requirements" {
				if maxLength, ok := field["max_length"].(int); !ok || maxLength > feishuCardInputMaxLength {
					t.Errorf("%s max_length = %v, want at most %d", name, field["max_length"], feishuCardInputMaxLength)
				}
			}
		}
	}
	for _, name := range []string{"title", "description", "group_id", "due_at", "target_user_ids", "attachment_requirements", "publish_assignment"} {
		if !got[name] {
			t.Errorf("publish card is missing %q", name)
		}
	}
	group := fields[2].(map[string]any)
	option := group["options"].([]any)[0].(map[string]any)
	if option["value"] != "17" || option["text"].(map[string]any)["content"] != "视觉组" {
		t.Fatalf("group option was not drawn from the authorized website groups: %#v", option)
	}
	if strings.Contains(strings.ToLower(strings.Join([]string{fields[0].(map[string]any)["tag"].(string)}, " ")), "upload") {
		t.Fatal("card must not claim to support an unavailable file upload component")
	}
}

func TestFeishuCardActionsMatchTheirFormType(t *testing.T) {
	for _, tc := range []struct {
		kind   string
		action string
		want   bool
	}{
		{kind: "publish", action: "publish_assignment", want: true},
		{kind: "publish", action: "submit_review"},
		{kind: "review", action: "submit_review", want: true},
		{kind: "review", action: "publish_assignment"},
		{kind: "unknown", action: "submit_review"},
	} {
		if got := feishuCardActionSupported(tc.kind, tc.action); got != tc.want {
			t.Errorf("action %q for kind %q = %t, want %t", tc.action, tc.kind, got, tc.want)
		}
	}
}

func TestParseFeishuRecipientIDs(t *testing.T) {
	for _, tc := range []struct {
		input string
		want  []uint64
		bad   bool
	}{
		{input: "", want: nil},
		{input: "全组", want: nil},
		{input: "11, 12，11", want: []uint64{11, 12}},
		{input: "11;12", want: []uint64{11, 12}},
		{input: "11, zero", bad: true},
		{input: "0", bad: true},
	} {
		got, err := parseFeishuRecipientIDs(tc.input)
		if (err != nil) != tc.bad {
			t.Fatalf("parse(%q) err=%v, bad=%t", tc.input, err, tc.bad)
		}
		if !tc.bad && len(got) != len(tc.want) {
			t.Fatalf("parse(%q) = %v, want %v", tc.input, got, tc.want)
		}
		for index := range got {
			if got[index] != tc.want[index] {
				t.Fatalf("parse(%q) = %v, want %v", tc.input, got, tc.want)
			}
		}
	}
}

func TestFeishuMultipartFilesPreservesNamesAndContents(t *testing.T) {
	want := []byte("teaching material")
	form, cleanup, err := feishuMultipartFiles([]feishuMaterialBytes{{Name: "说明.pdf", Content: want}})
	if err != nil {
		t.Fatal(err)
	}
	defer cleanup()
	if len(form.File["files"]) != 1 || form.File["files"][0].Filename != "说明.pdf" {
		t.Fatalf("unexpected parsed files: %#v", form.File)
	}
	file, err := form.File["files"][0].Open()
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	got, err := io.ReadAll(file)
	if err != nil || !bytes.Equal(got, want) {
		t.Fatalf("multipart content changed: got=%q err=%v", got, err)
	}
}

func TestFeishuResourceNameFallbackUsesMIMEExtension(t *testing.T) {
	name := "飞书教学资料-abc12345" + filepath.Ext(mimeExtension("image/png", []byte("png")))
	if name != "飞书教学资料-abc12345.png" {
		t.Fatalf("unexpected resource file name: %s", name)
	}
	if got := mimeExtension("application/octet-stream", []byte("\x89PNG\r\n\x1a\n")); got != ".png" {
		t.Fatalf("generic image response content type was not detected: %q", got)
	}
}

func TestFeishuMessageResourceDownloadUsesPrivateMessageResourceAPI(t *testing.T) {
	h := testFeishuHandler()
	want := []byte("%PDF-1.7 test")
	h.client = &http.Client{Transport: feishuTransportFunc(func(request *http.Request) (*http.Response, error) {
		if request.Method != http.MethodGet || request.URL.Path != "/open-apis/im/v1/messages/om_private/resources/file_key_1" || request.URL.Query().Get("type") != "file" {
			t.Fatalf("unexpected message resource request: %s %s", request.Method, request.URL)
		}
		if request.Header.Get("Authorization") != "Bearer token" {
			t.Fatalf("missing app authorization: %q", request.Header.Get("Authorization"))
		}
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"application/pdf"}}, Body: io.NopCloser(bytes.NewReader(want))}, nil
	})}
	got, contentType, err := h.downloadFeishuMessageResource(context.Background(), "token", "om_private", "file_key_1", "file")
	if err != nil || !bytes.Equal(got, want) || contentType != "application/pdf" {
		t.Fatalf("resource download content=%q type=%q err=%v", got, contentType, err)
	}
}

func TestFeishuMessageEventIgnoresGroupChatsAndMissingOpenID(t *testing.T) {
	h := testFeishuHandler()
	for _, tc := range []struct {
		name   string
		openID string
		chat   string
	}{
		{name: "missing open id", chat: "p2p"},
		{name: "group chat", openID: "ou_user", chat: "group"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodPost, "/api/integrations/feishu/card-action", strings.NewReader("{}"))
			var event feishuCallback
			event.Event.Sender.SenderID.OpenID = tc.openID
			event.Event.Message.ChatType = tc.chat
			event.Event.Message.ChatID = "oc_private"
			event.Event.Message.MessageType = "text"
			event.Event.Message.Content = `{"text":"发布作业"}`
			h.handleFeishuMessageEvent(c, event)
			if recorder.Code != http.StatusOK || recorder.Body.String() != `{"code":0}` {
				t.Fatalf("ignored message status=%d body=%s", recorder.Code, recorder.Body.String())
			}
		})
	}
}

func TestFeishuMessageEventAcknowledgesBeforeProcessing(t *testing.T) {
	h := testFeishuHandler()
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/integrations/feishu/card-action", strings.NewReader("{}"))
	var event feishuCallback
	event.Event.Sender.SenderID.OpenID = "ou_unlinked"
	event.Event.Message.ChatType = "p2p"
	event.Event.Message.ChatID = "oc_private"
	event.Event.Message.MessageType = "text"
	event.Event.Message.Content = `{"text":"unknown command"}`
	h.handleFeishuMessageEvent(c, event)
	if recorder.Code != http.StatusOK || recorder.Body.String() != `{"code":0}` {
		t.Fatalf("pilot message event acknowledgement status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}
