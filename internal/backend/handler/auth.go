package handler

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/config"
	"tarsgo-backend/service/auth"
)

type AuthHandler struct {
	cfg     *config.Config
	service authService
}

type authService interface {
	BootstrapStatus(ctx context.Context) (*auth.BootstrapStatus, error)
	SendRegisterCode(ctx context.Context, email string) error
	RegisterWithEmail(ctx context.Context, input auth.RegisterEmailInput) (*auth.AuthResult, error)
	RegisterInitialSuperAdmin(ctx context.Context, input auth.RegisterInitialSuperAdminInput) (*auth.AuthResult, error)
	LoginWithPassword(ctx context.Context, email string, password string) (*auth.AuthResult, error)
	SendLoginCode(ctx context.Context, email string) error
	LoginWithCode(ctx context.Context, email string, code string) (*auth.AuthResult, error)
	BuildGitHubLoginURL() (string, string, error)
	HandleGitHubCallback(ctx context.Context, code string) (*auth.AuthResult, error)
	CurrentUser(ctx context.Context, token string) (*auth.SessionUser, error)
	CookieName() string
	OAuthStateCookieName() string
	CookieMaxAgeSeconds() int
	CookieSecure() bool
	CookieSameSite() http.SameSite
	AdminDashboardURL() string
	SetupSuperAdminURL() string
	LoginErrorURL(code string) string
}

type emailRequest struct {
	Email string `json:"email" binding:"required,email,max=255"`
}

type registerEmailRequest struct {
	Email    string `json:"email" binding:"required,email,max=255"`
	Password string `json:"password" binding:"required,min=6,max=72"`
	RealName string `json:"realName" binding:"required,max=100"`
	Phone    string `json:"phone" binding:"required,max=20"`
	Code     string `json:"code" binding:"required,len=6,numeric"`
}

type bootstrapSuperAdminRequest struct {
	Email           string `json:"email" binding:"required,email,max=255"`
	Password        string `json:"password" binding:"required,min=6,max=72"`
	ConfirmPassword string `json:"confirmPassword" binding:"required,min=6,max=72"`
}

type loginPasswordRequest struct {
	Email    string `json:"email" binding:"required,email,max=255"`
	Password string `json:"password" binding:"required,min=6,max=72"`
}

type loginCodeRequest struct {
	Email string `json:"email" binding:"required,email,max=255"`
	Code  string `json:"code" binding:"required,len=6,numeric"`
}

func NewAuthHandler(cfg *config.Config, service authService) *AuthHandler {
	return &AuthHandler{
		cfg:     cfg,
		service: service,
	}
}

func (h *AuthHandler) SendRegisterCode(c *gin.Context) {
	var request emailRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	if err := h.service.SendRegisterCode(c.Request.Context(), request.Email); err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "验证码已发送", nil)
}

func (h *AuthHandler) BootstrapStatus(c *gin.Context) {
	status, err := h.service.BootstrapStatus(c.Request.Context())
	if err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "获取初始化状态成功", status)
}

func (h *AuthHandler) RegisterWithEmail(c *gin.Context) {
	var request registerEmailRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	result, err := h.service.RegisterWithEmail(c.Request.Context(), auth.RegisterEmailInput{
		Email:    request.Email,
		Password: request.Password,
		RealName: request.RealName,
		Phone:    request.Phone,
		Code:     request.Code,
	})
	if err != nil {
		h.handleServiceError(c, err)
		return
	}

	h.setAuthCookie(c, result.Token)
	writeAPI(c, http.StatusOK, "注册成功", gin.H{"user": result.User})
}

func (h *AuthHandler) RegisterInitialSuperAdmin(c *gin.Context) {
	var request bootstrapSuperAdminRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	result, err := h.service.RegisterInitialSuperAdmin(c.Request.Context(), auth.RegisterInitialSuperAdminInput{
		Email:           request.Email,
		Password:        request.Password,
		ConfirmPassword: request.ConfirmPassword,
	})
	if err != nil {
		h.handleServiceError(c, err)
		return
	}

	h.setAuthCookie(c, result.Token)
	writeAPI(c, http.StatusOK, "超级管理员注册成功", gin.H{"user": result.User})
}

func (h *AuthHandler) LoginWithPassword(c *gin.Context) {
	var request loginPasswordRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	result, err := h.service.LoginWithPassword(c.Request.Context(), request.Email, request.Password)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}

	h.setAuthCookie(c, result.Token)
	writeAPI(c, http.StatusOK, "登录成功", gin.H{"user": result.User})
}

