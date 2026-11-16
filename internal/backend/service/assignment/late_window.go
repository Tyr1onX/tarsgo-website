package assignment

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"tarsgo-backend/model"
)

// SetLateWindow opens or revokes individual submission windows. The original
// assignment deadline remains unchanged for late-submission reporting.
func (s *Service) SetLateWindow(ctx context.Context, actor Actor, assignmentID uint64, userIDs []uint64, dueAt time.Time) (*AdminAssignmentDetail, error) {
	if err := requireAdmin(actor); err != nil {
		return nil, err
	}
	userIDs = uniqueSortedIDs(userIDs)
	if len(userIDs) == 0 || len(userIDs) > maxRecipients {
		return nil, badRequest("请选择需要补交的成员")
	}
	now := s.now()
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var item model.Assignment
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&item, assignmentID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return notFound("作业不存在")
			}
			return err
		}
		if err := s.requireManagerGroupAccessWithDB(tx, actor, item.GroupID); err != nil {
			return err
		}
		if item.PublicationStatus != model.AssignmentPublicationPublished {
			return conflict("已撤回的作业不能开放补交")
		}
		if !dueAt.IsZero() && (!dueAt.After(now) || !dueAt.After(readStoredUTCWall(item.DueAt))) {
			return badRequest("补交截止时间必须晚于当前时间和原截止时间")
		}
		recipients, err := s.assignmentRecipientIDs(tx, item)
		if err != nil {
			return err
		}
		for _, id := range userIDs {
			if !containsID(recipients, id) {
				return badRequest("选择了不属于该作业的成员")
			}
		}
		if dueAt.IsZero() {
			return tx.Where("assignment_id = ? AND user_id IN ?", item.ID, userIDs).Delete(&model.AssignmentLateWindow{}).Error
		}
		windows := make([]model.AssignmentLateWindow, 0, len(userIDs))
		for _, id := range userIDs {
			windows = append(windows, model.AssignmentLateWindow{
				AssignmentID: item.ID, UserID: id, DueAt: storeUTCWall(dueAt.UTC()),
				GrantedBy: actor.ID, UpdatedAt: storeUTCWall(now.UTC()),
			})
		}
		return tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "assignment_id"}, {Name: "user_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"due_at", "granted_by", "updated_at"}),
		}).Create(&windows).Error
	})
	if err != nil {
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, internalError("更新补交设置失败", err)
	}
	return s.GetAdmin(ctx, actor, assignmentID)
}

// loadLateWindows reads one assignment's member-specific windows in one query.
func (s *Service) loadLateWindows(db *gorm.DB, assignmentIDs, userIDs []uint64) (map[uint64]*time.Time, error) {
	windows := make(map[uint64]*time.Time)
	if len(assignmentIDs) == 0 || len(userIDs) == 0 {
		return windows, nil
	}
	var rows []model.AssignmentLateWindow
	if err := db.Where("assignment_id IN ? AND user_id IN ?", assignmentIDs, userIDs).Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		dueAt := readStoredUTCWall(row.DueAt)
		windows[row.UserID] = &dueAt
	}
	return windows, nil
}
