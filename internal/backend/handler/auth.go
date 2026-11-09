package handler

import (
	"context"
	"errors"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/middleware"
	"tarsgo-backend/model"
	"tarsgo-backend/service/accountprofile"
	"tarsgo-backend/service/auth"
	"tarsgo-backend/service/usergroup"
)

type groupMembershipReader interface {
	CurrentState(context.Context, uint64) (*usergroup.MembershipResolution, error)
}

type AuthHandler struct {
	service         authService
	groupMembership groupMembershipReader
}

type authService interface {
	BootstrapStatus(ctx context.Context) (*auth.BootstrapStatus, error)
	SendRegisterCode(ctx context.Context, email string) error
	RegisterWithEmail(ctx context.Context, input auth.RegisterEmailInput) (*auth.AuthResult, error)
	RegisterInitialSuperAdmin(ctx context.Context, input auth.RegisterInitialSuperAdminInput) (*auth.AuthResult, error)
	LoginWithPassword(ctx context.Context, email string, password string) (*auth.AuthResult, error)
	SendLoginCode(ctx context.Context, email string) error
	SendPasswordResetCode(ctx context.Context, email string) error
	ResetPassword(ctx context.Context, email, code, newPassword string) error
	LoginWithCode(ctx context.Context, email string, code string) (*auth.AuthResult, error)
	CurrentUser(ctx context.Context, token string) (*auth.SessionUser, error)
	UpdateProfile(ctx context.Context, userID uint64, input auth.ProfileInput) (*auth.SessionUser, error)
	AccountProfile(ctx context.Context, userID uint64) (*accountprofile.Profile, error)
	CreateAccountSession(ctx context.Context, userID uint64, currentToken, vaultToken string) (*auth.AccountSessionsResult, error)
	InitializeAccountSessions(ctx context.Context, currentToken, vaultToken string) (*auth.AccountSessionsResult, error)
	ListAccountSessions(ctx context.Context, vaultToken, currentToken string) (*auth.AccountSessionsResult, error)
	SwitchAccountSession(ctx context.Context, vaultToken string, entryID uint64) (*auth.AccountSessionsResult, error)
	RemoveAccountSession(ctx context.Context, vaultToken, currentToken string, entryID uint64) (*auth.AccountSessionsResult, error)
	LogoutCurrentAccount(ctx context.Context, currentToken, vaultToken string) (bool, error)
	LogoutAllAccounts(ctx context.Context, currentToken, vaultToken string) error
	CookieName() string
	CookieMaxAgeSeconds() int
	CookieSecure() bool
	CookieSameSite() http.SameSite
}

type emailRequest struct {
	Email string `json:"email" binding:"required,email,max=255"`
}

type registerEmailRequest struct {
	accountprofile.Input
	Email    string `json:"email" binding:"required,email,max=255"`
	Password string `json:"password" binding:"required,min=6,max=72"`
	RealName string `json:"realName" binding:"required,max=100"`
	Code     string `json:"code" binding:"required,len=6,numeric"`
}

type bootstrapSuperAdminRequest struct {
	Email           string `json:"email" binding:"required,email,max=255"`
	RealName        string `json:"realName" binding:"required,max=100"`
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

type emailPasswordResetRequest struct {
	Email           string `json:"email" binding:"required,email,max=255"`
	Code            string `json:"code" binding:"required,len=6,numeric"`
	Password        string `json:"password" binding:"required,min=8,max=72"`
	ConfirmPassword string `json:"confirmPassword" binding:"required"`
}

type switchAccountRequest struct {
	AccountID uint64 `json:"accountId" binding:"required,gt=0"`
}

func NewAuthHandler(service authService) *AuthHandler {
	return &AuthHandler{service: service}
}

func (h *AuthHandler) SetGroupMembershipService(service groupMembershipReader) {
	h.groupMembership = service
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
		Input:    request.Input,
		Email:    request.Email,
		Password: request.Password,
		RealName: request.RealName,
		Code:     request.Code,
	})
	if err != nil {
		h.handleServiceError(c, err)
		return
	}

	if !h.finishAuthentication(c, result) {
		return
	}
	_ = middleware.RecordBusinessActivity(c, middleware.ActivityInput{ActionKey: model.ActivityUserRegistered, TargetUserID: &result.User.ID, EntityType: "user", EntityID: result.User.ID})
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
		RealName:        request.RealName,
		Password:        request.Password,
		ConfirmPassword: request.ConfirmPassword,
	})
	if err != nil {
		h.handleServiceError(c, err)
		return
	}

	if !h.finishAuthentication(c, result) {
		return
	}
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

	if !h.finishAuthentication(c, result) {
		return
	}
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

