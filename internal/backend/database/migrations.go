package database

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

type migration struct {
	version uint64
	apply   func(db *gorm.DB) error
}

func migrationRegistry(appEnv string) []migration {
	return []migration{
		{version: 1, apply: func(db *gorm.DB) error { return AutoMigrate(db, appEnv) }},
		{version: 2, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.Announcement{},
				&model.AnnouncementTargetGroup{},
			)
		}},
		{version: 3, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.TeamEvent{},
				&model.TeamEventTargetGroup{},
			)
		}},
		{version: 4, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.PortalLink{},
				&model.PortalLinkTargetGroup{},
			)
		}},
		{version: 5, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.ActivityEvent{})
		}},
		{version: 6, apply: migrateAdminScopes},
		{version: 7, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.Registration{}, &model.RegistrationInterview{})
		}},
		{version: 8, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.UserGroup{})
		}},
		{version: 9, apply: migrateRecruitmentWorkflow},
		{version: 10, apply: migrateInterviewScheduling},
		{version: 11, apply: migrateInterviewSessionFormAssociation},
	}
}

func migrateInterviewSessionFormAssociation(db *gorm.DB) error {
	if err := db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.InterviewSession{}); err != nil {
		return err
	}
	// Preserve historical sessions as unassigned when their registration
	// history spans forms or no registration refers to them. Only an unambiguous
	// one-form relationship is safe to carry forward.
	return db.Exec(`
		UPDATE interview_sessions AS sessions
		JOIN (
			SELECT interview_session_id, MIN(form_id) AS form_id
			FROM registrations
			WHERE interview_session_id IS NOT NULL
			GROUP BY interview_session_id
			HAVING COUNT(DISTINCT form_id) = 1
		) AS linked ON linked.interview_session_id = sessions.id
		SET sessions.form_id = linked.form_id
		WHERE sessions.form_id IS NULL
	`).Error
}

func migrateInterviewScheduling(db *gorm.DB) error {
	if err := db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
		&model.InterviewSession{},
		&model.Registration{},
	); err != nil {
		return err
	}
	return db.Model(&model.Registration{}).
		Where("interview_attendance IS NULL OR interview_attendance = ?", "").
		Updates(interviewSchedulingBackfillUpdates()).Error
}

func interviewSchedulingBackfillUpdates() map[string]any {
	return map[string]any{
		"interview_attendance": model.InterviewAttendancePending,
		"interview_session_id": nil,
	}
}

type recruitmentBackfill struct {
	PreferredGroupID *uint64
	Status           string
	RejectedStage    *string
	ScreenedBy       *uint64
	ScreenedAt       *time.Time
	ScreeningRemark  *string
	InterviewerID    *uint64
	InterviewedAt    *time.Time
	InterviewRemark  *string
}

func migrateRecruitmentWorkflow(db *gorm.DB) error {
	if err := db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.Registration{}); err != nil {
		return err
	}

	var registrations []model.Registration
	// Only legacy rows without a canonical preferred group need backfilling.
	// This also makes the migration safe to resume after a partial failure:
	// rows already migrated, plus records created by the new workflow, are left intact.
	if err := db.Where("preferred_group_id IS NULL").Preload("Interviews").Find(&registrations).Error; err != nil {
		return err
	}
	for index := range registrations {
		backfill := buildRecruitmentBackfill(&registrations[index])
		updates := map[string]any{
			"preferred_group_id": backfill.PreferredGroupID,
			"recruitment_status": backfill.Status,
			"rejected_stage":     backfill.RejectedStage,
			"screened_by":        backfill.ScreenedBy,
			"screened_at":        backfill.ScreenedAt,
			"screening_remark":   backfill.ScreeningRemark,
			"interviewer_id":     backfill.InterviewerID,
			"interviewed_at":     backfill.InterviewedAt,
			"interview_remark":   backfill.InterviewRemark,
		}
		if err := db.Model(&model.Registration{}).Where("id = ?", registrations[index].ID).Updates(updates).Error; err != nil {
			return err
		}
	}
	return nil
}

