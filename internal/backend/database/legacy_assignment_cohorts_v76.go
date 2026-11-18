package database

import (
	"encoding/json"
	"fmt"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
)

// Preserve the complete original audience snapshot before narrowing a legacy
// full-group assignment. The migration never deletes submissions or reviews.
type legacyAssignmentTargetArchiveV75 struct {
	AssignmentID uint64    `gorm:"column:assignment_id;type:bigint unsigned;primaryKey"`
	UserID       uint64    `gorm:"column:user_id;type:bigint unsigned;primaryKey"`
	TargetID     uint64    `gorm:"column:target_id;type:bigint unsigned;not null"`
	CreatedAt    time.Time `gorm:"column:created_at;type:datetime;not null"`
	ArchivedAt   time.Time `gorm:"column:archived_at;type:datetime;not null"`
}

func (legacyAssignmentTargetArchiveV75) TableName() string {
	return "legacy_assignment_target_archives"
}

type latestAssignmentCohort struct {
	ID        uint64
	CreatedAt time.Time
}

func latestAdmittedCohort(db *gorm.DB, groupID uint64) (latestAssignmentCohort, bool, error) {
	var forms []latestAssignmentCohort
	err := db.Table("registration_forms AS f").
		Select("f.id, f.created_at").
		Joins("JOIN registrations AS r ON r.form_id = f.id").
		Joins("JOIN user_group_members AS gm ON gm.user_id = r.user_id AND gm.group_id = ?", groupID).
		Joins("JOIN users AS u ON u.id = r.user_id").
		Joins("JOIN roles AS role ON role.id = u.role_id").
		Joins("JOIN user_groups AS g ON g.id = gm.group_id").
		Where("r.recruitment_status = ? AND u.status = ? AND role.name = ? AND g.status = ? AND u.team_identity_status <> ?",
			model.RecruitmentStatusAdmitted, model.UserStatusEnabled, model.RoleNameUser,
			model.UserGroupStatusActive, model.TeamIdentityFormerMember).
		Group("f.id, f.created_at").
		Order("f.created_at DESC, f.id DESC").
		Limit(2).Scan(&forms).Error
	if err != nil || len(forms) == 0 {
		return latestAssignmentCohort{}, false, err
	}
	// Two forms created at the same time cannot safely establish a latest cohort.
	if len(forms) > 1 && forms[0].CreatedAt.Equal(forms[1].CreatedAt) {
		return latestAssignmentCohort{}, false, nil
	}
	return forms[0], true, nil
}

func eligibleAssignmentCohortMembers(db *gorm.DB, groupID, formID uint64) ([]uint64, error) {
	var ids []uint64
	err := db.Table("registrations AS r").
		Distinct("r.user_id").
		Joins("JOIN user_group_members AS gm ON gm.user_id = r.user_id AND gm.group_id = ?", groupID).
		Joins("JOIN user_groups AS g ON g.id = gm.group_id").
		Joins("JOIN users AS u ON u.id = r.user_id").
		Joins("JOIN roles AS role ON role.id = u.role_id").
		Where("r.form_id = ? AND r.recruitment_status = ? AND g.status = ? AND u.status = ? AND role.name = ? AND u.team_identity_status <> ?",
			formID, model.RecruitmentStatusAdmitted, model.UserGroupStatusActive,
			model.UserStatusEnabled, model.RoleNameUser, model.TeamIdentityFormerMember).
		Order("r.user_id ASC").Pluck("r.user_id", &ids).Error
	return ids, err
}

func allMembersInCohort(submitted, eligible []uint64) bool {
	if len(submitted) == 0 || len(eligible) == 0 {
		return false
	}
	members := make(map[uint64]struct{}, len(eligible))
	for _, id := range eligible {
		members[id] = struct{}{}
	}
	for _, id := range submitted {
		if _, ok := members[id]; !ok {
			return false
		}
	}
	return true
}

