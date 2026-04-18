package registration

import (
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type registrationFileStore interface {
	Save(ctx context.Context, input registrationFileSaveInput) (*storedRegistrationFile, error)
	Remove(ctx context.Context, relativePath string) error
	Resolve(relativePath string) (string, error)
}

type registrationFileSaveInput struct {
	FormID    uint64
	UserID    uint64
	FieldKey  string
	File      *multipart.FileHeader
	Now       time.Time
	RandomKey string
}

type storedRegistrationFile struct {
	FileName     string
	RelativePath string
	Size         int64
	ContentType  string
}

type localRegistrationFileStore struct {
	rootDir string
}

func newLocalRegistrationFileStore(rootDir string) (*localRegistrationFileStore, error) {
	baseDir := strings.TrimSpace(rootDir)
	if baseDir == "" {
		baseDir = filepath.Join("upload", "recruitment")
	}

	absRoot, err := filepath.Abs(baseDir)
	if err != nil {
		return nil, fmt.Errorf("resolve registration upload root: %w", err)
	}

	return &localRegistrationFileStore{rootDir: absRoot}, nil
}

func (s *localRegistrationFileStore) Save(ctx context.Context, input registrationFileSaveInput) (*storedRegistrationFile, error) {
	if input.File == nil {
		return nil, fmt.Errorf("missing file header")
	}

	fileName := sanitizeUploadFileName(input.File.Filename)
	if fileName == "" {
		fileName = "upload.bin"
	}

	randomKey := strings.ToLower(strings.TrimSpace(input.RandomKey))
	if randomKey == "" {
		randomKey = time.Now().Format("150405")
	}

	timestamp := input.Now
	if timestamp.IsZero() {
		timestamp = time.Now()
	}

	relativeDir := filepath.Join(
		fmt.Sprintf("%d", input.FormID),
		fmt.Sprintf("%d", input.UserID),
		input.FieldKey,
	)
	targetDir, err := s.Resolve(relativeDir)
	if err != nil {
		return nil, err
	}

	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return nil, fmt.Errorf("create upload directory: %w", err)
	}

	storedName := fmt.Sprintf("%s_%s_%s",
		timestamp.Format("20060102150405"),
		randomKey,
		fileName,
	)

	relativePath := filepath.Join(relativeDir, storedName)
	targetPath, err := s.Resolve(relativePath)
	if err != nil {
		return nil, err
	}

	src, err := input.File.Open()
	if err != nil {
		return nil, fmt.Errorf("open upload file: %w", err)
	}
	defer src.Close()

	dst, err := os.Create(targetPath)
	if err != nil {
		return nil, fmt.Errorf("create upload file: %w", err)
	}

	written, copyErr := io.Copy(dst, &contextReader{ctx: ctx, reader: src})
	closeErr := dst.Close()
	if copyErr != nil {
		_ = os.Remove(targetPath)
		return nil, fmt.Errorf("save upload file: %w", copyErr)
	}
	if closeErr != nil {
		_ = os.Remove(targetPath)
		return nil, fmt.Errorf("close upload file: %w", closeErr)
	}

	contentType := strings.TrimSpace(input.File.Header.Get("Content-Type"))
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	return &storedRegistrationFile{
		FileName:     fileName,
		RelativePath: filepath.ToSlash(relativePath),
		Size:         written,
		ContentType:  contentType,
	}, nil
}

func (s *localRegistrationFileStore) Remove(ctx context.Context, relativePath string) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	targetPath, err := s.Resolve(relativePath)
	if err != nil {
		return err
	}

	if err := os.Remove(targetPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove upload file: %w", err)
	}

	return nil
}

func (s *localRegistrationFileStore) Resolve(relativePath string) (string, error) {
	cleanRelative := filepath.Clean(strings.TrimSpace(relativePath))
	if cleanRelative == "." || cleanRelative == "" {
		return s.rootDir, nil
	}

	targetPath := filepath.Join(s.rootDir, cleanRelative)
	absTarget, err := filepath.Abs(targetPath)
	if err != nil {
		return "", fmt.Errorf("resolve upload path: %w", err)
	}

	rootWithSeparator := s.rootDir
	if !strings.HasSuffix(rootWithSeparator, string(os.PathSeparator)) {
		rootWithSeparator += string(os.PathSeparator)
	}
	if absTarget != s.rootDir && !strings.HasPrefix(absTarget, rootWithSeparator) {
		return "", fmt.Errorf("upload path escapes root")
	}

	return absTarget, nil
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
