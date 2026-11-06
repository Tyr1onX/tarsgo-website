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
	"log"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"tarsgo-backend/config"
	"tarsgo-backend/middleware"
	"tarsgo-backend/model"
	"tarsgo-backend/service/assignment"
)

type FeishuReviewHandler struct {
	cfg         config.FeishuConfig
	db          *gorm.DB
	assignments *assignment.Service
	client      *http.Client
	notifyMu    sync.Mutex
}

func NewFeishuReviewHandler(cfg config.FeishuConfig, db *gorm.DB, assignments *assignment.Service) *FeishuReviewHandler {
	return &FeishuReviewHandler{cfg: cfg, db: db, assignments: assignments, client: &http.Client{Timeout: 30 * time.Second}}
}

func (h *FeishuReviewHandler) enabled() bool {
	return h.cfg.AppID != "" && h.cfg.AppSecret != "" && h.cfg.TesterUnionID != ""
}

func (h *FeishuReviewHandler) authorizedTester(c *gin.Context) bool {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil || h.cfg.TesterUserID == 0 || user.ID != h.cfg.TesterUserID {
		c.JSON(http.StatusForbidden, gin.H{"message": "当前飞书试点仅允许指定管理员操作"})
		return false
	}
	return true
}

func (h *FeishuReviewHandler) SendTestCard(c *gin.Context) {
	if !h.authorizedTester(c) {
		return
	}
	card := feishuReviewCard("模拟作业 · 评分联调", "仅用于验证飞书卡片和网站回调，不修改任何作业成绩。", "test", 0, nil)
	if err := h.sendCard(c.Request.Context(), card); err != nil {
		middleware.LogInternalError(c, "feishu test card", http.StatusBadGateway, err)
		c.JSON(http.StatusBadGateway, gin.H{"message": "飞书卡片发送失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "模拟批改卡片已发送到你的飞书私聊"})
}

// NotifySubmission sends new homework to the designated pilot reviewer.
// Submission has already committed; a Feishu outage must not undo the upload.
func (h *FeishuReviewHandler) NotifySubmission(ctx context.Context, submissionID uint64) error {
	if !h.enabled() || h.cfg.TesterUserID == 0 {
		return nil
	}
	var submitted model.AssignmentSubmission
	if err := h.db.WithContext(ctx).First(&submitted, submissionID).Error; err != nil {
		return err
	}
	var reviewer model.User
	if err := h.db.WithContext(ctx).Preload("Role").First(&reviewer, h.cfg.TesterUserID).Error; err != nil {
		return err
	}
	if reviewer.Status != model.UserStatusEnabled {
		return nil
	}
	detail, err := h.assignments.GetAdmin(ctx, assignment.Actor{ID: reviewer.ID, RoleName: reviewer.Role.Name}, submitted.AssignmentID)
	if err != nil {
		var serviceError *assignment.ServiceError
		if errors.As(err, &serviceError) && serviceError.Status == http.StatusForbidden {
			return nil // This submission belongs to another group's reviewer.
		}
		return err
	}
	for _, member := range detail.Members {
		target := member.LatestSubmission
		if target == nil || target.ID != submissionID {
			continue
		}
		token, err := h.tenantToken(ctx)
		if err != nil {
			return err
		}
		if h.bitableEnabled() {
			if _, _, err := h.syncBitableHistory(ctx, token, assignment.Actor{ID: reviewer.ID, RoleName: reviewer.Role.Name}, detail.Assignment, member); err != nil {
				log.Printf("feishu bitable submission sync failed submission=%d: %v", submissionID, err)
			}
		}
		if len(target.Reviews) != 0 {
			return nil
		}
		return h.sendSubmissionReview(ctx, token, assignment.Actor{ID: reviewer.ID, RoleName: reviewer.Role.Name}, detail.Assignment, member, target, h.assignments.OpenFile)
	}
	return nil // A newer submission superseded this notification.
}

func (h *FeishuReviewHandler) sendSubmissionReview(
	ctx context.Context,
	token string,
	actor assignment.Actor,
	item assignment.AssignmentView,
	member assignment.AssignmentMemberView,
	target *assignment.SubmissionView,
	openFile func(context.Context, assignment.Actor, uint64) (*assignment.Download, error),
) error {
	// Keep the context marker, attachment messages, and grading card together in the reviewer's DM.
	h.notifyMu.Lock()
	defer h.notifyMu.Unlock()

	names := make([]string, 0, len(target.Files))
	for _, file := range target.Files {
		names = append(names, file.FileName)
	}
	identifier := fmt.Sprintf("作业 #%d · 提交 #%d", item.ID, target.ID)
	marker := identifier + "\n附件按下列顺序发送：" + strings.Join(names, "、")
	if len(names) == 0 {
		marker += "无"
	}
	if err := h.sendMessage(ctx, token, "text", map[string]string{"text": marker}); err != nil {
		log.Printf("feishu assignment marker failed assignment=%d submission=%d: %v", item.ID, target.ID, err)
	}

	failed := make([]assignment.FileView, 0)
	for _, file := range target.Files {
		var download *assignment.Download
		var err error
		if file.Size <= 0 || file.Size > feishuMaxFileSize {
			err = fmt.Errorf("unsupported Feishu file size: %d", file.Size)
		} else {
			download, err = openFile(ctx, actor, file.ID)
		}
		if err == nil {
			err = h.sendSubmissionFileContent(ctx, token, target.ID, file, download)
		}
		if err != nil {
			log.Printf("feishu attachment failed submission=%d file=%d: %v", target.ID, file.ID, err)
			failed = append(failed, file)
		}
	}

	return h.sendSubmissionReviewCard(ctx, token, item, member, target, failed)
}

func (h *FeishuReviewHandler) sendSubmissionReviewCard(ctx context.Context, token string, item assignment.AssignmentView, member assignment.AssignmentMemberView, target *assignment.SubmissionView, failed []assignment.FileView) error {
	names := make([]string, 0, len(target.Files))
	for _, file := range target.Files {
		names = append(names, file.FileName)
	}
	identifier := fmt.Sprintf("作业 #%d · 提交 #%d", item.ID, target.ID)
	chinaTime := target.SubmittedAt.In(feishuChinaTimeZone).Format("2006-01-02 15:04")
	info := fmt.Sprintf("%s\n提交人：%s\n第 %d 次提交 · %s\n附件：%s", identifier, member.Name, target.Attempt, chinaTime, strings.Join(names, "、"))
	if len(names) == 0 {
		info = fmt.Sprintf("%s\n提交人：%s\n第 %d 次提交 · %s\n附件：无", identifier, member.Name, target.Attempt, chinaTime)
	}
	card := feishuReviewCard(item.GroupName+" · "+item.Title, info, "review", target.ID, failed)
	return h.sendMessage(ctx, token, "interactive", card)
}

func feishuReviewCard(title, info, kind string, submissionID uint64, files []assignment.FileView) map[string]any {
	value := map[string]any{"kind": kind}
	if submissionID != 0 {
		value["submission_id"] = submissionID
	}
	elements := []any{
		map[string]any{"tag": "markdown", "content": info},
	}
	for _, file := range files {
		elements = append(elements, map[string]any{
			"tag": "button", "text": map[string]any{"tag": "plain_text", "content": "附件发送失败，网站下载 · " + file.FileName},
			"behaviors": []any{map[string]any{"type": "open_url", "default_url": fmt.Sprintf("https://jijiamaster.com/api/assignment-files/%d", file.ID)}},
		})
	}
	elements = append(elements, map[string]any{
		"tag": "form", "name": "assignment_review_form",
		"elements": []any{
			map[string]any{"tag": "input", "name": "score", "required": true, "placeholder": map[string]any{"tag": "plain_text", "content": "评分（0–100 分）"}, "max_length": 3},
			map[string]any{"tag": "select_static", "name": "decision", "required": true, "placeholder": map[string]any{"tag": "plain_text", "content": "选择处理结果"}, "options": []any{
				map[string]any{"text": map[string]any{"tag": "plain_text", "content": "通过"}, "value": model.AssignmentReviewPassed},
				map[string]any{"text": map[string]any{"tag": "plain_text", "content": "退回重做"}, "value": model.AssignmentReviewNeedsRedo},
			}},
			map[string]any{"tag": "input", "name": "comment", "placeholder": map[string]any{"tag": "plain_text", "content": "评语（选填）"}, "input_type": "multiline_text", "max_length": 1000},
			map[string]any{"tag": "button", "name": "submit_review", "form_action_type": "submit", "type": "primary_filled", "text": map[string]any{"tag": "plain_text", "content": "提交评分"},
				"behaviors": []any{map[string]any{"type": "callback", "value": value}}},
		},
	})
	return map[string]any{
		"schema": "2.0", "config": map[string]any{"update_multi": true},
		"header": map[string]any{"template": "blue", "title": map[string]any{"tag": "plain_text", "content": title}},
		"body":   map[string]any{"elements": elements},
	}
}

const (
	feishuMaxFileSize  = 30 * 1000 * 1000
	feishuMaxImageSize = 10 * 1000 * 1000
)

var feishuChinaTimeZone = time.FixedZone("Asia/Shanghai", 8*60*60)

func (h *FeishuReviewHandler) sendSubmissionFileContent(ctx context.Context, token string, submissionID uint64, file assignment.FileView, download *assignment.Download) error {
	if file.Size <= 0 || file.Size > feishuMaxFileSize {
		return fmt.Errorf("unsupported Feishu file size: %d", file.Size)
	}
	if download == nil || int64(len(download.Content)) != file.Size {
		return fmt.Errorf("assignment attachment content does not match its stored size")
	}
	ext := strings.ToLower(filepath.Ext(file.FileName))
	// Assignment uploads are stored with application/octet-stream, so select image messages by
	// the original extension instead of relying on the stored Content-Type.
	image := file.Size <= feishuMaxImageSize
	if image {
		switch ext {
		case ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".ico", ".heic":
		default:
			image = false
		}
	}
	fileType := "stream"
	if !image {
		switch ext {
		case ".pdf", ".doc", ".xls", ".ppt":
			fileType = strings.TrimPrefix(ext, ".")
		}
	}
	key, err := h.uploadFeishuFile(ctx, token, download.FileName, download.Content, image, fileType)
	if err != nil {
		return err
	}
	messageType := "file"
	content := map[string]string{"file_key": key}
	if image {
		messageType = "image"
		content = map[string]string{"image_key": key}
	}
	log.Printf("feishu attachment upload succeeded submission=%d file=%d type=%s", submissionID, file.ID, messageType)
	if err := h.sendMessage(ctx, token, messageType, content); err != nil {
		return err
	}
	log.Printf("feishu attachment message sent submission=%d file=%d type=%s", submissionID, file.ID, messageType)
	return nil
}

func (h *FeishuReviewHandler) uploadFeishuFile(ctx context.Context, token, name string, content []byte, image bool, fileType string) (string, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	field, kind, url := "file", "file_type", "https://open.feishu.cn/open-apis/im/v1/files"
	if image {
		field, kind, url = "image", "image_type", "https://open.feishu.cn/open-apis/im/v1/images"
		fileType = "message"
	}
	if err := writer.WriteField(kind, fileType); err != nil {
		return "", err
	}
	if !image {
		if err := writer.WriteField("file_name", name); err != nil {
			return "", err
		}
	}
	part, err := writer.CreateFormFile(field, name)
	if err != nil {
		return "", err
	}
	if _, err := part.Write(content); err != nil {
		return "", err
	}
	if err := writer.Close(); err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, &body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res, err := h.client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var apiError struct {
			Code int `json:"code"`
		}
		_ = json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&apiError)
		if apiError.Code != 0 {
			return "", fmt.Errorf("Feishu upload HTTP %d, code=%d", res.StatusCode, apiError.Code)
		}
		return "", fmt.Errorf("Feishu upload HTTP %d", res.StatusCode)
	}
	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			FileKey  string `json:"file_key"`
			ImageKey string `json:"image_key"`
		} `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&result); err != nil {
		return "", err
	}
	key := result.Data.FileKey
	if image {
		key = result.Data.ImageKey
	}
	if result.Code != 0 || key == "" {
		return "", fmt.Errorf("Feishu upload rejected: %d %s", result.Code, result.Msg)
	}
	return key, nil
}

func (h *FeishuReviewHandler) sendCard(ctx context.Context, card map[string]any) error {
	token, err := h.tenantToken(ctx)
	if err != nil {
		return err
	}
	return h.sendMessage(ctx, token, "interactive", card)
}

func (h *FeishuReviewHandler) tenantToken(ctx context.Context) (string, error) {
	if !h.enabled() {
		return "", errors.New("feishu pilot is not configured")
	}
	body, _ := json.Marshal(map[string]string{"app_id": h.cfg.AppID, "app_secret": h.cfg.AppSecret})
	var result struct {
		Code  int    `json:"code"`
		Token string `json:"tenant_access_token"`
	}
	if err := h.postJSON(ctx, "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", body, "", &result); err != nil {
		return "", err
	}
	if result.Code != 0 || result.Token == "" {
		return "", errors.New("feishu tenant token rejected")
	}
	return result.Token, nil
}

func (h *FeishuReviewHandler) sendMessage(ctx context.Context, token, msgType string, content any) error {
	payload, err := json.Marshal(content)
	if err != nil {
		return err
	}
	msg, _ := json.Marshal(map[string]string{"receive_id": h.cfg.TesterUnionID, "msg_type": msgType, "content": string(payload)})
	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			MessageID string `json:"message_id"`
		} `json:"data"`
	}
	if err := h.postJSON(ctx, "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=union_id", msg, token, &result); err != nil {
		return err
	}
	if result.Code != 0 || result.Data.MessageID == "" {
		return fmt.Errorf("feishu message rejected: %d %s", result.Code, result.Msg)
	}
	return nil
}

func (h *FeishuReviewHandler) postJSON(ctx context.Context, url string, data []byte, token string, into any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := h.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("feishu returned HTTP %d", res.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(into)
}

type feishuCallback struct {
	Type      string `json:"type"`
	Challenge string `json:"challenge"`
	Event     struct {
		Action struct {
			Name  string `json:"name"`
			Value struct {
				Kind         string `json:"kind"`
				SubmissionID uint64 `json:"submission_id"`
			} `json:"value"`
			FormValue map[string]string `json:"form_value"`
		} `json:"action"`
	} `json:"event"`
}

func (h *FeishuReviewHandler) Callback(c *gin.Context) {
	if !h.enabled() {
		c.Status(http.StatusNotFound)
		return
	}
	raw, err := io.ReadAll(io.LimitReader(c.Request.Body, 64<<10+1))
	if err != nil || len(raw) > 64<<10 {
		c.Status(http.StatusBadRequest)
		return
	}
	if h.cfg.EncryptKey != "" {
		raw, err = decryptFeishuPayload(raw, h.cfg.EncryptKey)
		if err != nil {
			c.Status(http.StatusBadRequest)
			return
		}
	}
	var event feishuCallback
	if err := json.Unmarshal(raw, &event); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	if event.Type == "url_verification" {
		c.JSON(http.StatusOK, gin.H{"challenge": event.Challenge})
		return
	}
	if event.Event.Action.Name != "submit_review" {
		feishuToast(c, "error", "不支持此操作")
		return
	}
	score, err := strconv.Atoi(strings.TrimSpace(event.Event.Action.FormValue["score"]))
	decision := event.Event.Action.FormValue["decision"]
	comment := event.Event.Action.FormValue["comment"]
	if err != nil || score < 0 || score > 100 || (decision != model.AssignmentReviewPassed && decision != model.AssignmentReviewNeedsRedo) || len([]rune(comment)) > 1000 {
		feishuToast(c, "error", "请输入 0–100 的整数成绩并选择处理结果")
		return
	}
	kind := event.Event.Action.Value.Kind
	switch kind {
	case "test":
		feishuCompleted(c, "模拟评分完成", score, decision, comment, "已验证卡片表单回传，没有修改网站成绩")
	case "review":
		if h.cfg.TesterUserID == 0 || event.Event.Action.Value.SubmissionID == 0 {
			feishuToast(c, "error", "未配置网站试点管理员")
			return
		}
		var user model.User
		if err := h.db.WithContext(c.Request.Context()).Preload("Role").First(&user, h.cfg.TesterUserID).Error; err != nil ||
			user.Status != model.UserStatusEnabled {
			feishuToast(c, "error", "网站管理员不可用")
			return
		}
		actor := assignment.Actor{ID: user.ID, RoleName: user.Role.Name}
		detail, err := h.assignments.ReviewFirst(c.Request.Context(), actor, event.Event.Action.Value.SubmissionID, assignment.ReviewInput{
			Score: uint8(score), Decision: decision, Comment: comment,
		})
		if err != nil {
			feishuToast(c, "error", "批改未保存：作业已处理、提交已更新或当前无管理权限")
			return
		}
		if h.bitableEnabled() {
			for _, member := range detail.Members {
				if member.LatestSubmission != nil && member.LatestSubmission.ID == event.Event.Action.Value.SubmissionID {
					syncCtx, cancel := context.WithTimeout(c.Request.Context(), bitableReviewTimeout)
					if syncErr := h.syncBitableReview(syncCtx, actor, detail.Assignment, member); syncErr != nil {
						log.Printf("feishu bitable review sync failed submission=%d: %v", event.Event.Action.Value.SubmissionID, syncErr)
					}
					cancel()
					break
				}
			}
		}
		feishuCompleted(c, "批改已保存至吉甲大师网站", score, decision, comment, "")
	default:
		feishuToast(c, "error", "未知的卡片类型")
	}
}

func feishuToast(c *gin.Context, kind, message string) {
	c.JSON(http.StatusOK, gin.H{"toast": gin.H{"type": kind, "content": message}})
}

func feishuCompleted(c *gin.Context, title string, score int, decision, comment, detail string) {
	label := "通过"
	if decision == model.AssignmentReviewNeedsRedo {
		label = "退回重做"
	}
	text := fmt.Sprintf("%d 分 · %s", score, label)
	if comment != "" {
		text += "\n评语：" + comment
	}
	if detail != "" {
		text += "\n" + detail
	}
	c.JSON(http.StatusOK, gin.H{
		"toast": gin.H{"type": "success", "content": title},
		"card": gin.H{"type": "raw", "data": gin.H{
			"schema": "2.0", "config": gin.H{"update_multi": true},
			"header": gin.H{"template": "green", "title": gin.H{"tag": "plain_text", "content": title}},
			"body":   gin.H{"elements": []any{gin.H{"tag": "markdown", "content": text}}},
		}},
	})
}

func decryptFeishuPayload(body []byte, key string) ([]byte, error) {
	var envelope struct {
		Encrypt string `json:"encrypt"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil || envelope.Encrypt == "" {
		return nil, errors.New("missing encrypted callback")
	}
	raw, err := base64.StdEncoding.DecodeString(envelope.Encrypt)
	if err != nil || len(raw) < aes.BlockSize*2 || len(raw)%aes.BlockSize != 0 {
		return nil, errors.New("invalid encrypted callback")
	}
	hash := sha256.Sum256([]byte(key))
	block, err := aes.NewCipher(hash[:])
	if err != nil {
		return nil, err
	}
	plain := make([]byte, len(raw)-aes.BlockSize)
	cipher.NewCBCDecrypter(block, raw[:aes.BlockSize]).CryptBlocks(plain, raw[aes.BlockSize:])
	padding := int(plain[len(plain)-1])
	if padding < 1 || padding > aes.BlockSize || !bytes.Equal(plain[len(plain)-padding:], bytes.Repeat([]byte{byte(padding)}, padding)) {
		return nil, errors.New("invalid callback padding")
	}
	return plain[:len(plain)-padding], nil
}
