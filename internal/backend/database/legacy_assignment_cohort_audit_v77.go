package database

import (
	"fmt"
	"strconv"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

// Read-only follow-up for legacy group-wide assignments that v76 deliberately
// left unchanged. Only aggregate counts enter deployment logs, never user IDs.
func auditLegacyAssignmentCohortsV77(db *gorm.DB) error {
	var assignments []model.Assignment
	if err := db.Model(&model.Assignment{}).
		Joins("JOIN user_groups AS g ON g.id = assignments.group_id").
		Where("assignments.is_group_wide = ? AND assignments.publication_status = ? AND g.name IN ?",
			true, model.AssignmentPublicationPublished,
			[]string{"机械组", "电控组", "视觉组", "AI组", "运营组"}).
		Order("assignments.id ASC").Find(&assignments).Error; err != nil {
		return err
	}
	for _, item := range assignments {
		var group model.UserGroup
		if err := db.Select("name").First(&group, item.GroupID).Error; err != nil {
			return err
		}
		cohort, found, err := latestAdmittedCohort(db, item.GroupID)
		if err != nil {
			return err
		}
		var submitted []uint64
		if err := db.Model(&model.AssignmentSubmission{}).Distinct("user_id").
			Where("assignment_id = ?", item.ID).Pluck("user_id", &submitted).Error; err != nil {
			return err
		}
		var targetCount int64
		if err := db.Model(&model.AssignmentTarget{}).
			Where("assignment_id = ?", item.ID).Count(&targetCount).Error; err != nil {
			return err
		}
		if !found {
			fmt.Printf("legacy-assignment-diagnosis id=%d title=%s group=%s submitted=%d stored_targets=%d result=no_unique_latest_cohort\n",
				item.ID, strconv.Quote(item.Title), strconv.Quote(group.Name), len(submitted), targetCount)
			continue
		}
		eligible, err := eligibleAssignmentCohortMembers(db, item.GroupID, cohort.ID)
		if err != nil {
			return err
		}
		var records []model.Registration
		if len(submitted) > 0 {
			if err := db.Model(&model.Registration{}).Select("user_id", "form_id", "recruitment_status").
				Where("user_id IN ?", submitted).Find(&records).Error; err != nil {
				return err
			}
		}
		byUser := make(map[uint64][]model.Registration, len(submitted))
		for _, record := range records {
			byUser[record.UserID] = append(byUser[record.UserID], record)
		}
		matched := make(map[uint64]bool, len(eligible))
		for _, id := range eligible {
			matched[id] = true
		}
		var breakdown cohortMismatchCounts
		for _, userID := range submitted {
			breakdown.add(matched[userID], byUser[userID], cohort.ID)
		}
		fmt.Printf("legacy-assignment-diagnosis id=%d title=%s group=%s cohort=%d cohort_members=%d submitted=%d matched=%d latest_admitted_ineligible=%d latest_not_admitted=%d admitted_other_cohort=%d registered_other_only=%d no_registration=%d stored_targets=%d\n",
			item.ID, strconv.Quote(item.Title), strconv.Quote(group.Name),
			cohort.ID, len(eligible), len(submitted), breakdown.Matched,
			breakdown.LatestAdmittedIneligible, breakdown.LatestNotAdmitted, breakdown.AdmittedOther,
			breakdown.RegisteredOther, breakdown.NoRegistration, targetCount)
	}
	fmt.Printf("legacy-assignment-diagnosis complete assignments=%d (read-only)\n", len(assignments))
	return nil
}

type cohortMismatchCounts struct {
	Matched                  int
	LatestAdmittedIneligible int
	LatestNotAdmitted        int
	AdmittedOther            int
	RegisteredOther          int
	NoRegistration           int
}

func (c *cohortMismatchCounts) add(eligible bool, records []model.Registration, latest uint64) {
	if eligible {
		c.Matched++
		return
	}
	latestAdmitted, latestNotAdmitted, otherAdmitted := false, false, false
	for _, record := range records {
		if record.FormID == latest {
			if record.RecruitmentStatus == model.RecruitmentStatusAdmitted {
				latestAdmitted = true
			} else {
				latestNotAdmitted = true
			}
		} else if record.RecruitmentStatus == model.RecruitmentStatusAdmitted {
			otherAdmitted = true
		}
	}
	switch {
	case latestAdmitted:
		c.LatestAdmittedIneligible++
	case latestNotAdmitted:
		c.LatestNotAdmitted++
	case otherAdmitted:
		c.AdmittedOther++
	case len(records) > 0:
		c.RegisteredOther++
	default:
		c.NoRegistration++
	}
}