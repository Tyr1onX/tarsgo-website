package aisalon

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
)

const MaxPosterUploadBytes = 10 << 20

const maxPosterPixels = 16_000_000

func (s *Service) UploadPoster(ctx context.Context, file *multipart.FileHeader) (string, error) {
	return savePosterUpload(ctx, filepath.Join("upload", "ai-salon", "posters"), file)
}

func savePosterUpload(ctx context.Context, rootDir string, file *multipart.FileHeader) (string, error) {
	data, extension, err := readPosterUpload(file)
	if err != nil {
		return "", fail(400, err.Error())
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if err := os.MkdirAll(rootDir, 0o755); err != nil {
		return "", fmt.Errorf("create AI salon poster directory: %w", err)
	}
	var key [16]byte
	if _, err := rand.Read(key[:]); err != nil {
		return "", fmt.Errorf("generate AI salon poster filename: %w", err)
	}
	filename := hex.EncodeToString(key[:]) + "." + extension
	path := filepath.Join(rootDir, filename)
	destination, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return "", fmt.Errorf("create AI salon poster: %w", err)
	}
	if _, err := io.Copy(destination, bytes.NewReader(data)); err != nil {
		_ = destination.Close()
		_ = os.Remove(path)
		return "", fmt.Errorf("write AI salon poster: %w", err)
	}
	if err := destination.Sync(); err != nil {
		_ = destination.Close()
		_ = os.Remove(path)
		return "", fmt.Errorf("sync AI salon poster: %w", err)
	}
	if err := destination.Close(); err != nil {
		_ = os.Remove(path)
		return "", fmt.Errorf("close AI salon poster: %w", err)
	}
	return salonPosterURLPrefix + filename, nil
}

func readPosterUpload(file *multipart.FileHeader) ([]byte, string, error) {
	if file == nil || file.Size <= 0 || file.Size > MaxPosterUploadBytes {
		return nil, "", fmt.Errorf("海报图片不能为空且不能超过 10 MB")
	}
	source, err := file.Open()
	if err != nil {
		return nil, "", fmt.Errorf("读取海报图片失败")
	}
	defer source.Close()
	data, err := io.ReadAll(io.LimitReader(source, MaxPosterUploadBytes+1))
	if err != nil {
		return nil, "", fmt.Errorf("读取海报图片失败")
	}
	if len(data) == 0 || len(data) > MaxPosterUploadBytes || int64(len(data)) != file.Size {
		return nil, "", fmt.Errorf("海报图片不能为空且不能超过 10 MB")
	}
	extension, err := validatePosterImage(data)
	if err != nil {
		return nil, "", err
	}
	return data, extension, nil
}

func validatePosterImage(data []byte) (string, error) {
	if len(data) >= 12 && bytes.Equal(data[:4], []byte("RIFF")) && bytes.Equal(data[8:12], []byte("WEBP")) {
		if validStillWebP(data) {
			return "webp", nil
		}
		return "", fmt.Errorf("海报图片无效或尺寸过大")
	}

	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || !safePosterDimensions(config.Width, config.Height) {
		return "", fmt.Errorf("海报图片无效或尺寸过大")
	}
	_, decodedFormat, err := image.Decode(bytes.NewReader(data))
	if err != nil || decodedFormat != format {
		return "", fmt.Errorf("海报图片无效")
	}
	switch format {
	case "jpeg":
		return "jpg", nil
	case "png":
		return "png", nil
	default:
		return "", fmt.Errorf("仅支持 JPG、PNG 或 WebP 图片")
	}
}

func safePosterDimensions(width, height int) bool {
	return width > 0 && height > 0 && width <= 8192 && height <= 8192 && uint64(width)*uint64(height) <= maxPosterPixels
}

func validStillWebP(data []byte) bool {
	if len(data) < 20 || uint64(binary.LittleEndian.Uint32(data[4:8]))+8 != uint64(len(data)) {
		return false
	}
	width, height := 0, 0
	hasFrame := false
	for offset := 12; offset < len(data); {
		if len(data)-offset < 8 {
			return false
		}
		chunkType := string(data[offset : offset+4])
		chunkSize := int(binary.LittleEndian.Uint32(data[offset+4 : offset+8]))
		chunkStart := offset + 8
		if chunkSize < 0 || chunkSize > len(data)-chunkStart {
			return false
		}
		chunk := data[chunkStart : chunkStart+chunkSize]
		switch chunkType {
		case "VP8 ":
			if len(chunk) < 11 || chunk[0]&1 != 0 || !bytes.Equal(chunk[3:6], []byte{0x9d, 0x01, 0x2a}) {
				return false
			}
			width = int(binary.LittleEndian.Uint16(chunk[6:8]) & 0x3fff)
			height = int(binary.LittleEndian.Uint16(chunk[8:10]) & 0x3fff)
			hasFrame = true
		case "VP8L":
			if len(chunk) < 6 || chunk[0] != 0x2f {
				return false
			}
			width = 1 + (int(chunk[1]) | int(chunk[2]&0x3f)<<8)
			height = 1 + (int(chunk[2]>>6) | int(chunk[3])<<2 | int(chunk[4]&0x0f)<<10)
			hasFrame = true
		}
		chunkEnd := chunkStart + chunkSize
		offset = chunkEnd + (chunkSize & 1)
		if offset > len(data) {
			return false
		}
	}
	return hasFrame && safePosterDimensions(width, height)
}
