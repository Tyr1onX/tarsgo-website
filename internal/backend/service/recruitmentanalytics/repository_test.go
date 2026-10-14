package recruitmentanalytics

import (
	"context"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

func newMockGorm(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
	t.Helper()
	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sql mock: %v", err)
	}
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{DisableAutomaticPing: true})
	if err != nil {
		sqlDB.Close()
		t.Fatalf("open gorm over sql mock: %v", err)
	}
	t.Cleanup(func() {
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("unmet SQL expectations: %v", err)
		}
		sqlDB.Close()
	})
	return db, mock
}

func TestGormRepositoryUsesCohortScopedAggregateQueriesOnly(t *testing.T) {
	db, mock := newMockGorm(t)
	ctx := context.Background()
	formIDs := []uint64{4, 5}
	created := time.Date(2026, 9, 16, 0, 0, 0, 0, time.UTC)

	mock.ExpectQuery(regexp.QuoteMeta("SELECT id, title, created_at FROM `registration_forms` WHERE status <> ? OR EXISTS (SELECT 1 FROM registrations WHERE registrations.form_id = registration_forms.id) ORDER BY created_at ASC, id ASC")).
		WithArgs(uint8(statusDraft)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "title", "created_at"}).AddRow(4, "赛季纳新", created))
	forms, err := (gormRepository{db: db}).ListCohorts(ctx)
	if err != nil || len(forms) != 1 || forms[0].ID != 4 || forms[0].Title != "赛季纳新" {
		t.Fatalf("unexpected cohort rows: %#v, error=%v", forms, err)
	}

	mock.ExpectQuery("(?s)SELECT form_id, COUNT\\(\\*\\) AS total, .*AS pending FROM `registrations` WHERE form_id IN \\(\\?,\\?\\) GROUP BY .form_id.").
		WithArgs(statusAdmitted, statusRejected, statusWithdrawn, statusPendingScreening, statusPendingInterview, uint64(4), uint64(5)).
		WillReturnRows(sqlmock.NewRows([]string{"form_id", "total", "admitted", "rejected", "withdrawn", "pending"}).AddRow(4, 3, 1, 1, 0, 1))
	stats, err := (gormRepository{db: db}).RegistrationAggregates(ctx, formIDs)
	if err != nil || len(stats) != 1 || stats[0].Total != 3 || stats[0].Admitted != 1 || stats[0].Pending != 1 {
		t.Fatalf("unexpected registration aggregates: %#v, error=%v", stats, err)
	}

	groupPattern := "(?s)SELECT intents.form_id, COALESCE\\(NULLIF\\(user_groups.name, ''\\), \\?\\) AS name, COUNT\\(DISTINCT intents.registration_id\\) AS count FROM \\(SELECT form_id, id AS registration_id, group_1 AS group_id FROM registrations WHERE form_id IN \\(\\?,\\?\\) AND group_1 IS NOT NULL UNION SELECT form_id, id AS registration_id, group_2 AS group_id FROM registrations WHERE form_id IN \\(\\?,\\?\\) AND group_2 IS NOT NULL UNION SELECT form_id, id AS registration_id, preferred_group_id AS group_id FROM registrations WHERE form_id IN \\(\\?,\\?\\) AND preferred_group_id IS NOT NULL AND group_1 IS NULL AND group_2 IS NULL\\) AS intents LEFT JOIN user_groups ON user_groups.id = intents.group_id GROUP BY intents.form_id, user_groups.name ORDER BY intents.form_id, name"
	mock.ExpectQuery(groupPattern).
		WithArgs("历史组别（名称不可恢复）", uint64(4), uint64(5), uint64(4), uint64(5), uint64(4), uint64(5)).
		WillReturnRows(sqlmock.NewRows([]string{"form_id", "name", "count"}).AddRow(4, "机械组", 2))
	groups, err := (gormRepository{db: db}).GroupAggregates(ctx, formIDs)
	if err != nil || len(groups) != 1 || groups[0].Name != "机械组" || groups[0].Count != 2 {
		t.Fatalf("unexpected group aggregates: %#v, error=%v", groups, err)
	}

	mock.ExpectQuery("(?s)SELECT r.form_id, COUNT\\(DISTINCT r.id\\) AS count FROM registrations AS r JOIN user_group_members AS members ON .*r.form_id IN \\(\\?,\\?\\) AND r.recruitment_status = \\? GROUP BY .*form_id.*").
		WithArgs(uint64(4), uint64(5), statusAdmitted).
		WillReturnRows(sqlmock.NewRows([]string{"form_id", "count"}).AddRow(4, 1))
	members, err := (gormRepository{db: db}).MatchedFormalMembers(ctx, formIDs)
	if err != nil || len(members) != 1 || members[0].Count != 1 {
		t.Fatalf("unexpected matched member aggregates: %#v, error=%v", members, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("aggregate query expectations were not met: %v", err)
	}
}

func TestGroupIntentQueryCountsLegacyChoicesAndCanonicalPreferenceWithoutDoubleCounting(t *testing.T) {
	db, mock := newMockGorm(t)
	formIDs := []uint64{7}
	pattern := "(?s)SELECT intents.form_id, COALESCE\\(NULLIF\\(user_groups.name, ''\\), \\?\\) AS name, COUNT\\(DISTINCT intents.registration_id\\).*group_1.*group_2.*preferred_group_id.*group_1 IS NULL AND group_2 IS NULL.*"
	mock.ExpectQuery(pattern).
		WithArgs("历史组别（名称不可恢复）", uint64(7), uint64(7), uint64(7)).
		WillReturnRows(sqlmock.NewRows([]string{"form_id", "name", "count"}))
	if _, err := (gormRepository{db: db}).GroupAggregates(context.Background(), formIDs); err != nil {
		t.Fatalf("group-intention query returned error: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("group-intention expectations were not met: %v", err)
	}
}
