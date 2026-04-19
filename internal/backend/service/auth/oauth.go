package auth

import (
	"context"
	"fmt"
	"net/http"
	"strings"
)

type OAuthProfile struct {
	Provider       string
	ProviderUserID string
	Login          string
	Email          string
	EmailVerified  bool
	Name           string
	AvatarURL      string
}

type OAuthProvider interface {
	Provider() string
	DisplayName() string
	Enabled() bool
	BuildLoginURL(state string) string
	ExchangeCode(ctx context.Context, code string) (string, error)
	FetchProfile(ctx context.Context, accessToken string) (*OAuthProfile, error)
}

type OAuthLoginProvider struct {
	Provider    string `json:"provider"`
	DisplayName string `json:"displayName"`
}

func normalizeOAuthProvider(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func providerErrorCode(provider string, reason string) string {
	return fmt.Sprintf("%s_%s", normalizeOAuthProvider(provider), strings.TrimSpace(reason))
}

func providerDisplayName(provider string) string {
	switch normalizeOAuthProvider(provider) {
	case "google":
		return "Google"
	default:
		return "GitHub"
	}
}

func newUnknownOAuthProviderError(provider string) *ServiceError {
	return &ServiceError{
		Status:  http.StatusNotFound,
		Message: fmt.Sprintf("不支持的第三方登录类型：%s", strings.TrimSpace(provider)),
	}
}

func newDisabledOAuthProviderError(provider string) *ServiceError {
	return &ServiceError{
		Status:  http.StatusNotFound,
		Message: fmt.Sprintf("%s 登录未启用", providerDisplayName(provider)),
	}
}