// This one-time data migration compares each *published* legacy real-time group
// assignment against the newest admitted recruitment form for its current group.
// It narrows only assignments with at least one submission and where EVERY
// submitter belongs to that cohort. All other assignments remain untouched.
func migrateLegacyAssignmentRecipientsV76(db *gorm.DB) error {
	var assignments []model.Assignment
	err := db.Model(&model.Assignment{}).
		Joins("JOIN user_groups AS g ON g.id = assignments.group_id").
		Where("assignments.is_group_wide = ? AND assignments.publication_status = ? AND g.name IN ?",
			true, model.AssignmentPublicationPublished,
			[]string{"机械组", "电控组", "视觉组", "AI组", "运营组"}).
		Order("assignments.id ASC").Find(&assignments).Error
	if err != nil {
		return err
	}

	converted, skipped := 0, 0
	for _, item := range assignments {
		reason := ""
		cohort, found, err := latestAdmittedCohort(db, item.GroupID)
		if err != nil {
			return err
		}
		if !found {
			reason = "no_unambiguous_cohort"
		} else if cohort.CreatedAt.After(item.CreatedAt) {
			reason = "assignment_predates_latest_cohort"
		}
		if reason != "" {
			fmt.Printf("legacy-assignment-audit id=%d group=%d result=skipped reason=%s\n", item.ID, item.GroupID, reason)
			skipped++
			continue
		}

		eligible, err := eligibleAssignmentCohortMembers(db, item.GroupID, cohort.ID)
		if err != nil {
			return err
		}
		var submitted []uint64
		if err := db.Model(&model.AssignmentSubmission{}).Distinct("user_id").
			Where("assignment_id = ?", item.ID).Pluck("user_id", &submitted).Error; err != nil {
			return err
		}
		if !allMembersInCohort(submitted, eligible) {
			reason = "no_submissions_or_submitter_outside_latest_cohort"
			fmt.Printf("legacy-assignment-audit id=%d group=%d cohort=%d submitted=%d cohort_members=%d result=skipped reason=%s\n",
				item.ID, item.GroupID, cohort.ID, len(submitted), len(eligible), reason)
			skipped++
			continue
		}

		// The enclosing versioned migration transaction and the assignment
		// row lock serialize this change with the active submission flow.
		var locked model.Assignment
		if err := db.Clauses(clause.Locking{Strength: "UPDATE"}).First(&locked, item.ID).Error; err != nil {
			return err
		}
		if !locked.IsGroupWide || locked.PublicationStatus != model.AssignmentPublicationPublished {
			return fmt.Errorf("legacy assignment %d changed during migration", item.ID)
		}

		// Do a final check after acquiring the same assignment lock used by Submit.
		submitted = nil
		if err := db.Model(&model.AssignmentSubmission{}).Distinct("user_id").
			Where("assignment_id = ?", item.ID).Pluck("user_id", &submitted).Error; err != nil {
			return err
		}
		if !allMembersInCohort(submitted, eligible) {
			return fmt.Errorf("legacy assignment %d submitter scope changed during migration", item.ID)
		}

		var original []model.AssignmentTarget
		if err := db.Where("assignment_id = ?", item.ID).Find(&original).Error; err != nil {
			return err
		}
		archive := make([]legacyAssignmentTargetArchiveV75, 0, len(original))
		for _, target := range original {
			archive = append(archive, legacyAssignmentTargetArchiveV75{
				AssignmentID: target.AssignmentID, UserID: target.UserID,
				TargetID: target.ID, CreatedAt: target.CreatedAt, ArchivedAt: time.Now().UTC(),
			})
		}
		if len(archive) > 0 {
			if err := db.Clauses(clause.OnConflict{DoNothing: true}).Create(&archive).Error; err != nil {
				return err
			}
		}

		if err := db.Where("assignment_id = ?", item.ID).Delete(&model.AssignmentTarget{}).Error; err != nil {
			return err
		}
		targets := make([]model.AssignmentTarget, 0, len(eligible))
		for _, userID := range eligible {
			targets = append(targets, model.AssignmentTarget{AssignmentID: item.ID, UserID: userID})
		}
		if err := db.Create(&targets).Error; err != nil {
			return err
		}
		formIDs, err := json.Marshal([]uint64{cohort.ID})
		if err != nil {
			return err
		}
		if err := db.Model(&model.Assignment{}).Where("id = ?", item.ID).
			Updates(map[string]any{"is_group_wide": false, "cohort_form_ids": string(formIDs)}).Error; err != nil {
			return err
		}

		fmt.Printf("legacy-assignment-audit id=%d group=%d cohort=%d submitted=%d original_targets=%d fixed_targets=%d result=converted\n",
			item.ID, item.GroupID, cohort.ID, len(submitted), len(original), len(eligible))
		converted++
	}
	fmt.Printf("legacy-assignment-audit complete converted=%d skipped=%d\n", converted, skipped)
	return nil
}