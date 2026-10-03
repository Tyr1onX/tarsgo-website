package config

import (
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	App      AppConfig
	Database DatabaseConfig
	CORS     CORSConfig
	Auth     AuthConfig
	SMTP     SMTPConfig
	GitHub   GitHubConfig
	Google   GoogleConfig
	Source   SourceConfig
}

type AppConfig struct {
	Env         string
	Port        string
	GinMode     string
	FrontendURL string
	AutoMigrate bool
}

type DatabaseConfig struct {
	Host            string
	Port            string
	Name            string
	User            string
	Password        string
	Charset         string
	Loc             string
	ParseTime       bool
	MaxIdleConns    int
	MaxOpenConns    int
	ConnMaxLifetime time.Duration
}

type CORSConfig struct {
	AllowedOrigins []string
}

type AuthConfig struct {
	JWTSecret           string
	CookieName          string
	OAuthStateCookie    string
	TokenTTL            time.Duration
	CookieMaxAgeSeconds int
	CookieSecure        bool
	CookieSameSite      http.SameSite
}

type SMTPConfig struct {
	Host     string
	Port     string
	Username string
	Password string
	From     string
}

type GitHubConfig struct {
	Enabled      bool
	ClientID     string
	ClientSecret string
	CallbackURL  string
	AuthorizeURL string
	TokenURL     string
	UserURL      string
	EmailsURL    string
	Scope        string
}

type GoogleConfig struct {
	Enabled      bool
	ClientID     string
	ClientSecret string
	CallbackURL  string
	AuthorizeURL string
	TokenURL     string
	UserURL      string
	Scope        string
}

type SourceConfig struct {
	EnvFilePath string
}

func Load() (*Config, error) {
	envFilePath, err := ResolveEnvFilePath()
	if err != nil {
		return nil, err
	}

	if err := loadEnvFile(envFilePath); err != nil {
		return nil, err
	}

	cfg := &Config{
		App: AppConfig{
			Env:         getEnv("APP_ENV", "development"),
			Port:        getEnv("APP_PORT", "8080"),
			GinMode:     getEnv("GIN_MODE", "debug"),
			FrontendURL: getEnv("APP_FRONTEND_URL", ""),
			AutoMigrate: getEnvAsBool("APP_AUTO_MIGRATE", true),
		},
		Database: DatabaseConfig{
			Host:            os.Getenv("DB_HOST"),
			Port:            getEnv("DB_PORT", "3306"),
			Name:            os.Getenv("DB_NAME"),
			User:            os.Getenv("DB_USER"),
			Password:        os.Getenv("DB_PASSWORD"),
			Charset:         getEnv("DB_CHARSET", "utf8mb4"),
			Loc:             getEnv("DB_LOC", "Local"),
			ParseTime:       getEnvAsBool("DB_PARSE_TIME", true),
			MaxIdleConns:    getEnvAsInt("DB_MAX_IDLE_CONNS", 10),
			MaxOpenConns:    getEnvAsInt("DB_MAX_OPEN_CONNS", 20),
			ConnMaxLifetime: time.Duration(getEnvAsInt("DB_CONN_MAX_LIFETIME_MINUTES", 30)) * time.Minute,
		},
		CORS: CORSConfig{
			AllowedOrigins: splitAndClean(getEnv(
				"CORS_ALLOWED_ORIGINS",
				"http://localhost:5173,http://localhost:5180",
			)),
		},
		Auth: AuthConfig{
			JWTSecret:           os.Getenv("JWT_SECRET"),
			CookieName:          getEnv("JWT_COOKIE_NAME", "tarsgo_token"),
			OAuthStateCookie:    getEnv("JWT_OAUTH_STATE_COOKIE_NAME", "tarsgo_oauth_state"),
			TokenTTL:            time.Duration(getEnvAsInt("JWT_EXPIRES_HOURS", 72)) * time.Hour,
			CookieMaxAgeSeconds: getEnvAsInt("JWT_COOKIE_MAX_AGE_SECONDS", 72*60*60),
			CookieSecure:        getEnvAsBool("JWT_COOKIE_SECURE", false),
			CookieSameSite:      parseSameSite(getEnv("JWT_COOKIE_SAME_SITE", "lax")),
		},
		SMTP: SMTPConfig{
			Port: "465",
		},
		GitHub: GitHubConfig{
			Enabled:      false,
			AuthorizeURL: "https://github.com/login/oauth/authorize",
			TokenURL:     "https://github.com/login/oauth/access_token",
			UserURL:      "https://api.github.com/user",
			EmailsURL:    "https://api.github.com/user/emails",
			Scope:        "read:user user:email",
		},
		Google: GoogleConfig{
			Enabled:      false,
			AuthorizeURL: "https://accounts.google.com/o/oauth2/v2/auth",
			TokenURL:     "https://oauth2.googleapis.com/token",
			UserURL:      "https://openidconnect.googleapis.com/v1/userinfo",
			Scope:        "openid email profile",
		},
		Source: SourceConfig{
			EnvFilePath: envFilePath,
		},
	}

	missing := make([]string, 0, 13)
	if strings.TrimSpace(cfg.Database.Host) == "" {
		missing = append(missing, "DB_HOST")
	}
	if strings.TrimSpace(cfg.Database.Name) == "" {
		missing = append(missing, "DB_NAME")
	}
	if strings.TrimSpace(cfg.Database.User) == "" {
		missing = append(missing, "DB_USER")
	}
	if strings.TrimSpace(cfg.Database.Password) == "" {
		missing = append(missing, "DB_PASSWORD")
	}
	if strings.TrimSpace(cfg.Auth.JWTSecret) == "" {
		missing = append(missing, "JWT_SECRET")
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("missing required environment variables: %s", strings.Join(missing, ", "))
	}
	if strings.EqualFold(strings.TrimSpace(cfg.App.Env), "production") {
		if len(strings.TrimSpace(cfg.Auth.JWTSecret)) < 32 || strings.Contains(strings.ToLower(cfg.Auth.JWTSecret), "change") {
			return nil, fmt.Errorf("JWT_SECRET must be a unique random value of at least 32 characters in production")
		}
		if !cfg.Auth.CookieSecure {
			return nil, fmt.Errorf("JWT_COOKIE_SECURE must be true in production")
		}
	}

	return cfg, nil
}

