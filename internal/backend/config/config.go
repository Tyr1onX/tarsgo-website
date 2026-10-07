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
	Email    EmailConfig
	Source   SourceConfig
}

type AppConfig struct {
	Env         string
	Port        string
	GinMode     string
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
	TokenTTL            time.Duration
	CookieMaxAgeSeconds int
	CookieSecure        bool
	CookieSameSite      http.SameSite
}

type EmailConfig struct {
	APIKey string `json:"-"`
	From   string
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
			TokenTTL:            time.Duration(getEnvAsInt("JWT_EXPIRES_HOURS", 72)) * time.Hour,
			CookieMaxAgeSeconds: getEnvAsInt("JWT_COOKIE_MAX_AGE_SECONDS", 72*60*60),
			CookieSecure:        getEnvAsBool("JWT_COOKIE_SECURE", false),
			CookieSameSite:      parseSameSite(getEnv("JWT_COOKIE_SAME_SITE", "lax")),
		},
		Email: EmailConfig{
			APIKey: strings.TrimSpace(os.Getenv("RESEND_API_KEY")),
			From:   getEnv("EMAIL_FROM", "吉甲大师 <noreply@jijiamaster.com>"),
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
