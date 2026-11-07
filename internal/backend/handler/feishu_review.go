package handler

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
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
	cfg                config.FeishuConfig
	db                 *gorm.DB
	assignments        *assignment.Service
	client             *http.Client
	notifyMu           sync.Mutex
	pendingMaterialsMu sync.Mutex
	pendingMaterials   map[string]feishuPendingMaterial
	materialUploadMu   sync.Mutex
}

func NewFeishuReviewHandler(cfg config.FeishuConfig, db *gorm.DB, assignments *assignment.Service) *FeishuReviewHandler {
	return &FeishuReviewHandler{
		cfg: cfg, db: db, assignments: assignments, client: &http.Client{Timeout: 30 * time.Second},
		pendingMaterials: make(map[string]feishuPendingMaterial),
	}
}

func (h *FeishuReviewHandler) enabled() bool {
	return h.cfg.AppID != "" && h.cfg.AppSecret != ""
}

func (h *FeishuReviewHandler) SendTestCard(c *gin.Context) {
	sessionUser, ok := middleware.CurrentSessionUser(c)
	if !ok || sessionUser == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "请先登录网站"})
		return
	}
	var user model.User
	if err := h.db.WithContext(c.Request.Context()).Preload("Role").First(&user, sessionUser.ID).Error; err != nil || user.Status != model.UserStatusEnabled {
		c.JSON(http.StatusForbidden, gin.H{"message": "当前账号不可用"})
		return
	}
	openID := ""
	if user.FeishuOpenID != nil {
		openID = *user.FeishuOpenID
	}
	if _, _, err := h.resolveFeishuOperator(c.Request.Context(), openID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"message": "请先绑定有作业管理权限的飞书账号"})
		return
	}
	card := feishuReviewCard("模拟作业 · 评分联调", "仅用于验证飞书卡片和网站回调，不修改任何作业成绩。", "test", 0, 0)
	if err := h.sendCardTo(c.Request.Context(), openID, card); err != nil {
		middleware.LogInternalError(c, "feishu test card", http.StatusBadGateway, err)
		c.JSON(http.StatusBadGateway, gin.H{"message": "飞书卡片发送失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "模拟批改卡片已发送到你的飞书私聊"})
}

// SyncSubmission syncs a committed website submission to the shared Bitable.
// It never sends per-submission messages or cards; a Feishu outage cannot undo
// the website submission.
func (h *FeishuReviewHandler) SyncSubmission(ctx context.Context, submissionID uint64) error {
	if !h.enabled() || !h.bitableEnabled() {
		return nil
	}
	var submitted model.AssignmentSubmission
	if err := h.db.WithContext(ctx).First(&submitted, submissionID).Error; err != nil {
		return err
	}
	systemActor, err := h.systemAssignmentActor(ctx)
	if err != nil {
		return err
	}
	detail, err := h.assignments.GetAdmin(ctx, systemActor, submitted.AssignmentID)
	if err != nil {
		return err
	}
	for _, member := range detail.Members {
		if member.LatestSubmission == nil || member.LatestSubmission.ID != submissionID {
			continue
		}
		token, err := h.tenantToken(ctx)
		if err != nil {
			return err
		}
		_, _, err = h.syncBitableHistory(ctx, token, systemActor, detail.Assignment, member)
		if err != nil {
			log.Printf("feishu bitable submission sync failed submission=%d: %v", submissionID, err)
		}
		return err
	}
	return nil // A newer submission superseded this committed notification.
}

func (h *FeishuReviewHandler) systemAssignmentActor(ctx context.Context) (assignment.Actor, error) {
	var user model.User
	err := h.db.WithContext(ctx).Select("users.id").
		Joins("JOIN roles ON roles.id = users.role_id").
		Where("roles.name = ? AND users.status = ?", model.RoleNameSuperAdmin, model.UserStatusEnabled).
		Order("users.id ASC").First(&user).Error
	if err != nil {
		return assignment.Actor{}, fmt.Errorf("find enabled site super admin for Feishu submission sync: %w", err)
	}
	return assignment.Actor{ID: user.ID, RoleName: model.RoleNameSuperAdmin}, nil
}

func (h *FeishuReviewHandler) sendSubmissionReviewCard(ctx context.Context, token, operatorOpenID string, item assignment.AssignmentView, member assignment.AssignmentMemberView, target *assignment.SubmissionView) error {
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
	card := feishuReviewCard(item.GroupName+" · "+item.Title, info, "review", target.ID, item.GroupID)
	return h.sendMessageTo(ctx, token, operatorOpenID, "open_id", "interactive", card)
}

func feishuReviewCard(title, info, kind string, submissionID, groupID uint64) map[string]any {
	value := map[string]any{"kind": kind}
	if submissionID != 0 {
		value["submission_id"] = submissionID
	}
	if groupID != 0 {
		value["group_id"] = groupID
	}
	elements := []any{
		map[string]any{"tag": "markdown", "content": info},
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

var feishuChinaTimeZone = time.FixedZone("Asia/Shanghai", 8*60*60)

func (h *FeishuReviewHandler) sendCardTo(ctx context.Context, operatorOpenID string, card map[string]any) error {
	token, err := h.tenantToken(ctx)
	if err != nil {
		return err
	}
	return h.sendMessageTo(ctx, token, operatorOpenID, "open_id", "interactive", card)
}

func (h *FeishuReviewHandler) tenantToken(ctx context.Context) (string, error) {
	if !h.enabled() {
		return "", errors.New("feishu app is not configured")
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

func (h *FeishuReviewHandler) sendMessageTo(ctx context.Context, token, receiveID, receiveIDType, msgType string, content any) error {
	if receiveID == "" || (receiveIDType != "open_id" && receiveIDType != "union_id") {
		return errors.New("invalid Feishu message recipient")
	}
	payload, err := json.Marshal(content)
	if err != nil {
		return err
	}
	msg, _ := json.Marshal(map[string]string{"receive_id": receiveID, "msg_type": msgType, "content": string(payload)})
	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			MessageID string `json:"message_id"`
		} `json:"data"`
	}
	if err := h.postJSON(ctx, "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type="+receiveIDType, msg, token, &result); err != nil {
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
	Token     string `json:"token"`
	Header    struct {
		Token     string `json:"token"`
		AppID     string `json:"app_id"`
		EventType string `json:"event_type"`
	} `json:"header"`
	Event struct {
		EventType string `json:"type"`
		Operator  struct {
			OpenID  string `json:"open_id"`
			UnionID string `json:"union_id"`
		} `json:"operator"`
		Sender struct {
			SenderID struct {
				OpenID  string `json:"open_id"`
				UnionID string `json:"union_id"`
			} `json:"sender_id"`
		} `json:"sender"`
		Message feishuIncomingMessage `json:"message"`
		Action  struct {
			Name  string `json:"name"`
			Value struct {
				Kind         string `json:"kind"`
				SubmissionID uint64 `json:"submission_id"`
				GroupID      uint64 `json:"group_id"`
				RequestID    string `json:"request_id"`
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
	raw, urlVerification := h.feishuURLVerificationPayload(raw)
	if !urlVerification {
		raw, err = h.authenticateAndDecodeFeishuCallback(c, raw)
		if err != nil {
			c.Status(http.StatusUnauthorized)
			return
		}
	}
	var event feishuCallback
	if err := json.Unmarshal(raw, &event); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	if event.Type == "url_verification" {
		if h.cfg.VerificationToken == "" || event.Token == "" || event.Token != h.cfg.VerificationToken {
			c.Status(http.StatusUnauthorized)
			return
		}
		c.JSON(http.StatusOK, gin.H{"challenge": event.Challenge})
		return
	}
	if event.Header.EventType == "im.message.receive_v1" {
		h.handleFeishuMessageEvent(c, event)
		return
	}
	if event.Header.EventType != "card.action.trigger" || event.Event.Operator.OpenID == "" {
		c.Status(http.StatusUnauthorized)
		return
	}
	actor, operator, err := h.resolveFeishuOperator(c.Request.Context(), event.Event.Operator.OpenID)
	if err != nil {
		c.Status(http.StatusUnauthorized)
		return
	}
	kind := event.Event.Action.Value.Kind
	if !feishuCardActionSupported(kind, event.Event.Action.Name) {
		feishuToast(c, "error", "不支持此操作")
		return
	}
	if kind == "publish" {
		if event.Event.Action.Value.RequestID == "" {
			feishuToast(c, "error", "发布请求无效，请重新发送“发布作业”")
			return
		}
		if err := h.publishFeishuAssignment(c, actor, event); err != nil {
			log.Printf("feishu assignment publish failed: %v", err)
			feishuToast(c, "error", "发布失败：请检查必填信息、接收成员与组别权限")
		}
		return
	}
	if kind == "next_review" {
		groupID := event.Event.Action.Value.GroupID
		if groupID == 0 {
			feishuToast(c, "error", "批改组别信息无效")
			return
		}
		feishuToast(c, "success", "正在从网站查询下一份待批改作业")
		go h.sendNextReviewCard(actor, operator, groupID)
		return
	}
	score, err := strconv.Atoi(strings.TrimSpace(event.Event.Action.FormValue["score"]))
	decision := event.Event.Action.FormValue["decision"]
	comment := event.Event.Action.FormValue["comment"]
	if err != nil || score < 0 || score > 100 || (decision != model.AssignmentReviewPassed && decision != model.AssignmentReviewNeedsRedo) || len([]rune(comment)) > 1000 {
		feishuToast(c, "error", "请输入 0–100 的整数成绩并选择处理结果")
		return
	}
	switch kind {
	case "test":
		feishuCompleted(c, "模拟评分完成", score, decision, comment, "已验证卡片表单回传，没有修改网站成绩")
	case "review":
		if event.Event.Action.Value.SubmissionID == 0 {
			feishuToast(c, "error", "提交编号无效")
			return
		}
		detail, err := h.assignments.ReviewFirst(c.Request.Context(), actor, event.Event.Action.Value.SubmissionID, assignment.ReviewInput{
			Score: uint8(score), Decision: decision, Comment: comment,
		})
		if err != nil {
			var serviceErr *assignment.ServiceError
			if errors.As(err, &serviceErr) && serviceErr.Status == http.StatusConflict {
				feishuToast(c, "error", "这份作业已由其他队员处理，未重复保存")
				return
			}
			feishuToast(c, "error", "批改未保存：提交已更新或当前账号无该组权限")
			return
		}
		if h.bitableEnabled() {
			for _, member := range detail.Members {
				if member.LatestSubmission != nil && member.LatestSubmission.ID == event.Event.Action.Value.SubmissionID {
					h.syncBitableReviewAsync(actor, detail.Assignment, member)
					break
				}
			}
		}
		feishuReviewCompleted(c, "批改已保存至吉甲大师网站", score, decision, comment, detail.Assignment.GroupID)
	default:
		feishuToast(c, "error", "未知的卡片类型")
	}
}

func feishuCardActionSupported(kind, action string) bool {
	switch kind {
	case "publish":
		return action == "publish_assignment"
	case "test", "review":
		return action == "submit_review"
	case "next_review":
		return action == "review_next"
	default:
		return false
	}
}

func (h *FeishuReviewHandler) authenticateAndDecodeFeishuCallback(c *gin.Context, raw []byte) ([]byte, error) {
	if h.cfg.EncryptKey == "" {
		return nil, errors.New("Feishu Encrypt Key is required for signed callbacks")
	}
	timestamp := c.GetHeader("X-Lark-Request-Timestamp")
	nonce := c.GetHeader("X-Lark-Request-Nonce")
	signature := c.GetHeader("X-Lark-Signature")
	if timestamp == "" || nonce == "" || signature == "" {
		return nil, errors.New("missing Feishu callback signature")
	}
	issuedAt, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || time.Since(time.Unix(issuedAt, 0)) > 5*time.Minute || time.Until(time.Unix(issuedAt, 0)) > 5*time.Minute {
		return nil, errors.New("stale Feishu callback timestamp")
	}
	content := make([]byte, 0, len(timestamp)+len(nonce)+len(h.cfg.EncryptKey)+len(raw))
	content = append(content, timestamp...)
	content = append(content, nonce...)
	content = append(content, h.cfg.EncryptKey...)
	content = append(content, raw...)
	signatureHash := sha256.Sum256(content)
	if len(signature) != len(signatureHash)*2 || subtle.ConstantTimeCompare([]byte(strings.ToLower(signature)), []byte(fmt.Sprintf("%x", signatureHash))) != 1 {
		return nil, errors.New("invalid Feishu callback signature")
	}
	var envelope struct {
		Encrypt string `json:"encrypt"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, errors.New("invalid Feishu callback envelope")
	}
	if envelope.Encrypt != "" {
		decoded, err := decryptFeishuPayload(raw, h.cfg.EncryptKey)
		if err != nil {
			return nil, err
		}
		raw = decoded
	}
	var event feishuCallback
	if err := json.Unmarshal(raw, &event); err != nil {
		return nil, err
	}
	if h.cfg.VerificationToken == "" || callbackVerificationToken(event) != h.cfg.VerificationToken {
		return nil, errors.New("invalid Feishu verification token")
	}
	if event.Header.AppID == "" || event.Header.AppID != h.cfg.AppID {
		return nil, errors.New("invalid Feishu app id")
	}
	return raw, nil
}

func callbackVerificationToken(event feishuCallback) string {
	if event.Header.Token != "" {
		return event.Header.Token
	}
	return event.Token
}

func (h *FeishuReviewHandler) feishuURLVerificationPayload(raw []byte) ([]byte, bool) {
	var event struct {
		Type string `json:"type"`
	}
	if json.Unmarshal(raw, &event) == nil && event.Type == "url_verification" {
		return raw, true
	}
	if h.cfg.EncryptKey != "" {
		decoded, err := decryptFeishuPayload(raw, h.cfg.EncryptKey)
		if err == nil && json.Unmarshal(decoded, &event) == nil && event.Type == "url_verification" {
			return decoded, true
		}
	}
	return raw, false
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

func feishuReviewCompleted(c *gin.Context, title string, score int, decision, comment string, groupID uint64) {
	label := "通过"
	if decision == model.AssignmentReviewNeedsRedo {
		label = "退回重做"
	}
	result := fmt.Sprintf("%d 分 · %s", score, label)
	if comment != "" {
		result += "\n评语：" + comment
	}
	card := map[string]any{
		"schema": "2.0", "config": map[string]any{"update_multi": true},
		"header": map[string]any{"template": "green", "title": map[string]any{"tag": "plain_text", "content": title}},
		"body": map[string]any{"elements": []any{
			map[string]any{"tag": "markdown", "content": result},
			map[string]any{"tag": "button", "name": "review_next", "type": "primary_filled", "text": map[string]any{"tag": "plain_text", "content": "批改下一份"},
				"behaviors": []any{map[string]any{"type": "callback", "value": map[string]any{"kind": "next_review", "group_id": groupID}}}},
		}},
	}
	c.JSON(http.StatusOK, gin.H{
		"toast": gin.H{"type": "success", "content": title},
		"card":  gin.H{"type": "raw", "data": card},
	})
}

func (h *FeishuReviewHandler) sendNextReviewCard(actor assignment.Actor, operator model.User, groupID uint64) {
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	openID := ""
	if operator.FeishuOpenID != nil {
		openID = *operator.FeishuOpenID
	}
	detail, member, err := h.assignments.NextPending(ctx, actor, groupID)
	if err != nil {
		message := "查询下一份待批改作业失败，请返回看板重试"
		var serviceErr *assignment.ServiceError
		if errors.As(err, &serviceErr) && serviceErr.Status == http.StatusNotFound {
			message = "该技术组目前没有待批改作业"
		}
		if replyErr := h.sendTextTo(ctx, openID, message); replyErr != nil {
			log.Printf("feishu next review response failed operator=%d group=%d: %v", operator.ID, groupID, replyErr)
		}
		if !errors.As(err, &serviceErr) || serviceErr.Status != http.StatusNotFound {
			log.Printf("feishu next review query failed operator=%d group=%d: %v", operator.ID, groupID, err)
		}
		return
	}
	token, err := h.tenantToken(ctx)
	if err == nil {
		err = h.sendSubmissionReviewCard(ctx, token, openID, detail.Assignment, *member, member.LatestSubmission)
	}
	if err != nil {
		log.Printf("feishu next review card failed operator=%d group=%d submission=%d: %v", operator.ID, groupID, member.LatestSubmission.ID, err)
		if replyErr := h.sendTextTo(ctx, openID, "下一份作业卡片发送失败，请稍后重试"); replyErr != nil {
			log.Printf("feishu next review failure response failed operator=%d: %v", operator.ID, replyErr)
		}
	}
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
