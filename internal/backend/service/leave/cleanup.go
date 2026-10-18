package leave

import (
	"context"
	"log"
	"time"

	"gorm.io/gorm"
	"tarsgo-backend/model"
)

// StartResultCleanup expires signed leave attachments in the database while
// retaining the run and upload metadata for the historical record.
func StartResultCleanup(ctx context.Context, db *gorm.DB) {
	if db == nil {
		return
	}
	cleanup := func() {
		result := db.WithContext(ctx).Model(&model.SchoolLeaveGroupResult{}).
			Where("expires_at <= ? AND size_bytes > 0", time.Now().In(shanghai)).
			Updates(map[string]any{"content": []byte{}, "size_bytes": 0})
		if result.Error != nil {
			log.Printf("leave result cleanup failed: %v", result.Error)
		}
	}
	cleanup()
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				cleanup()
			}
		}
	}()
}
