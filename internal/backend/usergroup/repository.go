package usergroup

import (
	"context"
	"strings"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

type Repository interface {
	RunInTx(ctx context.Context, fn func(repo Repository) error) error
	ListGroups(ctx context.Context, filter ListGroupsInput) ([]model.UserGroup, int64, error)
	GetGroupStats(ctx context.Context) (GroupStats, error)
	GetGroupByID(ctx context.Context, groupID uint64) (*model.UserGroup, error)
	CreateGroup(ctx context.Context, group *model.UserGroup) error
	UpdateGroup(ctx context.Context, groupID uint64, updates map[string]any) error
	DeleteGroup(ctx context.Context, groupID uint64) error
	ClearDefaultExcept(ctx context.Context, exceptGroupID uint64) error
	CountMembers(ctx context.Context, groupID uint64) (int64, error)
	GetMemberByID(ctx context.Context, groupID uint64, memberID uint64) (*model.UserGroupMember, error)
	FindMemberByUserID(ctx context.Context, groupID uint64, userID uint64) (*model.UserGroupMember, error)
	CreateMember(ctx context.Context, member *model.UserGroupMember) error
	UpdateMember(ctx context.Context, groupID uint64, memberID uint64, updates map[string]any) error
	DeleteMember(ctx context.Context, groupID uint64, memberID uint64) error
	SearchCandidateUsers(ctx context.Context, groupID uint64, keyword string, limit int) ([]model.User, error)
	GetUserByID(ctx context.Context, userID uint64) (*model.User, error)
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

func (r *GormRepository) ListGroups(ctx context.Context, filter ListGroupsInput) ([]model.UserGroup, int64, error) {
	base := r.db.WithContext(ctx).Model(&model.UserGroup{})

	if keyword := strings.TrimSpace(filter.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		base = base.Where("name LIKE ? OR description LIKE ?", like, like)
	}

	if filter.Status != nil {
		base = base.Where("status = ?", *filter.Status)
	}

	countQuery := base.Session(&gorm.Session{})
	var total int64
	if err := countQuery.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var groups []model.UserGroup
	dataQuery := base.Session(&gorm.Session{})
	if err := dataQuery.
		Preload("Members", func(db *gorm.DB) *gorm.DB {
			return db.Order("role DESC").Order("joined_at ASC")
		}).
		Preload("Members.User").
		Preload("Members.User.Role").
		Order("is_default DESC").
		Order("status DESC").
		Order("created_at DESC").
		Offset((filter.Page - 1) * filter.PageSize).
		Limit(filter.PageSize).
		Find(&groups).Error; err != nil {
		return nil, 0, err
	}

	return groups, total, nil
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
	if err := r.db.WithContext(ctx).Model(&model.UserGroupMember{}).Count(&stats.TotalMembers).Error; err != nil {
		return stats, err
	}

	return stats, nil
}

func (r *GormRepository) GetGroupByID(ctx context.Context, groupID uint64) (*model.UserGroup, error) {
	var group model.UserGroup
	if err := r.db.WithContext(ctx).
		Preload("Members", func(db *gorm.DB) *gorm.DB {
			return db.Order("role DESC").Order("joined_at ASC")
		}).
		Preload("Members.User").
		Preload("Members.User.Role").
		First(&group, groupID).Error; err != nil {
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

func (r *GormRepository) DeleteGroup(ctx context.Context, groupID uint64) error {
	return r.db.WithContext(ctx).Delete(&model.UserGroup{}, groupID).Error
}

func (r *GormRepository) ClearDefaultExcept(ctx context.Context, exceptGroupID uint64) error {
	return r.db.WithContext(ctx).
		Model(&model.UserGroup{}).
		Where("id <> ? AND is_default = ?", exceptGroupID, true).
		Update("is_default", false).Error
}

func (r *GormRepository) CountMembers(ctx context.Context, groupID uint64) (int64, error) {
	var total int64
	err := r.db.WithContext(ctx).Model(&model.UserGroupMember{}).Where("group_id = ?", groupID).Count(&total).Error
	return total, err
}

func (r *GormRepository) GetMemberByID(ctx context.Context, groupID uint64, memberID uint64) (*model.UserGroupMember, error) {
	var member model.UserGroupMember
	if err := r.db.WithContext(ctx).
		Preload("User").
		Preload("User.Role").
		Preload("Group").
		Where("group_id = ?", groupID).
		First(&member, memberID).Error; err != nil {
		return nil, err
	}
	return &member, nil
}

func (r *GormRepository) FindMemberByUserID(ctx context.Context, groupID uint64, userID uint64) (*model.UserGroupMember, error) {
	var member model.UserGroupMember
	if err := r.db.WithContext(ctx).Where("group_id = ? AND user_id = ?", groupID, userID).First(&member).Error; err != nil {
		return nil, err
	}
	return &member, nil
}

func (r *GormRepository) CreateMember(ctx context.Context, member *model.UserGroupMember) error {
	return r.db.WithContext(ctx).Create(member).Error
}

func (r *GormRepository) UpdateMember(ctx context.Context, groupID uint64, memberID uint64, updates map[string]any) error {
	return r.db.WithContext(ctx).
		Model(&model.UserGroupMember{}).
		Where("group_id = ? AND id = ?", groupID, memberID).
		Updates(updates).Error
}

func (r *GormRepository) DeleteMember(ctx context.Context, groupID uint64, memberID uint64) error {
	return r.db.WithContext(ctx).Where("group_id = ? AND id = ?", groupID, memberID).Delete(&model.UserGroupMember{}).Error
}

func (r *GormRepository) SearchCandidateUsers(ctx context.Context, groupID uint64, keyword string, limit int) ([]model.User, error) {
	query := r.db.WithContext(ctx).
		Model(&model.User{}).
		Joins("JOIN roles ON roles.id = users.role_id").
		Where("roles.name IN ?", []string{model.RoleNameAdmin, model.RoleNameUser})

	if groupID > 0 {
		subQuery := r.db.WithContext(ctx).
			Model(&model.UserGroupMember{}).
			Select("user_id").
			Where("group_id = ?", groupID)
		query = query.Where("users.id NOT IN (?)", subQuery)
	}

	if trimmed := strings.TrimSpace(keyword); trimmed != "" {
		like := "%" + trimmed + "%"
		query = query.Where(
			"users.name LIKE ? OR users.email LIKE ? OR users.phone LIKE ? OR users.real_name LIKE ? OR users.nickname LIKE ?",
			like,
			like,
			like,
			like,
			like,
		)
	}

	var users []model.User
	if err := query.
		Preload("Role").
		Preload("GroupMembers").
		Preload("GroupMembers.Group").
		Order("users.created_at DESC").
		Limit(limit).
		Find(&users).Error; err != nil {
		return nil, err
	}

	return users, nil
}

func (r *GormRepository) GetUserByID(ctx context.Context, userID uint64) (*model.User, error) {
	var user model.User
	if err := r.db.WithContext(ctx).
		Preload("Role").
		Preload("GroupMembers").
		Preload("GroupMembers.Group").
		First(&user, userID).Error; err != nil {
		return nil, err
	}
	return &user, nil
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

func EligibleRoleName(roleName string) bool {
	return roleName == model.RoleNameAdmin || roleName == model.RoleNameUser
}
