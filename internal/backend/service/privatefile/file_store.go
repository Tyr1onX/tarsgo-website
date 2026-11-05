package privatefile

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	MaxFiles      = 10
	MaxFileSize   = 20 << 20
	MaxFilesTotal = 50 << 20
)

type Upload struct {
	Header      *multipart.FileHeader
	FileName    string
	ContentType string
	ContentHash string
	AllowLarge  bool
}

type StoredFile struct {
	FileName    string
	StoragePath string
	ContentType string
	Size        int64
}

type Store struct{ rootDir string }

func NewStore(rootDir string) (*Store, error) {
	baseDir := strings.TrimSpace(rootDir)
	if baseDir == "" {
		return nil, fmt.Errorf("private file storage root is required")
	}
	absRoot, err := filepath.Abs(baseDir)
	if err != nil {
		return nil, fmt.Errorf("resolve private file storage root: %w", err)
	}
	return &Store{rootDir: absRoot}, nil
}

func ValidateUploads(headers []*multipart.FileHeader, allowLarge bool) ([]Upload, error) {
	if len(headers) == 0 || len(headers) > MaxFiles {
		return nil, fmt.Errorf("请上传 1 至 %d 个附件", MaxFiles)
	}
	var total int64
	validated := make([]Upload, 0, len(headers))
	for _, header := range headers {
		if header == nil || header.Size <= 0 {
			return nil, fmt.Errorf("不能上传空附件")
		}
		if !allowLarge {
			if header.Size > MaxFileSize {
				return nil, fmt.Errorf("单个附件不能超过 20 MB")
			}
			total += header.Size
			if total > MaxFilesTotal {
				return nil, fmt.Errorf("附件总大小不能超过 50 MB")
			}
		}
		fileName := CleanFileName(header.Filename)
		if fileName == "" {
			return nil, fmt.Errorf("附件文件名无效")
		}
		validated = append(validated, Upload{Header: header, FileName: fileName, ContentType: "application/octet-stream"})
	}
	return validated, nil
}

func HashUpload(header *multipart.FileHeader, allowLarge bool) (string, error) {
	if header == nil {
		return "", fmt.Errorf("missing upload")
	}
	source, err := header.Open()
	if err != nil {
		return "", err
	}
	defer source.Close()
	hash := sha256.New()
	var reader io.Reader = source
	if !allowLarge {
		reader = io.LimitReader(source, MaxFileSize+1)
	}
	written, err := io.Copy(hash, reader)
	if err != nil {
		return "", err
	}
	if written != header.Size || (!allowLarge && written > MaxFileSize) {
		return "", fmt.Errorf("upload size changed during validation")
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func (s *Store) Save(ctx context.Context, scopeID, ownerID uint64, file Upload) (*StoredFile, error) {
	if file.Header == nil {
		return nil, fmt.Errorf("missing upload")
	}
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		return nil, fmt.Errorf("generate private file name: %w", err)
	}
	name := hex.EncodeToString(random[:]) + strings.ToLower(filepath.Ext(file.FileName))
	relativePath := filepath.ToSlash(filepath.Join(fmt.Sprint(scopeID), fmt.Sprint(ownerID), name))
	targetPath, err := s.resolve(relativePath)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o700); err != nil {
		return nil, fmt.Errorf("create private file directory: %w", err)
	}
	source, err := file.Header.Open()
	if err != nil {
		return nil, fmt.Errorf("open private file upload: %w", err)
	}
	defer source.Close()
	destination, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return nil, fmt.Errorf("create private file: %w", err)
	}
	var output io.Writer = destination
	contentHasher := sha256.New()
	if file.ContentHash != "" {
		output = io.MultiWriter(destination, contentHasher)
	}
	var reader io.Reader = source
	if !file.AllowLarge {
		reader = io.LimitReader(source, MaxFileSize+1)
	}
	written, copyErr := io.Copy(output, &contextReader{ctx: ctx, source: reader})
	closeErr := destination.Close()
	if copyErr != nil || closeErr != nil || written != file.Header.Size || (!file.AllowLarge && written > MaxFileSize) {
		_ = os.Remove(targetPath)
		if copyErr != nil {
			return nil, fmt.Errorf("save private file: %w", copyErr)
		}
		if closeErr != nil {
			return nil, fmt.Errorf("close private file: %w", closeErr)
		}
		return nil, fmt.Errorf("private file size changed during upload or exceeds the size limit")
	}
	if file.ContentHash != "" && hex.EncodeToString(contentHasher.Sum(nil)) != file.ContentHash {
		_ = os.Remove(targetPath)
		return nil, fmt.Errorf("private file changed after validation")
	}
	return &StoredFile{FileName: file.FileName, StoragePath: relativePath, ContentType: file.ContentType, Size: written}, nil
}

func (s *Store) Remove(relativePath string) error {
	path, err := s.resolve(relativePath)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func (s *Store) Open(relativePath string) ([]byte, error) {
	path, err := s.resolve(relativePath)
	if err != nil {
		return nil, err
	}
	return os.ReadFile(path)
}

func (s *Store) ResolvePath(relativePath string) (string, error) { return s.resolve(relativePath) }

func (s *Store) resolve(relativePath string) (string, error) {
	clean := filepath.Clean(strings.TrimSpace(relativePath))
	if clean == "." || clean == "" || filepath.IsAbs(clean) || !filepath.IsLocal(clean) {
		return "", fmt.Errorf("private file path is invalid")
	}
	target, err := filepath.Abs(filepath.Join(s.rootDir, clean))
	if err != nil {
		return "", fmt.Errorf("resolve private file path: %w", err)
	}
	rootPrefix := s.rootDir + string(os.PathSeparator)
	if !strings.HasPrefix(target, rootPrefix) {
		return "", fmt.Errorf("private file path escapes storage root")
	}
	return target, nil
}

func CleanFileName(name string) string {
	name = strings.ReplaceAll(name, "\\", "/")
	name = filepath.Base(strings.TrimSpace(name))
	name = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, name)
	name = strings.TrimSpace(name)
	if utf8.RuneCountInString(name) > 200 {
		runes := []rune(name)
		name = string(runes[:200])
	}
	if name == "." || name == ".." {
		return ""
	}
	return name
}

type contextReader struct {
	ctx    context.Context
	source io.Reader
}

func (r *contextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.source.Read(p)
}