func buildRecruitmentBackfill(registration *model.Registration) recruitmentBackfill {
	if registration == nil {
		return recruitmentBackfill{Status: model.RecruitmentStatusPendingScreening}
	}

	preferredGroupID := registration.Group1ID
	canonicalInterviewGroupID := registration.Group1ID
	if registration.FinalStatus == model.RegistrationFinalStatusAdmitted && registration.FinalGroupID != nil {
		// A historical admission is authoritative. Production currently has no
		// second-choice admissions, but keep the migration lossless if another
		// environment contains one.
		preferredGroupID = registration.FinalGroupID
		canonicalInterviewGroupID = registration.FinalGroupID
	}

	var primaryInterview *model.RegistrationInterview
	if canonicalInterviewGroupID != nil {
		for index := range registration.Interviews {
			if registration.Interviews[index].GroupID == *canonicalInterviewGroupID {
				primaryInterview = &registration.Interviews[index]
				break
			}
		}
	}

	status := model.RecruitmentStatusPendingScreening
	var rejectedStage *string
	switch {
	case registration.Status == model.RegistrationStatusCancelled || registration.Group1Status == model.RegistrationStatusCancelled:
		status = model.RecruitmentStatusWithdrawn
	case registration.FinalStatus == model.RegistrationFinalStatusAdmitted:
		status = model.RecruitmentStatusAdmitted
	case registration.FinalStatus == model.RegistrationFinalStatusRejected:
		status = model.RecruitmentStatusRejected
		stage := model.RecruitmentRejectedStageScreening
		if primaryInterview != nil {
			stage = model.RecruitmentRejectedStageInterview
		}
		rejectedStage = migrationStringPtr(stage)
	case primaryInterview != nil:
		switch primaryInterview.Status {
		case model.RegistrationInterviewPassed:
			// Legacy interview success was not itself the authoritative final
			// admission signal. Only final_status=admitted may become admitted
			// during backfill; otherwise keep the candidate actionable rather
			// than guessing a final result.
			status = model.RecruitmentStatusPendingInterview
		case model.RegistrationInterviewFailed:
			status = model.RecruitmentStatusRejected
			rejectedStage = migrationStringPtr(model.RecruitmentRejectedStageInterview)
		default:
			status = model.RecruitmentStatusPendingInterview
		}
	case registration.Group1Status == model.RegistrationStatusApproved:
		status = model.RecruitmentStatusPendingInterview
	case registration.Group1Status == model.RegistrationStatusRejected:
		status = model.RecruitmentStatusRejected
		rejectedStage = migrationStringPtr(model.RecruitmentRejectedStageScreening)
	case registration.Group1Status == model.RegistrationStatusCancelled:
		status = model.RecruitmentStatusWithdrawn
	}

	result := recruitmentBackfill{
		PreferredGroupID: preferredGroupID,
		Status:           status,
		RejectedStage:    rejectedStage,
		ScreenedBy:       registration.ReviewerID1,
		ScreenedAt:       registration.ReviewedAt1,
		ScreeningRemark:  registration.ReviewRemark1,
	}
	if primaryInterview != nil {
		result.InterviewerID = primaryInterview.InterviewerID
		result.InterviewedAt = primaryInterview.InterviewedAt
		result.InterviewRemark = primaryInterview.Remark
	}
	return result
}

func migrationStringPtr(value string) *string {
	return &value
}

