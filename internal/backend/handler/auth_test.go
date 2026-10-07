package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/service/auth"
)

type stubAuthService struct {
	bootstrapStatusFn           func(ctx context.Context) (*auth.BootstrapStatus, error)
	sendRegisterCodeFn          func(ctx context.Context, email string) error
	registerWithEmailFn         func(ctx context.Context, input auth.RegisterEmailInput) (*auth.AuthResult, error)
	registerInitialSuperAdminFn func(ctx context.Context, input auth.RegisterInitialSuperAdminInput) (*auth.AuthResult, error)
	loginWithPasswordFn         func(ctx context.Context, email string, password string) (*auth.AuthResult, error)
	sendLoginCodeFn             func(ctx context.Context, email string) error
	loginWithCodeFn             func(ctx context.Context, email string, code string) (*auth.AuthResult, error)
	currentUserFn               func(ctx context.Context, token string) (*auth.SessionUser, error)
}

func (s stubAuthService) BootstrapStatus(ctx context.Context) (*auth.BootstrapStatus, error) {
	if s.bootstrapStatusFn != nil {
		return s.bootstrapStatusFn(ctx)
	}
	return &auth.BootstrapStatus{SetupRequired: false}, nil
}

func (s stubAuthService) SendRegisterCode(ctx context.Context, email string) error {
	if s.sendRegisterCodeFn != nil {
		return s.sendRegisterCodeFn(ctx, email)
	}
	return nil
}

func (s stubAuthService) RegisterWithEmail(ctx context.Context, input auth.RegisterEmailInput) (*auth.AuthResult, error) {
	if s.registerWithEmailFn != nil {
		return s.registerWithEmailFn(ctx, input)
	}
	return nil, nil
}

func (s stubAuthService) RegisterInitialSuperAdmin(ctx context.Context, input auth.RegisterInitialSuperAdminInput) (*auth.AuthResult, error) {
	if s.registerInitialSuperAdminFn != nil {
		return s.registerInitialSuperAdminFn(ctx, input)
	}
	return nil, nil
}

func (s stubAuthService) LoginWithPassword(ctx context.Context, email string, password string) (*auth.AuthResult, error) {
	if s.loginWithPasswordFn != nil {
		return s.loginWithPasswordFn(ctx, email, password)
	}
	return nil, nil
}

func (s stubAuthService) SendLoginCode(ctx context.Context, email string) error {
	if s.sendLoginCodeFn != nil {
		return s.sendLoginCodeFn(ctx, email)
	}
	return nil
}

func (s stubAuthService) LoginWithCode(ctx context.Context, email string, code string) (*auth.AuthResult, error) {
	if s.loginWithCodeFn != nil {
		return s.loginWithCodeFn(ctx, email, code)
	}
	return nil, nil
}

func (s stubAuthService) CurrentUser(ctx context.Context, token string) (*auth.SessionUser, error) {
	if s.currentUserFn != nil {
		return s.currentUserFn(ctx, token)
	}
	return nil, nil
}

func (s stubAuthService) CookieName() string {
	return "tarsgo_token"
}

func (s stubAuthService) CookieMaxAgeSeconds() int {
	return 3600
}

func (s stubAuthService) CookieSecure() bool {
	return false
}

func (s stubAuthService) CookieSameSite() http.SameSite {
	return http.SameSiteLaxMode
}

func TestSendRegisterCode(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	handler := NewAuthHandler(stubAuthService{})
	recorder, ctx := newJSONContext(t, http.MethodPost, "/api/register/email/send-code", map[string]string{
		"email": "user@example.com",
	})

	handler.SendRegisterCode(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload["message"] != "验证码已发送" {
		t.Fatalf("unexpected message: %v", payload["message"])
	}
}

func TestBootstrapStatus(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name          string
		setupRequired bool
	}{
		{name: "setup required", setupRequired: true},
		{name: "already initialized", setupRequired: false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			gin.SetMode(gin.TestMode)
			handler := NewAuthHandler(stubAuthService{
				bootstrapStatusFn: func(ctx context.Context) (*auth.BootstrapStatus, error) {
					return &auth.BootstrapStatus{SetupRequired: tc.setupRequired}, nil
				},
			})
			recorder, ctx := newPlainContext(http.MethodGet, "/api/bootstrap/status")

			handler.BootstrapStatus(ctx)

			if recorder.Code != http.StatusOK {
				t.Fatalf("expected status 200, got %d", recorder.Code)
			}

			var payload struct {
				Data auth.BootstrapStatus `json:"data"`
			}
			if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if payload.Data.SetupRequired != tc.setupRequired {
				t.Fatalf("expected setupRequired=%t, got %#v", tc.setupRequired, payload.Data)
			}
		})
	}
}

