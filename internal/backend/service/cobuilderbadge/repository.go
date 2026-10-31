package cobuilderbadge

import (
	"context"
	"time"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

type GormRepository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *GormRepository {
	return &GormRepository{db: db}
}

func (r *GormRepository) UserExists(ctx context.Context, userID uint64) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&model.User{}).Where("id = ?", userID).Count(&count).Error
	return count > 0, err
}

func (r *GormRepository) ListContributions(ctx context.Context, userID uint64) ([]model.CoBuilderContribution, error) {
	records := make([]model.CoBuilderContribution, 0)
	err := r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at DESC, id DESC").
		Find(&records).Error
	return records, err
}

func (r *GormRepository) CreateContribution(ctx context.Context, record *model.CoBuilderContribution) error {
	return r.db.WithContext(ctx).Create(record).Error
}

func (r *GormRepository) RevokeContribution(ctx context.Context, userID, contributionID, actorID uint64, at time.Time) (bool, error) {
	result := r.db.WithContext(ctx).Model(&model.CoBuilderContribution{}).
		Where("id = ? AND user_id = ? AND revoked_at IS NULL", contributionID, userID).
		Updates(map[string]any{"revoked_at": at, "revoked_by_id": actorID})
	return result.RowsAffected > 0, result.Error
}
