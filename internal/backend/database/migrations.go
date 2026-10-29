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
		{version: 12, apply: migrateInterviewResultNotifications},
		{version: 13, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.AuthSession{},
				&model.AccountVault{},
				&model.AccountVaultEntry{},
			)
		}},
		{version: 14, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.DailySignal{})
		}},
		{version: 15, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.WeeklyReport{})
		}},
		{version: 16, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.LeaveProfile{},
				&model.SchoolLeaveRequest{},
				&model.SchoolLeaveRun{},
				&model.SchoolLeaveGroupResult{},
				&model.LeaveAdminRead{},
				&model.DailyLeaveWindow{},
				&model.DailyLeaveEntry{},
				&model.DailyLeaveDocumentRequest{},
				&model.CampLeaveEvent{},
				&model.CampLeaveParticipant{},
			)
		}},
		{version: 17, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.LeaveAccessRequest{})
		}},
		{version: 18, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.Assignment{},
				&model.AssignmentTarget{},
				&model.AssignmentSubmission{},
				&model.AssignmentSubmissionFile{},
				&model.AssignmentReview{},
			)
		}},
		{version: 19, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.TrainingQuestion{},
				&model.TrainingQuestionPost{},
				&model.TrainingQuestionAttachment{},
			)
		}},
		{version: 20, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.TrainingQuestionGrowthEvent{})
		}},
		{version: 21, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.SkillNode{},
				&model.SkillNodePrerequisite{},
				&model.SkillNodeAssignment{},
				&model.SkillNodeProgress{},
				&model.SkillReviewEvent{},
			)
		}},
		{version: 22, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.ExpeditionProject{},
				&model.ExpeditionProjectMilestone{},
				&model.ExpeditionProjectParticipant{},
				&model.ExpeditionProjectEvent{},
			)
		}},
		{version: 23, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.ExpeditionProjectMilestone{})
		}},
		{version: 24, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.AssignmentMaterialFile{})
		}},
		{version: 25, apply: migrateAssignmentPublishIdempotency},
		{version: 26, apply: migrateAssignmentGroupWideDefault},
		{version: 27, apply: migrateAssignmentPublicationStatus},
		{version: 28, apply: migrateWeeklyReportExperienceFields},
		{version: 29, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.Timetable{})
		}},
		{version: 30, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.PracticeProject{}, &model.PracticeEntry{}, &model.PracticeSubmission{}, &model.PracticeFile{},
			)
		}},
		{version: 31, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.CapabilityDimension{}, &model.CapabilityDimensionSource{}, &model.CapabilityManualReview{},
			)
		}},
		{version: 32, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.MemberCultivationRecord{})
		}},
	}
}

func migrateWeeklyReportExperienceFields(db *gorm.DB) error {
	return migrateWeeklyReportExperienceFieldsForTable(db, model.WeeklyReport{}.TableName())
}

func migrateWeeklyReportExperienceFieldsForTable(db *gorm.DB, tableName string) error {
	if tableName == "" {
		return fmt.Errorf("weekly report table name is empty")
	}
	for _, character := range tableName {
		if !(character == '_' || character >= 'a' && character <= 'z' || character >= 'A' && character <= 'Z' || character >= '0' && character <= '9') {
			return fmt.Errorf("invalid weekly report table name")
		}
	}
	quotedTable := "`" + tableName + "`"
	if !db.Migrator().HasColumn(tableName, "gains") {
		if err := db.Exec("ALTER TABLE " + quotedTable + " ADD COLUMN `gains` TEXT NULL").Error; err != nil {
			return fmt.Errorf("add weekly report gains: %w", err)
		}
	}
	if err := db.Exec("UPDATE " + quotedTable + " SET `gains` = '' WHERE `gains` IS NULL").Error; err != nil {
		return fmt.Errorf("backfill empty weekly report gains: %w", err)
	}
	if err := db.Exec("ALTER TABLE " + quotedTable + " MODIFY COLUMN `gains` TEXT NOT NULL").Error; err != nil {
		return fmt.Errorf("require weekly report gains: %w", err)
	}
	if err := db.Exec("ALTER TABLE " + quotedTable + " MODIFY COLUMN `group_id` BIGINT UNSIGNED NULL DEFAULT NULL").Error; err != nil {
		return fmt.Errorf("allow ungrouped weekly reports: %w", err)
	}
	return nil
}

