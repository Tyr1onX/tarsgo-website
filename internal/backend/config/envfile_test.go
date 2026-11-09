package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveEnvFilePathPrefersWorkingDirectory(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	cwd := filepath.Join(root, "cwd")
	execDir := filepath.Join(root, "bin")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("create cwd: %v", err)
	}
	if err := os.MkdirAll(execDir, 0o755); err != nil {
		t.Fatalf("create exec dir: %v", err)
	}

	cwdEnv := filepath.Join(cwd, ".env")
	execEnv := filepath.Join(execDir, ".env")
	if err := os.WriteFile(cwdEnv, []byte("APP_ENV=development\n"), 0o644); err != nil {
		t.Fatalf("write cwd env: %v", err)
	}
	if err := os.WriteFile(execEnv, []byte("APP_ENV=production\n"), 0o644); err != nil {
		t.Fatalf("write exec env: %v", err)
	}

	got := resolveEnvFilePath(cwd, filepath.Join(execDir, "tarsgo.exe"))
	if got != cwdEnv {
		t.Fatalf("expected cwd env path %q, got %q", cwdEnv, got)
	}
}

func TestResolveEnvFilePathFallsBackToExecutableDirectory(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	cwd := filepath.Join(root, "cwd")
	execDir := filepath.Join(root, "bin")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("create cwd: %v", err)
	}
	if err := os.MkdirAll(execDir, 0o755); err != nil {
		t.Fatalf("create exec dir: %v", err)
	}

	execEnv := filepath.Join(execDir, ".env")
	if err := os.WriteFile(execEnv, []byte("APP_ENV=production\n"), 0o644); err != nil {
		t.Fatalf("write exec env: %v", err)
	}

	got := resolveEnvFilePath(cwd, filepath.Join(execDir, "tarsgo.exe"))
	if got != execEnv {
		t.Fatalf("expected exec env path %q, got %q", execEnv, got)
	}
}
