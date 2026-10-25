package weeklyreport

import (
	"context"
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
)

type Repository interface {
	ListUserGroups(ctx context.Context, userID uint64) ([]GroupOption, error)
	ListTeamGroups(ctx context.Context, userID uint64, systemRole string) ([]GroupOption, error)
	ListMine(ctx context.Context, userID uint64) ([]model.WeeklyReport, error)
	UpsertCurrent(ctx context.Context, report *model.WeeklyReport) error
	FindByWeek(ctx context.Context, userID uint64, weekStart string) (*model.WeeklyReport, error)
	FindOwnedReport(ctx context.Context, userID, reportID uint64) (*model.WeeklyReport, error)
	UpdateOwnedReport(ctx context.Context, userID, reportID uint64, completed, gains, blockers, nextPlan string) error
	ListActiveMembers(ctx context.Context, groupID uint64) ([]model.UserGroupMember, error)
	ListReportsForWeek(ctx context.Context, groupID uint64, weekStart string) ([]model.WeeklyReport, error)
}

type GormRepository struct{ db *gorm.DB }

func NewGormRepository(db *gorm.DB) *GormRepository { return &GormRepository{db: db} }

func (r *GormRepository) ListUserGroups(ctx context.Context, userID uint64) ([]GroupOption, error) {
	return r.listActiveGroups(ctx, userID, false)
}

func (r *GormRepository) ListTeamGroups(ctx context.Context, userID uint64, systemRole string) ([]GroupOption, error) {
	if systemRole == model.RoleNameSuperAdmin {
		return r.listActiveGroups(ctx, 0, true)
	}
	if systemRole != model.RoleNameAdmin {
		return []GroupOption{}, nil
	}
	return r.listActiveGroups(ctx, userID, false)
}

func (r *GormRepository) listActiveGroups(ctx context.Context, userID uint64, all bool) ([]GroupOption, error) {
	var groups []GroupOption
	query := r.db.WithContext(ctx).Model(&model.UserGroup{}).
		Select("user_groups.id AS group_id, user_groups.name").
		Where("user_groups.status = ?", model.UserGroupStatusActive)
	if !all {
		query = query.Joins("JOIN user_group_members ON user_group_members.group_id = user_groups.id").
			Joins("JOIN users ON users.id = user_group_members.user_id AND users.status = ?", model.UserStatusEnabled).
			Where("user_group_members.user_id = ?", userID)
	}
	err := query.Distinct().Order("user_groups.name ASC, user_groups.id ASC").Find(&groups).Error
	return groups, err
}

func (r *GormRepository) ListMine(ctx context.Context, userID uint64) ([]model.WeeklyReport, error) {
	var reports []model.WeeklyReport
	err := r.db.WithContext(ctx).
		Preload("Group").
		Where("user_id = ?", userID).
		Order("week_start DESC, updated_at DESC, id DESC").
		Find(&reports).Error
	return reports, err
}

// UpsertCurrent serializes writes on the user row. The legacy unique key is
// scoped by group, but one person must have only one active report per week;
// locking the authenticated user's row also covers ungrouped and moved users
// without rewriting historical rows or changing that legacy index.
func (r *GormRepository) UpsertCurrent(ctx context.Context, report *model.WeeklyReport) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var user model.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Select("id").Where("id = ?", report.UserID).First(&user).Error; err != nil {
			return err
		}
		var existing model.WeeklyReport
		err := tx.Where("user_id = ? AND week_start = ?", report.UserID, report.WeekStart).
			Order("updated_at DESC, id DESC").First(&existing).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if err == nil {
			if err := tx.Model(&model.WeeklyReport{}).Where("id = ? AND user_id = ?", existing.ID, report.UserID).
				Updates(map[string]any{
					"completed": report.Completed,
					"gains":     report.Gains,
					"blockers":  report.Blockers,
					"next_plan": report.NextPlan,
				}).Error; err != nil {
				return err
			}
			report.ID = existing.ID
			report.GroupID = existing.GroupID
			return nil
		}
		return tx.Create(report).Error
	})
}

func (r *GormRepository) FindByWeek(ctx context.Context, userID uint64, weekStart string) (*model.WeeklyReport, error) {
	var report model.WeeklyReport
	err := r.db.WithContext(ctx).Preload("Group").
		Where("user_id = ? AND week_start = ?", userID, weekStart).
		Order("updated_at DESC, id DESC").First(&report).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &report, nil
}

func (r *GormRepository) FindOwnedReport(ctx context.Context, userID, reportID uint64) (*model.WeeklyReport, error) {
	var report model.WeeklyReport
	err := r.db.WithContext(ctx).Preload("Group").Where("id = ? AND user_id = ?", reportID, userID).First(&report).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &report, nil
}

func (r *GormRepository) UpdateOwnedReport(ctx context.Context, userID, reportID uint64, completed, gains, blockers, nextPlan string) error {
	return r.db.WithContext(ctx).Model(&model.WeeklyReport{}).
		Where("id = ? AND user_id = ?", reportID, userID).
		Updates(map[string]any{"completed": completed, "gains": gains, "blockers": blockers, "next_plan": nextPlan}).Error
}

func (r *GormRepository) ListActiveMembers(ctx context.Context, groupID uint64) ([]model.UserGroupMember, error) {
	var members []model.UserGroupMember
	err := r.db.WithContext(ctx).Model(&model.UserGroupMember{}).
		Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id AND user_groups.status = ?", model.UserGroupStatusActive).
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
