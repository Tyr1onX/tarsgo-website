package database

import (
	"fmt"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"tarsgo-backend/model"
)

func TestMigrationRegistryIsOrderedAndKeepsBaseVersion(t *testing.T) {
	items := migrationRegistry("test")
	if len(items) != 68 {
		t.Fatalf("expected 68 registered migrations, got %d", len(items))
	}
	wantVersions := []uint64{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68}
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

func TestMigration55AddsUniqueFeishuIdentityMapping(t *testing.T) {
	items := migrationRegistry("test")
	if len(items) < 55 || items[54].version != 55 || items[54].apply == nil {
		t.Fatal("Feishu identity migration 55 is missing")
	}
	field, ok := reflect.TypeOf(model.User{}).FieldByName("FeishuOpenID")
	if !ok || field.Type.Kind() != reflect.Pointer || field.Type.Elem().Kind() != reflect.String {
		t.Fatalf("FeishuOpenID must be a nullable string, type = %v", field.Type)
	}
	if !strings.Contains(field.Tag.Get("gorm"), "uniqueIndex:uk_feishu_open_id") {
		t.Fatalf("FeishuOpenID must be unique, gorm tag = %q", field.Tag.Get("gorm"))
	}
}

func TestMigration36CreatesCoBuilderBadgeUnlockState(t *testing.T) {
	items := migrationRegistry("test")
	if len(items) < 36 || items[35].version != 36 || items[35].apply == nil {
		t.Fatal("co-builder badge unlock migration 36 is missing")
	}
	if got := (model.CoBuilderBadgeUnlockState{}).TableName(); got != "co_builder_badge_unlock_states" {
		t.Fatalf("unlock state table = %q", got)
	}
}

func TestMigration37AddsCommunityFieldsToQuestionRecords(t *testing.T) {
	items := migrationRegistry("test")
	if len(items) < 37 || items[36].version != 37 || items[36].apply == nil {
		t.Fatal("community migration 37 is missing")
	}
	questionGroup, ok := reflect.TypeOf(model.TrainingQuestion{}).FieldByName("GroupID")
	if !ok || questionGroup.Type.Kind() != reflect.Pointer {
		t.Fatalf("community posts need nullable group attribution; type = %v", questionGroup.Type)
	}
	if got := (model.CommunityPostReaction{}).TableName(); got != "community_post_reactions" {
		t.Fatalf("community interaction table = %q", got)
	}
	if _, ok := reflect.TypeOf(model.TrainingQuestionPost{}).FieldByName("ParentPostID"); !ok {
		t.Fatal("community replies must support replying to another reply")
	}
}

func TestMigration38CreatesCommunityGrowthLedgerAndCommentLikes(t *testing.T) {
	items := migrationRegistry("test")
	if len(items) < 38 || items[37].version != 38 || items[37].apply == nil {
		t.Fatal("community growth migration 38 is missing")
	}
	if got := (model.CommunityCheckIn{}).TableName(); got != "community_check_ins" {
		t.Fatalf("check-in table = %q", got)
	}
	if got := (model.CommunityExperienceEvent{}).TableName(); got != "community_experience_events" {
		t.Fatalf("experience event table = %q", got)
	}
	if got := (model.CommunityCommentReaction{}).TableName(); got != "community_comment_reactions" {
		t.Fatalf("comment reaction table = %q", got)
	}
	if _, ok := reflect.TypeOf(model.TrainingQuestion{}).FieldByName("AcceptedSolutionID"); !ok {
		t.Fatal("community posts must retain the specifically accepted reply")
	}
}

func TestMigration39CreatesPublicCommunityMemberProfiles(t *testing.T) {
	items := migrationRegistry("test")
	if len(items) < 39 || items[38].version != 39 || items[38].apply == nil {
		t.Fatal("community member profile migration 39 is missing")
	}
	if got := (model.CommunityMemberProfile{}).TableName(); got != "community_member_profiles" {
		t.Fatalf("community member profile table = %q", got)
	}
	if _, ok := reflect.TypeOf(model.CommunityMemberProfile{}).FieldByName("FeaturedBadgeKey"); !ok {
		t.Fatal("community member profile must store its selected representative badge")
	}
}

func TestMigration40CreatesDeduplicatedCommunityPostViews(t *testing.T) {
	items := migrationRegistry("test")
	if len(items) < 40 || items[39].version != 40 || items[39].apply == nil {
		t.Fatal("community post view migration 40 is missing")
	}
	if got := (model.CommunityPostViewRecord{}).TableName(); got != "community_post_views" {
		t.Fatalf("community post view table = %q", got)
	}
	for _, name := range []string{"QuestionID", "UserID"} {
		field, ok := reflect.TypeOf(model.CommunityPostViewRecord{}).FieldByName(name)
		if !ok || !strings.Contains(field.Tag.Get("gorm"), "primaryKey") {
			t.Fatalf("community post view %s must be part of the unique key", name)
		}
	}
}

func TestMigration41CreatesDefaultedTeamIdentityStatus(t *testing.T) {
	items := migrationRegistry("test")
	if len(items) < 41 || items[40].version != 41 || items[40].apply == nil {
		t.Fatal("team identity migration 41 is missing")
	}
	field, ok := reflect.TypeOf(model.User{}).FieldByName("TeamIdentityStatus")
	if !ok || !strings.Contains(field.Tag.Get("gorm"), "default:'community_member'") {
		t.Fatal("existing and newly registered accounts must default to unverified community members")
	}
}

func TestMigration45DropsObsoleteTeamIdentityHistory(t *testing.T) {
	items := migrationRegistry("test")
	if len(items) < 45 || items[44].version != 45 || items[44].apply == nil {
		t.Fatal("team identity history removal migration 45 is missing")
	}
	if got := (teamIdentityChangeV41{}).TableName(); got != "team_identity_changes" {
		t.Fatalf("historical migration table = %q", got)
	}
	field, ok := reflect.TypeOf(model.User{}).FieldByName("TeamIdentityStatus")
	if !ok || !strings.Contains(field.Tag.Get("gorm"), "column:team_identity_status") {
		t.Fatal("migration 45 must preserve the current identity status column")
	}

	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true})
	if err != nil {
		_ = sqlDB.Close()
		t.Fatalf("open GORM over SQL mock: %v", err)
	}
	t.Cleanup(func() {
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("unmet SQL expectation: %v", err)
		}
		_ = sqlDB.Close()
	})
	mock.ExpectExec("DROP TABLE IF EXISTS team_identity_changes").WillReturnResult(sqlmock.NewResult(0, 0))
	if err := items[44].apply(db); err != nil {
		t.Fatalf("apply migration 45: %v", err)
	}
}

