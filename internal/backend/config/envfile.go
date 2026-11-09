package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/joho/godotenv"
)

func ResolveEnvFilePath() (string, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("get current working directory: %w", err)
	}

	executable, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("get executable path: %w", err)
	}

	return resolveEnvFilePath(cwd, executable), nil
}

func loadEnvFile(path string) error {
	envPath := strings.TrimSpace(path)
	if envPath == "" {
		return nil
	}

	if _, err := os.Stat(envPath); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("stat env file %s: %w", envPath, err)
	}

	if err := godotenv.Load(envPath); err != nil {
		return fmt.Errorf("load env file %s: %w", envPath, err)
	}

	return nil
}

func resolveEnvFilePath(cwd string, executable string) string {
	candidates := make([]string, 0, 2)

	if trimmedCWD := strings.TrimSpace(cwd); trimmedCWD != "" {
		candidates = append(candidates, filepath.Join(trimmedCWD, ".env"))
	}

	if trimmedExecutable := strings.TrimSpace(executable); trimmedExecutable != "" {
		execDir := filepath.Dir(trimmedExecutable)
		execEnvPath := filepath.Join(execDir, ".env")
		if !containsPath(candidates, execEnvPath) {
			candidates = append(candidates, execEnvPath)
		}
	}

	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}

	if len(candidates) > 0 {
		return candidates[0]
	}

	return ".env"
}

func containsPath(paths []string, target string) bool {
	for _, path := range paths {
		if path == target {
			return true
		}
	}
	return false
}
