package adminuser

import (
	"context"
	"strings"

	"gorm.io/gorm"

	"tarsgo-backend/model"
	"tarsgo-backend/service/usergroup"
)

type Repository interface {
	ListUsers(ctx context.Context, filter ListUsersInput) ([]model.User, int64, error)
	GetUserStats(ctx context.Context) (UserStats, error)
	GetUserByID(ctx context.Context, userID uint64) (*model.User, error)
	ListRecruitmentHistory(ctx context.Context, userID uint64) ([]model.Registration, error)
	UpdateCurrentRecruitmentGroup(ctx context.Context, userID uint64, groupID uint64) error
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
		base = base.Where("users.name LIKE ? OR users.email LIKE ?", like, like)
	}

	if roleName := strings.TrimSpace(filter.Role); roleName != "" {
		base = base.Where("roles.name = ?", roleName)
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
	return stats, nil
}

func (r *GormRepository) GetUserByID(ctx context.Context, userID uint64) (*model.User, error) {
	var user model.User
	if err := r.db.WithContext(ctx).
		Preload("Role").
		First(&user, userID).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *GormRepository) ListRecruitmentHistory(ctx context.Context, userID uint64) ([]model.Registration, error) {
	var registrations []model.Registration
	err := r.db.WithContext(ctx).
		Preload("Form").
		Preload("PreferredGroup").
		Where("user_id = ?", userID).
		Order("submitted_at DESC").
		Order("id DESC").
		Find(&registrations).Error
	return registrations, err
}

func (r *GormRepository) UpdateCurrentRecruitmentGroup(ctx context.Context, userID uint64, groupID uint64) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var forms []model.RegistrationForm
		if err := tx.Where("status = ?", model.RegistrationFormStatusPublished).Find(&forms).Error; err != nil {
			return err
		}
		if len(forms) != 1 {
			return gorm.ErrRecordNotFound
		}
		var group model.UserGroup
		if err := tx.Where("id = ? AND status = ?", groupID, model.UserGroupStatusActive).First(&group).Error; err != nil {
			return err
		}
		var registration model.Registration
		if err := tx.Where("user_id = ? AND form_id = ?", userID, forms[0].ID).First(&registration).Error; err != nil {
			return err
		}
		if registration.PreferredGroupID != nil && *registration.PreferredGroupID == groupID {
			return nil
		}
		result := tx.Model(&model.Registration{}).
			Where("user_id = ? AND form_id = ?", userID, forms[0].ID).
			Update("preferred_group_id", groupID)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return nil
	})
}

func (r *GormRepository) GetUserByEmail(ctx context.Context, email string) (*model.User, error) {
	var user model.User
	if err := r.db.WithContext(ctx).
		Preload("Role").
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
