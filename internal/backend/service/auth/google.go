package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"tarsgo-backend/config"
)

type GoogleClient struct {
	cfg        config.GoogleConfig
	httpClient *http.Client
}

type googleUserInfoResponse struct {
	Subject       string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}

type googleTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	Scope       string `json:"scope"`
}

func NewGoogleClient(cfg config.GoogleConfig) *GoogleClient {
	return &GoogleClient{
		cfg:        cfg,
		httpClient: &http.Client{},
	}
}

func (c *GoogleClient) Provider() string {
	return "google"
}

func (c *GoogleClient) DisplayName() string {
	return "Google"
}

func (c *GoogleClient) Enabled() bool {
	return c.cfg.Enabled
}

func (c *GoogleClient) BuildLoginURL(state string) string {
	values := url.Values{}
	values.Set("client_id", c.cfg.ClientID)
	values.Set("redirect_uri", c.cfg.CallbackURL)
	values.Set("response_type", "code")
	values.Set("scope", c.cfg.Scope)
	values.Set("state", state)

	return c.cfg.AuthorizeURL + "?" + values.Encode()
}

func (c *GoogleClient) ExchangeCode(ctx context.Context, code string) (string, error) {
	values := url.Values{}
	values.Set("client_id", c.cfg.ClientID)
	values.Set("client_secret", c.cfg.ClientSecret)
	values.Set("code", code)
	values.Set("redirect_uri", c.cfg.CallbackURL)
	values.Set("grant_type", "authorization_code")

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.TokenURL, strings.NewReader(values.Encode()))
	if err != nil {
		return "", fmt.Errorf("create google token request: %w", err)
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("User-Agent", "TarsGo")

	response, err := c.httpClient.Do(request)
	if err != nil {
		return "", fmt.Errorf("request google token: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode >= http.StatusBadRequest {
		return "", fmt.Errorf("google token request failed with status %d", response.StatusCode)
	}

	var payload googleTokenResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return "", fmt.Errorf("decode google token response: %w", err)
	}
	if strings.TrimSpace(payload.AccessToken) == "" {
		return "", fmt.Errorf("google token response missing access_token")
	}

	return payload.AccessToken, nil
}

func (c *GoogleClient) FetchProfile(ctx context.Context, accessToken string) (*OAuthProfile, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.cfg.UserURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create google user request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", "TarsGo")

	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("request google userinfo: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("google userinfo request failed with status %d", response.StatusCode)
	}

	var payload googleUserInfoResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode google userinfo response: %w", err)
	}
	if strings.TrimSpace(payload.Subject) == "" {
		return nil, fmt.Errorf("google userinfo response missing sub")
	}

	return &OAuthProfile{
		Provider:       c.Provider(),
		ProviderUserID: payload.Subject,
		Email:          strings.TrimSpace(payload.Email),
		EmailVerified:  payload.EmailVerified,
		Name:           strings.TrimSpace(payload.Name),
		AvatarURL:      strings.TrimSpace(payload.Picture),
	}, nil
}