func TestRegisterWithEmailSetsCookie(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	handler := NewAuthHandler(stubAuthService{
		registerWithEmailFn: func(ctx context.Context, input auth.RegisterEmailInput) (*auth.AuthResult, error) {
			if input.RealName != "张三" {
				t.Fatalf("expected realName to be forwarded, got %q", input.RealName)
			}
			if input.Phone != "13800138000" {
				t.Fatalf("expected phone to be forwarded, got %q", input.Phone)
			}
			return &auth.AuthResult{
				Token: "signed-token",
				User: &auth.SessionUser{
					ID:    1,
					Email: "user@example.com",
					Role: auth.SessionRole{
						ID:          1,
						Name:        "user",
						DisplayName: "普通用户",
					},
				},
			}, nil
		},
	})
	recorder, ctx := newJSONContext(t, http.MethodPost, "/api/register/email", map[string]string{
		"email":    "user@example.com",
		"password": "123456",
		"realName": "张三",
		"phone":    "13800138000",
		"code":     "123456",
	})

	handler.RegisterWithEmail(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	setCookie := recorder.Header().Get("Set-Cookie")
	if !strings.Contains(setCookie, "tarsgo_token=signed-token") {
		t.Fatalf("expected auth cookie to be set, got %s", setCookie)
	}
}

func TestRegisterWithEmailRejectsMissingRequiredFields(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	handler := NewAuthHandler(stubAuthService{
		registerWithEmailFn: func(ctx context.Context, input auth.RegisterEmailInput) (*auth.AuthResult, error) {
			t.Fatal("register service should not be called for invalid request")
			return nil, nil
		},
	})

	recorder, ctx := newJSONContext(t, http.MethodPost, "/api/register/email", map[string]string{
		"email":    "user@example.com",
		"password": "123456",
		"phone":    "13800138000",
		"code":     "123456",
	})

	handler.RegisterWithEmail(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "请求参数不合法") {
		t.Fatalf("unexpected response body: %s", recorder.Body.String())
	}
}

func TestRegisterInitialSuperAdminSetsCookie(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	handler := NewAuthHandler(stubAuthService{
		registerInitialSuperAdminFn: func(ctx context.Context, input auth.RegisterInitialSuperAdminInput) (*auth.AuthResult, error) {
			return &auth.AuthResult{
				Token: "bootstrap-token",
				User: &auth.SessionUser{
					ID:    1,
					Email: "root@example.com",
					Role: auth.SessionRole{
						ID:          1,
						Name:        "super_admin",
						DisplayName: "超级管理员",
					},
				},
			}, nil
		},
	})
	recorder, ctx := newJSONContext(t, http.MethodPost, "/api/bootstrap/super-admin", map[string]string{
		"email":           "root@example.com",
		"password":        "Password123",
		"confirmPassword": "Password123",
	})

	handler.RegisterInitialSuperAdmin(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	setCookie := recorder.Header().Get("Set-Cookie")
	if !strings.Contains(setCookie, "tarsgo_token=bootstrap-token") {
		t.Fatalf("expected bootstrap auth cookie to be set, got %s", setCookie)
	}
}

func TestRegisterInitialSuperAdminReturnsServiceError(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name    string
		status  int
		message string
	}{
		{name: "password mismatch", status: http.StatusBadRequest, message: "两次输入的密码不一致"},
		{name: "already initialized", status: http.StatusConflict, message: "系统已初始化，请直接登录"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			gin.SetMode(gin.TestMode)
			handler := NewAuthHandler(stubAuthService{
				registerInitialSuperAdminFn: func(ctx context.Context, input auth.RegisterInitialSuperAdminInput) (*auth.AuthResult, error) {
					return nil, &auth.ServiceError{Status: tc.status, Message: tc.message}
				},
			})
			recorder, ctx := newJSONContext(t, http.MethodPost, "/api/bootstrap/super-admin", map[string]string{
				"email":           "root@example.com",
				"password":        "Password123",
				"confirmPassword": "Password123",
			})

			handler.RegisterInitialSuperAdmin(ctx)

			if recorder.Code != tc.status {
				t.Fatalf("expected status %d, got %d", tc.status, recorder.Code)
			}
			if !strings.Contains(recorder.Body.String(), tc.message) {
				t.Fatalf("expected message %q, got %s", tc.message, recorder.Body.String())
			}
		})
	}
}

