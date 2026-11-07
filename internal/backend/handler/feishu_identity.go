package handler

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"tarsgo-backend/middleware"
	"tarsgo-backend/model"
	"tarsgo-backend/service/assignment"
)

const feishuLinkCodeTTL = 10 * time.Minute

func (h *FeishuReviewHandler) FeishuLinkPage(c *gin.Context) {
	c.Header("Cache-Control", "private, no-store")
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(http.StatusOK, `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>绑定飞书账号</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:0 20px;color:#182222}button{padding:10px 16px}code{display:block;padding:14px;background:#f3f6f5;overflow-wrap:anywhere}#result{margin-top:16px}</style><h1>绑定飞书账号</h1><p>绑定后，机器人会按你的网站组别权限处理发布和批改。绑定码 10 分钟内有效，仅能绑定当前网站账号。</p><button id="generate">生成绑定码</button><section id="result" hidden><p>在飞书与吉甲大师作业助手的私聊中发送：</p><code id="command"></code><button id="copy">复制绑定命令</button></section><p id="status" role="status"></p><script>const status=document.querySelector('#status'),result=document.querySelector('#result'),command=document.querySelector('#command');document.querySelector('#generate').onclick=async()=>{status.textContent='';try{const r=await fetch('/api/admin/integrations/feishu/link-code',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'}});const d=await r.json();if(!r.ok)throw new Error(d.message||'生成失败');command.textContent='绑定 '+d.data.code;result.hidden=false;}catch(e){status.textContent=e.message||'生成失败';}};document.querySelector('#copy').onclick=async()=>{await navigator.clipboard.writeText(command.textContent);status.textContent='已复制';};</script></html>`)
}

func (h *FeishuReviewHandler) FeishuLinkCode(c *gin.Context) {
	if h.cfg.AppSecret == "" {
		writeAPIError(c, http.StatusServiceUnavailable, "飞书机器人尚未配置")
		return
	}
	sessionUser, ok := middleware.CurrentSessionUser(c)
	if !ok || sessionUser == nil {
		writeAPIError(c, http.StatusUnauthorized, "请先登录网站")
		return
	}
	var user model.User
	if err := h.db.WithContext(c.Request.Context()).Preload("Role").First(&user, sessionUser.ID).Error; err != nil || user.Status != model.UserStatusEnabled {
		writeAPIError(c, http.StatusForbidden, "当前网站账号不可用")
		return
	}
	actor := assignment.Actor{ID: user.ID, RoleName: user.Role.Name}
	if _, err := h.assignments.ListManagedGroups(c.Request.Context(), actor); err != nil {
		writeAPIError(c, http.StatusForbidden, "当前网站账号没有可管理的技术组")
		return
	}
	code, err := h.newFeishuLinkCode(user.ID)
	if err != nil {
		middleware.LogInternalError(c, "generate Feishu binding code", http.StatusInternalServerError, err)
		writeAPIError(c, http.StatusInternalServerError, "生成绑定码失败")
		return
	}
	writeAPI(c, http.StatusOK, "绑定码已生成", gin.H{"code": code, "expiresInSeconds": int(feishuLinkCodeTTL.Seconds())})
}

func (h *FeishuReviewHandler) newFeishuLinkCode(userID uint64) (string, error) {
	if userID == 0 || h.cfg.AppSecret == "" {
		return "", fmt.Errorf("invalid Feishu link code request")
	}
	var nonce [16]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		return "", err
	}
	payload := fmt.Sprintf("%d:%d:%s", userID, time.Now().Add(feishuLinkCodeTTL).Unix(), hex.EncodeToString(nonce[:]))
	encoded := base64.RawURLEncoding.EncodeToString([]byte(payload))
	mac := hmac.New(sha256.New, []byte(h.cfg.AppSecret))
	_, _ = mac.Write([]byte("tarsgo-feishu-link:v1:" + encoded))
	return encoded + "." + hex.EncodeToString(mac.Sum(nil)), nil
}

