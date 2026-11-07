package handler

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/service/assignment"
)

const (
	feishuMessageResourceURL = "https://open.feishu.cn/open-apis/im/v1/messages"
	feishuMessageFileLimit   = 100 << 20
	feishuCardInputMaxLength = 1000
	feishuMaterialTTL        = 15 * time.Minute
)

type feishuIncomingMessage struct {
	MessageID   string `json:"message_id"`
	ChatID      string `json:"chat_id"`
	ChatType    string `json:"chat_type"`
	MessageType string `json:"message_type"`
	Content     string `json:"content"`
}

type feishuPendingMaterial struct {
	AssignmentID uint64
	ExpiresAt    time.Time
}

type feishuMessageContent struct {
	Text     string `json:"text"`
	FileKey  string `json:"file_key"`
	FileName string `json:"file_name"`
	ImageKey string `json:"image_key"`
}

func (h *FeishuReviewHandler) handleFeishuMessageEvent(c *gin.Context, event feishuCallback) {
	message := event.Event.Message
	operatorOpenID := event.Event.Sender.SenderID.OpenID
	if !strings.HasPrefix(operatorOpenID, "ou_") || message.ChatType != "p2p" || message.ChatID == "" {
		c.JSON(http.StatusOK, gin.H{"code": 0})
		return
	}

	var content feishuMessageContent
	if err := json.Unmarshal([]byte(message.Content), &content); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 0})
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	c.JSON(http.StatusOK, gin.H{"code": 0})
	go func() {
		defer cancel()
		h.processFeishuMessage(ctx, operatorOpenID, message, content)
	}()
}

func (h *FeishuReviewHandler) processFeishuMessage(ctx context.Context, operatorOpenID string, message feishuIncomingMessage, content feishuMessageContent) {
	command := strings.TrimSpace(content.Text)
	switch {
	case message.MessageType == "text" && strings.HasPrefix(command, "绑定 "):
		code := strings.TrimSpace(strings.TrimPrefix(command, "绑定 "))
		user, err := h.consumeFeishuLinkCode(ctx, operatorOpenID, code)
		if err != nil {
			if user != nil {
				h.sendFeishuMessageError(ctx, operatorOpenID, "网站身份已绑定，但看板授权同步失败；请管理员修复看板权限")
			} else {
				h.sendFeishuMessageError(ctx, operatorOpenID, "绑定失败："+err.Error())
			}
			return
		}
		h.sendFeishuMessageError(ctx, operatorOpenID, "飞书账号已绑定，可查看作业看板并按网站组别权限发布、批改")
	case message.MessageType == "text" && command == "发布作业":
		actor, _, err := h.resolveFeishuOperator(ctx, operatorOpenID)
		if err != nil {
			h.sendFeishuMessageError(ctx, operatorOpenID, "请先通过网站管理员账号绑定飞书，并确认当前账号有可管理的技术组")
			return
		}
		groups, err := h.assignments.ListManagedGroups(ctx, actor)
		if err != nil {
			h.sendFeishuMessageError(ctx, operatorOpenID, "当前网站账号没有可管理的作业组别")
			return
		}
		requestID, err := newFeishuPublishRequestID()
		if err == nil {
			err = h.sendCardTo(ctx, operatorOpenID, feishuAssignmentPublishCard(groups, requestID))
		}
		if err != nil {
			log.Printf("feishu assignment publish form failed: %v", err)
			h.sendFeishuMessageError(ctx, operatorOpenID, "发布表单发送失败，请稍后重试")
		}
	case message.MessageType == "text" && strings.HasPrefix(command, "资料 #"):
		assignmentID, err := strconv.ParseUint(strings.TrimSpace(strings.TrimPrefix(command, "资料 #")), 10, 64)
		if err != nil || assignmentID == 0 {
			h.sendFeishuMessageError(ctx, operatorOpenID, "格式应为：资料 #作业编号")
			return
		}
		actor, _, err := h.resolveFeishuOperator(ctx, operatorOpenID)
		if err == nil {
			_, err = h.assignments.GetAdmin(ctx, actor, assignmentID)
		}
		if err != nil {
			h.sendFeishuMessageError(ctx, operatorOpenID, "无权为该作业添加教学资料，或作业已不存在")
		} else {
			h.pendingMaterialsMu.Lock()
			h.pendingMaterials[operatorOpenID] = feishuPendingMaterial{AssignmentID: assignmentID, ExpiresAt: time.Now().Add(feishuMaterialTTL)}
			h.pendingMaterialsMu.Unlock()
			if err := h.sendTextTo(ctx, operatorOpenID, fmt.Sprintf("请在新人首次提交前，于 15 分钟内发送该作业的教学资料文件；完成后发送“结束资料”。作业 #%d", assignmentID)); err != nil {
				log.Printf("feishu material upload prompt failed assignment=%d: %v", assignmentID, err)
			}
		}
	case message.MessageType == "text" && command == "结束资料":
		h.pendingMaterialsMu.Lock()
		delete(h.pendingMaterials, operatorOpenID)
		h.pendingMaterialsMu.Unlock()
		if err := h.sendTextTo(ctx, operatorOpenID, "已结束教学资料上传"); err != nil {
			log.Printf("feishu material upload completion message failed: %v", err)
		}
	case message.MessageType == "file" || message.MessageType == "image":
		pending, ok := h.pendingMaterialFor(operatorOpenID)
		if ok && message.MessageID == "" {
			h.reportMaterialFailure(ctx, operatorOpenID, pending.AssignmentID, message.MessageID, errors.New("Feishu material message has no message ID"))
			return
		}
		if ok {
			actor, _, err := h.resolveFeishuOperator(ctx, operatorOpenID)
			if err != nil {
				h.reportMaterialFailure(ctx, operatorOpenID, pending.AssignmentID, message.MessageID, err)
				return
			}
			h.processFeishuTeachingMaterial(ctx, operatorOpenID, actor, pending.AssignmentID, message)
		}
	}
}

