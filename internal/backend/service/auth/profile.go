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

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
)

const (
	avatarURLPrefix = "/upload/avatars/"
	maxAvatarBytes  = 2 << 20
)

type ProfileInput struct {
	RealName string
	Phone    string
	Avatar   *multipart.FileHeader
}

// UpdateProfile deliberately updates only self-service fields. Email, role and
// group membership remain under administrator control.
func (s *Service) UpdateProfile(ctx context.Context, userID uint64, input ProfileInput) (*SessionUser, error) {
	realName := strings.TrimSpace(input.RealName)
	if runeCount := utf8.RuneCountInString(realName); runeCount > 100 || !isChineseRealName(realName) {
		return nil, &ServiceError{Status: http.StatusBadRequest, Message: "姓名需为 1 至 100 个汉字"}
	}
	phone := strings.TrimSpace(input.Phone)
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

	updates := map[string]any{"phone": nil, "real_name": realName}
	if phone != "" {
		updates["phone"] = phone
	}

	newAvatarPath := ""
	newAvatarURL := ""
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
		newAvatarURL = avatarURLPrefix + filename
		updates["avatar_url"] = newAvatarURL
	}

	oldAvatar := user.AvatarURL
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var current model.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND status = ?", userID, model.UserStatusEnabled).Take(&current).Error; err != nil {
			return err
		}
		oldAvatar = current.AvatarURL
		result := tx.Model(&model.User{}).
			Where("id = ? AND status = ?", userID, model.UserStatusEnabled).Updates(updates)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		// A successful avatar upload grants the reward, while custom avatars
		// already present in the database are safely backfilled if migration 43
		// and a concurrent legacy profile update crossed during deployment.
		if newAvatarPath != "" || isCustomAvatarURL(current.AvatarURL) {
			actorID := userID
			event := model.CommunityExperienceEvent{
				UserID: userID, ActorID: &actorID, SourceType: "avatar", SourceID: userID,
				SourceKey: fmt.Sprintf("avatar:first:%d", userID), Points: 20, CreatedAt: s.now().UTC(),
			}
			if err := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "source_key"}}, DoNothing: true}).Create(&event).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		if newAvatarPath != "" {
			_ = os.Remove(newAvatarPath)
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "保存个人资料失败", Err: err}
	}
	user.RealName = &realName
	user.Phone = nil
	if phone != "" {
		user.Phone = &phone
	}
	if newAvatarPath != "" {
		user.AvatarURL = &newAvatarURL
		if isCustomAvatarURL(oldAvatar) {
			oldFile := strings.TrimPrefix(*oldAvatar, avatarURLPrefix)
			if filepath.Base(oldFile) == oldFile && oldFile != "" {
				_ = os.Remove(filepath.Join("upload", "avatars", oldFile))
			}
		}
	}
	sessionUser := toSessionUser(user)
	return &sessionUser, nil
}

func isCustomAvatarURL(value *string) bool {
	return value != nil && strings.HasPrefix(strings.TrimSpace(*value), avatarURLPrefix)
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
