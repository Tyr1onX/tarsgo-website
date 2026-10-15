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
	CreateUser(ctx context.Context, user *model.User) error
	UpdateUser(ctx context.Context, userID uint64, updates map[string]any) error
	UpdateUserGroup(ctx context.Context, actorID, userID uint64, groupID *uint64) error
	UpdateUserGroupRole(ctx context.Context, actorID, userID, groupID uint64, role uint8) error
	UpdatePasswordHash(ctx context.Context, userID uint64, passwordHash string) error
}

type GormRepository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) Repository {
	return &GormRepository{db: db}
}

func (r *GormRepository) ListUsers(ctx context.Context, filter ListUsersInput) ([]model.User, int64, error) {
	memberships := r.activeMembershipCounts()
	rawMemberships := r.rawMembershipCounts()
	base := r.db.WithContext(ctx).
		Model(&model.User{}).
		Joins("JOIN roles ON roles.id = users.role_id").
		Joins("LEFT JOIN (?) AS group_counts ON group_counts.user_id = users.id", memberships).
		Joins("LEFT JOIN (?) AS raw_group_counts ON raw_group_counts.user_id = users.id", rawMemberships)

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
	switch filter.GroupState {
	case "assigned":
		base = base.Where("COALESCE(group_counts.group_count, 0) = 1")
	case "unassigned":
		base = base.Where("COALESCE(group_counts.group_count, 0) = 0")
	case "pending":
		base = base.Where("COALESCE(group_counts.group_count, 0) >= 2")
	case "cleanup":
		base = base.Where("COALESCE(raw_group_counts.group_count, 0) >= 2 AND COALESCE(group_counts.group_count, 0) < 2")
	}

	countQuery := base.Session(&gorm.Session{})
	var total int64
	if err := countQuery.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var users []model.User
	dataQuery := base.Session(&gorm.Session{})
	if err := dataQuery.
		Preload("Role").Preload("GroupMembers.Group").
		Order("users.created_at DESC").
		Offset((filter.Page - 1) * filter.PageSize).
		Limit(filter.PageSize).
		Find(&users).Error; err != nil {
		return nil, 0, err
	}

	return users, total, nil
}

func (r *GormRepository) GetUserStats(ctx context.Context) (UserStats, error) {
	stats := UserStats{GroupDistribution: make([]GroupDistributionItem, 0)}
	type aggregate struct {
		Total      int64
		Enabled    int64
		Disabled   int64
		Admins     int64
		Grouped    int64
		Unassigned int64
		Pending    int64
		Cleanup    int64
	}
	var counts aggregate
	memberships := r.activeMembershipCounts()
	rawMemberships := r.rawMembershipCounts()
	if err := r.db.WithContext(ctx).Table("users").
		Joins("JOIN roles ON roles.id = users.role_id").
		Joins("LEFT JOIN (?) AS group_counts ON group_counts.user_id = users.id", memberships).
		Joins("LEFT JOIN (?) AS raw_group_counts ON raw_group_counts.user_id = users.id", rawMemberships).
		Select(`COUNT(DISTINCT users.id) AS total,
			COALESCE(SUM(CASE WHEN users.status = ? THEN 1 ELSE 0 END), 0) AS enabled,
			COALESCE(SUM(CASE WHEN users.status = ? THEN 1 ELSE 0 END), 0) AS disabled,
			COALESCE(SUM(CASE WHEN roles.name IN (?, ?) THEN 1 ELSE 0 END), 0) AS admins,
			COALESCE(SUM(CASE WHEN COALESCE(group_counts.group_count, 0) = 1 THEN 1 ELSE 0 END), 0) AS grouped,
			COALESCE(SUM(CASE WHEN COALESCE(group_counts.group_count, 0) = 0 THEN 1 ELSE 0 END), 0) AS unassigned,
			COALESCE(SUM(CASE WHEN COALESCE(group_counts.group_count, 0) >= 2 THEN 1 ELSE 0 END), 0) AS pending,
			COALESCE(SUM(CASE WHEN COALESCE(raw_group_counts.group_count, 0) >= 2 AND COALESCE(group_counts.group_count, 0) < 2 THEN 1 ELSE 0 END), 0) AS cleanup`,
			model.UserStatusEnabled, model.UserStatusDisabled, model.RoleNameSuperAdmin, model.RoleNameAdmin).
		Scan(&counts).Error; err != nil {
		return stats, err
	}
	stats.Total, stats.Enabled, stats.Disabled, stats.Admins = counts.Total, counts.Enabled, counts.Disabled, counts.Admins
	stats.Grouped, stats.Unassigned, stats.Pending = counts.Grouped, counts.Unassigned, counts.Pending
	stats.CleanupPending = counts.Cleanup

	singleMembership := r.db.Table("user_group_members AS member").
		Select("member.user_id, MIN(member.group_id) AS group_id").
		Joins("JOIN user_groups AS active_group ON active_group.id = member.group_id AND active_group.status = ?", model.UserGroupStatusActive).
		Group("member.user_id").Having("COUNT(DISTINCT member.group_id) = 1")
	if err := r.db.WithContext(ctx).Table("user_groups AS groups").
		Select("groups.id AS group_id, groups.name, COUNT(DISTINCT single_membership.user_id) AS user_count").
		Joins("LEFT JOIN (?) AS single_membership ON single_membership.group_id = groups.id", singleMembership).
		Where("groups.status = ?", model.UserGroupStatusActive).
		Group("groups.id, groups.name").Order("groups.name ASC").
		Scan(&stats.GroupDistribution).Error; err != nil {
		return stats, err
	}
	return stats, nil
}

func (r *GormRepository) activeMembershipCounts() *gorm.DB {
	return r.db.Table("user_group_members AS members").
		Select("members.user_id, COUNT(DISTINCT members.group_id) AS group_count").
		Joins("JOIN user_groups AS active_groups ON active_groups.id = members.group_id AND active_groups.status = ?", model.UserGroupStatusActive).
		Group("members.user_id")
}

func (r *GormRepository) rawMembershipCounts() *gorm.DB {
	return r.db.Table("user_group_members AS members").
		Select("members.user_id, COUNT(DISTINCT members.group_id) AS group_count").
		Group("members.user_id")
}

func (r *GormRepository) GetUserByID(ctx context.Context, userID uint64) (*model.User, error) {
	var user model.User
	if err := r.db.WithContext(ctx).
		Preload("Role").
		Preload("GroupMembers.Group").
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

func (r *GormRepository) CreateUser(ctx context.Context, user *model.User) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return tx.Create(user).Error
	})
}

func (r *GormRepository) UpdateUserGroup(ctx context.Context, actorID, userID uint64, groupID *uint64) error {
	return usergroup.ReplaceUserGroup(ctx, r.db, actorID, userID, groupID)
}

func (r *GormRepository) UpdateUserGroupRole(ctx context.Context, actorID, userID, groupID uint64, role uint8) error {
	return usergroup.UpdateUserGroupRole(ctx, r.db, actorID, userID, groupID, role)
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
