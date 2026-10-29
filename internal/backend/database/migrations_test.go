package database

import (
	"fmt"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"tarsgo-backend/model"
)

func TestMigrationRegistryIsOrderedAndKeepsBaseVersion(t *testing.T) {
	items := migrationRegistry("test")
	if len(items) != 30 {
		t.Fatalf("expected 30 registered migrations, got %d", len(items))
	}
	wantVersions := []uint64{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30}
	for index, want := range wantVersions {
		if items[index].version != want {
			t.Fatalf("migration %d has version %d, want %d", index, items[index].version, want)
		}
	}
	if items[0].version != 1 {
		t.Fatalf("unexpected migration registry: %#v", items)
	}
	for index := 1; index < len(items); index++ {
		if items[index-1].version >= items[index].version {
			t.Fatalf("migrations must be strictly ordered at index %d", index)
		}
	}
}

func TestMigration28AddsAllMemberWeeklyReportFields(t *testing.T) {
	items := migrationRegistry("test")
	if items[27].version != 28 || items[27].apply == nil {
		t.Fatal("weekly report migration 28 is missing")
	}
	field, ok := reflect.TypeOf(model.WeeklyReport{}).FieldByName("GroupID")
	if !ok || field.Type.Kind() != reflect.Pointer {
		t.Fatalf("weekly report group attribution must be nullable; type = %v", field.Type)
	}
	if _, ok := reflect.TypeOf(model.WeeklyReport{}).FieldByName("Gains"); !ok {
		t.Fatal("weekly report gains field is missing")
	}
}

func TestAcceptanceDatabaseWeeklyReportMigrationPreservesHistoryAndAllowsUnassigned(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TARSGO_QA_TEST_DSN"))
	if dsn == "" {
		t.Skip("TARSGO_QA_TEST_DSN is not set")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("refusing weekly report migration verification outside the isolated local acceptance database")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal("open isolated acceptance database")
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal("open isolated acceptance SQL connection")
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	tableName := fmt.Sprintf("weekly_report_migration_probe_%d", time.Now().UnixNano())
	quotedTable := "`" + tableName + "`"
	createTable := fmt.Sprintf("CREATE TABLE %s (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, group_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NOT NULL, week_start DATE NOT NULL, completed TEXT NOT NULL, blockers TEXT NOT NULL, next_plan TEXT NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, UNIQUE KEY uk_weekly_report_member_week (group_id, user_id, week_start), KEY idx_weekly_report_group_week (group_id, week_start), KEY idx_weekly_report_user_week (user_id, week_start)) ENGINE=InnoDB", quotedTable)
	if err := db.Exec(createTable).Error; err != nil {
		t.Fatalf("create v27 weekly report probe: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Exec("DROP TABLE IF EXISTS " + quotedTable).Error; err != nil {
			t.Errorf("drop weekly report migration probe: %v", err)
		}
	})
	createdAt := time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)
	if err := db.Exec("INSERT INTO "+quotedTable+" (group_id, user_id, week_start, completed, blockers, next_plan, created_at, updated_at) VALUES (41, 900001, '2026-10-19', '旧进展一', '无', '旧计划一', ?, ?), (52, 900001, '2026-10-19', '旧进展二', '无', '旧计划二', ?, ?)", createdAt, createdAt, createdAt, createdAt).Error; err != nil {
		t.Fatalf("seed v27 reports from different group scopes: %v", err)
	}
	if err := migrateWeeklyReportExperienceFieldsForTable(db, tableName); err != nil {
		t.Fatalf("apply weekly report migration: %v", err)
	}
	if err := migrateWeeklyReportExperienceFieldsForTable(db, tableName); err != nil {
		t.Fatalf("repeat weekly report migration: %v", err)
	}
	var rows []struct {
		ID        uint64
		GroupID   *uint64 `gorm:"column:group_id"`
		Completed string
		Gains     string
	}
	if err := db.Table(tableName).Select("id, group_id, completed, gains").Order("id ASC").Find(&rows).Error; err != nil {
		t.Fatalf("read migrated weekly reports: %v", err)
	}
	if len(rows) != 2 || rows[0].GroupID == nil || *rows[0].GroupID != 41 || rows[0].Completed != "旧进展一" || rows[0].Gains != "" || rows[1].GroupID == nil || *rows[1].GroupID != 52 || rows[1].Completed != "旧进展二" || rows[1].Gains != "" {
		t.Fatalf("migration changed old report scopes/content: %#v", rows)
	}
	var nullable string
	if err := db.Raw("SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'group_id'", tableName).Scan(&nullable).Error; err != nil {
		t.Fatalf("inspect nullable group id: %v", err)
	}
	if nullable != "YES" {
		t.Fatalf("group_id IS_NULLABLE = %q, want YES", nullable)
	}
	if err := db.Exec("INSERT INTO "+quotedTable+" (group_id, user_id, week_start, completed, gains, blockers, next_plan, created_at, updated_at) VALUES (NULL, 900002, '2026-10-19', '未分组进展', '收获', '无', '计划', ?, ?)", createdAt, createdAt).Error; err != nil {
		t.Fatalf("insert unassigned member's weekly report: %v", err)
	}
}