func (h *AuthHandler) SendPasswordResetCode(c *gin.Context) {
	var request emailRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "邮箱格式不合法")
		return
	}
	if err := h.service.SendPasswordResetCode(c.Request.Context(), request.Email); err != nil {
		h.handleServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "如该邮箱已注册且可用，验证码将发送至该邮箱", nil)
}

func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var request emailPasswordResetRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}
	if request.Password != request.ConfirmPassword {
		writeAPIError(c, http.StatusBadRequest, "两次输入的密码不一致")
		return
	}
	if err := h.service.ResetPassword(c.Request.Context(), request.Email, request.Code, request.Password); err != nil {
		h.handleServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "密码已重置，请重新登录", nil)
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

	if !h.finishAuthentication(c, result) {
		return
	}
	writeAPI(c, http.StatusOK, "登录成功", gin.H{"user": result.User})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	currentToken, _ := c.Cookie(h.service.CookieName())
	vaultToken, _ := c.Cookie(accountVaultCookieName)
	keepVault, err := h.service.LogoutCurrentAccount(c.Request.Context(), currentToken, vaultToken)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	h.clearAuthCookie(c)
	if !keepVault {
		h.clearAccountVaultCookie(c)
	}
	writeAPI(c, http.StatusOK, "登出成功", nil)
}

func (h *AuthHandler) InitializeAccountSessions(c *gin.Context) {
	currentToken, err := c.Cookie(h.service.CookieName())
	if err != nil || strings.TrimSpace(currentToken) == "" {
		writeAPIError(c, http.StatusUnauthorized, "未登录")
		return
	}
	vaultToken, _ := c.Cookie(accountVaultCookieName)
	result, serviceErr := h.service.InitializeAccountSessions(c.Request.Context(), currentToken, vaultToken)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}
	h.setAuthCookieWithAge(c, result.SessionToken, result.SessionCookieMaxAgeSeconds)
	h.setAccountVaultCookieWithAge(c, result.VaultToken, result.VaultCookieMaxAgeSeconds)
	writeAPI(c, http.StatusOK, "账号列表已更新", gin.H{
		"accounts":        result.Accounts,
		"identityChanged": result.SessionToken != currentToken,
	})
}

func (h *AuthHandler) ListAccountSessions(c *gin.Context) {
	vaultToken, _ := c.Cookie(accountVaultCookieName)
	currentToken, _ := c.Cookie(h.service.CookieName())
	result, err := h.service.ListAccountSessions(c.Request.Context(), vaultToken, currentToken)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "获取账号列表成功", gin.H{"accounts": result.Accounts})
}

func (h *AuthHandler) SwitchAccountSession(c *gin.Context) {
	var request switchAccountRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}
	vaultToken, _ := c.Cookie(accountVaultCookieName)
	result, err := h.service.SwitchAccountSession(c.Request.Context(), vaultToken, request.AccountID)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	h.setAuthCookieWithAge(c, result.SessionToken, result.SessionCookieMaxAgeSeconds)
	h.setAccountVaultCookieWithAge(c, result.VaultToken, result.VaultCookieMaxAgeSeconds)
	writeAPI(c, http.StatusOK, "账号已切换", gin.H{"user": result.User, "accounts": result.Accounts})
}

func (h *AuthHandler) RemoveAccountSession(c *gin.Context) {
	entryID, err := parsePathID(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "请求参数不合法")
		return
	}
	vaultToken, _ := c.Cookie(accountVaultCookieName)
	currentToken, _ := c.Cookie(h.service.CookieName())
	result, serviceErr := h.service.RemoveAccountSession(c.Request.Context(), vaultToken, currentToken, entryID)
	if serviceErr != nil {
		h.handleServiceError(c, serviceErr)
		return
	}
	if result.CurrentRemoved {
		h.clearAuthCookie(c)
	}
	if result.VaultRemoved {
		h.clearAccountVaultCookie(c)
	}
	writeAPI(c, http.StatusOK, "账号已移除", gin.H{
		"accounts":       result.Accounts,
		"currentRemoved": result.CurrentRemoved,
		"vaultRemoved":   result.VaultRemoved,
	})
}