func (c AppConfig) Address() string {
	return ":" + c.Port
}

func (c AppConfig) AdminDashboardURL() string {
	return c.FrontendRoute("/dashboard")
}

func (c AppConfig) BootstrapSetupURL() string {
	return c.FrontendRoute("/dashboard/setup/super-admin")
}

func (c AppConfig) LoginErrorURL(code string) string {
	return c.FrontendRoute("/login") + "?error=" + code
}

func (c AppConfig) FrontendRoute(routePath string) string {
	normalizedPath := "/" + strings.TrimLeft(strings.TrimSpace(routePath), "/")
	if strings.TrimSpace(c.FrontendURL) == "" {
		return normalizedPath
	}

	return strings.TrimRight(strings.TrimSpace(c.FrontendURL), "/") + normalizedPath
}

func (c DatabaseConfig) DSN() string {
	return fmt.Sprintf(
		"%s:%s@tcp(%s:%s)/%s?charset=%s&parseTime=%t&loc=%s",
		c.User,
		c.Password,
		c.Host,
		c.Port,
		c.Name,
		c.Charset,
		c.ParseTime,
		c.Loc,
	)
}

func getEnv(key string, fallback string) string {
	if value, ok := os.LookupEnv(key); ok && strings.TrimSpace(value) != "" {
		return value
	}
	return fallback
}

func getEnvAsInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func getEnvAsBool(key string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func splitAndClean(value string) []string {
	items := strings.Split(value, ",")
	cleaned := make([]string, 0, len(items))

	for _, item := range items {
		trimmed := strings.TrimSpace(item)
		if trimmed != "" {
			cleaned = append(cleaned, trimmed)
		}
	}

	if len(cleaned) == 0 {
		return []string{
			"http://localhost:5173",
			"http://localhost:5180",
		}
	}

	return cleaned
}

func parseSameSite(value string) http.SameSite {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "strict":
		return http.SameSiteStrictMode
	case "none":
		return http.SameSiteNoneMode
	default:
		return http.SameSiteLaxMode
	}
}