func TestMigration26OnlyCorrectsAssignmentRecipientDefault(t *testing.T) {
	items := migrationRegistry("test")
	var migration26 *migration
	for index := range items {
		if items[index].version == 26 {
			migration26 = &items[index]
			break
		}
	}
	if migration26 == nil {
		t.Fatal("assignment recipient default migration 26 is missing")
	}
	if migration26.apply == nil {
		t.Fatal("assignment recipient default migration has no implementation")
	}
	field, ok := reflect.TypeOf(model.Assignment{}).FieldByName("IsGroupWide")
	if !ok || !strings.Contains(field.Tag.Get("gorm"), "default:0") {
		t.Fatalf("IsGroupWide must default to false after migration 26; gorm tag = %q", field.Tag.Get("gorm"))
	}
}

func TestMigration27AddsAssignmentPublicationLifecycleWithoutTouchingRecipients(t *testing.T) {
	items := migrationRegistry("test")
	var migration27 *migration
	for index := range items {
		if items[index].version == 27 {
			migration27 = &items[index]
			break
		}
	}
	if migration27 == nil || migration27.apply == nil {
		t.Fatal("assignment publication lifecycle migration 27 is missing")
	}
	field, ok := reflect.TypeOf(model.Assignment{}).FieldByName("PublicationStatus")
	if !ok || !strings.Contains(field.Tag.Get("gorm"), "default:'published'") {
		t.Fatalf("new and upgraded assignments must default to published; gorm tag = %q", field.Tag.Get("gorm"))
	}
}

func TestAcceptanceDatabaseAssignmentPublicationMigrationPreservesExistingRows(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TARSGO_QA_TEST_DSN"))
	if dsn == "" {
		t.Skip("TARSGO_QA_TEST_DSN is not set")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("refusing assignment migration verification outside the isolated local acceptance database")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal("open isolated acceptance database")
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal("open isolated acceptance SQL connection")
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	tableName := fmt.Sprintf("assignment_migration_probe_%d", time.Now().UnixNano())
	if err := db.Exec(fmt.Sprintf("CREATE TABLE `%s` (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, title VARCHAR(160) NOT NULL) ENGINE=InnoDB", tableName)).Error; err != nil {
		t.Fatalf("create temporary migration probe table: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Exec(fmt.Sprintf("DROP TABLE IF EXISTS `%s`", tableName)).Error; err != nil {
			t.Errorf("drop temporary migration probe table: %v", err)
		}
	})
	if err := db.Exec(fmt.Sprintf("INSERT INTO `%s` (title) VALUES (?), (?)", tableName), "legacy full-group assignment", "legacy targeted assignment").Error; err != nil {
		t.Fatalf("seed migration probe with pre-existing assignments: %v", err)
	}
	probeDB := db.Table(tableName)
	if err := migrateAssignmentPublicationStatus(probeDB); err != nil {
		t.Fatalf("apply migration 27 to pre-existing rows: %v", err)
	}
	if err := migrateAssignmentPublicationStatus(probeDB); err != nil {
		t.Fatalf("repeat migration 27 idempotently: %v", err)
	}
	var rows []struct {
		ID                uint64
		Title             string
		PublicationStatus string
	}
	if err := probeDB.Select("id, title, publication_status").Order("id ASC").Find(&rows).Error; err != nil {
		t.Fatalf("read historical rows after migration: %v", err)
	}
	if len(rows) != 2 || rows[0].ID != 1 || rows[0].Title != "legacy full-group assignment" || rows[0].PublicationStatus != model.AssignmentPublicationPublished || rows[1].ID != 2 || rows[1].Title != "legacy targeted assignment" || rows[1].PublicationStatus != model.AssignmentPublicationPublished {
		t.Fatalf("migration changed or failed to backfill historical assignment rows: %#v", rows)
	}
}

