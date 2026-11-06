package handler

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
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

// FeishuReviewHandler is intentionally restricted to one tester during the pilot.
// It never derives website permissions from an untrusted card action.
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
	return h.cfg.AppID != "" && h.cfg.AppSecret != "" && h.cfg.VerificationToken != "" && h.cfg.TesterUnionID != ""
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

// SendSubmissionCard is a manual pilot operation, not an automatic notification.
// It can only be sent by the bound tester for a submission they may already review.
func (h *FeishuReviewHandler) SendSubmissionCard(c *gin.Context) {
	if !h.authorizedTester(c) {
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "提交编号无效"})
		return
	}
	var submitted model.AssignmentSubmission
	if err := h.db.WithContext(c.Request.Context()).First(&submitted, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "提交不存在"})
		return
	}
	detail, err := h.assignments.GetAdmin(c.Request.Context(), feishuActor(h.cfg.TesterUserID, c), submitted.AssignmentID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"message": "无权批改该组作业"})
		return
	}
	var target *assignment.SubmissionView
	var memberName string
	for _, member := range detail.Members {
		if member.LatestSubmission != nil && member.LatestSubmission.ID == id {
			target = member.LatestSubmission
			memberName = member.Name
			break
		}
	}
	if target == nil || len(target.Reviews) != 0 {
		c.JSON(http.StatusConflict, gin.H{"message": "该提交已批改或不是最新提交"})
		return
	}
	var fileNames []string
	for _, f := range target.Files {
		fileNames = append(fileNames, f.FileName)
	}
	card := feishuReviewCard(detail.Assignment.GroupName+" · "+detail.Assignment.Title,
		fmt.Sprintf("提交人：%s\n第 %d 次提交\n附件：%s\n\n查看附件请先登录吉甲大师网站。", memberName, target.Attempt, strings.Join(fileNames, "、")),
		"review", id, &detail.Assignment.ID)
	if err := h.sendCard(c.Request.Context(), card); err != nil {
		middleware.LogInternalError(c, "feishu submission card", http.StatusBadGateway, err)
		c.JSON(http.StatusBadGateway, gin.H{"message": "飞书卡片发送失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "批改卡片已发送到你的飞书私聊"})
}

func feishuActor(id uint64, c *gin.Context) assignment.Actor {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil || user.ID != id {
		return assignment.Actor{}
	}
	return assignment.Actor{ID: id, RoleName: user.Role.Name}
}

func feishuReviewCard(title, info, kind string, submissionID uint64, assignmentID *uint64) map[string]any {
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
	Token     string `json:"token"`
	Challenge string `json:"challenge"`
	Header    struct {
		Token     string `json:"token"`
		AppID     string `json:"app_id"`
		EventType string `json:"event_type"`
	} `json:"header"`
	Event struct {
		Operator struct {
			UnionID string `json:"union_id"`
		} `json:"operator"`
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
	var event feishuCallback
	if h.cfg.EncryptKey != "" {
		// Feishu sends URL verification as an encrypted envelope too, but that
		// handshake does not carry the signature headers used for normal
		// callbacks. Decrypt it first, then authenticate it with the token.
		var envelope struct {
			Encrypt string `json:"encrypt"`
		}
		if err := json.Unmarshal(raw, &envelope); err != nil || envelope.Encrypt == "" {
			c.Status(http.StatusBadRequest)
			return
		}
		plain, err := decryptFeishuPayload(raw, h.cfg.EncryptKey)
		if err != nil {
			c.Status(http.StatusBadRequest)
			return
		}
		if err := json.Unmarshal(plain, &event); err != nil {
			c.Status(http.StatusBadRequest)
			return
		}
		if event.Type != "url_verification" && !verifyFeishuSignature(c.Request.Header, raw, h.cfg.EncryptKey, time.Now()) {
			c.Status(http.StatusUnauthorized)
			return
		}
	} else if err := json.Unmarshal(raw, &event); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	// URL verification is a separate handshake. With encryption enabled its
	// payload has already been decrypted above; without encryption it is plain.
	// In both cases, only echo the challenge after checking the app token.
	if event.Type == "url_verification" {
		if subtle.ConstantTimeCompare([]byte(event.Token), []byte(h.cfg.VerificationToken)) != 1 {
			c.Status(http.StatusUnauthorized)
			return
		}
		c.JSON(http.StatusOK, gin.H{"challenge": event.Challenge})
		return
	}
	token := event.Header.Token
	if subtle.ConstantTimeCompare([]byte(token), []byte(h.cfg.VerificationToken)) != 1 {
		log.Print("feishu callback rejected: verification token mismatch")
		c.Status(http.StatusUnauthorized)
		return
	}
	if event.Header.AppID != h.cfg.AppID || event.Header.EventType != "card.action.trigger" {
		c.Status(http.StatusBadRequest)
		return
	}
	if event.Event.Operator.UnionID != h.cfg.TesterUnionID {
		feishuToast(c, "error", "只有试点管理员可以批改")
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
		if h.cfg.EncryptKey == "" {
			feishuToast(c, "error", "正式评分需要先配置飞书回调加密密钥")
			return
		}
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

func verifyFeishuSignature(headers http.Header, body []byte, key string, now time.Time) bool {
	ts := headers.Get("X-Lark-Request-Timestamp")
	nonce := headers.Get("X-Lark-Request-Nonce")
	signature := headers.Get("X-Lark-Signature")
	timestamp, err := strconv.ParseInt(ts, 10, 64)
	if err != nil {
		log.Print("feishu callback rejected: missing or invalid signature timestamp")
		return false
	}
	if nonce == "" || signature == "" {
		log.Print("feishu callback rejected: missing signature headers")
		return false
	}
	if now.Sub(time.Unix(timestamp, 0)) > 5*time.Minute || time.Unix(timestamp, 0).Sub(now) > 5*time.Minute {
		log.Print("feishu callback rejected: signature timestamp outside 5-minute window")
		return false
	}
	hash := sha256.Sum256(append([]byte(ts+nonce+key), body...))
	valid := subtle.ConstantTimeCompare([]byte(hex.EncodeToString(hash[:])), []byte(signature)) == 1
	if !valid {
		log.Print("feishu callback rejected: signature mismatch")
	}
	return valid
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
