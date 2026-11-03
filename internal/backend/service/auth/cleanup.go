package auth

import (
	"context"
	"log"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"tarsgo-backend/model"
)

const authCleanupBatchSize = 500

// StartSessionCleanup owns maintenance outside authentication requests. Expiry
// and revocation are still checked on every protected request independently.
func StartSessionCleanup(ctx context.Context, db *gorm.DB) {
	if db == nil {
		return
	}
	go func() {
		run := func() {
			budget, cancel := context.WithTimeout(ctx, 30*time.Second)
			defer cancel()
			for {
				more, err := cleanupSessionBatch(budget, db, time.Now())
				if err != nil {
					if ctx.Err() == nil {
						log.Printf("auth session cleanup failed: %v", err)
					}
					return
				}
				if !more {
					return
				}
			}
		}
		run()
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				run()
			}
		}
	}()
}

func cleanupSessionBatch(ctx context.Context, db *gorm.DB, now time.Time) (bool, error) {
	more := false
	err := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var vaultIDs []uint64
		if err := tx.Model(&model.AccountVault{}).Clauses(clause.Locking{Strength: "UPDATE"}).Where("expires_at <= ?", now).Order("id").Limit(authCleanupBatchSize).Pluck("id", &vaultIDs).Error; err != nil {
			return err
		}
		if len(vaultIDs) > 0 {
			if err := tx.Where("vault_id IN ?", vaultIDs).Delete(&model.AccountVaultEntry{}).Error; err != nil {
				return err
			}
			if err := tx.Where("id IN ?", vaultIDs).Delete(&model.AccountVault{}).Error; err != nil {
				return err
			}
		}
		var sessionIDs []uint64
		if err := tx.Model(&model.AuthSession{}).Where("expires_at <= ? AND NOT EXISTS (SELECT 1 FROM account_vault_entries WHERE account_vault_entries.session_id = auth_sessions.id)", now.Add(-ExpiredSessionRetention)).Order("id").Limit(authCleanupBatchSize).Pluck("id", &sessionIDs).Error; err != nil {
			return err
		}
		if len(sessionIDs) > 0 {
			// Recheck references and expiry in the delete, after any concurrent renewal.
			if err := tx.Where("id IN ? AND expires_at <= ? AND NOT EXISTS (SELECT 1 FROM account_vault_entries WHERE account_vault_entries.session_id = auth_sessions.id)", sessionIDs, now.Add(-ExpiredSessionRetention)).Delete(&model.AuthSession{}).Error; err != nil {
				return err
			}
		}
		more = len(vaultIDs) == authCleanupBatchSize || len(sessionIDs) == authCleanupBatchSize
		return nil
	})
	return more, err
}