func (h *AuthHandler) LogoutAllAccounts(c *gin.Context) {
	currentToken, _ := c.Cookie(h.service.CookieName())
	vaultToken, _ := c.Cookie(accountVaultCookieName)
	if err := h.service.LogoutAllAccounts(c.Request.Context(), currentToken, vaultToken); err != nil {
		h.handleServiceError(c, err)
		return
	}
	h.clearAuthCookie(c)
	h.clearAccountVaultCookie(c)
	writeAPI(c, http.StatusOK, "已退出全部账号", nil)
}

func (h *AuthHandler) Me(c *gin.Context) {
	token, err := c.Cookie(h.service.CookieName())
	if err != nil || strings.TrimSpace(token) == "" {
		writeAPIError(c, http.StatusUnauthorized, "未登录")
		return
	}

	vaultToken, _ := c.Cookie(accountVaultCookieName)
	var user *auth.SessionUser
	if resolver, ok := h.service.(interface {
		CurrentUserAndRenewal(context.Context, string, string) (*auth.CurrentUserRenewalResult, error)
	}); ok {
		result, resolveErr := resolver.CurrentUserAndRenewal(c.Request.Context(), token, vaultToken)
		if resolveErr != nil {
			h.handleServiceError(c, resolveErr)
			return
		}
		if result == nil || result.User == nil {
			h.handleServiceError(c, &auth.ServiceError{Status: http.StatusInternalServerError, Message: "加载当前用户失败"})
			return
		}
		user = result.User
		if result.RenewalError == nil && result.Renewal != nil {
			renewal := result.Renewal
			if renewal.AuthRenewed && renewal.AuthCookieMaxAgeSeconds > 0 {
				h.setCookie(c, h.service.CookieName(), token, renewal.AuthCookieMaxAgeSeconds, true)
			}
			if renewal.VaultRenewed && renewal.VaultCookieMaxAgeSeconds > 0 && strings.TrimSpace(vaultToken) != "" {
				h.setCookie(c, accountVaultCookieName, vaultToken, renewal.VaultCookieMaxAgeSeconds, true)
			}
		}
	} else {
		user, err = h.service.CurrentUser(c.Request.Context(), token)
		if err != nil {
			h.handleServiceError(c, err)
			return
		}
		if renewer, ok := h.service.(interface {
			RenewAccountSession(context.Context, string, string) (*auth.SessionRenewal, error)
		}); ok {
			if renewal, renewErr := renewer.RenewAccountSession(c.Request.Context(), token, vaultToken); renewErr == nil && renewal != nil {
				if renewal.AuthRenewed && renewal.AuthCookieMaxAgeSeconds > 0 {
					h.setCookie(c, h.service.CookieName(), token, renewal.AuthCookieMaxAgeSeconds, true)
				}
				if renewal.VaultRenewed && renewal.VaultCookieMaxAgeSeconds > 0 && strings.TrimSpace(vaultToken) != "" {
					h.setCookie(c, accountVaultCookieName, vaultToken, renewal.VaultCookieMaxAgeSeconds, true)
				}
			}
		}
	}

	response := gin.H{"user": user}
	if c.Query("include") == "groups" && h.groupMembership != nil {
		// Preserve the identity response even if the separate group lookup fails.
		// The dashboard can then use its existing group-retry/error path.
		if groups, groupErr := h.groupMembership.CurrentState(c.Request.Context(), user.ID); groupErr == nil {
			response["groupConfirmation"] = groups
		}
	}
	writeAPI(c, http.StatusOK, "获取当前用户成功", response)
}

