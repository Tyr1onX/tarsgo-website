package availability

import (
	"context"
	"gorm.io/gorm"
	"tarsgo-backend/model"
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
	err := r.db.WithContext(ctx).Where("user_id IN ?", ids).Find(&result).Error
	return result, err
}
func (r *GormRepository) Semesters(ctx context.Context, groupID uint64) ([]string, error) {
	result := []string{}
	err := r.db.WithContext(ctx).Model(&model.Timetable{}).
		Joins("JOIN user_group_members ON user_group_members.user_id = personal_timetables.user_id").
		Joins("JOIN user_groups ON user_groups.id = user_group_members.group_id AND user_groups.status = ?", model.UserGroupStatusActive).
		Joins("JOIN users ON users.id = user_group_members.user_id AND users.status = ?", model.UserStatusEnabled).
		Where("user_group_members.group_id = ?", groupID).
		Distinct("personal_timetables.semester").
		Order("personal_timetables.semester DESC").Pluck("personal_timetables.semester", &result).Error
	return result, err
}