// migrateAdminScopes introduces explicit administrator scope and normalizes
// historical group-member roles. It is deliberately data-driven so it works
// for both MySQL installations and the SQLite databases used by tests.
func migrateAdminScopes(db *gorm.DB) error {
	if err := db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.User{}, &model.UserGroupMember{}); err != nil {
		return err
	}
	// Before this migration role=1 meant leader. The new enum reserves 1 for
	// group_admin and 2 for leader, so reinterpret existing rows explicitly.
	if err := db.Model(&model.UserGroupMember{}).Where("role = ?", 1).Update("role", 2).Error; err != nil {
		return err
	}

	var users []model.User
	if err := db.Preload("Role").Preload("GroupMembers", func(q *gorm.DB) *gorm.DB {
		return q.Order("joined_at ASC").Order("id ASC")
	}).Find(&users).Error; err != nil {
		return err
	}
	for i := range users {
		user := &users[i]
		// A super administrator can never belong to an ordinary group.
		if user.Role.Name == model.RoleNameSuperAdmin {
			if err := db.Where("user_id = ?", user.ID).Delete(&model.UserGroupMember{}).Error; err != nil {
				return err
			}
			if err := db.Model(&model.User{}).Where("id = ?", user.ID).Updates(map[string]any{"admin_scope": model.AdminScopeGlobal, "management_group_id": nil}).Error; err != nil {
				return err
			}
			continue
		}

		// Keep only the earliest management membership. Remaining memberships
		// stay intact but become ordinary members.
		var kept *model.UserGroupMember
		for j := range user.GroupMembers {
			member := &user.GroupMembers[j]
			if member.Role != model.UserGroupMemberRoleLeader && member.Role != model.UserGroupMemberRoleGroupAdmin {
				continue
			}
			if kept == nil {
				kept = member
				continue
			}
			if err := db.Model(&model.UserGroupMember{}).Where("id = ?", member.ID).Update("role", model.UserGroupMemberRoleMember).Error; err != nil {
				return err
			}
		}

		updates := map[string]any{"admin_scope": model.AdminScopeNone, "management_group_id": nil}
		switch user.Role.Name {
		case model.RoleNameAdmin:
			if kept != nil {
				updates["admin_scope"] = model.AdminScopeGroup
				updates["management_group_id"] = kept.GroupID
			} else {
				updates["admin_scope"] = model.AdminScopeGlobal
			}
		case model.RoleNameUser:
			if kept != nil {
				// Historical leaders were often stored with role=user; preserve
				// their management identity and promote the system role.
				updates["admin_scope"] = model.AdminScopeGroup
				updates["management_group_id"] = kept.GroupID
				updates["role_id"] = gorm.Expr("(SELECT id FROM roles WHERE name = ?)", model.RoleNameAdmin)
			} else {
				for _, member := range user.GroupMembers {
					if member.Role == model.UserGroupMemberRoleLeader || member.Role == model.UserGroupMemberRoleGroupAdmin {
						if err := db.Model(&model.UserGroupMember{}).Where("id = ?", member.ID).Update("role", model.UserGroupMemberRoleMember).Error; err != nil {
							return err
						}
					}
				}
			}
		}
		if err := db.Model(&model.User{}).Where("id = ?", user.ID).Updates(updates).Error; err != nil {
			return err
		}
	}
	var invalid int64
	if err := db.Model(&model.User{}).Joins("JOIN roles ON roles.id = users.role_id").Where("(roles.name = ? AND (users.admin_scope IS NULL OR users.admin_scope = ? OR users.admin_scope NOT IN (?, ?))) OR (roles.name = ? AND (users.admin_scope IS NULL OR users.admin_scope <> ? OR users.management_group_id IS NOT NULL)) OR (roles.name = ? AND users.management_group_id IS NOT NULL)", model.RoleNameAdmin, model.AdminScopeNone, model.AdminScopeGlobal, model.AdminScopeGroup, model.RoleNameUser, model.AdminScopeNone, model.RoleNameSuperAdmin).Count(&invalid).Error; err != nil {
		return err
	}
	if invalid > 0 {
		return fmt.Errorf("admin scope consistency check failed: %d users", invalid)
	}
	if err := db.Model(&model.UserGroupMember{}).Joins("JOIN users ON users.id = user_group_members.user_id").Joins("JOIN roles ON roles.id = users.role_id").Where("roles.name = ?", model.RoleNameSuperAdmin).Count(&invalid).Error; err != nil {
		return err
	}
	if invalid > 0 {
		return fmt.Errorf("super administrator group membership consistency check failed: %d memberships", invalid)
	}
	return nil
}

// RunMigrations applies every unapplied migration in order. Each version has
// its own transaction and is recorded only after its schema change succeeds.
func RunMigrations(ctx context.Context, db *gorm.DB, appEnv string) error {
	if db == nil {
		return fmt.Errorf("database is nil")
	}
	if err := db.WithContext(ctx).Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version BIGINT UNSIGNED PRIMARY KEY, applied_at DATETIME NOT NULL) ENGINE=InnoDB`).Error; err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	for _, item := range migrationRegistry(appEnv) {
		var count int64
		if err := db.WithContext(ctx).Table("schema_migrations").Where("version = ?", item.version).Count(&count).Error; err != nil {
			return fmt.Errorf("check migration %d: %w", item.version, err)
		}
		if count > 0 {
			continue
		}
		if err := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			if err := item.apply(tx); err != nil {
				return err
			}
			return tx.Table("schema_migrations").Create(map[string]any{
				"version": item.version, "applied_at": time.Now(),
			}).Error
		}); err != nil {
			return fmt.Errorf("apply migration %d: %w", item.version, err)
		}
	}

	if err := seedDevelopmentMockData(db.WithContext(ctx), appEnv); err != nil {
		return fmt.Errorf("seed development data: %w", err)
	}
	return nil
}