func (h *FeishuReviewHandler) consumeFeishuLinkCode(ctx context.Context, openID, code string) (*model.User, error) {
	if openID == "" || !strings.HasPrefix(openID, "ou_") || h.cfg.AppSecret == "" {
		return nil, fmt.Errorf("invalid Feishu identity or configuration")
	}
	parts := strings.Split(code, ".")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return nil, fmt.Errorf("绑定码格式不正确")
	}
	mac := hmac.New(sha256.New, []byte(h.cfg.AppSecret))
	_, _ = mac.Write([]byte("tarsgo-feishu-link:v1:" + parts[0]))
	expected, err := hex.DecodeString(parts[1])
	if err != nil || subtle.ConstantTimeCompare(expected, mac.Sum(nil)) != 1 {
		return nil, fmt.Errorf("绑定码无效或已过期")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("绑定码无效或已过期")
	}
	claims := strings.Split(string(payload), ":")
	if len(claims) != 3 {
		return nil, fmt.Errorf("绑定码无效或已过期")
	}
	userID, userErr := strconv.ParseUint(claims[0], 10, 64)
	expiresAt, expiryErr := strconv.ParseInt(claims[1], 10, 64)
	if userErr != nil || expiryErr != nil || userID == 0 || time.Now().Unix() > expiresAt {
		return nil, fmt.Errorf("绑定码无效或已过期")
	}
	var user model.User
	if err := h.db.WithContext(ctx).Preload("Role").First(&user, userID).Error; err != nil || user.Status != model.UserStatusEnabled {
		return nil, fmt.Errorf("对应的网站账号不可用")
	}
	actor := assignment.Actor{ID: user.ID, RoleName: user.Role.Name}
	if _, err := h.assignments.ListManagedGroups(ctx, actor); err != nil {
		return nil, fmt.Errorf("对应的网站账号没有可管理的技术组")
	}
	if user.FeishuOpenID != nil && *user.FeishuOpenID != openID {
		return nil, fmt.Errorf("该网站账号已绑定其他飞书账号")
	}
	if user.FeishuOpenID == nil {
		result := h.db.WithContext(ctx).Model(&model.User{}).
			Where("id = ? AND status = ? AND feishu_open_id IS NULL", user.ID, model.UserStatusEnabled).
			Update("feishu_open_id", openID)
		if result.Error != nil {
			return nil, result.Error
		}
		if result.RowsAffected == 0 {
			var current model.User
			if err := h.db.WithContext(ctx).First(&current, user.ID).Error; err != nil || current.FeishuOpenID == nil || *current.FeishuOpenID != openID {
				return nil, fmt.Errorf("该网站账号或飞书账号已完成其他绑定")
			}
		}
	}
	if err := h.ensureBitableReader(ctx, openID); err != nil {
		return &user, fmt.Errorf("身份已绑定，但看板只读权限同步失败: %w", err)
	}
	user.FeishuOpenID = &openID
	return &user, nil
}

func (h *FeishuReviewHandler) resolveFeishuOperator(ctx context.Context, openID string) (assignment.Actor, model.User, error) {
	if openID == "" || !strings.HasPrefix(openID, "ou_") {
		return assignment.Actor{}, model.User{}, fmt.Errorf("missing Feishu open_id")
	}
	var user model.User
	if err := h.db.WithContext(ctx).Preload("Role").Where("feishu_open_id = ?", openID).First(&user).Error; err != nil {
		return assignment.Actor{}, model.User{}, err
	}
	if user.Status != model.UserStatusEnabled {
		return assignment.Actor{}, model.User{}, fmt.Errorf("website user is disabled")
	}
	actor := assignment.Actor{ID: user.ID, RoleName: user.Role.Name}
	if _, err := h.assignments.ListManagedGroups(ctx, actor); err != nil {
		return assignment.Actor{}, model.User{}, err
	}
	return actor, user, nil
}