func (h *FeishuReviewHandler) sendFeishuMessageError(ctx context.Context, operatorOpenID, message string) {
	if err := h.sendTextTo(ctx, operatorOpenID, message); err != nil {
		log.Printf("feishu operator reply failed: %v", err)
	}
}

func (h *FeishuReviewHandler) pendingMaterialFor(openID string) (feishuPendingMaterial, bool) {
	h.pendingMaterialsMu.Lock()
	defer h.pendingMaterialsMu.Unlock()
	pending, ok := h.pendingMaterials[openID]
	if !ok {
		return feishuPendingMaterial{}, false
	}
	if time.Now().After(pending.ExpiresAt) {
		delete(h.pendingMaterials, openID)
		return feishuPendingMaterial{}, false
	}
	return pending, true
}

func (h *FeishuReviewHandler) processFeishuTeachingMaterial(ctx context.Context, operatorOpenID string, actor assignment.Actor, assignmentID uint64, message feishuIncomingMessage) {
	h.materialUploadMu.Lock()
	defer h.materialUploadMu.Unlock()

	var content feishuMessageContent
	if err := json.Unmarshal([]byte(message.Content), &content); err != nil {
		return
	}
	resourceKey, resourceType := content.FileKey, "file"
	fileName := strings.TrimSpace(content.FileName)
	if message.MessageType == "image" {
		resourceKey, resourceType = content.ImageKey, "image"
		fileName = ""
	}
	if resourceKey == "" || message.MessageID == "" {
		h.reportMaterialFailure(ctx, operatorOpenID, assignmentID, message.MessageID, errors.New("Feishu material message has no resource key or message ID"))
		return
	}
	token, err := h.tenantToken(ctx)
	if err != nil {
		h.reportMaterialFailure(ctx, operatorOpenID, assignmentID, message.MessageID, err)
		return
	}
	body, mimeType, err := h.downloadFeishuMessageResource(ctx, token, message.MessageID, resourceKey, resourceType)
	if err != nil {
		h.reportMaterialFailure(ctx, operatorOpenID, assignmentID, message.MessageID, err)
		return
	}
	if fileName == "" {
		prefix := "飞书教学资料-"
		if resourceType == "image" {
			prefix = "飞书图片-"
		}
		fileName = prefix + safeResourceSuffix(resourceKey) + filepath.Ext(mimeExtension(mimeType, body))
	}
	if len(body) == 0 || len(body) > feishuMessageFileLimit {
		h.reportMaterialFailure(ctx, operatorOpenID, assignmentID, message.MessageID, errors.New("Feishu material is empty or exceeds 100 MiB"))
		return
	}
	form, cleanup, err := feishuMultipartFiles([]feishuMaterialBytes{{Name: fileName, Content: body}})
	if err != nil {
		h.reportMaterialFailure(ctx, operatorOpenID, assignmentID, message.MessageID, err)
		return
	}
	defer cleanup()
	if err := h.skipDuplicateMaterial(ctx, actor, assignmentID, fileName, body); err != nil {
		h.reportMaterialFailure(ctx, operatorOpenID, assignmentID, message.MessageID, err)
		return
	}
	if _, err := h.assignments.UploadMaterialFiles(ctx, actor, assignmentID, form.File["files"]); err != nil {
		h.reportMaterialFailure(ctx, operatorOpenID, assignmentID, message.MessageID, err)
		return
	}
	if err := h.sendTextTo(ctx, operatorOpenID, fmt.Sprintf("教学资料已保存到网站作业 #%d：%s", assignmentID, fileName)); err != nil {
		log.Printf("feishu material upload confirmation failed assignment=%d message=%s: %v", assignmentID, message.MessageID, err)
	}
}

