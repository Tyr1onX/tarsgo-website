package handler

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/service/systemconfig"
)

type SystemConfigHandler struct {
	service      systemConfigService
	registerFlow registerFlowService
}

type systemConfigService interface {
	GetEmailConfig(ctx context.Context) (*systemconfig.EmailConfig, error)
	UpdateEmailConfig(ctx context.Context, input systemconfig.UpdateEmailInput) (*systemconfig.EmailConfig, error)
	TestEmailConfig(ctx context.Context, input systemconfig.TestEmailInput) error
	TestVerificationCodeConfig(ctx context.Context, input systemconfig.TestVerificationCodeInput) error
	GetOAuthConfigs(ctx context.Context) ([]systemconfig.OAuthProviderConfig, error)
	UpdateOAuthConfig(ctx context.Context, provider string, input systemconfig.UpdateOAuthProviderInput) (*systemconfig.OAuthProviderConfig, error)
}

type registerFlowService interface {
	SendRegisterFlowCode(ctx context.Context, input systemconfig.SendRegisterFlowCodeInput) error
	VerifyRegisterFlowCode(ctx context.Context, input systemconfig.VerifyRegisterFlowCodeInput) error
}

type updateEmailConfigRequest struct {
	Host     string `json:"host" binding:"required,max=255"`
	Port     string `json:"port" binding:"required,max=20"`
	Username string `json:"username" binding:"required,max=255"`
	Password string `json:"password" binding:"max=255"`
	From     string `json:"from" binding:"required,email,max=255"`
}

type testEmailConfigRequest struct {
	Host     string `json:"host" binding:"required,max=255"`
	Port     string `json:"port" binding:"required,max=20"`
	Username string `json:"username" binding:"required,max=255"`
	Password string `json:"password" binding:"max=255"`
	From     string `json:"from" binding:"required,email,max=255"`
	To       string `json:"to" binding:"required,email,max=255"`
}

type sendRegisterFlowCodeRequest struct {
	Host     string `json:"host" binding:"required,max=255"`
	Port     string `json:"port" binding:"required,max=20"`
	Username string `json:"username" binding:"required,max=255"`
	Password string `json:"password" binding:"max=255"`
	From     string `json:"from" binding:"required,email,max=255"`
	Email    string `json:"email" binding:"required,email,max=255"`
}

type verifyRegisterFlowCodeRequest struct {
	Email string `json:"email" binding:"required,email,max=255"`
	Code  string `json:"code" binding:"required,len=6,numeric"`
}

type updateOAuthProviderRequest struct {
	Enabled      bool   `json:"enabled"`
	ClientID     string `json:"clientId" binding:"max=255"`
	ClientSecret string `json:"clientSecret" binding:"max=255"`
	CallbackURL  string `json:"callbackUrl" binding:"max=500"`
	Scope        string `json:"scope" binding:"max=255"`
}

func NewSystemConfigHandler(service systemConfigService, registerFlow registerFlowService) *SystemConfigHandler {
	return &SystemConfigHandler{service: service, registerFlow: registerFlow}
}

func (h *SystemConfigHandler) GetEmailConfig(c *gin.Context) {
	result, err := h.service.GetEmailConfig(c.Request.Context())
	if err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "获取邮件配置成功", result)
}

func (h *SystemConfigHandler) UpdateEmailConfig(c *gin.Context) {
	var request updateEmailConfigRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	result, err := h.service.UpdateEmailConfig(c.Request.Context(), systemconfig.UpdateEmailInput{
		Host:     request.Host,
		Port:     request.Port,
		Username: request.Username,
		Password: request.Password,
		From:     request.From,
	})
	if err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "邮件配置已保存并立即生效", result)
}

func (h *SystemConfigHandler) TestEmailConfig(c *gin.Context) {
	var request testEmailConfigRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	if err := h.service.TestEmailConfig(c.Request.Context(), systemconfig.TestEmailInput{
		Host:     request.Host,
		Port:     request.Port,
		Username: request.Username,
		Password: request.Password,
		From:     request.From,
		To:       request.To,
	}); err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "测试邮件发送成功", nil)
}

func (h *SystemConfigHandler) TestVerificationCodeConfig(c *gin.Context) {
	var request testEmailConfigRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	if err := h.service.TestVerificationCodeConfig(c.Request.Context(), systemconfig.TestVerificationCodeInput{
		Host:     request.Host,
		Port:     request.Port,
		Username: request.Username,
		Password: request.Password,
		From:     request.From,
		To:       request.To,
	}); err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "验证码测试邮件发送成功", nil)
}

func (h *SystemConfigHandler) SendRegisterFlowCode(c *gin.Context) {
	var request sendRegisterFlowCodeRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	if err := h.registerFlow.SendRegisterFlowCode(c.Request.Context(), systemconfig.SendRegisterFlowCodeInput{
		Host:     request.Host,
		Port:     request.Port,
		Username: request.Username,
		Password: request.Password,
		From:     request.From,
		Email:    request.Email,
	}); err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "注册验证码已发送", nil)
}

func (h *SystemConfigHandler) VerifyRegisterFlowCode(c *gin.Context) {
	var request verifyRegisterFlowCodeRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	if err := h.registerFlow.VerifyRegisterFlowCode(c.Request.Context(), systemconfig.VerifyRegisterFlowCodeInput{
		Email: request.Email,
		Code:  request.Code,
	}); err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "验证码校验通过", nil)
}

func (h *SystemConfigHandler) GetOAuthConfigs(c *gin.Context) {
	items, err := h.service.GetOAuthConfigs(c.Request.Context())
	if err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "获取第三方登录配置成功", gin.H{"items": items})
}

func (h *SystemConfigHandler) UpdateOAuthConfig(c *gin.Context) {
	provider := strings.TrimSpace(c.Param("provider"))

	var request updateOAuthProviderRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	result, err := h.service.UpdateOAuthConfig(c.Request.Context(), provider, systemconfig.UpdateOAuthProviderInput{
		Enabled:      request.Enabled,
		ClientID:     request.ClientID,
		ClientSecret: request.ClientSecret,
		CallbackURL:  request.CallbackURL,
		Scope:        request.Scope,
	})
	if err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "第三方登录配置已保存并立即生效", result)
}

func (h *SystemConfigHandler) handleServiceError(c *gin.Context, err error) {
	var serviceErr *systemconfig.ServiceError
	if errors.As(err, &serviceErr) {
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}

	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}
