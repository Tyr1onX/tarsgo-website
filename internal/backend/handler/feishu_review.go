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
	"strconv"
	"strings"
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
}

func NewFeishuReviewHandler(cfg config.FeishuConfig, db *gorm.DB, assignments *assignment.Service) *FeishuReviewHandler {
	return &FeishuReviewHandler{cfg: cfg, db: db, assignments: assignments, client: &http.Client{Timeout: 5 * time.Second}}
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
	card := feishuReviewCard("模拟作业 · 评分联调", "仅用于验证飞书卡片和网站回调，不修改任何作业成绩。", "test", 0, nil, nil)
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
		if len(target.Reviews) != 0 {
			return nil
		}
		card := feishuReviewCard(detail.Assignment.GroupName+" · "+detail.Assignment.Title,
			fmt.Sprintf("提交人：%s\n第 %d 次提交\n附件需要登录网站后查看。", member.Name, target.Attempt),
			"review", submissionID, &detail.Assignment.ID, target.Files)
		return h.sendCard(ctx, card)
	}
	return nil // A newer submission superseded this notification.
}

func feishuReviewCard(title, info, kind string, submissionID uint64, assignmentID *uint64, files []assignment.FileView) map[string]any {
	value := map[string]any{"kind": kind}
	if submissionID != 0 {
		value["submission_id"] = submissionID
	}
	elements := []any{
		map[string]any{"tag": "markdown", "content": info},
	}
	if assignmentID != nil {
		elements = append(elements, map[string]any{
			"tag": "button", "text": map[string]any{"tag": "plain_text", "content": "在网站查看作业"},
			"behaviors": []any{map[string]any{"type": "open_url", "default_url": fmt.Sprintf("https://jijiamaster.com/dashboard/admin/training/submissions?assignmentId=%d", *assignmentID)}},
		})
	}
	for _, file := range files {
		elements = append(elements, map[string]any{
			"tag": "button", "text": map[string]any{"tag": "plain_text", "content": "查看附件 · " + file.FileName},
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

func (h *FeishuReviewHandler) sendCard(ctx context.Context, card map[string]any) error {
	if !h.enabled() {
		return errors.New("feishu pilot is not configured")
	}
	body, _ := json.Marshal(map[string]string{"app_id": h.cfg.AppID, "app_secret": h.cfg.AppSecret})
	var token struct {
		Code  int    `json:"code"`
		Token string `json:"tenant_access_token"`
	}
	if err := h.postJSON(ctx, "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", body, "", &token); err != nil {
		return err
	}
	if token.Code != 0 || token.Token == "" {
		return errors.New("feishu tenant token rejected")
	}
	cardJSON, _ := json.Marshal(card)
	msg, _ := json.Marshal(map[string]string{"receive_id": h.cfg.TesterUnionID, "msg_type": "interactive", "content": string(cardJSON)})
	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			MessageID string `json:"message_id"`
		} `json:"data"`
	}
	if err := h.postJSON(ctx, "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=union_id", msg, token.Token, &result); err != nil {
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
		_, err := h.assignments.ReviewFirst(c.Request.Context(), assignment.Actor{ID: user.ID, RoleName: user.Role.Name}, event.Event.Action.Value.SubmissionID, assignment.ReviewInput{
			Score: uint8(score), Decision: decision, Comment: comment,
		})
		if err != nil {
			feishuToast(c, "error", "批改未保存：作业已处理、提交已更新或当前无管理权限")
			return
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