func (h *FeishuReviewHandler) skipDuplicateMaterial(ctx context.Context, actor assignment.Actor, assignmentID uint64, fileName string, body []byte) error {
	detail, err := h.assignments.GetAdmin(ctx, actor, assignmentID)
	if err != nil {
		return err
	}
	for _, existing := range detail.Assignment.MaterialFiles {
		if existing.FileName != fileName || existing.Size != int64(len(body)) {
			continue
		}
		download, err := h.assignments.OpenMaterialFile(ctx, actor, existing.ID)
		if err != nil {
			return err
		}
		if bytes.Equal(download.Content, body) {
			return errFeishuDuplicateMaterial
		}
	}
	return nil
}

var errFeishuDuplicateMaterial = errors.New("duplicate Feishu material event")

type feishuMaterialBytes struct {
	Name    string
	Content []byte
}

func feishuMultipartFiles(files []feishuMaterialBytes) (*multipart.Form, func(), error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for _, file := range files {
		part, err := writer.CreateFormFile("files", file.Name)
		if err != nil {
			return nil, nil, err
		}
		if _, err := part.Write(file.Content); err != nil {
			return nil, nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, nil, err
	}
	request, err := http.NewRequest(http.MethodPost, "http://localhost/", bytes.NewReader(body.Bytes()))
	if err != nil {
		return nil, nil, err
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	if err := request.ParseMultipartForm(1 << 20); err != nil {
		if request.MultipartForm != nil {
			_ = request.MultipartForm.RemoveAll()
		}
		return nil, nil, err
	}
	return request.MultipartForm, func() { _ = request.MultipartForm.RemoveAll() }, nil
}

func (h *FeishuReviewHandler) downloadFeishuMessageResource(ctx context.Context, token, messageID, resourceKey, resourceType string) ([]byte, string, error) {
	endpoint := feishuMessageResourceURL + "/" + url.PathEscape(messageID) + "/resources/" + url.PathEscape(resourceKey)
	query := url.Values{"type": []string{resourceType}}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint+"?"+query.Encode(), nil)
	if err != nil {
		return nil, "", err
	}
	request.Header.Set("Authorization", "Bearer "+token)
	response, err := h.client.Do(request)
	if err != nil {
		return nil, "", err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("Feishu message resource returned HTTP %d", response.StatusCode)
	}
	content, err := io.ReadAll(io.LimitReader(response.Body, feishuMessageFileLimit+1))
	if err != nil {
		return nil, "", err
	}
	if len(content) > feishuMessageFileLimit {
		return nil, "", errors.New("Feishu message resource exceeds 100 MiB")
	}
	return content, response.Header.Get("Content-Type"), nil
}

func safeResourceSuffix(key string) string {
	if len(key) > 8 {
		key = key[len(key)-8:]
	}
	key = strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, key)
	if key == "" {
		return "attachment"
	}
	return key
}

