package usergroup

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const groupLogoURLPrefix = "/upload/config/group/"

type groupLogoFileStore interface {
	Save(ctx context.Context, input groupLogoSaveInput) (*storedGroupLogo, error)
	Remove(ctx context.Context, relativePath string) error
	RelativePathFromURL(rawURL string) (string, bool)
}

type groupLogoSaveInput struct {
	File *multipart.FileHeader
	Now  time.Time
}

type storedGroupLogo struct {
	FileName     string
	RelativePath string
	URL          string
	Size         int64
	ContentType  string
}

type localGroupLogoFileStore struct {
	rootDir string
}

func newLocalGroupLogoFileStore(rootDir string) (*localGroupLogoFileStore, error) {
	baseDir := strings.TrimSpace(rootDir)
	if baseDir == "" {
		baseDir = filepath.Join("upload", "config", "group")
	}

	absRoot, err := filepath.Abs(baseDir)
	if err != nil {
		return nil, fmt.Errorf("resolve group logo upload root: %w", err)
	}

	return &localGroupLogoFileStore{rootDir: absRoot}, nil
}

func (s *localGroupLogoFileStore) Save(ctx context.Context, input groupLogoSaveInput) (*storedGroupLogo, error) {
	if input.File == nil {
		return nil, fmt.Errorf("missing file header")
	}

	fileName := sanitizeUploadFileName(input.File.Filename)
	if fileName == "" {
		fileName = "logo.bin"
	}

	timestamp := input.Now
	if timestamp.IsZero() {
		timestamp = time.Now()
	}

	if err := os.MkdirAll(s.rootDir, 0o755); err != nil {
		return nil, fmt.Errorf("create logo upload directory: %w", err)
	}

	randomKey, err := randomHexToken(6)
	if err != nil {
		return nil, fmt.Errorf("generate logo random key: %w", err)
	}

	storedName := fmt.Sprintf("%s_%s_%s", timestamp.Format("20060102150405"), randomKey, fileName)
	targetPath, err := s.Resolve(storedName)
	if err != nil {
		return nil, err
	}

	src, err := input.File.Open()
	if err != nil {
		return nil, fmt.Errorf("open logo upload file: %w", err)
	}
	defer src.Close()

	dst, err := os.Create(targetPath)
	if err != nil {
		return nil, fmt.Errorf("create logo upload file: %w", err)
	}

	written, copyErr := io.Copy(dst, &contextReader{ctx: ctx, reader: src})
	closeErr := dst.Close()
	if copyErr != nil {
		_ = os.Remove(targetPath)
		return nil, fmt.Errorf("save logo upload file: %w", copyErr)
	}
	if closeErr != nil {
		_ = os.Remove(targetPath)
		return nil, fmt.Errorf("close logo upload file: %w", closeErr)
	}

	contentType := strings.TrimSpace(input.File.Header.Get("Content-Type"))
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	return &storedGroupLogo{
		FileName:     fileName,
		RelativePath: storedName,
		URL:          groupLogoURLPrefix + storedName,
		Size:         written,
		ContentType:  contentType,
	}, nil
}

func (s *localGroupLogoFileStore) Remove(ctx context.Context, relativePath string) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	targetPath, err := s.Resolve(relativePath)
	if err != nil {
		return err
	}

	if err := os.Remove(targetPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove logo upload file: %w", err)
	}

	return nil
}

func (s *localGroupLogoFileStore) RelativePathFromURL(rawURL string) (string, bool) {
	trimmed := strings.TrimSpace(rawURL)
	if !strings.HasPrefix(trimmed, groupLogoURLPrefix) {
		return "", false
	}

	relativePath := strings.TrimPrefix(trimmed, groupLogoURLPrefix)
	cleanRelative := filepath.Clean(strings.TrimSpace(relativePath))
	if cleanRelative == "." || cleanRelative == "" {
		return "", false
	}

	return cleanRelative, true
}

func (s *localGroupLogoFileStore) Resolve(relativePath string) (string, error) {
	cleanRelative := filepath.Clean(strings.TrimSpace(relativePath))
	if cleanRelative == "." || cleanRelative == "" {
		return s.rootDir, nil
	}

	targetPath := filepath.Join(s.rootDir, cleanRelative)
	absTarget, err := filepath.Abs(targetPath)
	if err != nil {
		return "", fmt.Errorf("resolve logo upload path: %w", err)
	}

	rootWithSeparator := s.rootDir
	if !strings.HasSuffix(rootWithSeparator, string(os.PathSeparator)) {
		rootWithSeparator += string(os.PathSeparator)
	}
	if absTarget != s.rootDir && !strings.HasPrefix(absTarget, rootWithSeparator) {
		return "", fmt.Errorf("logo upload path escapes root")
	}

	return absTarget, nil
}

func randomHexToken(byteLength int) (string, error) {
	if byteLength <= 0 {
		return "", nil
	}

	buf := make([]byte, byteLength)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r *contextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(p)
}

func sanitizeUploadFileName(name string) string {
	base := filepath.Base(strings.TrimSpace(name))
	base = strings.ReplaceAll(base, " ", "_")
	base = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z':
			return r
		case r >= 'A' && r <= 'Z':
			return r
		case r >= '0' && r <= '9':
			return r
		case r == '.', r == '-', r == '_':
			return r
		default:
			return '_'
		}
	}, base)
	base = strings.Trim(base, "._")
	if base == "" {
		return ""
	}
	if len(base) > 120 {
		return base[len(base)-120:]
	}
	return base
}
