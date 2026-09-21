package runtimeconfig

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/config"
	"tarsgo-backend/model"
)

const (
	KeyEmailSMTP   = "email.smtp"
	KeyOAuthGitHub = "oauth.github"
	KeyOAuthGoogle = "oauth.google"
)

type OAuthSettings struct {
	Enabled      bool
	ClientID     string
	ClientSecret string
	CallbackURL  string
	Scope        string
}

type Store struct {
	db *gorm.DB

	mu         sync.RWMutex
	smtp       config.SMTPConfig
	github     OAuthSettings
	google     OAuthSettings
	githubBase config.GitHubConfig
	googleBase config.GoogleConfig
}

type smtpPayload struct {
	Host     string `json:"host"`
	Port     string `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
	From     string `json:"from"`
}

type oauthPayload struct {
	Enabled      bool   `json:"enabled"`
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
	CallbackURL  string `json:"callbackUrl"`
	Scope        string `json:"scope"`
}

func NewStore(db *gorm.DB, cfg *config.Config) (*Store, error) {
	store := &Store{
		db:         db,
		githubBase: cfg.GitHub,
		googleBase: cfg.Google,
	}

	if err := store.Reload(context.Background()); err != nil {
		return nil, err
	}

	return store, nil
}

func (s *Store) Reload(ctx context.Context) error {
	smtpConfig, err := s.loadSMTPConfig(ctx)
	if err != nil {
		return err
	}
	githubSettings, err := s.loadOAuthSettings(ctx, model.OAuthProviderGitHub)
	if err != nil {
		return err
	}
	googleSettings, err := s.loadOAuthSettings(ctx, model.OAuthProviderGoogle)
	if err != nil {
		return err
	}

	s.mu.Lock()
	s.smtp = smtpConfig
	s.github = githubSettings
	s.google = googleSettings
	s.mu.Unlock()

	return nil
}

func (s *Store) SMTPConfig() config.SMTPConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return s.smtp
}

func (s *Store) SaveSMTPConfig(ctx context.Context, cfg config.SMTPConfig) error {
	normalized := normalizeSMTPConfig(cfg)
	if err := s.save(ctx, KeyEmailSMTP, smtpPayload{
		Host:     normalized.Host,
		Port:     normalized.Port,
		Username: normalized.Username,
		Password: normalized.Password,
		From:     normalized.From,
	}); err != nil {
		return err
	}

	s.mu.Lock()
	s.smtp = normalized
	s.mu.Unlock()

	return nil
}

func (s *Store) GitHubConfig() config.GitHubConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()

	cfg := s.githubBase
	applyOAuthSettingsToGitHub(&cfg, s.github)
	return cfg
}

func (s *Store) GoogleConfig() config.GoogleConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()

	cfg := s.googleBase
	applyOAuthSettingsToGoogle(&cfg, s.google)
	return cfg
}

func (s *Store) OAuthSettings(provider string) (OAuthSettings, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	switch normalizeProvider(provider) {
	case model.OAuthProviderGitHub:
		return s.github, nil
	case model.OAuthProviderGoogle:
		return s.google, nil
	default:
		return OAuthSettings{}, fmt.Errorf("unsupported oauth provider: %s", strings.TrimSpace(provider))
	}
}

func (s *Store) SaveOAuthSettings(ctx context.Context, provider string, settings OAuthSettings) error {
	normalizedProvider := normalizeProvider(provider)
	normalized := normalizeOAuthSettings(normalizedProvider, settings)

	if err := s.save(ctx, configKeyForProvider(normalizedProvider), oauthPayload{
		Enabled:      normalized.Enabled,
		ClientID:     normalized.ClientID,
		ClientSecret: normalized.ClientSecret,
		CallbackURL:  normalized.CallbackURL,
		Scope:        normalized.Scope,
	}); err != nil {
		return err
	}

	s.mu.Lock()
	switch normalizedProvider {
	case model.OAuthProviderGitHub:
		s.github = normalized
	case model.OAuthProviderGoogle:
		s.google = normalized
	default:
		s.mu.Unlock()
		return fmt.Errorf("unsupported oauth provider: %s", strings.TrimSpace(provider))
	}
	s.mu.Unlock()

	return nil
}

func (s *Store) loadSMTPConfig(ctx context.Context) (config.SMTPConfig, error) {
	record, err := s.find(ctx, KeyEmailSMTP)
	if err != nil {
		return config.SMTPConfig{}, err
	}
	if record == nil {
		return normalizeSMTPConfig(config.SMTPConfig{}), nil
	}

	var payload smtpPayload
	if err := json.Unmarshal([]byte(record.ConfigValue), &payload); err != nil {
		return config.SMTPConfig{}, fmt.Errorf("decode %s: %w", KeyEmailSMTP, err)
	}

	return normalizeSMTPConfig(config.SMTPConfig{
		Host:     payload.Host,
		Port:     payload.Port,
		Username: payload.Username,
		Password: payload.Password,
		From:     payload.From,
	}), nil
}

func (s *Store) loadOAuthSettings(ctx context.Context, provider string) (OAuthSettings, error) {
	key := configKeyForProvider(provider)
	record, err := s.find(ctx, key)
	if err != nil {
		return OAuthSettings{}, err
	}
	if record == nil {
		return normalizeOAuthSettings(provider, OAuthSettings{}), nil
	}

	var payload oauthPayload
	if err := json.Unmarshal([]byte(record.ConfigValue), &payload); err != nil {
		return OAuthSettings{}, fmt.Errorf("decode %s: %w", key, err)
	}

	return normalizeOAuthSettings(provider, OAuthSettings{
		Enabled:      payload.Enabled,
		ClientID:     payload.ClientID,
		ClientSecret: payload.ClientSecret,
		CallbackURL:  payload.CallbackURL,
		Scope:        payload.Scope,
	}), nil
}

func (s *Store) find(ctx context.Context, key string) (*model.SystemConfig, error) {
	var record model.SystemConfig
	result := s.db.WithContext(ctx).
		Where("config_key = ?", strings.TrimSpace(key)).
		Limit(1).
		Find(&record)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, nil
	}

	return &record, nil
}

func (s *Store) save(ctx context.Context, key string, payload any) error {
	value, err := marshalPayload(payload)
	if err != nil {
		return err
	}

	record := model.SystemConfig{
		ConfigKey:   strings.TrimSpace(key),
		ConfigValue: value,
	}

	return s.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "config_key"}},
			DoUpdates: clause.Assignments(map[string]any{
				"config_value": value,
				"updated_at":   time.Now(),
			}),
		}).
		Create(&record).Error
}

func marshalPayload(payload any) (string, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal system config payload: %w", err)
	}
	return string(data), nil
}

func configKeyForProvider(provider string) string {
	switch normalizeProvider(provider) {
	case model.OAuthProviderGoogle:
		return KeyOAuthGoogle
	default:
		return KeyOAuthGitHub
	}
}

func oauthPayloadFromSettings(provider string, settings OAuthSettings) oauthPayload {
	normalized := normalizeOAuthSettings(provider, settings)
	return oauthPayload{
		Enabled:      normalized.Enabled,
		ClientID:     normalized.ClientID,
		ClientSecret: normalized.ClientSecret,
		CallbackURL:  normalized.CallbackURL,
		Scope:        normalized.Scope,
	}
}

func applyOAuthSettingsToGitHub(cfg *config.GitHubConfig, settings OAuthSettings) {
	cfg.Enabled = settings.Enabled
	cfg.ClientID = settings.ClientID
	cfg.ClientSecret = settings.ClientSecret
	cfg.CallbackURL = settings.CallbackURL
	cfg.Scope = settings.Scope
}

func applyOAuthSettingsToGoogle(cfg *config.GoogleConfig, settings OAuthSettings) {
	cfg.Enabled = settings.Enabled
	cfg.ClientID = settings.ClientID
	cfg.ClientSecret = settings.ClientSecret
	cfg.CallbackURL = settings.CallbackURL
	cfg.Scope = settings.Scope
}

func normalizeSMTPConfig(cfg config.SMTPConfig) config.SMTPConfig {
	port := strings.TrimSpace(cfg.Port)
	if port == "" {
		port = "465"
	}

	return config.SMTPConfig{
		Host:     strings.TrimSpace(cfg.Host),
		Port:     port,
		Username: strings.TrimSpace(cfg.Username),
		Password: strings.TrimSpace(cfg.Password),
		From:     strings.TrimSpace(cfg.From),
	}
}

func normalizeOAuthSettings(provider string, settings OAuthSettings) OAuthSettings {
	scope := strings.TrimSpace(settings.Scope)
	if scope == "" {
		scope = defaultOAuthScope(provider)
	}

	return OAuthSettings{
		Enabled:      settings.Enabled,
		ClientID:     strings.TrimSpace(settings.ClientID),
		ClientSecret: strings.TrimSpace(settings.ClientSecret),
		CallbackURL:  strings.TrimSpace(settings.CallbackURL),
		Scope:        scope,
	}
}

func defaultOAuthScope(provider string) string {
	switch normalizeProvider(provider) {
	case model.OAuthProviderGoogle:
		return "openid email profile"
	default:
		return "read:user user:email"
	}
}

func normalizeProvider(provider string) string {
	return strings.ToLower(strings.TrimSpace(provider))
}