func TestInterviewSchedulingMigrationBackfillOnlyTouchesNewColumns(t *testing.T) {
	updates := interviewSchedulingBackfillUpdates()
	if len(updates) != 2 {
		t.Fatalf("expected only interview scheduling defaults, got %#v", updates)
	}
	if got := updates["interview_attendance"]; got != model.InterviewAttendancePending {
		t.Fatalf("interview_attendance = %#v, want %q", got, model.InterviewAttendancePending)
	}
	if got, exists := updates["interview_session_id"]; !exists || got != nil {
		t.Fatalf("interview_session_id = %#v, want nil", got)
	}

	protectedColumns := []string{"preferred_group_id", "recruitment_status", "rejected_stage"}
	for _, column := range protectedColumns {
		if _, exists := updates[column]; exists {
			t.Fatalf("v10 migration must not rewrite canonical column %q", column)
		}
	}
}

func TestInterviewSchedulingMigrationDefaultsPreserve548HistoricalCanonicalResults(t *testing.T) {
	statuses := []string{
		model.RecruitmentStatusPendingScreening,
		model.RecruitmentStatusPendingInterview,
		model.RecruitmentStatusAdmitted,
		model.RecruitmentStatusRejected,
		model.RecruitmentStatusWithdrawn,
	}
	for index := 0; index < 548; index++ {
		groupID := uint64(100 + index%7)
		stage := ""
		if statuses[index%len(statuses)] == model.RecruitmentStatusRejected {
			if index%2 == 0 {
				stage = model.RecruitmentRejectedStageScreening
			} else {
				stage = model.RecruitmentRejectedStageInterview
			}
		}
		registration := model.Registration{
			PreferredGroupID:    &groupID,
			RecruitmentStatus:   statuses[index%len(statuses)],
			InterviewAttendance: "",
		}
		if stage != "" {
			registration.RejectedStage = &stage
		}

		beforeGroup := *registration.PreferredGroupID
		beforeStatus := registration.RecruitmentStatus
		beforeStage := ""
		if registration.RejectedStage != nil {
			beforeStage = *registration.RejectedStage
		}

		registration.InterviewAttendance = model.InterviewAttendancePending
		registration.InterviewSessionID = nil

		if registration.PreferredGroupID == nil || *registration.PreferredGroupID != beforeGroup {
			t.Fatalf("record %d preferred group changed", index)
		}
		if registration.RecruitmentStatus != beforeStatus {
			t.Fatalf("record %d status changed from %q to %q", index, beforeStatus, registration.RecruitmentStatus)
		}
		afterStage := ""
		if registration.RejectedStage != nil {
			afterStage = *registration.RejectedStage
		}
		if afterStage != beforeStage {
			t.Fatalf("record %d rejected stage changed from %q to %q", index, beforeStage, afterStage)
		}
	}
}

