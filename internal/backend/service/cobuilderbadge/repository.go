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

func (r *GormRepository) ClaimUnlock(ctx context.Context, userID uint64, level uint8, token string, expiresAt, now time.Time) (bool, error) {
	db := r.db.WithContext(ctx)
	if err := db.Exec("INSERT INTO co_builder_badge_unlock_states (user_id, highest_seen, claimed_level) VALUES (?, 0, 0) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)", userID).Error; err != nil {
		return false, err
	}
	result := db.Exec("UPDATE co_builder_badge_unlock_states SET claimed_level = ?, claim_token = ?, claim_expires_at = ? WHERE user_id = ? AND highest_seen < ? AND (claim_token IS NULL OR claim_expires_at <= ?)", level, token, expiresAt, userID, level, now)
	return result.RowsAffected > 0, result.Error
}

func (r *GormRepository) AcknowledgeUnlock(ctx context.Context, userID uint64, token string) error {
	return r.db.WithContext(ctx).Exec("UPDATE co_builder_badge_unlock_states SET highest_seen = GREATEST(highest_seen, claimed_level), claimed_level = 0, claim_token = NULL, claim_expires_at = NULL WHERE user_id = ? AND claim_token = ?", userID, token).Error
}