func migrateAssignmentPublicationStatus(db *gorm.DB) error {
	if db.Migrator().HasColumn(&model.Assignment{}, "PublicationStatus") {
		return nil
	}
	return db.Migrator().AddColumn(&model.Assignment{}, "PublicationStatus")
}

func migrateAssignmentGroupWideDefault(db *gorm.DB) error {
	return db.Migrator().AlterColumn(&model.Assignment{}, "IsGroupWide")
}

func migrateAssignmentPublishIdempotency(db *gorm.DB) error {
	if !db.Migrator().HasColumn(&model.Assignment{}, "PublishRequestID") {
		if err := db.Migrator().AddColumn(&model.Assignment{}, "PublishRequestID"); err != nil {
			return err
		}
	}
	if !db.Migrator().HasColumn(&model.Assignment{}, "PublishRequestHash") {
		if err := db.Migrator().AddColumn(&model.Assignment{}, "PublishRequestHash"); err != nil {
			return err
		}
	}
	if !db.Migrator().HasIndex(&model.Assignment{}, "uk_assignment_publish_request") {
		if err := db.Migrator().CreateIndex(&model.Assignment{}, "PublishRequestID"); err != nil {
			return err
		}
	}
	return nil
}

func migrateInterviewResultNotifications(db *gorm.DB) error {
	if err := db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
		&model.InterviewResultRevision{},
		&model.InterviewResultNotification{},
	); err != nil {
		return err
	}

	// Results saved before notification tracking was introduced cannot safely
	// be assumed delivered or undelivered. Record them as unknown and require
	// an explicit operator check before any resend.
	var registrations []model.Registration
	if err := db.Preload("User").Preload("Form").Preload("PreferredGroup").
		Where("interviewed_at IS NOT NULL AND (recruitment_status = ? OR (recruitment_status = ? AND rejected_stage = ?))",
			model.RecruitmentStatusAdmitted, model.RecruitmentStatusRejected, model.RecruitmentRejectedStageInterview).
		Find(&registrations).Error; err != nil {
		return err
	}
	for _, registration := range registrations {
		var count int64
		if err := db.Model(&model.InterviewResultRevision{}).
			Where("registration_id = ?", registration.ID).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			continue
		}
		createdAt := registration.UpdatedAt.UTC()
		if registration.InterviewedAt != nil && !registration.InterviewedAt.IsZero() {
			createdAt = registration.InterviewedAt.UTC()
		}
		revision := model.InterviewResultRevision{
			RegistrationID: registration.ID,
			Revision:       1,
			ResultStatus:   registration.RecruitmentStatus,
			ActorID:        registration.InterviewerID,
			Reason:         migrationStringPtr("迁移前已有面试结果；历史邮件状态未知，补发前需核对邮件服务商记录。"),
			CreatedAt:      createdAt,
		}
		if err := db.Create(&revision).Error; err != nil {
			return err
		}
		recipient := ""
		if registration.ContactEmail != nil && *registration.ContactEmail != "" {
			recipient = *registration.ContactEmail
		} else {
			recipient = registration.User.Email
		}
		notification := model.InterviewResultNotification{
			RegistrationID: registration.ID,
			RevisionID:     revision.ID,
			Status:         model.InterviewNotificationLegacyUnknown,
			Recipient:      recipient,
			Subject:        "历史面试结果通知待核对",
			Body:           "本结果在邮件状态跟踪上线前登记。请先核对邮件服务商记录，再决定是否补发。",
			CreatedAt:      createdAt,
			UpdatedAt:      createdAt,
		}
		if err := db.Create(&notification).Error; err != nil {
			return err
		}
	}
	return nil
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

// migrateAdminScopes is the historical v6 schema/identity normalization. The
// legacy scope columns remain for compatibility, but organization identities
// must never change a user's system role or delete their group membership.
func migrateAdminScopes(db *gorm.DB) error {
	if err := db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.User{}, &model.UserGroupMember{}); err != nil {
		return err
	}
	// Before this migration, role=1 meant leader. Keep that identity when the
	// current enum reserves 1 for the retired group-admin value and 2 for leader.
	if err := db.Model(&model.UserGroupMember{}).Where("role = ?", 1).Update("role", 2).Error; err != nil {
		return err
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
	if err := seedAcceptanceTestData(db.WithContext(ctx), appEnv); err != nil {
		return fmt.Errorf("seed acceptance test data: %w", err)
	}
	return nil
}