func TestBuildRecruitmentBackfillPreservesLegacyFactsWithoutSecondChoiceAdmission(t *testing.T) {
	now := time.Date(2026, 10, 5, 8, 0, 0, 0, time.UTC)
	group1 := uint64(101)
	group2 := uint64(202)
	reviewer := uint64(11)
	interviewer := uint64(12)
	remark := "初筛备注"
	interviewRemark := "面试备注"

	tests := []struct {
		name                 string
		registration         model.Registration
		wantPreferredGroupID uint64
		wantStatus           string
		wantRejectedStage    string
		wantInterviewer      bool
	}{
		{
			name: "new pending screening",
			registration: model.Registration{
				Group1ID:     &group1,
				Group1Status: model.RegistrationStatusPending,
				FinalStatus:  model.RegistrationFinalStatusPending,
			},
			wantPreferredGroupID: group1,
			wantStatus:           model.RecruitmentStatusPendingScreening,
		},
		{
			name: "screening approved waits for interview",
			registration: model.Registration{
				Group1ID:      &group1,
				Group1Status:  model.RegistrationStatusApproved,
				ReviewerID1:   &reviewer,
				ReviewedAt1:   &now,
				ReviewRemark1: &remark,
				FinalStatus:   model.RegistrationFinalStatusPending,
			},
			wantPreferredGroupID: group1,
			wantStatus:           model.RecruitmentStatusPendingInterview,
		},
		{
			name: "screening rejected ignores approved second choice",
			registration: model.Registration{
				Group1ID:     &group1,
				Group2ID:     &group2,
				Group1Status: model.RegistrationStatusRejected,
				Group2Status: model.RegistrationStatusApproved,
				ReviewerID1:  &reviewer,
				ReviewedAt1:  &now,
				FinalStatus:  model.RegistrationFinalStatusPending,
			},
			wantPreferredGroupID: group1,
			wantStatus:           model.RecruitmentStatusRejected,
			wantRejectedStage:    model.RecruitmentRejectedStageScreening,
		},
		{
			name: "legacy interview pass without final admission is not guessed as admitted",
			registration: model.Registration{
				Group1ID:     &group1,
				Group1Status: model.RegistrationStatusApproved,
				FinalStatus:  model.RegistrationFinalStatusPending,
				Interviews: []model.RegistrationInterview{
					{GroupID: group1, Status: model.RegistrationInterviewPassed, InterviewerID: &interviewer, InterviewedAt: &now, Remark: &interviewRemark},
				},
			},
			wantPreferredGroupID: group1,
			wantStatus:           model.RecruitmentStatusPendingInterview,
			wantInterviewer:      true,
		},
		{
			name: "first choice interview failure ends workflow even if second passed",
			registration: model.Registration{
				Group1ID:     &group1,
				Group2ID:     &group2,
				Group1Status: model.RegistrationStatusApproved,
				Group2Status: model.RegistrationStatusApproved,
				FinalStatus:  model.RegistrationFinalStatusPending,
				Interviews: []model.RegistrationInterview{
					{GroupID: group1, Status: model.RegistrationInterviewFailed, InterviewerID: &interviewer, InterviewedAt: &now, Remark: &interviewRemark},
					{GroupID: group2, Status: model.RegistrationInterviewPassed},
				},
			},
			wantPreferredGroupID: group1,
			wantStatus:           model.RecruitmentStatusRejected,
			wantRejectedStage:    model.RecruitmentRejectedStageInterview,
			wantInterviewer:      true,
		},
		{
			name: "second choice only interview is archived and not guessed as admission",
			registration: model.Registration{
				Group1ID:     &group1,
				Group2ID:     &group2,
				Group1Status: model.RegistrationStatusApproved,
				Group2Status: model.RegistrationStatusApproved,
				FinalStatus:  model.RegistrationFinalStatusPending,
				Interviews: []model.RegistrationInterview{
					{GroupID: group2, Status: model.RegistrationInterviewPassed, InterviewerID: &interviewer, InterviewedAt: &now},
				},
			},
			wantPreferredGroupID: group1,
			wantStatus:           model.RecruitmentStatusPendingInterview,
		},
		{
			name: "historical second choice admission keeps recorded final group",
			registration: model.Registration{
				Group1ID:     &group1,
				Group2ID:     &group2,
				FinalGroupID: &group2,
				FinalStatus:  model.RegistrationFinalStatusAdmitted,
				Interviews: []model.RegistrationInterview{
					{GroupID: group1, Status: model.RegistrationInterviewFailed},
					{GroupID: group2, Status: model.RegistrationInterviewPassed, InterviewerID: &interviewer, InterviewedAt: &now, Remark: &interviewRemark},
				},
			},
			wantPreferredGroupID: group2,
			wantStatus:           model.RecruitmentStatusAdmitted,
			wantInterviewer:      true,
		},
		{
			name: "withdrawn legacy record",
			registration: model.Registration{
				Group1ID: &group1,
				Status:   model.RegistrationStatusCancelled,
			},
			wantPreferredGroupID: group1,
			wantStatus:           model.RecruitmentStatusWithdrawn,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := buildRecruitmentBackfill(&test.registration)
			if got.PreferredGroupID == nil || *got.PreferredGroupID != test.wantPreferredGroupID {
				t.Fatalf("preferred group = %#v, want %d", got.PreferredGroupID, test.wantPreferredGroupID)
			}
			if got.Status != test.wantStatus {
				t.Fatalf("status = %q, want %q", got.Status, test.wantStatus)
			}
			stage := ""
			if got.RejectedStage != nil {
				stage = *got.RejectedStage
			}
			if stage != test.wantRejectedStage {
				t.Fatalf("rejected stage = %q, want %q", stage, test.wantRejectedStage)
			}
			if test.wantInterviewer && (got.InterviewerID == nil || *got.InterviewerID != interviewer || got.InterviewedAt == nil || got.InterviewRemark == nil || *got.InterviewRemark != interviewRemark) {
				t.Fatalf("expected canonical first-choice interview facts, got %#v", got)
			}
			if test.name == "second choice only interview is archived and not guessed as admission" && got.InterviewerID != nil {
				t.Fatalf("second-choice-only interview must not populate canonical interviewer: %#v", got)
			}
		})
	}
}
