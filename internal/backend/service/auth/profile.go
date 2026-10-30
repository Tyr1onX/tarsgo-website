package auth

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"tarsgo-backend/model"
)

const (
	avatarURLPrefix = "/upload/avatars/"
	maxAvatarBytes  = 2 << 20
)

type ProfileInput struct {
	Nickname string
	Phone    string
	Avatar   *multipart.FileHeader
}

// UpdateProfile deliberately updates only self-service fields. Identity, email,
// role and group membership remain under administrator control.
func (s *Service) UpdateProfile(ctx context.Context, userID uint64, input ProfileInput) (*SessionUser, error) {
	nickname := strings.TrimSpace(input.Nickname)
	phone := strings.TrimSpace(input.Phone)
	if !utf8.ValidString(nickname) || utf8.RuneCountInString(nickname) > 100 || strings.ContainsAny(nickname, "\r\n\t") {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "姓名不能超过 100 字，且不能包含换行或制表符"}
	}
	if phone != "" && !isValidMainlandMobile(phone) {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "请输入正确的 11 位手机号"}
	}

	user, err := s.loadUserWithRole(ctx, userID)
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "读取个人资料失败", Err: err}
	}
	if err := ensureUserEnabled(user); err != nil {
		return nil, err
	}

	updates := map[string]any{"nickname": nil, "phone": nil}
	if nickname != "" {
		updates["nickname"] = nickname
	}
	if phone != "" {
		updates["phone"] = phone
	}

	newAvatarPath := ""
	if input.Avatar != nil {
		data, extension, err := readProfileAvatar(input.Avatar)
		if err != nil {
			return nil, &ServiceError{Status: http.StatusBadRequest, Message: err.Error()}
		}
		var key [16]byte
		if _, err := rand.Read(key[:]); err != nil {
			return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "保存头像失败", Err: err}
		}
		dir := filepath.Join("upload", "avatars")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "保存头像失败", Err: err}
		}
		filename := hex.EncodeToString(key[:]) + "." + extension
		newAvatarPath = filepath.Join(dir, filename)
		if err := os.WriteFile(newAvatarPath, data, 0o644); err != nil {
			return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "保存头像失败", Err: err}
		}
		updates["avatar_url"] = avatarURLPrefix + filename
	}

	result := s.db.WithContext(ctx).Model(&model.User{}).
		Where("id = ? AND status = ?", userID, model.UserStatusEnabled).Updates(updates)
	if result.Error != nil {
		if newAvatarPath != "" {
			_ = os.Remove(newAvatarPath)
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "保存个人资料失败", Err: result.Error}
	}

	oldAvatar := user.AvatarURL
	user.Nickname, user.Phone = nil, nil
	if nickname != "" {
		user.Nickname = &nickname
	}
	if phone != "" {
		user.Phone = &phone
	}
	if newAvatarPath != "" {
		newURL := updates["avatar_url"].(string)
		user.AvatarURL = &newURL
		if oldAvatar != nil && strings.HasPrefix(*oldAvatar, avatarURLPrefix) {
			oldFile := strings.TrimPrefix(*oldAvatar, avatarURLPrefix)
			if filepath.Base(oldFile) == oldFile && oldFile != "" {
				_ = os.Remove(filepath.Join("upload", "avatars", oldFile))
			}
		}
	}
	sessionUser := toSessionUser(user)
	return &sessionUser, nil
}

func readProfileAvatar(file *multipart.FileHeader) ([]byte, string, error) {
	if file.Size == 0 || file.Size > maxAvatarBytes {
		return nil, "", fmt.Errorf("头像不能为空且不能超过 2MB")
	}
	src, err := file.Open()
	if err != nil {
		return nil, "", fmt.Errorf("读取头像失败")
	}
	defer src.Close()
	data, err := io.ReadAll(io.LimitReader(src, maxAvatarBytes+1))
	if err != nil {
		return nil, "", fmt.Errorf("读取头像失败")
	}
	if len(data) == 0 || len(data) > maxAvatarBytes {
		return nil, "", fmt.Errorf("头像不能为空且不能超过 2MB")
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width < 1 || config.Height < 1 || config.Width > 4096 || config.Height > 4096 {
		return nil, "", fmt.Errorf("头像图片无效或尺寸过大")
	}
	_, decodedFormat, err := image.Decode(bytes.NewReader(data))
	if err != nil || decodedFormat != format {
		return nil, "", fmt.Errorf("头像图片无效")
	}
	switch format {
	case "jpeg":
		return data, "jpg", nil
	case "png":
		return data, "png", nil
	default:
		return nil, "", fmt.Errorf("头像仅支持 JPG 或 PNG")
	}
}
