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

	"tarsgo-backend/auth"
)

type stubAuthService struct {
	sendRegisterCodeFn     func(ctx context.Context, email string) error
	registerWithEmailFn    func(ctx context.Context, input auth.RegisterEmailInput) (*auth.AuthResult, error)
	loginWithPasswordFn    func(ctx context.Context, email string, password string) (*auth.AuthResult, error)
	sendLoginCodeFn        func(ctx context.Context, email string) error
	loginWithCodeFn        func(ctx context.Context, email string, code string) (*auth.AuthResult, error)
	buildGitHubLoginURLFn  func() (string, string, error)
	handleGitHubCallbackFn func(ctx context.Context, code string) (*auth.AuthResult, error)
	currentUserFn          func(ctx context.Context, token string) (*auth.SessionUser, error)
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

func (s stubAuthService) BuildGitHubLoginURL() (string, string, error) {
	if s.buildGitHubLoginURLFn != nil {
		return s.buildGitHubLoginURLFn()
	}
	return "", "", nil
}

func (s stubAuthService) HandleGitHubCallback(ctx context.Context, code string) (*auth.AuthResult, error) {
	if s.handleGitHubCallbackFn != nil {
		return s.handleGitHubCallbackFn(ctx, code)
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

func (s stubAuthService) OAuthStateCookieName() string {
	return "tarsgo_oauth_state"
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

func (s stubAuthService) AdminDashboardURL() string {
	return "http://127.0.0.1:5173/admin/dashboard"
}

func (s stubAuthService) LoginErrorURL(code string) string {
	return "http://127.0.0.1:5173/login?error=" + code
}

func TestSendRegisterCode(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	handler := NewAuthHandler(nil, stubAuthService{})
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

func TestRegisterWithEmailSetsCookie(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	handler := NewAuthHandler(nil, stubAuthService{
		registerWithEmailFn: func(ctx context.Context, input auth.RegisterEmailInput) (*auth.AuthResult, error) {
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

func TestMeWithoutCookieReturnsUnauthorized(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	handler := NewAuthHandler(nil, stubAuthService{})
	recorder, ctx := newPlainContext(http.MethodGet, "/api/me")

	handler.Me(ctx)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", recorder.Code)
	}
}

func TestLogoutClearsCookie(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)
	handler := NewAuthHandler(nil, stubAuthService{})
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