func TestAuthEndpointsReturnBootstrapConflict(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	serviceErr := &auth.ServiceError{Status: http.StatusConflict, Message: "系统尚未初始化，请先完成超级管理员注册"}
	handler := NewAuthHandler(stubAuthService{
		registerWithEmailFn: func(ctx context.Context, input auth.RegisterEmailInput) (*auth.AuthResult, error) {
			return nil, serviceErr
		},
		loginWithPasswordFn: func(ctx context.Context, email string, password string) (*auth.AuthResult, error) {
			return nil, serviceErr
		},
	})

	registerRecorder, registerCtx := newJSONContext(t, http.MethodPost, "/api/register/email", map[string]string{
		"email":    "user@example.com",
		"password": "123456",
		"realName": "张三",
		"phone":    "13800138000",
		"code":     "123456",
	})
	handler.RegisterWithEmail(registerCtx)
	if registerRecorder.Code != http.StatusConflict {
		t.Fatalf("expected register status 409, got %d", registerRecorder.Code)
	}

	loginRecorder, loginCtx := newJSONContext(t, http.MethodPost, "/api/login/email/password", map[string]string{
		"email":    "user@example.com",
		"password": "123456",
	})
	handler.LoginWithPassword(loginCtx)
	if loginRecorder.Code != http.StatusConflict {
		t.Fatalf("expected login status 409, got %d", loginRecorder.Code)
	}
}

func TestMeWithoutCookieReturnsUnauthorized(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	handler := NewAuthHandler(stubAuthService{})
	recorder, ctx := newPlainContext(http.MethodGet, "/api/me")

	handler.Me(ctx)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", recorder.Code)
	}
}

func TestMeReturnsCurrentUser(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	handler := NewAuthHandler(stubAuthService{
		currentUserFn: func(ctx context.Context, token string) (*auth.SessionUser, error) {
			return &auth.SessionUser{
				ID:    7,
				Email: "user@example.com",
				Role: auth.SessionRole{
					ID:          3,
					Name:        "user",
					DisplayName: "普通用户",
				},
			}, nil
		},
	})
	recorder, ctx := newPlainContext(http.MethodGet, "/api/me")
	ctx.Request.AddCookie(&http.Cookie{Name: "tarsgo_token", Value: "signed-token"})

	handler.Me(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	var payload struct {
		Data struct {
			User auth.SessionUser `json:"user"`
		} `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Data.User.ID != 7 || payload.Data.User.Email != "user@example.com" {
		t.Fatalf("expected current account in response, got %#v", payload.Data.User)
	}
}

func TestLogoutClearsCookie(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	handler := NewAuthHandler(stubAuthService{})
	recorder, ctx := newPlainContext(http.MethodPost, "/api/logout")

	handler.Logout(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	setCookie := recorder.Header().Values("Set-Cookie")
	if len(setCookie) == 0 {
		t.Fatalf("expected Set-Cookie header")
	}
	if !strings.Contains(strings.Join(setCookie, ";"), "tarsgo_token=") {
		t.Fatalf("expected auth cookie to be cleared, got %v", setCookie)
	}
}

func newJSONContext(t *testing.T, method string, target string, body any) (*httptest.ResponseRecorder, *gin.Context) {
	t.Helper()

	buffer, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal request body: %v", err)
	}

	recorder, ctx := newPlainContext(method, target)
	ctx.Request.Body = ioNopCloser(bytes.NewReader(buffer))
	ctx.Request.Header.Set("Content-Type", "application/json")
	return recorder, ctx
}

func newPlainContext(method string, target string) (*httptest.ResponseRecorder, *gin.Context) {
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(method, target, nil)
	return recorder, ctx
}

type nopCloser struct {
	*bytes.Reader
}

func (n nopCloser) Close() error {
	return nil
}

func ioNopCloser(reader *bytes.Reader) nopCloser {
	return nopCloser{Reader: reader}
}
