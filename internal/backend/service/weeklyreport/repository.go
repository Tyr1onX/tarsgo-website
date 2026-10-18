package weeklyreport

import (
	"context"
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
)

type Repository interface {
	FindOperationsMembership(ctx context.Context, userID uint64) (*model.UserGroupMember, error)
	ListMine(ctx context.Context, groupID, userID uint64) ([]model.WeeklyReport, error)
	UpsertCurrent(ctx context.Context, report *model.WeeklyReport) error
	FindByWeek(ctx context.Context, groupID, userID uint64, weekStart string) (*model.WeeklyReport, error)
	FindOwnedReport(ctx context.Context, groupID, userID, reportID uint64) (*model.WeeklyReport, error)
	UpdateOwnedReport(ctx context.Context, groupID, userID, reportID uint64, completed, blockers, nextPlan string) error
	ListActiveMembers(ctx context.Context, groupID uint64) ([]model.UserGroupMember, error)
	ListReportsForWeek(ctx context.Context, groupID uint64, weekStart string) ([]model.WeeklyReport, error)
}

type GormRepository struct{ db *gorm.DB }

func NewGormRepository(db *gorm.DB) *GormRepository { return &GormRepository{db: db} }

func (r *GormRepository) FindOperationsMembership(ctx context.Context, userID uint64) (*model.UserGroupMember, error) {
	var member model.UserGroupMember
	err := r.db.WithContext(ctx).Model(&model.UserGroupMember{}).
		Select("user_group_members.*").
		Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id").
		Joins("JOIN users ON users.id = user_group_members.user_id").
		Where("user_group_members.user_id = ? AND user_groups.name = ? AND user_groups.status = ? AND users.status = ?",
			userID, OperationsGroupName, model.UserGroupStatusActive, model.UserStatusEnabled).
		First(&member).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &member, nil
}

func (r *GormRepository) ListMine(ctx context.Context, groupID, userID uint64) ([]model.WeeklyReport, error) {
	var reports []model.WeeklyReport
	err := r.db.WithContext(ctx).
		Where("group_id = ? AND user_id = ?", groupID, userID).
		Order("week_start DESC").
		Find(&reports).Error
	return reports, err
}

func (r *GormRepository) UpsertCurrent(ctx context.Context, report *model.WeeklyReport) error {
	return r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "group_id"}, {Name: "user_id"}, {Name: "week_start"}},
		DoUpdates: clause.AssignmentColumns([]string{"completed", "blockers", "next_plan", "updated_at"}),
	}).Create(report).Error
}

func (r *GormRepository) FindByWeek(ctx context.Context, groupID, userID uint64, weekStart string) (*model.WeeklyReport, error) {
	var report model.WeeklyReport
	err := r.db.WithContext(ctx).
		Where("group_id = ? AND user_id = ? AND week_start = ?", groupID, userID, weekStart).
		First(&report).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &report, nil
}

func (r *GormRepository) FindOwnedReport(ctx context.Context, groupID, userID, reportID uint64) (*model.WeeklyReport, error) {
	var report model.WeeklyReport
	err := r.db.WithContext(ctx).
		Where("id = ? AND group_id = ? AND user_id = ?", reportID, groupID, userID).
		First(&report).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &report, nil
}

func (r *GormRepository) UpdateOwnedReport(ctx context.Context, groupID, userID, reportID uint64, completed, blockers, nextPlan string) error {
	return r.db.WithContext(ctx).Model(&model.WeeklyReport{}).
		Where("id = ? AND group_id = ? AND user_id = ?", reportID, groupID, userID).
		Updates(map[string]any{"completed": completed, "blockers": blockers, "next_plan": nextPlan}).Error
}

func (r *GormRepository) ListActiveMembers(ctx context.Context, groupID uint64) ([]model.UserGroupMember, error) {
	var members []model.UserGroupMember
	err := r.db.WithContext(ctx).Model(&model.UserGroupMember{}).
		Joins("JOIN users ON users.id = user_group_members.user_id AND users.status = ?", model.UserStatusEnabled).
		Where("user_group_members.group_id = ?", groupID).
		Preload("User").
		Order("users.real_name ASC, users.name ASC, users.id ASC").
		Find(&members).Error
	return members, err
}

func (r *GormRepository) ListReportsForWeek(ctx context.Context, groupID uint64, weekStart string) ([]model.WeeklyReport, error) {
	var reports []model.WeeklyReport
	err := r.db.WithContext(ctx).
		Where("group_id = ? AND week_start = ?", groupID, weekStart).
		Find(&reports).Error
	return reports, err
}
