package privatefile

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
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

func ValidateUploads(headers []*multipart.FileHeader) ([]Upload, error) {
	if len(headers) == 0 || len(headers) > MaxFiles {
		return nil, fmt.Errorf("请上传 1 至 %d 个附件", MaxFiles)
	}
	var total int64
	validated := make([]Upload, 0, len(headers))
	for _, header := range headers {
		if header == nil || header.Size <= 0 || header.Size > MaxFileSize {
			return nil, fmt.Errorf("单个附件不能为空且不能超过 20 MB")
		}
		total += header.Size
		if total > MaxFilesTotal {
			return nil, fmt.Errorf("附件总大小不能超过 50 MB")
		}
		fileName := CleanFileName(header.Filename)
		if fileName == "" {
			return nil, fmt.Errorf("附件文件名无效")
		}
		contentType, err := ValidateFileContent(header, fileName)
		if err != nil {
			return nil, fmt.Errorf("附件格式不受支持或文件内容与扩展名不符")
		}
		validated = append(validated, Upload{Header: header, FileName: fileName, ContentType: contentType})
	}
	return validated, nil
}

func HashUpload(header *multipart.FileHeader) (string, error) {
	if header == nil {
		return "", fmt.Errorf("missing upload")
	}
	source, err := header.Open()
	if err != nil {
		return "", err
	}
	defer source.Close()
	hash := sha256.New()
	written, err := io.Copy(hash, io.LimitReader(source, MaxFileSize+1))
	if err != nil {
		return "", err
	}
	if written != header.Size || written > MaxFileSize {
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
	written, copyErr := io.Copy(output, &contextReader{ctx: ctx, source: io.LimitReader(source, MaxFileSize+1)})
	closeErr := destination.Close()
	if copyErr != nil || closeErr != nil || written > MaxFileSize {
		_ = os.Remove(targetPath)
		if copyErr != nil {
			return nil, fmt.Errorf("save private file: %w", copyErr)
		}
		if closeErr != nil {
			return nil, fmt.Errorf("close private file: %w", closeErr)
		}
		return nil, fmt.Errorf("private file exceeds the size limit")
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

func ValidateFileContent(header *multipart.FileHeader, fileName string) (string, error) {
	ext := strings.ToLower(filepath.Ext(fileName))
	allowed := map[string]bool{
		".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true,
		".pdf": true, ".doc": true, ".docx": true, ".xls": true, ".xlsx": true,
		".ppt": true, ".pptx": true, ".txt": true, ".md": true,
		".zip": true, ".7z": true, ".rar": true,
	}
	if !allowed[ext] {
		return "", fmt.Errorf("unsupported file extension")
	}
	if header == nil {
		return "", fmt.Errorf("missing upload")
	}
	source, err := header.Open()
	if err != nil {
		return "", err
	}
	defer source.Close()
	buffer := make([]byte, 512)
	count, err := io.ReadFull(source, buffer)
	if err != nil && err != io.EOF && err != io.ErrUnexpectedEOF {
		return "", err
	}
	buffer = buffer[:count]
	if !MatchesFileSignature(ext, buffer) {
		return "", fmt.Errorf("file signature does not match extension")
	}
	contentType := mime.TypeByExtension(ext)
	if contentType == "" {
		contentType = http.DetectContentType(buffer)
	}
	return contentType, nil
}

func MatchesFileSignature(ext string, content []byte) bool {
	hasPrefix := func(prefix ...byte) bool {
		return len(content) >= len(prefix) && string(content[:len(prefix)]) == string(prefix)
	}
	zip := hasPrefix('P', 'K', 3, 4) || hasPrefix('P', 'K', 5, 6) || hasPrefix('P', 'K', 7, 8)
	office := hasPrefix(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)
	switch ext {
	case ".jpg", ".jpeg":
		return hasPrefix(0xff, 0xd8, 0xff)
	case ".png":
		return hasPrefix(0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a)
	case ".gif":
		return hasPrefix('G', 'I', 'F', '8', '7', 'a') || hasPrefix('G', 'I', 'F', '8', '9', 'a')
	case ".webp":
		return len(content) >= 12 && string(content[:4]) == "RIFF" && string(content[8:12]) == "WEBP"
	case ".pdf":
		return hasPrefix('%', 'P', 'D', 'F', '-')
	case ".doc", ".xls", ".ppt":
		return office
	case ".docx", ".xlsx", ".pptx", ".zip":
		return zip
	case ".7z":
		return hasPrefix(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)
	case ".rar":
		return hasPrefix('R', 'a', 'r', '!', 0x1a, 0x07)
	case ".txt", ".md":
		return utf8.Valid(content) && !strings.ContainsRune(string(content), '\x00')
	default:
		return false
	}
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
