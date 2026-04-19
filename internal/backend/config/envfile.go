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

func ReadEnvFile(path string) (map[string]string, error) {
	envPath := strings.TrimSpace(path)
	if envPath == "" {
		return map[string]string{}, nil
	}

	if _, err := os.Stat(envPath); err != nil {
		if os.IsNotExist(err) {
			return map[string]string{}, nil
		}
		return nil, fmt.Errorf("stat env file %s: %w", envPath, err)
	}

	values, err := godotenv.Read(envPath)
	if err != nil {
		return nil, fmt.Errorf("read env file %s: %w", envPath, err)
	}
	return values, nil
}

func WriteEnvFile(path string, envMap map[string]string) error {
	envPath := strings.TrimSpace(path)
	if envPath == "" {
		return fmt.Errorf("env file path is empty")
	}

	content, err := godotenv.Marshal(envMap)
	if err != nil {
		return fmt.Errorf("marshal env file %s: %w", envPath, err)
	}

	dir := filepath.Dir(envPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("ensure env file directory %s: %w", dir, err)
	}

	tempFile, err := os.CreateTemp(dir, ".env.*.tmp")
	if err != nil {
		return fmt.Errorf("create temporary env file in %s: %w", dir, err)
	}
	tempPath := tempFile.Name()
	success := false
	defer func() {
		_ = tempFile.Close()
		if !success {
			_ = os.Remove(tempPath)
		}
	}()

	if _, err := tempFile.WriteString(content); err != nil {
		return fmt.Errorf("write temporary env file %s: %w", tempPath, err)
	}
	if err := tempFile.Close(); err != nil {
		return fmt.Errorf("close temporary env file %s: %w", tempPath, err)
	}

	if err := os.Rename(tempPath, envPath); err != nil {
		return fmt.Errorf("replace env file %s: %w", envPath, err)
	}

	success = true
	return nil
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
