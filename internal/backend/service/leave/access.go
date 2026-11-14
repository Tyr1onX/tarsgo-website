package leave

import (
	"context"
	"errors"
	"net/http"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"tarsgo-backend/model"
)

const LeaveAccessNotRequested = "not_requested"

type LeaveAccessState struct {
	Status      string     `json:"status"`
	StartAt     *time.Time `json:"startAt,omitempty"`
	EndAt       *time.Time `json:"endAt,omitempty"`
	RequestedAt *time.Time `json:"requestedAt,omitempty"`
	ReviewedAt  *time.Time `json:"reviewedAt,omitempty"`
}

type LeaveAccessRequestView struct {
	ID          uint64     `json:"id"`
	UserID      uint64     `json:"userId"`
	UserName    string     `json:"userName"`
	Email       string     `json:"email"`
	Status      string     `json:"status"`
	StartAt     *time.Time `json:"startAt,omitempty"`
	EndAt       *time.Time `json:"endAt,omitempty"`
	RequestedAt time.Time  `json:"requestedAt"`
}

func accessState(row model.LeaveAccessRequest) *LeaveAccessState {
	status := row.Status
	// Legacy approvals without a specific leave period are not valid authorizations.
	if (status == model.LeaveAccessApproved || status == model.LeaveAccessPending) && (row.StartAt == nil || row.EndAt == nil) {
		status = model.LeaveAccessRevoked
	}
	return &LeaveAccessState{Status: status, StartAt: row.StartAt, EndAt: row.EndAt, RequestedAt: &row.RequestedAt, ReviewedAt: row.ReviewedAt}
}

func (s *Service) HasLeaveAccess(ctx context.Context, userID uint64) (bool, error) {
	var count int64
	err := s.db.WithContext(ctx).Model(&model.LeaveAccessRequest{}).
		Where("user_id = ? AND (status = ? OR (status IN ? AND start_at IS NOT NULL AND end_at IS NOT NULL))",
			userID, model.LeaveAccessGranted, []string{model.LeaveAccessPending, model.LeaveAccessApproved}).Count(&count).Error
	if err != nil {
		return false, internalError("检查请假权限失败", err)
	}
	return count == 1, nil
}

func (s *Service) LeaveAccessState(ctx context.Context, userID uint64) (*LeaveAccessState, error) {
	var row model.LeaveAccessRequest
	err := s.db.WithContext(ctx).Where("user_id = ?", userID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return &LeaveAccessState{Status: LeaveAccessNotRequested}, nil
	}
	if err != nil {
		return nil, internalError("读取请假授权状态失败", err)
	}
	return accessState(row), nil
}

// GrantLeaveAccess is the sole way to open a member's one-time leave workflow.
func (s *Service) GrantLeaveAccess(ctx context.Context, userID, adminID uint64, grant bool) (*LeaveAccessState, error) {
	var user model.User
	if err := s.db.WithContext(ctx).Select("id", "status").First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("成员不存在")
		}
		return nil, internalError("查询成员失败", err)
	}
	if grant && user.Status != model.UserStatusEnabled {
		return nil, badRequest("停用账号不能授权")
	}
	next := model.LeaveAccessRevoked
	if grant {
		next = model.LeaveAccessGranted
	}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var row model.LeaveAccessRequest
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", userID).First(&row).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if !grant {
				return nil
			}
			return tx.Create(&model.LeaveAccessRequest{UserID: userID, Status: next, RequestedAt: s.nowShanghai(), ReviewedBy: &adminID}).Error
		}
		if err != nil {
			return err
		}
		return tx.Model(&row).Updates(map[string]any{
			"status": next, "start_at": nil, "end_at": nil,
			"requested_at": s.nowShanghai(), "reviewed_at": nil, "reviewed_by": adminID,
		}).Error
	})
	if err != nil {
		return nil, internalError("更新请假授权失败", err)
	}
	return s.LeaveAccessState(ctx, userID)
}

