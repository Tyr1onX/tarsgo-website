package database

import (
	"fmt"
	"log"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

// These two admitted applications still pointed at the retired default group.
// Their current, independently verified organization memberships are the
// explicit target of this one-time correction.
type retiredAdmissionCorrection struct {
	RegistrationID uint64
	UserID         uint64
	GroupID        uint64
}

func finalizeRetiredDefaultGroupV90(db *gorm.DB) error {
	return finalizeRetiredDefaultGroupCorrections(db, []retiredAdmissionCorrection{
		{RegistrationID: 530, UserID: 742, GroupID: 2},
		{RegistrationID: 547, UserID: 474, GroupID: 5},
	})
}

func finalizeRetiredDefaultGroupCorrections(db *gorm.DB, corrections []retiredAdmissionCorrection) error {
	return db.Transaction(func(tx *gorm.DB) error {
		var defaultIDs []uint64
		if err := tx.Model(&model.UserGroup{}).Where("is_default = 1").Pluck("id", &defaultIDs).Error; err != nil {
			return err
		}
		if len(defaultIDs) == 0 {
			return nil
		}

		for _, correction := range corrections {
			var matched int64
			if err := tx.Model(&model.Registration{}).
				Where("id = ? AND user_id = ? AND preferred_group_id IN ? AND recruitment_status = ?",
					correction.RegistrationID, correction.UserID, defaultIDs, model.RecruitmentStatusAdmitted).
				Count(&matched).Error; err != nil {
				return err
			}
			if matched == 0 {
				continue
			}

			var group model.UserGroup
			if err := tx.Where("id = ? AND status = ? AND is_default = 0", correction.GroupID, model.UserGroupStatusActive).
				First(&group).Error; err != nil {
				return fmt.Errorf("registration %d: target group is not active: %w", correction.RegistrationID, err)
			}
			var membershipCount int64
			if err := tx.Model(&model.UserGroupMember{}).
				Where("user_id = ?", correction.UserID).Count(&membershipCount).Error; err != nil {
				return err
			}
			if membershipCount != 1 {
				return fmt.Errorf("registration %d: expected one current membership, got %d", correction.RegistrationID, membershipCount)
			}
			if err := tx.Model(&model.UserGroupMember{}).
				Where("user_id = ? AND group_id = ?", correction.UserID, correction.GroupID).
				Count(&membershipCount).Error; err != nil {
				return err
			}
			if membershipCount != 1 {
				return fmt.Errorf("registration %d: current membership does not match approved group %d", correction.RegistrationID, correction.GroupID)
			}

			result := tx.Model(&model.Registration{}).
				Where("id = ? AND user_id = ? AND preferred_group_id IN ?", correction.RegistrationID, correction.UserID, defaultIDs).
				UpdateColumn("preferred_group_id", correction.GroupID)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return fmt.Errorf("registration %d: group association changed during correction", correction.RegistrationID)
			}

			if err := tx.Table("registration_legacy_archives").
				Where("id = ? AND user_id = ? AND main_group_id IN ?", correction.RegistrationID, correction.UserID, defaultIDs).
				Updates(map[string]any{"main_group_id": correction.GroupID, "main_group_name": group.Name}).Error; err != nil {
				return err
			}
			log.Printf("corrected retired default group application %d -> group %d", correction.RegistrationID, correction.GroupID)
		}

		var admitted int64
		if err := tx.Model(&model.Registration{}).
			Where("preferred_group_id IN ? AND recruitment_status = ?", defaultIDs, model.RecruitmentStatusAdmitted).
			Count(&admitted).Error; err != nil {
			return err
		}
		if admitted > 0 {
			return fmt.Errorf("%d admitted registration(s) still reference the retired default group; refusing to delete", admitted)
		}
		var archived int64
		if err := tx.Table("registration_legacy_archives").
			Where("main_group_id IN ?", defaultIDs).Count(&archived).Error; err != nil {
			return err
		}
		if archived > 0 {
			return fmt.Errorf("%d historical archive(s) still reference the retired default group", archived)
		}

		// v89 clears the invalid group field on activity records without
		// deleting the records, then v87 checks all foreign keys and deletes
		// only truly unreferenced legacy group rows.
		if err := normalizeRetiredDefaultGroupReferencesV89(tx); err != nil {
			return err
		}
		var remaining int64
		if err := tx.Model(&model.UserGroup{}).Where("is_default = 1").Count(&remaining).Error; err != nil {
			return err
		}
		if remaining > 0 {
			return fmt.Errorf("%d retired default group(s) remain after cleanup", remaining)
		}
		return nil
	})
}