// UpdateProfile uses the authenticated account ID, never a client-supplied ID.
func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil {
		writeAPIError(c, http.StatusUnauthorized, "未登录")
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, (2<<20)+(64<<10))
	if err := c.Request.ParseMultipartForm(2 << 20); err != nil {
		writeAPIError(c, http.StatusBadRequest, "个人资料请求无效或文件过大")
		return
	}
	if c.Request.MultipartForm != nil {
		defer c.Request.MultipartForm.RemoveAll()
	}
	form := c.Request.MultipartForm
	if form == nil || len(form.Value["phone"]) > 1 || len(form.Value["realName"]) != 1 || len(form.File["avatar"]) > 1 {
		writeAPIError(c, http.StatusBadRequest, "个人资料请求参数不合法")
		return
	}
	for key := range form.Value {
		if key != "phone" && key != "realName" && key != "isStudent" && key != "studentId" && key != "college" && key != "grade" {
			writeAPIError(c, http.StatusBadRequest, "只能修改个人资料字段")
			return
		}
	}
	for key := range form.File {
		if key != "avatar" {
			writeAPIError(c, http.StatusBadRequest, "只能修改个人资料字段")
			return
		}
	}
	var avatar *multipart.FileHeader
	if files := form.File["avatar"]; len(files) == 1 {
		avatar = files[0]
	}
	input := auth.ProfileInput{RealName: c.PostForm("realName"), Phone: c.PostForm("phone"), UpdatePhone: len(form.Value["phone"]) == 1, Avatar: avatar}
	if len(form.Value["isStudent"]) > 0 || len(form.Value["studentId"]) > 0 || len(form.Value["college"]) > 0 || len(form.Value["grade"]) > 0 {
		if len(form.Value["isStudent"]) != 1 || (c.PostForm("isStudent") != "true" && c.PostForm("isStudent") != "false") {
			writeAPIError(c, 400, "请选择是否在校学生")
			return
		}
		for _, key := range []string{"studentId", "college", "grade"} {
			if len(form.Value[key]) > 1 {
				writeAPIError(c, 400, "个人资料请求参数不合法")
				return
			}
		}
		student := c.PostForm("isStudent") == "true"
		input.Academic = &accountprofile.Input{IsStudent: &student, StudentID: c.PostForm("studentId"), College: c.PostForm("college"), Grade: c.PostForm("grade")}
	}
	updated, err := h.service.UpdateProfile(c.Request.Context(), user.ID, input)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	writeAPI(c, http.StatusOK, "个人资料已更新", gin.H{"user": updated})
}

func (h *AuthHandler) handleServiceError(c *gin.Context, err error) {
	var serviceErr *auth.ServiceError
	if errors.As(err, &serviceErr) {
		writeAPIError(c, serviceErr.Status, serviceErr.Message)
		return
	}

	writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
}

func (h *AuthHandler) setAuthCookieWithAge(c *gin.Context, token string, maxAge int) {
	if maxAge <= 0 {
		maxAge = h.service.CookieMaxAgeSeconds()
	}
	h.setCookie(c, h.service.CookieName(), token, maxAge, true)
}

const accountVaultCookieName = auth.AccountVaultCookieName

func (h *AuthHandler) setAccountVaultCookieWithAge(c *gin.Context, token string, maxAge int) {
	if strings.TrimSpace(token) == "" {
		return
	}
	if maxAge <= 0 {
		maxAge = h.service.CookieMaxAgeSeconds()
	}
	h.setCookie(c, accountVaultCookieName, token, maxAge, true)
}

func (h *AuthHandler) clearAuthCookie(c *gin.Context) {
	h.setCookie(c, h.service.CookieName(), "", -1, true)
}

func (h *AuthHandler) clearAccountVaultCookie(c *gin.Context) {
	h.setCookie(c, accountVaultCookieName, "", -1, true)
}

func (h *AuthHandler) finishAuthentication(c *gin.Context, result *auth.AuthResult) bool {
	if result == nil || result.User == nil {
		writeAPIError(c, http.StatusInternalServerError, "创建登录态失败")
		return false
	}
	currentToken, _ := c.Cookie(h.service.CookieName())
	vaultToken, _ := c.Cookie(accountVaultCookieName)
	accountSessions, err := h.service.CreateAccountSession(c.Request.Context(), result.User.ID, currentToken, vaultToken)
	if err != nil {
		h.handleServiceError(c, err)
		return false
	}
	h.setAuthCookieWithAge(c, accountSessions.SessionToken, accountSessions.SessionCookieMaxAgeSeconds)
	h.setAccountVaultCookieWithAge(c, accountSessions.VaultToken, accountSessions.VaultCookieMaxAgeSeconds)
	return true
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

func (h *AuthHandler) AccountProfile(c *gin.Context) {
	user, ok := middleware.CurrentSessionUser(c)
	if !ok || user == nil {
		writeAPIError(c, 401, "未登录")
		return
	}
	p, err := h.service.AccountProfile(c.Request.Context(), user.ID)
	if err != nil {
		h.handleServiceError(c, err)
		return
	}
	writeAPI(c, 200, "获取个人资料成功", p)
}
