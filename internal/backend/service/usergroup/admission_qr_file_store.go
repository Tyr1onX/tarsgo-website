package usergroup

import (
	"bytes"
	"context"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const (
	admissionQRCodeURLPrefix = "/api/admin/admission-qr/"
	admissionQRCodeMaxBytes  = 2 << 20
	maxAdmissionQRCodePixels = 16_000_000
)

var admissionQRCodeNamePattern = regexp.MustCompile(`^qr_[0-9]{14}_[a-f0-9]{24}\.(png|jpg)$`)

type admissionQRCodeFileStore interface {
	Save(ctx context.Context, file *multipart.FileHeader, now time.Time) (*storedAdmissionQRCode, error)
	Read(ctx context.Context, fileName string) ([]byte, string, error)
	Remove(ctx context.Context, fileName string) error
	RelativePathFromURL(rawURL string) (string, bool)
}

type storedAdmissionQRCode struct {
	FileName     string
	RelativePath string
	URL          string
	Size         int64
	ContentType  string
}

type localAdmissionQRCodeFileStore struct {
	rootDir string
}

func mustNewAdmissionQRCodeFileStore() *localAdmissionQRCodeFileStore {
	store, err := newLocalAdmissionQRCodeFileStore("")
	if err != nil {
		panic(err)
	}
	return store
}

func newLocalAdmissionQRCodeFileStore(rootDir string) (*localAdmissionQRCodeFileStore, error) {
	baseDir := strings.TrimSpace(rootDir)
	if baseDir == "" {
		baseDir = filepath.Join("upload", "config", "admission-qr")
	}
	absRoot, err := filepath.Abs(baseDir)
	if err != nil {
		return nil, fmt.Errorf("resolve admission QR upload root: %w", err)
	}
	return &localAdmissionQRCodeFileStore{rootDir: absRoot}, nil
}

func (s *localAdmissionQRCodeFileStore) Save(ctx context.Context, file *multipart.FileHeader, now time.Time) (*storedAdmissionQRCode, error) {
	if file == nil {
		return nil, fmt.Errorf("missing admission QR image")
	}
	if file.Size > admissionQRCodeMaxBytes {
		return nil, fmt.Errorf("录取群二维码不能超过 2MB")
	}
	src, err := file.Open()
	if err != nil {
		return nil, fmt.Errorf("open admission QR image: %w", err)
	}
	defer src.Close()
	data, err := io.ReadAll(io.LimitReader(&contextReader{ctx: ctx, reader: src}, admissionQRCodeMaxBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read admission QR image: %w", err)
	}
	if int64(len(data)) > admissionQRCodeMaxBytes {
		return nil, fmt.Errorf("录取群二维码不能超过 2MB")
	}
	contentType, extension, err := validateAdmissionQRCodeImage(data)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(s.rootDir, 0o750); err != nil {
		return nil, fmt.Errorf("create admission QR upload directory: %w", err)
	}
	if now.IsZero() {
		now = time.Now()
	}
	token, err := randomHexToken(12)
	if err != nil {
		return nil, fmt.Errorf("generate admission QR file key: %w", err)
	}
	fileName := fmt.Sprintf("qr_%s_%s.%s", now.Format("20060102150405"), token, extension)
	target, err := s.resolve(fileName)
	if err != nil {
		return nil, err
	}
	dst, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o640)
	if err != nil {
		return nil, fmt.Errorf("create admission QR image: %w", err)
	}
	if _, err := dst.Write(data); err != nil {
		_ = dst.Close()
		_ = os.Remove(target)
		return nil, fmt.Errorf("save admission QR image: %w", err)
	}
	if err := dst.Close(); err != nil {
		_ = os.Remove(target)
		return nil, fmt.Errorf("close admission QR image: %w", err)
	}
	return &storedAdmissionQRCode{
		FileName: fileName, RelativePath: fileName, URL: admissionQRCodeURLPrefix + fileName,
		Size: int64(len(data)), ContentType: contentType,
	}, nil
}

func (s *localAdmissionQRCodeFileStore) Read(ctx context.Context, fileName string) ([]byte, string, error) {
	if err := ctx.Err(); err != nil {
		return nil, "", err
	}
	target, err := s.resolve(fileName)
	if err != nil {
		return nil, "", err
	}
	file, err := os.Open(target)
	if err != nil {
		return nil, "", err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(&contextReader{ctx: ctx, reader: file}, admissionQRCodeMaxBytes+1))
	if err != nil {
		return nil, "", err
	}
	contentType, _, err := validateAdmissionQRCodeImage(data)
	if err != nil {
		return nil, "", err
	}
	return data, contentType, nil
}

func (s *localAdmissionQRCodeFileStore) Remove(ctx context.Context, fileName string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	target, err := s.resolve(fileName)
	if err != nil {
		return err
	}
	if err := os.Remove(target); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove admission QR image: %w", err)
	}
	return nil
}

