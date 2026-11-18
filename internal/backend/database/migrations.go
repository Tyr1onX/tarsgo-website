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

// teamIdentityChangeV41 preserves the schema created by historical migration 41.
// It is not used by runtime identity management and migration 45 drops the table.
type teamIdentityChangeV41 struct {
	ID                           uint64    `gorm:"type:bigint unsigned;primaryKey;autoIncrement"`
	UserID                       uint64    `gorm:"column:user_id;type:bigint unsigned;not null;index:idx_team_identity_user_created"`
	ActorUserID                  uint64    `gorm:"column:actor_user_id;type:bigint unsigned;not null"`
	ActorName                    string    `gorm:"column:actor_name;size:120;not null;default:''"`
	PreviousStatus               string    `gorm:"column:previous_status;size:32;not null"`
	NextStatus                   string    `gorm:"column:next_status;size:32;not null"`
	Reason                       string    `gorm:"type:varchar(500);not null"`
	AssessmentPassed             bool      `gorm:"column:assessment_passed;not null;default:false"`
	LeaderConfirmed              bool      `gorm:"column:leader_confirmed;not null;default:false"`
	PriorFormalMembershipConfirm bool      `gorm:"column:prior_formal_membership_confirmed;not null;default:false"`
	CreatedAt                    time.Time `gorm:"column:created_at;type:datetime;not null;default:CURRENT_TIMESTAMP;index:idx_team_identity_user_created"`
}

func (teamIdentityChangeV41) TableName() string { return "team_identity_changes" }

// Historical v64 schema, retained only so a fresh database can replay migrations.
type assignmentLateWindowV64 struct {
	AssignmentID uint64    `gorm:"column:assignment_id;type:bigint unsigned;primaryKey"`
	UserID       uint64    `gorm:"column:user_id;type:bigint unsigned;primaryKey"`
	DueAt        time.Time `gorm:"column:due_at;type:datetime;not null"`
	GrantedBy    uint64    `gorm:"column:granted_by;type:bigint unsigned;not null"`
	UpdatedAt    time.Time `gorm:"column:updated_at;type:datetime;not null"`
}

