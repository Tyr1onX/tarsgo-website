package adminuser

import (
	"context"
	"strings"

	"gorm.io/gorm"

	"tarsgo-backend/model"
	"tarsgo-backend/usergroup"
)

type Repository interface {
	ListUsers(ctx context.Context, filter ListUsersInput) ([]model.User, int64, error)
	GetUserStats(ctx context.Context) (UserStats, error)
	GetUserByID(ctx context.Context, userID uint64) (*model.User, error)
	GetUserByEmail(ctx context.Context, email string) (*model.User, error)
	ListRoles(ctx context.Context) ([]model.Role, error)
	GetRoleByID(ctx context.Context, roleID uint64) (*model.Role, error)
	CreateUser(ctx context.Context, user *model.User, assignDefaultGroup bool) error
	UpdateUser(ctx context.Context, userID uint64, updates map[string]any) error
	UpdatePasswordHash(ctx context.Context, userID uint64, passwordHash string) error
}

type GormRepository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) Repository {
	return &GormRepository{db: db}
}

func (r *GormRepository) ListUsers(ctx context.Context, filter ListUsersInput) ([]model.User, int64, error) {
	base := r.db.WithContext(ctx).
		Model(&model.User{}).
		Joins("JOIN roles ON roles.id = users.role_id")

	if keyword := strings.TrimSpace(filter.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		base = base.Where(
			"users.name LIKE ? OR users.email LIKE ? OR users.phone LIKE ? OR users.real_name LIKE ? OR users.nickname LIKE ?",
			like,
			like,
			like,
			like,
			like,
		)
	}

	if roleName := strings.TrimSpace(filter.Role); roleName != "" {
		base = base.Where("roles.name = ?", roleName)
	}

	if filter.GroupID != nil {
		base = base.
			Joins("JOIN user_group_members ON user_group_members.user_id = users.id").
			Where("user_group_members.group_id = ?", *filter.GroupID)
	}

	if filter.Status != nil {
		base = base.Where("users.status = ?", *filter.Status)
	}

	countQuery := base.Session(&gorm.Session{})
	var total int64
	if err := countQuery.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var users []model.User
	dataQuery := base.Session(&gorm.Session{})
	if err := dataQuery.
		Preload("Role").
		Preload("GroupMembers").
		Preload("GroupMembers.Group").
		Order("users.created_at DESC").
		Offset((filter.Page - 1) * filter.PageSize).
		Limit(filter.PageSize).
		Find(&users).Error; err != nil {
		return nil, 0, err
	}

	return users, total, nil
}

func (r *GormRepository) GetUserStats(ctx context.Context) (UserStats, error) {
	stats := UserStats{}
	if err := r.db.WithContext(ctx).Model(&model.User{}).Count(&stats.Total).Error; err != nil {
		return stats, err
	}
	if err := r.db.WithContext(ctx).
		Model(&model.User{}).
		Where("status = ?", model.UserStatusEnabled).
		Count(&stats.Enabled).Error; err != nil {
		return stats, err
	}
	if err := r.db.WithContext(ctx).
		Model(&model.User{}).
		Where("status = ?", model.UserStatusDisabled).
		Count(&stats.Disabled).Error; err != nil {
		return stats, err
	}
	if err := r.db.WithContext(ctx).
		Model(&model.User{}).
		Joins("JOIN roles ON roles.id = users.role_id").
		Where("roles.name IN ?", []string{model.RoleNameSuperAdmin, model.RoleNameAdmin}).
		Count(&stats.Admins).Error; err != nil {
		return stats, err
	}
	if err := r.db.WithContext(ctx).
		Model(&model.User{}).
		Where("github_id IS NOT NULL AND TRIM(github_id) <> ''").
		Count(&stats.GitHubBound).Error; err != nil {
		return stats, err
	}

	return stats, nil
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

func (r *GormRepository) GetUserByEmail(ctx context.Context, email string) (*model.User, error) {
	var user model.User
	if err := r.db.WithContext(ctx).
		Preload("Role").
		Preload("GroupMembers").
		Preload("GroupMembers.Group").
		Where("email = ?", email).
		First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *GormRepository) ListRoles(ctx context.Context) ([]model.Role, error) {
	var roles []model.Role
	if err := r.db.WithContext(ctx).
		Order("sort_order ASC").
		Order("id ASC").
		Find(&roles).Error; err != nil {
		return nil, err
	}
	return roles, nil
}

func (r *GormRepository) GetRoleByID(ctx context.Context, roleID uint64) (*model.Role, error) {
	var role model.Role
	if err := r.db.WithContext(ctx).First(&role, roleID).Error; err != nil {
		return nil, err
	}
	return &role, nil
}

func (r *GormRepository) CreateUser(ctx context.Context, user *model.User, assignDefaultGroup bool) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(user).Error; err != nil {
			return err
		}
		if assignDefaultGroup {
			return usergroup.AssignDefaultGroupTx(tx, user.ID)
		}
		return nil
	})
}

func (r *GormRepository) UpdateUser(ctx context.Context, userID uint64, updates map[string]any) error {
	return r.db.WithContext(ctx).Model(&model.User{}).Where("id = ?", userID).Updates(updates).Error
}

func (r *GormRepository) UpdatePasswordHash(ctx context.Context, userID uint64, passwordHash string) error {
	return r.db.WithContext(ctx).
		Model(&model.User{}).
		Where("id = ?", userID).
		Update("password_hash", passwordHash).Error
}