func mimeExtension(contentType string, body []byte) string {
	mediaType, _, _ := mime.ParseMediaType(contentType)
	if mediaType == "" || mediaType == "application/octet-stream" {
		contentType = http.DetectContentType(body)
	}
	if mediaType, _, err := mime.ParseMediaType(contentType); err == nil {
		if extensions, _ := mime.ExtensionsByType(mediaType); len(extensions) > 0 {
			return extensions[0]
		}
	}
	return ".bin"
}

func (h *FeishuReviewHandler) reportMaterialFailure(ctx context.Context, operatorOpenID string, assignmentID uint64, messageID string, err error) {
	// Duplicate event delivery after a successful upload is intentionally a no-op.
	if errors.Is(err, errFeishuDuplicateMaterial) {
		return
	}
	log.Printf("feishu assignment material failed assignment=%d message=%s: %v", assignmentID, messageID, err)
	if replyErr := h.sendTextTo(ctx, operatorOpenID, fmt.Sprintf("教学资料未保存到网站。请检查文件限制，或确认作业 #%d 尚无提交记录。", assignmentID)); replyErr != nil {
		log.Printf("feishu material failure message failed assignment=%d: %v", assignmentID, replyErr)
	}
}

func (h *FeishuReviewHandler) sendTextTo(ctx context.Context, operatorOpenID, text string) error {
	token, err := h.tenantToken(ctx)
	if err != nil {
		return err
	}
	return h.sendMessageTo(ctx, token, operatorOpenID, "open_id", "text", map[string]string{"text": text})
}

func feishuAssignmentPublishCard(groups []assignment.GroupOption, requestID string) map[string]any {
	options := make([]any, 0, len(groups))
	for _, group := range groups {
		options = append(options, map[string]any{
			"text":  map[string]any{"tag": "plain_text", "content": group.Name},
			"value": strconv.FormatUint(group.ID, 10),
		})
	}
	value := map[string]any{"kind": "publish", "request_id": requestID}
	return map[string]any{
		"schema": "2.0", "config": map[string]any{"update_multi": true},
		"header": map[string]any{"template": "blue", "title": map[string]any{"tag": "plain_text", "content": "发布网站作业"}},
		"body": map[string]any{"elements": []any{
			map[string]any{"tag": "markdown", "content": "提交后立即发布到网站。接收对象留空表示所选组全员；填写网站成员 ID（逗号分隔）可指定成员。卡片不支持本地文件上传，发布后可在本私聊发送“资料 #作业编号”并继续发送文件。"},
			map[string]any{"tag": "form", "name": "assignment_publish_form", "elements": []any{
				map[string]any{"tag": "input", "name": "title", "required": true, "placeholder": map[string]any{"tag": "plain_text", "content": "作业名称"}, "max_length": 120},
				map[string]any{"tag": "input", "name": "description", "required": true, "input_type": "multiline_text", "placeholder": map[string]any{"tag": "plain_text", "content": "作业要求"}, "max_length": feishuCardInputMaxLength},
				map[string]any{"tag": "select_static", "name": "group_id", "required": true, "placeholder": map[string]any{"tag": "plain_text", "content": "所属组别"}, "options": options},
				map[string]any{"tag": "input", "name": "due_at", "required": true, "placeholder": map[string]any{"tag": "plain_text", "content": "截止时间（北京时间：YYYY-MM-DD HH:mm）"}, "max_length": 16},
				map[string]any{"tag": "input", "name": "target_user_ids", "placeholder": map[string]any{"tag": "plain_text", "content": "接收对象：成员 ID，逗号分隔；留空为全组"}, "max_length": 1000},
				map[string]any{"tag": "input", "name": "attachment_requirements", "placeholder": map[string]any{"tag": "plain_text", "content": "提交附件要求（选填）"}, "max_length": feishuCardInputMaxLength},
				map[string]any{"tag": "button", "name": "publish_assignment", "form_action_type": "submit", "type": "primary_filled", "text": map[string]any{"tag": "plain_text", "content": "发布作业"},
					"behaviors": []any{map[string]any{"type": "callback", "value": value}}},
			}},
		}},
	}
}

