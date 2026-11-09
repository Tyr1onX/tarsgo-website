package handler

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
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

var (
	errWorkflowOperatorNameNotFound  = errors.New("no enabled bound assignment administrator matches the workflow operator name")
	errWorkflowOperatorNameAmbiguous = errors.New("multiple enabled bound assignment administrators match the workflow operator name")
)

// Existing links now lead to the single binding interface in the workbench.
func (h *FeishuReviewHandler) FeishuLinkPage(c *gin.Context) {
	c.Redirect(http.StatusFound, "/dashboard/admin/training/assignments")
}

// FeishuBindingStatus exposes no Feishu identity; only the current website account's binding state.
func (h *FeishuReviewHandler) FeishuBindingStatus(c *gin.Context) {
	sessionUser, ok := middleware.CurrentSessionUser(c)
	if !ok || sessionUser == nil {
		writeAPIError(c, http.StatusUnauthorized, "请先登录网站")
		return
	}
	var user model.User
	if err := h.db.WithContext(c.Request.Context()).
		Select("feishu_open_id").
		Where("id = ? AND status = ?", sessionUser.ID, model.UserStatusEnabled).
		Take(&user).Error; err != nil {
		writeAPIError(c, http.StatusForbidden, "当前网站账号不可用")
		return
	}
	writeAPI(c, http.StatusOK, "获取飞书绑定状态成功", gin.H{
		"bound": user.FeishuOpenID != nil && *user.FeishuOpenID != "",
		"appId": h.cfg.AppID,
	})
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

func (h *FeishuReviewHandler) workflowOperatorOpenIDByName(ctx context.Context, name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", errWorkflowOperatorNameNotFound
	}
	var matches []struct {
		RealName     *string `gorm:"column:real_name"`
		FeishuOpenID *string `gorm:"column:feishu_open_id"`
		Status       uint8   `gorm:"column:status"`
		RoleName     string  `gorm:"column:role_name"`
	}
	if err := h.db.WithContext(ctx).Model(&model.User{}).
		Select("users.real_name, users.feishu_open_id, users.status, roles.name AS role_name").
		Joins("JOIN roles ON roles.id = users.role_id").
		Where("users.real_name = ?", name).Scan(&matches).Error; err != nil {
		return "", err
	}
	openIDs := make([]string, 0, len(matches))
	for _, match := range matches {
		if match.RealName == nil || strings.TrimSpace(*match.RealName) != name ||
			match.Status != model.UserStatusEnabled || match.FeishuOpenID == nil ||
			!strings.HasPrefix(*match.FeishuOpenID, "ou_") ||
			(match.RoleName != model.RoleNameAdmin && match.RoleName != model.RoleNameSuperAdmin) {
			continue
		}
		openIDs = append(openIDs, *match.FeishuOpenID)
	}
	switch len(openIDs) {
	case 0:
		return "", errWorkflowOperatorNameNotFound
	case 1:
		return openIDs[0], nil
	default:
		return "", errWorkflowOperatorNameAmbiguous
	}
}
