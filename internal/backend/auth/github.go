package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"tarsgo-backend/config"
)

type GitHubClient struct {
	cfg        config.GitHubConfig
	httpClient *http.Client
}

type GitHubProfile struct {
	ID        int64   `json:"id"`
	Login     string  `json:"login"`
	AvatarURL string  `json:"avatar_url"`
	Name      *string `json:"name"`
	Email     *string `json:"email"`
}

type githubEmail struct {
	Email    string `json:"email"`
	Primary  bool   `json:"primary"`
	Verified bool   `json:"verified"`
}

type githubTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	Scope       string `json:"scope"`
}

func NewGitHubClient(cfg config.GitHubConfig) *GitHubClient {
	return &GitHubClient{
		cfg:        cfg,
		httpClient: &http.Client{},
	}
}

func (c *GitHubClient) BuildLoginURL(state string) string {
	values := url.Values{}
	values.Set("client_id", c.cfg.ClientID)
	values.Set("redirect_uri", c.cfg.CallbackURL)
	values.Set("scope", c.cfg.Scope)
	values.Set("state", state)

	return c.cfg.AuthorizeURL + "?" + values.Encode()
}

func (c *GitHubClient) ExchangeCode(ctx context.Context, code string) (string, error) {
	values := url.Values{}
	values.Set("client_id", c.cfg.ClientID)
	values.Set("client_secret", c.cfg.ClientSecret)
	values.Set("code", code)
	values.Set("redirect_uri", c.cfg.CallbackURL)

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.TokenURL, strings.NewReader(values.Encode()))
	if err != nil {
		return "", fmt.Errorf("create github token request: %w", err)
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("User-Agent", "TarsGo")

	response, err := c.httpClient.Do(request)
	if err != nil {
		return "", fmt.Errorf("request github token: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode >= http.StatusBadRequest {
		return "", fmt.Errorf("github token request failed with status %d", response.StatusCode)
	}

	var payload githubTokenResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return "", fmt.Errorf("decode github token response: %w", err)
	}
	if strings.TrimSpace(payload.AccessToken) == "" {
		return "", fmt.Errorf("github token response missing access_token")
	}

	return payload.AccessToken, nil
}

func (c *GitHubClient) FetchProfile(ctx context.Context, accessToken string) (*GitHubProfile, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.cfg.UserURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create github user request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "TarsGo")

	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("request github user: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("github user request failed with status %d", response.StatusCode)
	}

	var profile GitHubProfile
	if err := json.NewDecoder(response.Body).Decode(&profile); err != nil {
		return nil, fmt.Errorf("decode github user response: %w", err)
	}

	if profile.ID == 0 {
		return nil, fmt.Errorf("github user response missing id")
	}

	if profile.Email == nil || strings.TrimSpace(*profile.Email) == "" {
		email, err := c.FetchPrimaryEmail(ctx, accessToken)
		if err == nil {
			profile.Email = &email
		}
	}

	if profile.Email == nil || strings.TrimSpace(*profile.Email) == "" {
		fallback := fmt.Sprintf("%s@users.noreply.github.com", strconv.FormatInt(profile.ID, 10))
		profile.Email = &fallback
	}

	return &profile, nil
}

func (c *GitHubClient) FetchPrimaryEmail(ctx context.Context, accessToken string) (string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.cfg.EmailsURL, nil)
	if err != nil {
		return "", fmt.Errorf("create github email request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "TarsGo")

	response, err := c.httpClient.Do(request)
	if err != nil {
		return "", fmt.Errorf("request github emails: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode >= http.StatusBadRequest {
		return "", fmt.Errorf("github emails request failed with status %d", response.StatusCode)
	}

	var emails []githubEmail
	if err := json.NewDecoder(response.Body).Decode(&emails); err != nil {
		return "", fmt.Errorf("decode github emails response: %w", err)
	}

	for _, item := range emails {
		if item.Primary && item.Verified && strings.TrimSpace(item.Email) != "" {
			return item.Email, nil
		}
	}

	for _, item := range emails {
		if item.Verified && strings.TrimSpace(item.Email) != "" {
			return item.Email, nil
		}
	}

	return "", fmt.Errorf("github user has no verified email")
}
