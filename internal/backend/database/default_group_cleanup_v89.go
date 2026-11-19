package database

import (
	"log"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

// The default group never represented a real recruitment choice. Keep the
// application and activity records, clear only this invalid group reference,
// then reuse v87's full reference check before deleting the retired group.
func normalizeRetiredDefaultGroupReferencesV89(db *gorm.DB) error {
	var ids []uint64
	if err := db.Model(&model.UserGroup{}).Where("is_default = 1").Pluck("id", &ids).Error; err != nil {
		return err
	}
	if len(ids) == 0 {
		return nil
	}

	var admitted int64
	if err := db.Table("registrations").
		Where("preferred_group_id IN ? AND recruitment_status = ?", ids, model.RecruitmentStatusAdmitted).
		Count(&admitted).Error; err != nil {
		return err
	}
	if admitted > 0 {
		log.Printf("retired default group cleanup blocked: %d admitted registration(s) require manual group verification", admitted)
		return nil
	}

	registrations := db.Table("registrations").Where("preferred_group_id IN ?", ids).Update("preferred_group_id", nil)
	if registrations.Error != nil {
		return registrations.Error
	}
	activities := db.Table("activity_events").Where("group_id IN ?", ids).Update("group_id", nil)
	if activities.Error != nil {
		return activities.Error
	}
	log.Printf("normalized retired default group references: registrations=%d activity_events=%d", registrations.RowsAffected, activities.RowsAffected)
	return purgeUnreferencedDefaultGroupsV87(db)
}