// A granted user submits one dated request, which needs separate approval.
func (s *Service) RequestLeaveAccess(ctx context.Context, userID uint64, input RequestInput) (*LeaveAccessState, error) {
	start, err := parseShanghaiDateTime(input.StartAt)
	if err != nil {
		return nil, badRequest("开始时间格式不正确")
	}
	end, err := parseShanghaiDateTime(input.EndAt)
	if err != nil {
		return nil, badRequest("结束时间格式不正确")
	}
	if err := validateRange(start, end, false); err != nil {
		return nil, badRequest(err.Error())
	}
	result := s.db.WithContext(ctx).Model(&model.LeaveAccessRequest{}).
		Where("user_id = ? AND status = ?", userID, model.LeaveAccessGranted).
		Updates(map[string]any{"status": model.LeaveAccessPending, "start_at": start, "end_at": end, "requested_at": s.nowShanghai(), "reviewed_at": nil, "reviewed_by": nil})
	if result.Error != nil {
		return nil, internalError("提交一次性请假申请失败", result.Error)
	}
	if result.RowsAffected == 0 {
		return nil, conflict("请先获得授权，或等待当前申请处理")
	}
	return s.LeaveAccessState(ctx, userID)
}

func (s *Service) ListPendingLeaveAccessRequests(ctx context.Context) ([]LeaveAccessRequestView, error) {
	rows := make([]LeaveAccessRequestView, 0)
	err := s.db.WithContext(ctx).Table("leave_access_requests AS requests").
		Select("requests.id, requests.user_id, COALESCE(NULLIF(TRIM(users.real_name), ''), '姓名待核实') AS user_name, users.email, requests.status, requests.start_at, requests.end_at, requests.requested_at").
		Joins("JOIN users ON users.id = requests.user_id").
		Where("requests.status = ? AND requests.start_at IS NOT NULL AND requests.end_at IS NOT NULL", model.LeaveAccessPending).
		Order("requests.requested_at ASC, requests.id ASC").Scan(&rows).Error
	if err != nil {
		return nil, internalError("读取一次性请假申请失败", err)
	}
	return rows, nil
}

func (s *Service) ListLeavePermissions(ctx context.Context) ([]LeaveAccessRequestView, error) {
	rows := make([]LeaveAccessRequestView, 0)
	err := s.db.WithContext(ctx).Table("leave_access_requests AS requests").
		Select("requests.id, requests.user_id, COALESCE(NULLIF(TRIM(users.real_name), ''), '姓名待核实') AS user_name, users.email, requests.status, requests.start_at, requests.end_at, requests.requested_at").
		Joins("JOIN users ON users.id = requests.user_id").
		Where("requests.status = ? OR (requests.status IN ? AND requests.start_at IS NOT NULL AND requests.end_at IS NOT NULL)", model.LeaveAccessGranted, []string{model.LeaveAccessPending, model.LeaveAccessApproved}).
		Order("requests.requested_at DESC, requests.id DESC").Scan(&rows).Error
	if err != nil {
		return nil, internalError("读取请假授权名单失败", err)
	}
	return rows, nil
}

func (s *Service) ReviewLeaveAccessRequest(ctx context.Context, requestID, adminID uint64, status string) (*LeaveAccessState, error) {
	if status != model.LeaveAccessApproved && status != model.LeaveAccessRejected {
		return nil, badRequest("审核结果无效")
	}
	var row model.LeaveAccessRequest
	if err := s.db.WithContext(ctx).Where("id = ?", requestID).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("请假申请不存在")
		}
		return nil, internalError("读取请假申请失败", err)
	}
	if row.Status != model.LeaveAccessPending || row.StartAt == nil || row.EndAt == nil {
		return nil, conflict("请假申请已失效或已审核")
	}
	reviewedAt := s.nowShanghai()
	result := s.db.WithContext(ctx).Model(&model.LeaveAccessRequest{}).
		Where("id = ? AND status = ? AND start_at IS NOT NULL AND end_at IS NOT NULL", requestID, model.LeaveAccessPending).
		Updates(map[string]any{"status": status, "reviewed_at": reviewedAt, "reviewed_by": adminID})
	if result.Error != nil {
		return nil, internalError("审核一次性请假申请失败", result.Error)
	}
	if result.RowsAffected == 0 {
		return nil, &ServiceError{Status: http.StatusConflict, Message: "请假申请已审核"}
	}
	row.Status = status
	row.ReviewedAt = &reviewedAt
	return accessState(row), nil
}

// The approved time range is immutable until the single document is generated.
func (s *Service) approvedLeaveRange(ctx context.Context, userID uint64, start, end time.Time) error {
	var count int64
	err := s.db.WithContext(ctx).Model(&model.LeaveAccessRequest{}).
		Where("user_id = ? AND status = ? AND start_at = ? AND end_at = ?", userID, model.LeaveAccessApproved, start, end).Count(&count).Error
	if err != nil {
		return internalError("检查请假审批失败", err)
	}
	if count != 1 {
		return conflict("本次请假尚未获批或已使用")
	}
	return nil
}
