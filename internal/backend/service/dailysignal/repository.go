package dailysignal

import (
	"context"
	"errors"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

var ErrNotFound = errors.New("daily signal not found")

type Repository interface {
	Find(ctx context.Context, userID uint64, date string) (*model.DailySignal, error)
	ListYear(ctx context.Context, userID uint64, startDate, endDate string) ([]model.DailySignal, error)
	Create(ctx context.Context, record *model.DailySignal) error
	SetMood(ctx context.Context, userID uint64, date string, mood *string) error
}

type GormRepository struct{ db *gorm.DB }

func NewGormRepository(db *gorm.DB) *GormRepository { return &GormRepository{db: db} }

func (r *GormRepository) Find(ctx context.Context, userID uint64, date string) (*model.DailySignal, error) {
	var record model.DailySignal
	err := r.db.WithContext(ctx).Where("user_id = ? AND signal_date = ?", userID, date).First(&record).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &record, nil
}

func (r *GormRepository) ListYear(ctx context.Context, userID uint64, startDate, endDate string) ([]model.DailySignal, error) {
	var records []model.DailySignal
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND signal_date >= ? AND signal_date <= ?", userID, startDate, endDate).
		Order("signal_date ASC").
		Find(&records).Error
	return records, err
}

func (r *GormRepository) Create(ctx context.Context, record *model.DailySignal) error {
	return r.db.WithContext(ctx).Create(record).Error
}

func (r *GormRepository) SetMood(ctx context.Context, userID uint64, date string, mood *string) error {
	result := r.db.WithContext(ctx).Model(&model.DailySignal{}).
		Where("user_id = ? AND signal_date = ?", userID, date).
		Updates(map[string]any{"mood": mood})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected > 0 {
		return nil
	}
	if _, err := r.Find(ctx, userID, date); errors.Is(err, ErrNotFound) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	return nil
}
