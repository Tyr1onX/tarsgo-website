package availability

import (
	"context"

	"gorm.io/gorm"
	"tarsgo-backend/model"
	"tarsgo-backend/service/timetable"
)

type GormRepository struct{ db *gorm.DB }

func NewGormRepository(db *gorm.DB) *GormRepository { return &GormRepository{db: db} }

func (r *GormRepository) Groups(ctx context.Context, actor Actor) ([]Group, error) {
	groups := []Group{}
	q := r.db.WithContext(ctx).Model(&model.UserGroup{}).
		Select("user_groups.id AS group_id, user_groups.name").
		Where("user_groups.status = ?", model.UserGroupStatusActive)
	if actor.Role != model.RoleNameSuperAdmin {
		q = q.Joins("JOIN user_group_members AS manager_members ON manager_members.group_id = user_groups.id").
			Joins("JOIN users AS managers ON managers.id = manager_members.user_id AND managers.status = ?", model.UserStatusEnabled).
			Where("manager_members.user_id = ?", actor.UserID)
	}
	err := q.Distinct().Order("user_groups.name ASC, user_groups.id ASC").Find(&groups).Error
	return groups, err
}

// AllGroups is used only by the admin time-coordination service. Its caller
// checks the system admin role before using this cross-group roster scope.
func (r *GormRepository) AllGroups(ctx context.Context) ([]Group, error) {
	groups := []Group{}
	err := r.db.WithContext(ctx).Model(&model.UserGroup{}).
		Select("user_groups.id AS group_id, user_groups.name").
		Where("user_groups.status = ?", model.UserGroupStatusActive).
		Order("user_groups.name ASC, user_groups.id ASC").Find(&groups).Error
	return groups, err
}

func (r *GormRepository) Members(ctx context.Context, groupID uint64) ([]model.UserGroupMember, error) {
	result := []model.UserGroupMember{}
	err := r.db.WithContext(ctx).Model(&model.UserGroupMember{}).
		Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id AND user_groups.status = ?", model.UserGroupStatusActive).
		Joins("JOIN users ON users.id = user_group_members.user_id AND users.status = ?", model.UserStatusEnabled).
		Where("user_group_members.group_id = ?", groupID).
		Preload("User").
		Order("users.real_name ASC, users.name ASC, users.id ASC").Find(&result).Error
	return result, err
}
func (r *GormRepository) Timetables(ctx context.Context, ids []uint64) ([]model.Timetable, error) {
	result := []model.Timetable{}
	if len(ids) == 0 {
		return result, nil
	}
	err := r.db.WithContext(ctx).Where("user_id IN ? AND semester = ?", ids, timetable.CurrentSemester).Find(&result).Error
	return result, err
}