func TestMigration42AddsIndependentCommunityFeaturedState(t *testing.T) {
	items := migrationRegistry("test")
	if len(items) < 42 || items[41].version != 42 || items[41].apply == nil {
		t.Fatal("community featured migration 42 is missing")
	}
	for _, modelType := range []reflect.Type{reflect.TypeOf(model.TrainingQuestion{}), reflect.TypeOf(model.TrainingQuestionPost{})} {
		field, ok := modelType.FieldByName("IsFeatured")
		if !ok || field.Type.Kind() != reflect.Bool || !strings.Contains(field.Tag.Get("gorm"), "column:is_featured") || !strings.Contains(field.Tag.Get("gorm"), "default:0") {
			t.Fatalf("%s must store an independent default-off featured state", modelType.Name())
		}
	}
}

func TestMigration43BackfillsExistingCustomAvatars(t *testing.T) {
	items := migrationRegistry("test")
	if len(items) < 43 || items[42].version != 43 || items[42].apply == nil {
		t.Fatal("community avatar reward migration 43 is missing")
	}
}

func TestMigration44AddsEmailPasswordResetState(t *testing.T) {
	items := migrationRegistry("test")
	if len(items) < 44 || items[43].version != 44 || items[43].apply == nil {
		t.Fatal("email password reset migration 44 is missing")
	}
	if _, ok := reflect.TypeOf(model.User{}).FieldByName("PasswordResetAt"); !ok {
		t.Fatal("password reset migration must persist the legacy JWT invalidation timestamp")
	}
	if _, ok := reflect.TypeOf(model.EmailCode{}).FieldByName("FailedAttempts"); !ok {
		t.Fatal("password reset migration must persist verification attempt limits")
	}
}

func TestAcceptanceDatabaseCommunityAvatarBackfillIsIdempotent(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TARSGO_QA_TEST_DSN"))
	if dsn == "" {
		t.Skip("TARSGO_QA_TEST_DSN is not set")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("refusing to run the community avatar backfill test outside the isolated local acceptance database")
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
	if !db.Migrator().HasTable(&model.CommunityExperienceEvent{}) {
		t.Fatal("community experience ledger is missing")
	}
	var role model.Role
	if err := db.Where("name = ?", model.RoleNameUser).Take(&role).Error; err != nil {
		t.Fatalf("load member role: %v", err)
	}
	nonce := fmt.Sprintf("%d", time.Now().UnixNano())
	avatarURL := "/upload/avatars/legacy-" + nonce + ".png"
	user := model.User{RoleID: role.ID, Name: "[TEST_QA] legacy-avatar", Email: "qa-avatar-" + nonce + "@tarsgo.test", AvatarURL: &avatarURL, Status: model.UserStatusEnabled}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create legacy avatar probe account: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Where("user_id = ?", user.ID).Delete(&model.CommunityExperienceEvent{}).Error; err != nil {
			t.Errorf("clean avatar reward probe: %v", err)
		}
		if err := db.Delete(&user).Error; err != nil {
			t.Errorf("clean avatar probe account: %v", err)
		}
	})
	if err := migrateCommunityAvatarExperienceBackfill(db); err != nil {
		t.Fatalf("apply avatar reward backfill: %v", err)
	}
	if err := migrateCommunityAvatarExperienceBackfill(db); err != nil {
		t.Fatalf("repeat avatar reward backfill: %v", err)
	}
	var events []model.CommunityExperienceEvent
	if err := db.Where("user_id = ? AND source_type = ?", user.ID, "avatar").Find(&events).Error; err != nil {
		t.Fatalf("read avatar reward events: %v", err)
	}
	if len(events) != 1 || events[0].Points != 20 || events[0].SourceKey != fmt.Sprintf("avatar:first:%d", user.ID) {
		t.Fatalf("avatar reward backfill = %#v, want one idempotent 20 XP event", events)
	}
}

