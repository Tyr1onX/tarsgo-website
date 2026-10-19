package leave

import (
	"context"
	"errors"
	"net/http"
	"time"

	"gorm.io/gorm"
	"tarsgo-backend/model"
)

const LeaveAccessNotRequested = "not_requested"

type LeaveAccessState struct {
	Status      string     `json:"status"`
	RequestedAt *time.Time `json:"requestedAt,omitempty"`
	ReviewedAt  *time.Time `json:"reviewedAt,omitempty"`
}

type LeaveAccessRequestView struct {
	ID          uint64    `json:"id"`
	UserID      uint64    `json:"userId"`
	UserName    string    `json:"userName"`
	Email       string    `json:"email"`
	Status      string    `json:"status"`
	RequestedAt time.Time `json:"requestedAt"`
}

func (s *Service) HasLeaveAccess(ctx context.Context, userID uint64) (bool, error) {
	var count int64
	err := s.db.WithContext(ctx).Model(&model.LeaveAccessRequest{}).
		Where("user_id = ? AND status = ?", userID, model.LeaveAccessApproved).Count(&count).Error
	if err != nil {
		return false, internalError("检查请假权限失败", err)
	}
	return count == 1, nil
}

func (s *Service) LeaveAccessState(ctx context.Context, userID uint64) (*LeaveAccessState, error) {
	var request model.LeaveAccessRequest
	err := s.db.WithContext(ctx).Where("user_id = ?", userID).First(&request).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return &LeaveAccessState{Status: LeaveAccessNotRequested}, nil
	}
	if err != nil {
		return nil, internalError("读取请假开通状态失败", err)
	}
	return &LeaveAccessState{Status: request.Status, RequestedAt: &request.RequestedAt, ReviewedAt: request.ReviewedAt}, nil
}

func (s *Service) RequestLeaveAccess(ctx context.Context, userID uint64) (*LeaveAccessState, error) {
	var request model.LeaveAccessRequest
	err := s.db.WithContext(ctx).Where("user_id = ?", userID).First(&request).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		request = model.LeaveAccessRequest{UserID: userID, Status: model.LeaveAccessPending, RequestedAt: s.nowShanghai()}
		if err := s.db.WithContext(ctx).Create(&request).Error; err != nil {
			if isDuplicate(err) {
				return s.LeaveAccessState(ctx, userID)
			}
			return nil, internalError("提交请假开通申请失败", err)
		}
		return &LeaveAccessState{Status: request.Status, RequestedAt: &request.RequestedAt}, nil
	}
	if err != nil {
		return nil, internalError("读取请假开通状态失败", err)
	}
	if request.Status != model.LeaveAccessRejected {
		return &LeaveAccessState{Status: request.Status, RequestedAt: &request.RequestedAt, ReviewedAt: request.ReviewedAt}, nil
	}

	requestedAt := s.nowShanghai()
	result := s.db.WithContext(ctx).Model(&model.LeaveAccessRequest{}).
		Where("user_id = ? AND status = ?", userID, model.LeaveAccessRejected).
		Updates(map[string]any{"status": model.LeaveAccessPending, "requested_at": requestedAt, "reviewed_at": nil, "reviewed_by": nil})
	if result.Error != nil {
		return nil, internalError("重新提交请假开通申请失败", result.Error)
	}
	if result.RowsAffected == 0 {
		return s.LeaveAccessState(ctx, userID)
	}
	return &LeaveAccessState{Status: model.LeaveAccessPending, RequestedAt: &requestedAt}, nil
}

func (s *Service) ListPendingLeaveAccessRequests(ctx context.Context) ([]LeaveAccessRequestView, error) {
	rows := make([]LeaveAccessRequestView, 0)
	err := s.db.WithContext(ctx).Table("leave_access_requests AS requests").
		Select("requests.id, requests.user_id, users.name AS user_name, users.email, requests.status, requests.requested_at").
		Joins("JOIN users ON users.id = requests.user_id").
		Where("requests.status = ?", model.LeaveAccessPending).
		Order("requests.requested_at ASC, requests.id ASC").Scan(&rows).Error
	if err != nil {
		return nil, internalError("读取请假开通申请失败", err)
	}
	return rows, nil
}

func (s *Service) ReviewLeaveAccessRequest(ctx context.Context, requestID, adminID uint64, status string) (*LeaveAccessState, error) {
	if status != model.LeaveAccessApproved && status != model.LeaveAccessRejected {
		return nil, badRequest("审核结果无效")
	}

	var request model.LeaveAccessRequest
	if err := s.db.WithContext(ctx).Where("id = ?", requestID).First(&request).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("请假开通申请不存在")
		}
		return nil, internalError("读取请假开通申请失败", err)
	}
	if request.Status == status {
		return &LeaveAccessState{Status: request.Status, RequestedAt: &request.RequestedAt, ReviewedAt: request.ReviewedAt}, nil
	}
	if request.Status != model.LeaveAccessPending {
		return nil, &ServiceError{Status: http.StatusConflict, Message: "请假开通申请已审核"}
	}

	reviewedAt := s.nowShanghai()
	result := s.db.WithContext(ctx).Model(&model.LeaveAccessRequest{}).
		Where("id = ? AND status = ?", requestID, model.LeaveAccessPending).
		Updates(map[string]any{"status": status, "reviewed_at": reviewedAt, "reviewed_by": adminID})
	if result.Error != nil {
		return nil, internalError("审核请假开通申请失败", result.Error)
	}
	if result.RowsAffected == 0 {
		return nil, &ServiceError{Status: http.StatusConflict, Message: "请假开通申请已审核"}
	}
	return &LeaveAccessState{Status: status, RequestedAt: &request.RequestedAt, ReviewedAt: &reviewedAt}, nil
}