func (h *AuthHandler) SendLoginCode(c *gin.Context) {
	var request emailRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	if err := h.service.SendLoginCode(c.Request.Context(), request.Email); err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "验证码已发送", nil)
}

func (h *AuthHandler) LoginWithCode(c *gin.Context) {
	var request loginCodeRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}

	result, err := h.service.LoginWithCode(c.Request.Context(), request.Email, request.Code)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}

	h.setAuthCookie(c, result.Token)
	writeAPI(c, http.StatusOK, "登录成功", gin.H{"user": result.User})
}

func (h *AuthHandler) GitHubLogin(c *gin.Context) {
	status, err := h.service.BootstrapStatus(c.Request.Context())
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	if status.SetupRequired {
		c.Redirect(http.StatusFound, h.service.SetupSuperAdminURL())
		return
	}

	loginURL, state, err := h.service.BuildGitHubLoginURL()
	if err != nil {
		h.handleServiceError(c, err)
		return
	}

	h.setCookie(c, h.service.OAuthStateCookieName(), state, 10*60, true)
	c.Redirect(http.StatusFound, loginURL)
}

func (h *AuthHandler) GitHubCallback(c *gin.Context) {
	status, err := h.service.BootstrapStatus(c.Request.Context())
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	if status.SetupRequired {
		h.clearOAuthStateCookie(c)
		c.Redirect(http.StatusFound, h.service.SetupSuperAdminURL())
		return
	}

	state := strings.TrimSpace(c.Query("state"))
	code := strings.TrimSpace(c.Query("code"))
	if state == "" || code == "" {
		h.clearOAuthStateCookie(c)
		c.Redirect(http.StatusFound, h.service.LoginErrorURL(url.QueryEscape("github_callback_invalid")))
		return
	}

	expectedState, err := c.Cookie(h.service.OAuthStateCookieName())
	if err != nil || expectedState != state {
		h.clearOAuthStateCookie(c)
		c.Redirect(http.StatusFound, h.service.LoginErrorURL(url.QueryEscape("github_state_invalid")))
		return
	}

	result, err := h.service.HandleGitHubCallback(c.Request.Context(), code)
	if err != nil {
		h.clearOAuthStateCookie(c)
		c.Redirect(http.StatusFound, h.service.LoginErrorURL(url.QueryEscape("github_oauth_failed")))
		return
	}

	h.setAuthCookie(c, result.Token)
	h.clearOAuthStateCookie(c)
	c.Redirect(http.StatusFound, h.service.AdminDashboardURL())
}

func (h *AuthHandler) Logout(c *gin.Context) {
	h.clearAuthCookie(c)
	h.clearOAuthStateCookie(c)
	writeAPI(c, http.StatusOK, "登出成功", nil)
}

func (h *AuthHandler) Me(c *gin.Context) {
	token, err := c.Cookie(h.service.CookieName())
	if err != nil || strings.TrimSpace(token) == "" {
		writeAPIError(c, http.StatusUnauthorized, "未登录")
		return
	}

	user, err := h.service.CurrentUser(c.Request.Context(), token)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}

	writeAPI(c, http.StatusOK, "获取当前用户成功", gin.H{"user": user})
}

func (h *AuthHandler) handleServiceError(c *gin.Context, err error) {
	var serviceErr *auth.ServiceError
	if errors.As(err, &serviceErr) {
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}

	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}

func (h *AuthHandler) setAuthCookie(c *gin.Context, token string) {
	h.setCookie(c, h.service.CookieName(), token, h.service.CookieMaxAgeSeconds(), true)
}

func (h *AuthHandler) clearAuthCookie(c *gin.Context) {
	h.setCookie(c, h.service.CookieName(), "", -1, true)
}

func (h *AuthHandler) clearOAuthStateCookie(c *gin.Context) {
	h.setCookie(c, h.service.OAuthStateCookieName(), "", -1, true)
}

func (h *AuthHandler) setCookie(c *gin.Context, name string, value string, maxAge int, httpOnly bool) {
	c.SetSameSite(h.service.CookieSameSite())
	c.SetCookie(name, value, maxAge, "/", "", h.service.CookieSecure(), httpOnly)
}

func writeAPI(c *gin.Context, status int, message string, data any) {
	c.JSON(status, gin.H{
		"code":    status,
		"message": message,
		"data":    data,
	})
}

func writeAPIError(c *gin.Context, status int, message string) {
	writeAPI(c, status, message, nil)
}