func TestMigration35CreatesCoBuilderContributionSourceOfTruth(t *testing.T) {
	items := migrationRegistry("test")
	if len(items) < 35 || items[34].version != 35 || items[34].apply == nil {
		t.Fatal("co-builder contribution migration 35 is missing")
	}
	if got := (model.CoBuilderContribution{}).TableName(); got != "co_builder_contributions" {
		t.Fatalf("contribution table = %q", got)
	}
}

func TestAcceptanceDatabaseCanonicalNameMigrationNeverInfersFromLegacyValues(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TARSGO_QA_TEST_DSN"))
	if dsn == "" {
		t.Skip("TARSGO_QA_TEST_DSN is not set")
	}
	if !strings.Contains(dsn, "@tcp(127.0.0.1:3317)/tarsgo_acceptance?") {
		t.Fatal("refusing user-name migration verification outside the isolated local acceptance database")
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
	tableName := fmt.Sprintf("user_name_migration_probe_%d", time.Now().UnixNano())
	quotedTable := "`" + tableName + "`"
	if err := db.Exec("CREATE TABLE " + quotedTable + " (id BIGINT UNSIGNED NOT NULL PRIMARY KEY, real_name VARCHAR(100) NULL, nickname VARCHAR(100) NULL, updated_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").Error; err != nil {
		t.Fatalf("create user-name migration probe: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Exec("DROP TABLE IF EXISTS " + quotedTable).Error; err != nil {
			t.Errorf("drop user-name migration probe: %v", err)
		}
	})
	updatedAt := time.Date(2026, time.October, 20, 12, 0, 0, 0, time.UTC)
	if err := db.Exec("INSERT INTO "+quotedTable+" (id, real_name, nickname, updated_at) VALUES (1, '已有姓名', '不同昵称', ?), (2, '', '旧昵称', ?), (3, NULL, '  新姓名  ', ?), (4, '   ', '姓名四', ?), (5, NULL, NULL, ?), (6, NULL, '   ', ?)", updatedAt, updatedAt, updatedAt, updatedAt, updatedAt, updatedAt).Error; err != nil {
		t.Fatalf("seed user-name migration probe: %v", err)
	}
	items := migrationRegistry("test")
	if items[33].version != 34 || items[33].apply == nil {
		t.Fatal("historical migration 34 is missing")
	}
	if err := items[33].apply(db); err != nil {
		t.Fatalf("apply canonical-name migration: %v", err)
	}
	if err := items[33].apply(db); err != nil {
		t.Fatalf("repeat canonical-name migration: %v", err)
	}
	var rows []struct {
		ID        uint64
		RealName  *string
		Nickname  *string
		UpdatedAt time.Time
	}
	if err := db.Table(tableName).Select("id, real_name, nickname, updated_at").Order("id ASC").Find(&rows).Error; err != nil {
		t.Fatalf("read migrated users: %v", err)
	}
	wantNames := []*string{stringPointer("已有姓名"), stringPointer(""), nil, stringPointer("   "), nil, nil}
	if len(rows) != len(wantNames) {
		t.Fatalf("migrated %d users, want %d", len(rows), len(wantNames))
	}
	for index, row := range rows {
		if !equalOptionalString(row.RealName, wantNames[index]) {
			t.Errorf("user %d real_name = %v, want %v", row.ID, row.RealName, wantNames[index])
		}
		if row.UpdatedAt.UTC() != updatedAt {
			t.Errorf("user %d updated_at changed from migration: %s", row.ID, row.UpdatedAt)
		}
	}
	wantLegacyValues := []*string{stringPointer("不同昵称"), stringPointer("旧昵称"), stringPointer("  新姓名  "), stringPointer("姓名四"), nil, stringPointer("   ")}
	for index, row := range rows {
		if !equalOptionalString(row.Nickname, wantLegacyValues[index]) {
			t.Errorf("user %d legacy value changed by migration: %v", row.ID, row.Nickname)
		}
	}
}

func stringPointer(value string) *string { return &value }

func equalOptionalString(left, right *string) bool {
	if left == nil || right == nil {
		return left == right
	}
	return *left == *right
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