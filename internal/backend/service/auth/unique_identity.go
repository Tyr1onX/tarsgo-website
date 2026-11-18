package auth

import (
	"net/http"
	"strings"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

// A person's name is not a unique identifier. Check stable, populated
// identity fields only; existing disabled accounts must not block new profiles.
func ensureDistinctStudentID(db *gorm.DB, userID uint64, studentID string) error {
	studentID = strings.ToUpper(strings.TrimSpace(studentID))
	if studentID == "" {
		return nil
	}
	query := db.Model(&model.User{}).
		Where("status = ? AND UPPER(TRIM(student_id)) = ?", model.UserStatusEnabled, studentID)
	if userID != 0 {
		query = query.Where("id <> ?", userID)
	}
	var count int64
	if err := query.Count(&count).Error; err != nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "检查学号关联失败", Err: err}
	}
	if count > 0 {
		return &ServiceError{Status: http.StatusConflict, Message: "该学号已有账号，请使用原账号或联系管理员"}
	}
	return nil
}

func ensureDistinctPhone(db *gorm.DB, userID uint64, phone string) error {
	if phone == "" {
		return nil
	}
	var count int64
	if err := db.Model(&model.User{}).
		Where("status = ? AND phone = ? AND id <> ?", model.UserStatusEnabled, phone, userID).
		Count(&count).Error; err != nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "检查手机号关联失败", Err: err}
	}
	if count > 0 {
		return &ServiceError{Status: http.StatusConflict, Message: "该手机号已有账号，请使用原账号或联系管理员"}
	}
	return nil
}