func newFeishuPublishRequestID() (string, error) {
	var data [16]byte
	if _, err := rand.Read(data[:]); err != nil {
		return "", err
	}
	data[6] = (data[6] & 0x0f) | 0x40
	data[8] = (data[8] & 0x3f) | 0x80
	encoded := hex.EncodeToString(data[:])
	return encoded[:8] + "-" + encoded[8:12] + "-" + encoded[12:16] + "-" + encoded[16:20] + "-" + encoded[20:], nil
}

func (h *FeishuReviewHandler) publishFeishuAssignment(c *gin.Context, actor assignment.Actor, event feishuCallback) error {
	values := event.Event.Action.FormValue
	groupID, err := strconv.ParseUint(strings.TrimSpace(values["group_id"]), 10, 64)
	if err != nil || groupID == 0 {
		return errors.New("assignment group is invalid")
	}
	dueAt, err := time.ParseInLocation("2006-01-02 15:04", strings.TrimSpace(values["due_at"]), feishuChinaTimeZone)
	if err != nil {
		return errors.New("assignment deadline is invalid")
	}
	targetIDs, err := parseFeishuRecipientIDs(values["target_user_ids"])
	if err != nil {
		return err
	}
	input := assignment.CreateInput{
		GroupID: groupID, Title: values["title"], Description: values["description"], DueAt: dueAt,
		AttachmentRequirements: values["attachment_requirements"], IsGroupWide: len(targetIDs) == 0, TargetUserIDs: targetIDs,
	}
	result, err := h.assignments.CreateWithMaterialFiles(c.Request.Context(), actor, input, event.Event.Action.Value.RequestID, nil)
	if err != nil {
		return err
	}
	card := map[string]any{
		"schema": "2.0", "config": map[string]any{"update_multi": true},
		"header": map[string]any{"template": "green", "title": map[string]any{"tag": "plain_text", "content": "作业已发布到网站"}},
		"body":   map[string]any{"elements": []any{map[string]any{"tag": "markdown", "content": fmt.Sprintf("**%s**\n作业 #%d · %s\n接收人数：%d\n截止：%s\n\n如需教学资料，请发送“资料 #%d”，随后在 15 分钟内把文件发送到本私聊；完成后发送“结束资料”。", result.Assignment.Title, result.Assignment.ID, result.Assignment.GroupName, result.Assignment.TargetCount, result.Assignment.DueAt.In(feishuChinaTimeZone).Format("2006-01-02 15:04"), result.Assignment.ID)}}},
	}
	c.JSON(http.StatusOK, gin.H{"toast": gin.H{"type": "success", "content": "作业已发布到网站"}, "card": gin.H{"type": "raw", "data": card}})
	return nil
}

func parseFeishuRecipientIDs(raw string) ([]uint64, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "全组" {
		return nil, nil
	}
	parts := strings.FieldsFunc(raw, func(r rune) bool { return r == ',' || r == '，' || r == ';' || r == '；' })
	if len(parts) == 0 || len(parts) > 500 {
		return nil, errors.New("invalid recipient list")
	}
	ids := make([]uint64, 0, len(parts))
	seen := make(map[uint64]struct{}, len(parts))
	for _, part := range parts {
		id, err := strconv.ParseUint(strings.TrimSpace(part), 10, 64)
		if err != nil || id == 0 {
			return nil, errors.New("invalid recipient id")
		}
		if _, exists := seen[id]; !exists {
			ids = append(ids, id)
			seen[id] = struct{}{}
		}
	}
	return ids, nil
}
