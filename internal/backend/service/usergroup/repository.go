package usergroup

import (
	"context"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
)

type Repository interface {
	RunInTx(ctx context.Context, fn func(repo Repository) error) error
	ListGroups(ctx context.Context, filter ListGroupsInput) ([]model.UserGroup, error)
	GetGroupStats(ctx context.Context) (GroupStats, error)
	GetGroupByID(ctx context.Context, groupID uint64) (*model.UserGroup, error)
	GetGroupByIDForUpdate(ctx context.Context, groupID uint64) (*model.UserGroup, error)
	CreateGroup(ctx context.Context, group *model.UserGroup) error
	UpdateGroup(ctx context.Context, groupID uint64, updates map[string]any) error
	ClearDefaultExcept(ctx context.Context, exceptGroupID uint64) error
}

type GormRepository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) Repository {
	return &GormRepository{db: db}
}

func (r *GormRepository) RunInTx(ctx context.Context, fn func(repo Repository) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(&GormRepository{db: tx})
	})
}

func (r *GormRepository) ListGroups(ctx context.Context, filter ListGroupsInput) ([]model.UserGroup, error) {
	base := r.db.WithContext(ctx).Model(&model.UserGroup{})

	if filter.Status != nil {
		base = base.Where("status = ?", *filter.Status)
	}

	var groups []model.UserGroup
	dataQuery := base.Session(&gorm.Session{})
	if err := dataQuery.Order("is_default DESC").Order("status DESC").Order("created_at DESC").Find(&groups).Error; err != nil {
		return nil, err
	}

	return groups, nil
}

func (r *GormRepository) GetGroupStats(ctx context.Context) (GroupStats, error) {
	stats := GroupStats{}
	query := r.db.WithContext(ctx).Model(&model.UserGroup{})

	if err := query.Count(&stats.Total).Error; err != nil {
		return stats, err
	}
	if err := query.Where("status = ?", model.UserGroupStatusActive).Count(&stats.Active).Error; err != nil {
		return stats, err
	}
	if err := query.Where("status = ?", model.UserGroupStatusDisabled).Count(&stats.Disabled).Error; err != nil {
		return stats, err
	}
	if err := query.Where("is_default = ?", true).Count(&stats.DefaultCount).Error; err != nil {
		return stats, err
	}

	return stats, nil
}

func (r *GormRepository) GetGroupByID(ctx context.Context, groupID uint64) (*model.UserGroup, error) {
	var group model.UserGroup
	if err := r.db.WithContext(ctx).First(&group, groupID).Error; err != nil {
		return nil, err
	}
	return &group, nil
}

func (r *GormRepository) GetGroupByIDForUpdate(ctx context.Context, groupID uint64) (*model.UserGroup, error) {
	var group model.UserGroup
	if err := r.db.WithContext(ctx).Clauses(clause.Locking{Strength: "UPDATE"}).First(&group, groupID).Error; err != nil {
		return nil, err
	}
	return &group, nil
}

func (r *GormRepository) CreateGroup(ctx context.Context, group *model.UserGroup) error {
	return r.db.WithContext(ctx).Create(group).Error
}

func (r *GormRepository) UpdateGroup(ctx context.Context, groupID uint64, updates map[string]any) error {
	return r.db.WithContext(ctx).Model(&model.UserGroup{}).Where("id = ?", groupID).Updates(updates).Error
}

func (r *GormRepository) CreateAuditLog(ctx context.Context, audit *model.AuditLog) error {
	return r.db.WithContext(ctx).Create(audit).Error
}

func (r *GormRepository) ClearDefaultExcept(ctx context.Context, exceptGroupID uint64) error {
	return r.db.WithContext(ctx).
		Model(&model.UserGroup{}).
		Where("id <> ? AND is_default = ?", exceptGroupID, true).
		Update("is_default", false).Error
}

func AssignDefaultGroupTx(tx *gorm.DB, userID uint64) error {
	var group model.UserGroup
	if err := tx.
		Where("is_default = ? AND status = ?", true, model.UserGroupStatusActive).
		Order("id ASC").
		First(&group).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil
		}
		return err
	}

	member := model.UserGroupMember{
		GroupID: group.ID,
		UserID:  userID,
		Role:    model.UserGroupMemberRoleMember,
	}
	return tx.
		Where("group_id = ? AND user_id = ?", group.ID, userID).
		Attrs(map[string]any{"role": member.Role}).
		FirstOrCreate(&member).Error
}
