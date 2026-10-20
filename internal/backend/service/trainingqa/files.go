package trainingqa

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"unicode"
	"unicode/utf8"
)

var errQuestionFileTooLarge = errors.New("question image exceeds size limit")

const (
	maxQuestionFiles      = 5
	maxQuestionFileSize   = 10 << 20
	maxQuestionFilesTotal = 20 << 20
)

type questionFileStore struct{ rootDir string }

type questionUpload struct {
	header      *multipart.FileHeader
	fileName    string
	contentType string
}

type storedQuestionFile struct {
	fileName    string
	storagePath string
	contentType string
	size        int64
}

func newQuestionFileStore(rootDir string) (*questionFileStore, error) {
	root := strings.TrimSpace(rootDir)
	if root == "" {
		root = filepath.Join("upload", "training-questions")
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve question upload root: %w", err)
	}
	return &questionFileStore{rootDir: absRoot}, nil
}

func validateQuestionUploads(headers []*multipart.FileHeader) ([]questionUpload, error) {
	if len(headers) > maxQuestionFiles {
		return nil, badRequest("图片最多上传 5 张")
	}
	var total int64
	validated := make([]questionUpload, 0, len(headers))
	for _, header := range headers {
		if header == nil || header.Size <= 0 || header.Size > maxQuestionFileSize {
			return nil, badRequest("单张图片不能为空且不能超过 10 MB")
		}
		total += header.Size
		if total > maxQuestionFilesTotal {
			return nil, badRequest("图片总大小不能超过 20 MB")
		}
		name := cleanQuestionFileName(header.Filename)
		if name == "" {
			return nil, badRequest("图片文件名无效")
		}
		contentType, err := questionImageContentType(header, name)
		if err != nil {
			return nil, badRequest("仅支持有效的 JPG、PNG、GIF 或 WebP 图片")
		}
		validated = append(validated, questionUpload{header: header, fileName: name, contentType: contentType})
	}
	return validated, nil
}

func questionImageContentType(header *multipart.FileHeader, fileName string) (string, error) {
	ext := strings.ToLower(filepath.Ext(fileName))
	allowed := map[string]string{
		".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
		".gif": "image/gif", ".webp": "image/webp",
	}
	contentType, ok := allowed[ext]
	if !ok {
		return "", fmt.Errorf("unsupported image extension")
	}
	file, err := header.Open()
	if err != nil {
		return "", err
	}
	defer file.Close()
	buffer := make([]byte, 512)
	count, readErr := io.ReadFull(file, buffer)
	if readErr != nil && readErr != io.EOF && readErr != io.ErrUnexpectedEOF {
		return "", readErr
	}
	buffer = buffer[:count]
	if !matchesQuestionImageSignature(ext, buffer) {
		return "", fmt.Errorf("image signature mismatch")
	}
	if detected := http.DetectContentType(buffer); detected != contentType && !(ext == ".webp" && detected == "image/webp") {
		return "", fmt.Errorf("detected image type mismatch")
	}
	return contentType, nil
}

func matchesQuestionImageSignature(ext string, content []byte) bool {
	hasPrefix := func(prefix ...byte) bool {
		return len(content) >= len(prefix) && string(content[:len(prefix)]) == string(prefix)
	}
	switch ext {
	case ".jpg", ".jpeg":
		return hasPrefix(0xff, 0xd8, 0xff)
	case ".png":
		return hasPrefix(0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a)
	case ".gif":
		return hasPrefix('G', 'I', 'F', '8', '7', 'a') || hasPrefix('G', 'I', 'F', '8', '9', 'a')
	case ".webp":
		return len(content) >= 12 && string(content[:4]) == "RIFF" && string(content[8:12]) == "WEBP"
	default:
		return false
	}
}

func (s *questionFileStore) save(ctx context.Context, groupID, questionID uint64, upload questionUpload) (*storedQuestionFile, error) {
	if upload.header == nil {
		return nil, fmt.Errorf("missing question image")
	}
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		return nil, fmt.Errorf("generate question image path: %w", err)
	}
	name := hex.EncodeToString(random[:]) + strings.ToLower(filepath.Ext(upload.fileName))
	relativePath := filepath.ToSlash(filepath.Join(fmt.Sprint(groupID), fmt.Sprint(questionID), name))
	targetPath, err := s.resolve(relativePath)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o700); err != nil {
		return nil, fmt.Errorf("create question image directory: %w", err)
	}
	source, err := upload.header.Open()
	if err != nil {
		return nil, fmt.Errorf("open question image: %w", err)
	}
	defer source.Close()
	destination, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return nil, fmt.Errorf("create question image: %w", err)
	}
	written, copyErr := io.Copy(destination, &questionContextReader{ctx: ctx, source: io.LimitReader(source, maxQuestionFileSize+1)})
	closeErr := destination.Close()
	if copyErr != nil || closeErr != nil || written <= 0 || written > maxQuestionFileSize {
		_ = os.Remove(targetPath)
		if copyErr != nil {
			return nil, fmt.Errorf("save question image: %w", copyErr)
		}
		if closeErr != nil {
			return nil, fmt.Errorf("close question image: %w", closeErr)
		}
		return nil, errQuestionFileTooLarge
	}
	return &storedQuestionFile{fileName: upload.fileName, storagePath: relativePath, contentType: upload.contentType, size: written}, nil
}

func (s *questionFileStore) remove(relativePath string) {
	if path, err := s.resolve(relativePath); err == nil {
		_ = os.Remove(path)
	}
}

func (s *questionFileStore) open(relativePath string) ([]byte, error) {
	path, err := s.resolve(relativePath)
	if err != nil {
		return nil, err
	}
	return os.ReadFile(path)
}

func (s *questionFileStore) resolve(relativePath string) (string, error) {
	clean := filepath.Clean(strings.TrimSpace(relativePath))
	if clean == "." || clean == "" || filepath.IsAbs(clean) || !filepath.IsLocal(clean) {
		return "", fmt.Errorf("question image path is invalid")
	}
	target, err := filepath.Abs(filepath.Join(s.rootDir, clean))
	if err != nil {
		return "", fmt.Errorf("resolve question image path: %w", err)
	}
	if !strings.HasPrefix(target, s.rootDir+string(os.PathSeparator)) {
		return "", fmt.Errorf("question image path escapes root")
	}
	return target, nil
}

func cleanQuestionFileName(name string) string {
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

type questionContextReader struct {
	ctx    context.Context
	source io.Reader
}

func (r *questionContextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.source.Read(p)
}
