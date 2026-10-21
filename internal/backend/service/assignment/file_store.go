package assignment

import (
	"context"
	"crypto/rand"
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
	"time"
	"unicode"
	"unicode/utf8"
)

const (
	maxAssignmentFiles      = 10
	maxAssignmentFileSize   = 20 << 20
	maxAssignmentFilesTotal = 50 << 20
)

type assignmentFileStore struct{ rootDir string }

type validatedUpload struct {
	header      *multipart.FileHeader
	fileName    string
	contentType string
}

type storedUpload struct {
	fileName    string
	storagePath string
	contentType string
	size        int64
}

func newAssignmentFileStore(rootDir string) (*assignmentFileStore, error) {
	baseDir := strings.TrimSpace(rootDir)
	if baseDir == "" {
		baseDir = filepath.Join("upload", "assignments")
	}
	absRoot, err := filepath.Abs(baseDir)
	if err != nil {
		return nil, fmt.Errorf("resolve assignment upload root: %w", err)
	}
	return &assignmentFileStore{rootDir: absRoot}, nil
}

func (s *assignmentFileStore) save(ctx context.Context, assignmentID, userID uint64, file validatedUpload, now time.Time) (*storedUpload, error) {
	if file.header == nil {
		return nil, fmt.Errorf("missing assignment upload")
	}
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		return nil, fmt.Errorf("generate assignment file name: %w", err)
	}
	name := hex.EncodeToString(random[:]) + strings.ToLower(filepath.Ext(file.fileName))
	relativePath := filepath.ToSlash(filepath.Join(fmt.Sprint(assignmentID), fmt.Sprint(userID), name))
	targetPath, err := s.resolve(relativePath)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o700); err != nil {
		return nil, fmt.Errorf("create assignment upload directory: %w", err)
	}
	source, err := file.header.Open()
	if err != nil {
		return nil, fmt.Errorf("open assignment upload: %w", err)
	}
	defer source.Close()
	destination, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return nil, fmt.Errorf("create assignment upload: %w", err)
	}
	written, copyErr := io.Copy(destination, &assignmentContextReader{ctx: ctx, source: io.LimitReader(source, maxAssignmentFileSize+1)})
	closeErr := destination.Close()
	if copyErr != nil || closeErr != nil || written > maxAssignmentFileSize {
		_ = os.Remove(targetPath)
		if copyErr != nil {
			return nil, fmt.Errorf("save assignment upload: %w", copyErr)
		}
		if closeErr != nil {
			return nil, fmt.Errorf("close assignment upload: %w", closeErr)
		}
		return nil, fmt.Errorf("assignment upload exceeds the size limit")
	}
	return &storedUpload{fileName: file.fileName, storagePath: relativePath, contentType: file.contentType, size: written}, nil
}

func (s *assignmentFileStore) remove(relativePath string) error {
	path, err := s.resolve(relativePath)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func (s *assignmentFileStore) open(relativePath string) ([]byte, error) {
	path, err := s.resolve(relativePath)
	if err != nil {
		return nil, err
	}
	return os.ReadFile(path)
}

func (s *assignmentFileStore) resolve(relativePath string) (string, error) {
	clean := filepath.Clean(strings.TrimSpace(relativePath))
	if clean == "." || clean == "" || filepath.IsAbs(clean) || !filepath.IsLocal(clean) {
		return "", fmt.Errorf("assignment upload path is invalid")
	}
	target, err := filepath.Abs(filepath.Join(s.rootDir, clean))
	if err != nil {
		return "", fmt.Errorf("resolve assignment upload path: %w", err)
	}
	rootPrefix := s.rootDir + string(os.PathSeparator)
	if !strings.HasPrefix(target, rootPrefix) {
		return "", fmt.Errorf("assignment upload path escapes root")
	}
	return target, nil
}

func validateUploads(headers []*multipart.FileHeader) ([]validatedUpload, error) {
	if len(headers) == 0 || len(headers) > maxAssignmentFiles {
		return nil, badRequest("请上传 1 至 10 个附件")
	}
	var total int64
	validated := make([]validatedUpload, 0, len(headers))
	for _, header := range headers {
		if header == nil || header.Size <= 0 || header.Size > maxAssignmentFileSize {
			return nil, badRequest("单个附件不能为空且不能超过 20 MB")
		}
		total += header.Size
		if total > maxAssignmentFilesTotal {
			return nil, badRequest("附件总大小不能超过 50 MB")
		}
		fileName := cleanAssignmentFileName(header.Filename)
		if fileName == "" {
			return nil, badRequest("附件文件名无效")
		}
		contentType, err := validateAssignmentFileContent(header, fileName)
		if err != nil {
			return nil, badRequest("附件格式不受支持或文件内容与扩展名不符")
		}
		validated = append(validated, validatedUpload{header: header, fileName: fileName, contentType: contentType})
	}
	return validated, nil
}

func validateAssignmentFileContent(header *multipart.FileHeader, fileName string) (string, error) {
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
	if !matchesAssignmentFileSignature(ext, buffer) {
		return "", fmt.Errorf("file signature does not match extension")
	}
	contentType := mime.TypeByExtension(ext)
	if contentType == "" {
		contentType = http.DetectContentType(buffer)
	}
	return contentType, nil
}

func matchesAssignmentFileSignature(ext string, content []byte) bool {
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

func cleanAssignmentFileName(name string) string {
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

type assignmentContextReader struct {
	ctx    context.Context
	source io.Reader
}

func (r *assignmentContextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.source.Read(p)
}