func (assignmentLateWindowV64) TableName() string { return "assignment_late_windows" }

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
				&skillNodeLegacy{},
				&skillNodePrerequisiteLegacy{},
				&skillNodeAssignmentLegacy{},
				&skillNodeProgressLegacy{},
				&skillReviewEventLegacy{},
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
				&capabilityDimensionLegacy{}, &capabilityDimensionSourceLegacy{}, &capabilityManualReviewLegacy{},
			)
		}},
		{version: 32, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.MemberCultivationRecord{})
		}},
		{version: 33, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.WeeklyReportAttachment{})
		}},
		{version: 34, apply: migrateCanonicalUserNames},
		{version: 35, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.CoBuilderContribution{})
		}},
		{version: 36, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.CoBuilderBadgeUnlockState{})
		}},
		{version: 37, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.TrainingQuestion{},
				&model.TrainingQuestionPost{},
				&model.CommunityPostReaction{},
			)
		}},
		{version: 38, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.TrainingQuestion{},
				&model.CommunityCommentReaction{},
				&model.CommunityCheckIn{},
				&model.CommunityExperienceEvent{},
			)
		}},
		{version: 39, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.CommunityMemberProfile{})
		}},
		{version: 40, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.CommunityPostViewRecord{})
		}},
		{version: 41, apply: func(db *gorm.DB) error {
			return migrateTeamIdentity(db)
		}},
		{version: 42, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.TrainingQuestion{},
				&model.TrainingQuestionPost{},
			)
		}},
		{version: 43, apply: migrateCommunityAvatarExperienceBackfill},
		{version: 44, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.EmailCode{}, &model.User{})
		}},
		{version: 45, apply: dropTeamIdentityChanges},
		{version: 46, apply: migrateWeeklyUniqueV46},
		{version: 47, apply: migrateCheckinIndexV47},
		{version: 48, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.User{}, &model.AISalonEvent{}, &model.AISalonRegistration{})
		}},
		{version: 49, apply: clearRetiredLearningData},
		{version: 50, apply: createLegacyRecruitmentArchive},
		{version: 51, apply: archiveRetiredRecruitment},
		{version: 52, apply: func(db *gorm.DB) error {
			for _, table := range []string{"users", "ai_salon_registrations"} {
				if !db.Migrator().HasColumn(table, "is_student") {
					if err := db.Exec("ALTER TABLE `" + table + "` ADD COLUMN is_student TINYINT(1) NULL DEFAULT NULL").Error; err != nil {
						return err
					}
				}
			}
			return nil
		}},
		{version: 53, apply: func(db *gorm.DB) error {
			for _, field := range []string{"Online", "MeetingURL"} {
				if !db.Migrator().HasColumn(&model.AISalonEvent{}, field) {
					if err := db.Migrator().AddColumn(&model.AISalonEvent{}, field); err != nil {
						return err
					}
				}
			}
			return nil
		}},
		{version: 54, apply: func(db *gorm.DB) error {
			if !db.Migrator().HasColumn(&model.AISalonEvent{}, "RegistrationClicks") {
				return db.Migrator().AddColumn(&model.AISalonEvent{}, "RegistrationClicks")
			}
			return nil
		}},
		{version: 55, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.User{})
		}},
		{version: 56, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.AssignmentReviewImage{})
		}},
		{version: 57, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.TrainingGrade{}, &model.CapabilityDimension{}, &model.CapabilityRating{},
			)
		}},
		{version: 58, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.CollectionForm{}, &model.CollectionSubmission{},
			)
		}},
		{version: 59, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.OperationsProgressItem{}, &model.OperationsProgressUpdate{},
			)
		}},
		{version: 60, apply: migrateOperationsProgressV60},
		{version: 61, apply: migrateOperationsPublicMetricsV61},
		{version: 62, apply: clearRMerTrialStageHistoryV62},
		{version: 63, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.LeaveAccessRequest{})
		}},
		{version: 64, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&assignmentLateWindowV64{})
		}},
		{version: 65, apply: func(db *gorm.DB) error {
			if !db.Migrator().HasTable(&assignmentLateWindowV64{}) {
				return nil
			}
			// Preserve previously granted extensions as one shared assignment deadline.
			return db.Exec(`UPDATE assignments a
				JOIN (SELECT assignment_id, MAX(due_at) AS due_at FROM assignment_late_windows GROUP BY assignment_id) w
				ON w.assignment_id = a.id
				SET a.due_at = GREATEST(a.due_at, w.due_at)`).Error
		}},
		{version: 66, apply: func(db *gorm.DB) error {
			return db.Migrator().DropTable(&assignmentLateWindowV64{})
		}},
		{version: 67, apply: migrateOperationsStepsV67},
		{version: 68, apply: migrateWeChatOperationsV68},
	}
}

func dropTeamIdentityChanges(db *gorm.DB) error {
	return db.Exec("DROP TABLE IF EXISTS team_identity_changes").Error
}

func migrateCommunityAvatarExperienceBackfill(db *gorm.DB) error {
	return db.Exec(`
		INSERT INTO community_experience_events
			(user_id, actor_id, source_type, source_id, related_id, source_key, points, created_at)
		SELECT id, NULL, 'avatar', id, 0, CONCAT('avatar:first:', id), 20, UTC_TIMESTAMP()
		FROM users
		WHERE avatar_url LIKE '/upload/avatars/%'
		ON DUPLICATE KEY UPDATE source_key = VALUES(source_key)
	`).Error
}

func migrateTeamIdentity(db *gorm.DB) error {
	if err := db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&teamIdentityChangeV41{}); err != nil {
		return err
	}
	if !db.Migrator().HasColumn(&model.User{}, "TeamIdentityStatus") {
		if err := db.Migrator().AddColumn(&model.User{}, "TeamIdentityStatus"); err != nil {
			return err
		}
	}
	if !db.Migrator().HasIndex(&model.User{}, "idx_team_identity_status") {
		if err := db.Migrator().CreateIndex(&model.User{}, "TeamIdentityStatus"); err != nil {
			return err
		}
	}
	return nil
}

func migrateCanonicalUserNames(db *gorm.DB) error {
	// Keep historical migration version 34 in place, but do not infer identity
	// data. Accounts with missing real names must be checked against an authority.
	return nil
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