func (s *localAdmissionQRCodeFileStore) RelativePathFromURL(rawURL string) (string, bool) {
	trimmed := strings.TrimSpace(rawURL)
	if !strings.HasPrefix(trimmed, admissionQRCodeURLPrefix) {
		return "", false
	}
	fileName := strings.TrimPrefix(trimmed, admissionQRCodeURLPrefix)
	if !admissionQRCodeNamePattern.MatchString(fileName) || filepath.Base(fileName) != fileName {
		return "", false
	}
	return fileName, true
}

func (s *localAdmissionQRCodeFileStore) resolve(fileName string) (string, error) {
	if !admissionQRCodeNamePattern.MatchString(fileName) || filepath.Base(fileName) != fileName {
		return "", fmt.Errorf("录取群二维码文件名不合法")
	}
	target := filepath.Join(s.rootDir, fileName)
	absTarget, err := filepath.Abs(target)
	if err != nil {
		return "", fmt.Errorf("resolve admission QR image: %w", err)
	}
	root := s.rootDir
	if !strings.HasSuffix(root, string(os.PathSeparator)) {
		root += string(os.PathSeparator)
	}
	if !strings.HasPrefix(absTarget, root) {
		return "", fmt.Errorf("admission QR image escapes upload root")
	}
	return absTarget, nil
}

func validateAdmissionQRCodeImage(data []byte) (contentType string, extension string, err error) {
	if len(data) == 0 || int64(len(data)) > admissionQRCodeMaxBytes {
		return "", "", fmt.Errorf("录取群二维码内容为空或超过 2MB")
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width <= 0 || config.Height <= 0 || config.Width > 4096 || config.Height > 4096 || int64(config.Width)*int64(config.Height) > maxAdmissionQRCodePixels {
		return "", "", fmt.Errorf("录取群二维码图片尺寸不合法或过大")
	}
	_, decodedFormat, err := image.Decode(bytes.NewReader(data))
	if err != nil || decodedFormat != format {
		return "", "", fmt.Errorf("录取群二维码不是完整有效的 PNG 或 JPEG 图片")
	}
	switch format {
	case "png":
		return "image/png", "png", nil
	case "jpeg":
		return "image/jpeg", "jpg", nil
	default:
		return "", "", fmt.Errorf("录取群二维码仅支持 PNG 或 JPEG 图片")
	}
}

func readAdmissionQRCodeURL(ctx context.Context, rawURL string) ([]byte, string, error) {
	store, err := newLocalAdmissionQRCodeFileStore("")
	if err != nil {
		return nil, "", err
	}
	if relativePath, ok := store.RelativePathFromURL(rawURL); ok {
		return store.Read(ctx, relativePath)
	}
	const legacyPrefix = "/upload/config/group/"
	trimmed := strings.TrimSpace(rawURL)
	if !strings.HasPrefix(trimmed, legacyPrefix) {
		return nil, "", fmt.Errorf("录取群二维码地址不合法")
	}
	name := strings.TrimPrefix(trimmed, legacyPrefix)
	if name == "" || filepath.Base(name) != name || strings.Contains(name, "..") || strings.Contains(name, "\\") {
		return nil, "", fmt.Errorf("录取群二维码地址不合法")
	}
	path := filepath.Join("upload", "config", "group", name)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, "", err
	}
	contentType, _, err := validateAdmissionQRCodeImage(data)
	if err != nil {
		return nil, "", err
	}
	return data, contentType, nil
}

func ReadAdmissionQRCodeImageURL(rawURL string) ([]byte, string, error) {
	return readAdmissionQRCodeURL(context.Background(), rawURL)
}

func admissionQRCodeURLIsDisplayable(rawURL string) bool {
	if _, ok := (&localAdmissionQRCodeFileStore{}).RelativePathFromURL(rawURL); ok {
		return true
	}
	const legacyPrefix = "/upload/config/group/"
	name := strings.TrimPrefix(strings.TrimSpace(rawURL), legacyPrefix)
	return strings.HasPrefix(strings.TrimSpace(rawURL), legacyPrefix) && name != "" && filepath.Base(name) == name && !strings.Contains(name, "..") && !strings.Contains(name, "\\")
}

func AdmissionQRCodeURLIsDisplayable(rawURL string) bool {
	return admissionQRCodeURLIsDisplayable(rawURL)
}
