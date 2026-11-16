package leave

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

// AdminGenerateDailyDocument generates a document for a selected member without
// changing that member's long-term access or pending one-time approval.
func (s *Service) AdminGenerateDailyDocument(ctx context.Context, adminID, memberID uint64, input RequestInput, offline bool) ([]byte, string, error) {
	start, err := parseShanghaiDateTime(input.StartAt)
	if err != nil {
		return nil, "", badRequest("开始时间格式不正确")
	}
	end, err := parseShanghaiDateTime(input.EndAt)
	if err != nil {
		return nil, "", badRequest("结束时间格式不正确")
	}
	if err := validateRange(start, end, false); err != nil {
		return nil, "", badRequest(err.Error())
	}
	phone := strings.TrimSpace(os.Getenv("LEAVE_CONTACT_PHONE"))
	if phone == "" {
		return nil, "", &ServiceError{Status: http.StatusServiceUnavailable, Message: "请假联系人尚未配置"}
	}

	var content []byte
	var filename string
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var member model.User
		if err := tx.Select("id", "status").First(&member, memberID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return notFound("成员账号不存在")
			}
			return err
		}
		if member.Status != model.UserStatusEnabled {
			return conflict("该成员账号已停用")
		}
		profile, err := s.requireProfile(tx, memberID)
		if err != nil {
			return err
		}
		collegeName, ok := collegeCodes[profile.CollegeCode]
		if !ok {
			return conflict("成员学院资料无效，请先更新")
		}
		content, err = buildDailyLeaveDocx(start, end, *profile, collegeName, phone, offline)
		if err != nil {
			return internalError("生成请假条失败", err)
		}
		entry := model.DailyLeaveEntry{
			UserID: &memberID, StartAt: &start, EndAt: &end,
			NameSnapshot: profile.Name, StudentIDSnapshot: profile.StudentID,
			CollegeSnapshot: profile.CollegeCode, ParticipantType: profile.ParticipantType,
		}
		if err := tx.Create(&entry).Error; err != nil {
			return err
		}
		if err := lockProfile(tx, memberID); err != nil {
			return err
		}
		// The audit actor is the administrator, not the represented member.
		if err := tx.Create(&model.DailyLeaveDocumentRequest{
			EntryID: entry.ID, UserID: &adminID,
			RequestStage: "download", RequestType: dailyRequestType(true),
			FileVersion: DailyLeaveVersion, Offline: offline, RequestedAt: s.nowShanghai(),
		}).Error; err != nil {
			return err
		}
		filename = fmt.Sprintf("%s_%s", profile.Name, dailyFilename(start, offline))
		return nil
	})
	if err != nil {
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, "", serviceErr
		}
		return nil, "", internalError("记录代生成假条失败", err)
	}
	return content, filename, nil
}

// GetAdminDocumentProfile uses the same validated student identity as the
// actual document, without granting the member leave-workbench access.
func (s *Service) GetAdminDocumentProfile(ctx context.Context, memberID uint64) (*model.LeaveProfile, error) {
	var member model.User
	if err := s.db.WithContext(ctx).Select("id", "status").First(&member, memberID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("成员账号不存在")
		}
		return nil, internalError("读取成员账号失败", err)
	}
	if member.Status != model.UserStatusEnabled {
		return nil, conflict("该成员账号已停用")
	}
	return s.GetProfile(ctx, memberID)
}
