package handler

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/gin-gonic/gin"
	"log"
	"math/big"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"tarsgo-backend/model"
	"time"
)

// BitableWorkflowSecret returns the credential used only by the board's
// button-triggered workflow. The endpoint is registered behind admin auth and
// this method narrows it further to website super-admins.
func (h *FeishuHandler) BitableWorkflowSecret(c *gin.Context) {
	actor := currentAssignmentActor(c)
	if actor.RoleName != model.RoleNameSuperAdmin || !h.bitableEnabled() {
		c.Status(http.StatusForbidden)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"token": h.bitableWorkflowToken()})
}

func (h *FeishuHandler) bitableWorkflowToken() string {
	mac := hmac.New(sha256.New, []byte(h.cfg.AppSecret))
	_, _ = mac.Write([]byte("tarsgo-feishu-bitable-review-workflow:v1:" + h.cfg.BitableAppToken + ":" + h.cfg.BitableTableID))
	return hex.EncodeToString(mac.Sum(nil))
}

// BitableReviewCardTrigger receives a read-only Bitable button workflow and
// sends the existing review card to the person who clicked it. If the workflow
// only supplies a display name, it is used solely to find one bound recipient;
// card submissions still authenticate by the callback's actual Feishu open_id.
func (h *FeishuHandler) BitableReviewCardTrigger(c *gin.Context) {
	provided := strings.TrimSpace(c.GetHeader("X-Bitable-Workflow-Token"))
	expected := h.bitableWorkflowToken()
	if !h.bitableEnabled() || provided == "" || subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
		c.Status(http.StatusUnauthorized)
		return
	}
	var request struct {
		SubmissionID json.RawMessage `json:"submission_id"`
		Operator     json.RawMessage `json:"operator"`
		User         json.RawMessage `json:"user"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(c.Writer, c.Request.Body, 64<<10)).Decode(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "无效的看板操作"})
		return
	}
	submissionID := parseWorkflowSubmissionID(request.SubmissionID)
	if submissionID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "提交编号无效"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 25*time.Second)
	defer cancel()

	openID := workflowOperatorOpenID(request.Operator)
	if openID == "" {
		openID = workflowOperatorOpenID(request.User)
	}
	if openID == "" {
		name := workflowOperatorName(request.Operator)
		if name == "" {
			name = workflowOperatorName(request.User)
		}
		if name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "无法识别当前飞书操作者"})
			return
		}
		resolvedOpenID, lookupErr := h.workflowOperatorOpenIDByName(ctx, name)
		if errors.Is(lookupErr, errWorkflowOperatorNameNotFound) {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "没有找到姓名匹配且已绑定的作业管理员"})
			return
		}
		if errors.Is(lookupErr, errWorkflowOperatorNameAmbiguous) {
			c.JSON(http.StatusConflict, gin.H{"success": false, "message": "操作者姓名匹配到多个已绑定管理员，无法安全发送评分卡片"})
			return
		}
		if lookupErr != nil {
			log.Printf("feishu bitable review-card operator lookup failed: %v", lookupErr)
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "识别当前飞书操作者失败"})
			return
		}
		openID = resolvedOpenID
	}
	actor, operator, err := h.resolveFeishuOperator(ctx, openID)
	if err != nil {
		h.respondBitableTrigger(c, ctx, openID, http.StatusForbidden, "该飞书账号尚未绑定有作业管理权限的网站账号")
		return
	}
	var submission model.AssignmentSubmission
	if err := h.db.WithContext(ctx).First(&submission, submissionID).Error; err != nil {
		h.respondBitableTrigger(c, ctx, openID, http.StatusNotFound, "提交已不存在或不可批改")
		return
	}
	detail, err := h.assignments.GetAdmin(ctx, actor, submission.AssignmentID)
	if err != nil {
		h.respondBitableTrigger(c, ctx, openID, http.StatusForbidden, "没有权限批改这个技术组的作业")
		return
	}
	for _, member := range detail.Members {
		if member.UserID != submission.UserID || member.LatestSubmission == nil || member.LatestSubmission.ID != submissionID {
			continue
		}
		if len(member.LatestSubmission.Reviews) > 0 {
			h.respondBitableTrigger(c, ctx, openID, http.StatusConflict, "该提交已完成批改")
			return
		}
		token, err := h.tenantToken(ctx)
		if err == nil {
			err = h.sendSubmissionReviewCard(ctx, token, openID, detail.Assignment, member, member.LatestSubmission)
		}
		if err != nil {
			log.Printf("feishu bitable review-card trigger failed submission=%d operator=%d: %v", submissionID, operator.ID, err)
			h.respondBitableTrigger(c, ctx, openID, http.StatusBadGateway, "评分卡片发送失败，请稍后重试")
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "评分卡片已发送到你的飞书私聊"})
		return
	}
	h.respondBitableTrigger(c, ctx, openID, http.StatusConflict, "该提交已被新版本替代或已完成批改")
}

func (h *FeishuHandler) respondBitableTrigger(c *gin.Context, ctx context.Context, openID string, status int, message string) {
	if openID != "" && strings.HasPrefix(openID, "ou_") {
		if err := h.sendTextTo(ctx, openID, message); err != nil {
			log.Printf("feishu Bitable workflow response failed: %v", err)
		}
	}
	c.JSON(status, gin.H{"success": status < http.StatusBadRequest, "message": message})
}

func parseWorkflowSubmissionID(raw json.RawMessage) uint64 {
	var value string
	if json.Unmarshal(raw, &value) == nil {
		return parseUnsignedWorkflowID(value)
	}
	var number json.Number
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.UseNumber()
	if decoder.Decode(&number) != nil {
		return 0
	}
	return parseUnsignedWorkflowID(number.String())
}

func parseUnsignedWorkflowID(raw string) uint64 {
	raw = strings.TrimSpace(raw)
	if id, err := strconv.ParseUint(raw, 10, 64); err == nil {
		return id
	}
	rational, ok := new(big.Rat).SetString(raw)
	if !ok || !rational.IsInt() || rational.Sign() <= 0 || !rational.Num().IsUint64() {
		return 0
	}
	return rational.Num().Uint64()
}

func workflowOperatorOpenID(raw json.RawMessage) string {
	var value any
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.UseNumber()
	if decoder.Decode(&value) != nil {
		return ""
	}
	var find func(any) string
	find = func(current any) string {
		switch typed := current.(type) {
		case string:
			if strings.HasPrefix(typed, "ou_") {
				return typed
			}
			// Bitable workflow raw-body references can encode a User value as a
			// JSON string. Decode that value before giving up on the operator ID.
			var nested any
			decoder := json.NewDecoder(strings.NewReader(typed))
			decoder.UseNumber()
			if decoder.Decode(&nested) == nil {
				if found := find(nested); found != "" {
					return found
				}
			}
		case map[string]any:
			for _, key := range []string{"open_id", "openId", "user_id", "userId", "id"} {
				if candidate, ok := typed[key].(string); ok && strings.HasPrefix(candidate, "ou_") {
					return candidate
				}
			}
			for _, nested := range typed {
				if found := find(nested); found != "" {
					return found
				}
			}
		case []any:
			for _, nested := range typed {
				if found := find(nested); found != "" {
					return found
				}
			}
		}
		return ""
	}
	return find(value)
}

func workflowOperatorName(raw json.RawMessage) string {
	var value any
	if json.Unmarshal(raw, &value) != nil {
		return ""
	}
	if text, ok := value.(string); ok {
		text = strings.TrimSpace(text)
		if strings.HasPrefix(text, "{") || strings.HasPrefix(text, "[") {
			var nested any
			if json.Unmarshal([]byte(text), &nested) == nil {
				if _, encodedObject := nested.(map[string]any); encodedObject {
					return workflowOperatorName([]byte(text))
				}
			}
		}
		if strings.HasPrefix(text, "ou_") {
			return ""
		}
		return text
	}
	object, ok := value.(map[string]any)
	if !ok {
		return ""
	}
	for _, key := range []string{"name", "real_name", "realName", "display_name", "displayName"} {
		if text, ok := object[key].(string); ok && strings.TrimSpace(text) != "" {
			return strings.TrimSpace(text)
		}
	}
	return ""
}

func (h *FeishuHandler) ensureBitableReader(ctx context.Context, openID string) error {
	if !h.bitableEnabled() || !strings.HasPrefix(openID, "ou_") {
		return errors.New("Bitable or Feishu reader identity is not configured")
	}
	token, err := h.tenantToken(ctx)
	if err != nil {
		return err
	}
	basePath := fmt.Sprintf("%s/%s/roles", feishuBitableURL, url.PathEscape(h.cfg.BitableAppToken))
	var roles struct {
		Items []struct {
			RoleID   string `json:"role_id"`
			RoleName string `json:"role_name"`
		} `json:"items"`
		HasMore   bool   `json:"has_more"`
		PageToken string `json:"page_token"`
	}
	if err := h.bitableRequest(ctx, http.MethodGet, basePath, url.Values{"page_size": {"100"}}, nil, "", token, &roles); err != nil {
		return fmt.Errorf("list Bitable reader roles: %w", err)
	}
	roleID := ""
	for _, role := range roles.Items {
		if role.RoleName == bitableReaderRoleName {
			roleID = role.RoleID
			break
		}
	}
	if roleID == "" {
		return fmt.Errorf("Bitable read-only role %q is not configured", bitableReaderRoleName)
	}
	rolePath := basePath + "/" + url.PathEscape(roleID) + "/members"
	query := url.Values{"page_size": {"100"}}
	for {
		var members struct {
			Items []struct {
				MemberID     string `json:"member_id"`
				MemberIDType string `json:"member_id_type"`
				ID           string `json:"id"`
				Type         string `json:"type"`
			} `json:"items"`
			HasMore   bool   `json:"has_more"`
			PageToken string `json:"page_token"`
		}
		if err := h.bitableRequest(ctx, http.MethodGet, rolePath, query, nil, "", token, &members); err != nil {
			return fmt.Errorf("list Bitable readers: %w", err)
		}
		for _, member := range members.Items {
			id := member.MemberID
			if id == "" {
				id = member.ID
			}
			if id == openID {
				return nil
			}
		}
		if !members.HasMore || members.PageToken == "" {
			break
		}
		query.Set("page_token", members.PageToken)
	}
	body, _ := json.Marshal(map[string]any{"member_list": []map[string]string{{"id": openID, "type": "open_id"}}})
	if err := h.bitableRequest(ctx, http.MethodPost, rolePath+"/batch_create", nil, bytes.NewReader(body), "application/json; charset=utf-8", token, nil); err != nil {
		return fmt.Errorf("add Bitable read-only access: %w", err)
	}
	return nil
}
