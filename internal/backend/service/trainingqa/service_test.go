package trainingqa

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/model"
)

func newQuestionMockGorm(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
	t.Helper()
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
			t.Errorf("unmet SQL expectations: %v", err)
		}
		_ = sqlDB.Close()
	})
	return db, mock
}

func expectMemberGroups(mock sqlmock.Sqlmock, userID uint64, ids ...uint64) {
	pattern := `(?s)SELECT ` + regexp.QuoteMeta("`user_group_members`.`group_id`") + ` FROM ` + regexp.QuoteMeta("`user_group_members`") + ` JOIN user_groups ON .* JOIN users ON .*WHERE user_group_members\.user_id = \? AND user_groups\.name IN \(\?,\?,\?,\?\) AND user_groups\.status = \? AND users\.status = \?.*ORDER BY user_group_members\.group_id ASC`
	rows := sqlmock.NewRows([]string{"group_id"})
	for _, id := range ids {
		rows.AddRow(id)
	}
	mock.ExpectQuery(pattern).WithArgs(userID, technicalGroups[0], technicalGroups[1], technicalGroups[2], technicalGroups[3], model.UserGroupStatusActive, model.UserStatusEnabled).WillReturnRows(rows)
}

func TestTechnicalMembersCannotUseOperationsOrUnassignedGroup(t *testing.T) {
	db, mock := newQuestionMockGorm(t)
	expectMemberGroups(mock, 40)
	service := &Service{db: db}
	_, err := service.ListMember(context.Background(), Actor{ID: 40, RoleName: model.RoleNameUser}, ListFilter{GroupID: 9})
	assertQuestionStatus(t, err, http.StatusForbidden)
}

func TestRegularAdminCannotManageAnotherTechnicalGroup(t *testing.T) {
	db, mock := newQuestionMockGorm(t)
	expectMemberGroups(mock, 8, 41)
	service := &Service{db: db}
	_, err := service.ListAdmin(context.Background(), Actor{ID: 8, RoleName: model.RoleNameAdmin}, ListFilter{GroupID: 42})
	assertQuestionStatus(t, err, http.StatusForbidden)
}

func TestSuperAdminCanManageTechnicalGroupsWithoutMembership(t *testing.T) {
	db, mock := newQuestionMockGorm(t)
	pattern := `(?s)SELECT ` + regexp.QuoteMeta("`id`") + ` FROM ` + regexp.QuoteMeta("`user_groups`") + ` WHERE name IN \(\?,\?,\?,\?\) AND status = \? ORDER BY id ASC`
	rows := sqlmock.NewRows([]string{"id"}).AddRow(2).AddRow(4).AddRow(7).AddRow(9)
	mock.ExpectQuery(pattern).WithArgs(technicalGroups[0], technicalGroups[1], technicalGroups[2], technicalGroups[3], model.UserGroupStatusActive).WillReturnRows(rows)
	service := &Service{db: db}
	if err := service.requireManagerGroup(context.Background(), Actor{ID: 1, RoleName: model.RoleNameSuperAdmin}, 7); err != nil {
		t.Fatalf("super-admin could not manage a technical group without membership: %v", err)
	}
}

func TestPrivateQuestionIsVisibleOnlyToItsAskerOrGroupAdmin(t *testing.T) {
	question := &model.TrainingQuestion{ID: 9, GroupID: 41, AskerID: 20, Visibility: model.TrainingQuestionPrivate}
	db, mock := newQuestionMockGorm(t)
	service := &Service{db: db}
	if err := service.requireVisible(context.Background(), Actor{ID: 20, RoleName: model.RoleNameUser}, question); err != nil {
		t.Fatalf("private question asker was denied: %v", err)
	}
	expectMemberGroups(mock, 21, 41)
	assertQuestionStatus(t, service.requireVisible(context.Background(), Actor{ID: 21, RoleName: model.RoleNameUser}, question), http.StatusNotFound)
	expectMemberGroups(mock, 22, 42)
	assertQuestionStatus(t, service.requireVisible(context.Background(), Actor{ID: 22, RoleName: model.RoleNameAdmin}, question), http.StatusNotFound)
	expectMemberGroups(mock, 23, 41)
	if err := service.requireVisible(context.Background(), Actor{ID: 23, RoleName: model.RoleNameAdmin}, question); err != nil {
		t.Fatalf("same-group admin was denied private question: %v", err)
	}
}

func TestMemberQuestionSearchIsGroupScopedAndHidesOthersPrivateQuestions(t *testing.T) {
	db, mock := newQuestionMockGorm(t)
	expectMemberGroups(mock, 50, 41)
	listPattern := `(?s)SELECT training_questions\..*WHERE.*training_questions\.group_id.*training_questions\.visibility.*training_questions\.asker_id.*training_questions\.title LIKE.*training_question_posts\.body LIKE`
	columns := []string{
		"id", "group_id", "asker_id", "title", "body", "visibility", "is_solved", "solved_by", "solved_at", "is_faq",
		"faq_by", "faq_at", "last_reply_at", "created_at", "updated_at", "group_name", "asker_name", "post_count",
	}
	mock.ExpectQuery(listPattern).WillReturnRows(sqlmock.NewRows(columns))
	service := &Service{db: db}
	items, err := service.ListMember(context.Background(), Actor{ID: 50, RoleName: model.RoleNameUser}, ListFilter{GroupID: 41, Keyword: "串口"})
	if err != nil {
		t.Fatalf("list questions: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("empty search result returned %d items", len(items))
	}
}

func TestOpenFileRejectsCrossGroupBeforeReadingPrivateStorage(t *testing.T) {
	db, mock := newQuestionMockGorm(t)
	mock.ExpectQuery(`(?s)SELECT \* FROM `+regexp.QuoteMeta("`training_question_attachments`")+` WHERE .*id`+regexp.QuoteMeta("`")+` = \? ORDER BY .* LIMIT \?`).
		WithArgs(uint64(7), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "question_id", "post_id", "uploader_id", "file_name", "storage_path", "content_type", "size", "created_at"}).
			AddRow(7, 9, nil, 20, "error.png", "41/9/private.png", "image/png", 100, time.Date(2026, 10, 20, 9, 0, 0, 0, time.UTC)))
	mock.ExpectQuery(`(?s)SELECT \* FROM `+regexp.QuoteMeta("`training_questions`")+` WHERE .*id`+regexp.QuoteMeta("`")+` = \? ORDER BY .* LIMIT \?`).
		WithArgs(uint64(9), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "group_id", "asker_id", "title", "body", "visibility", "is_solved", "solved_by", "solved_at", "is_faq", "faq_by", "faq_at", "last_reply_at", "created_at", "updated_at"}).
			AddRow(9, 41, 20, "私人问题", "正文", model.TrainingQuestionPrivate, false, nil, nil, false, nil, nil, nil, time.Date(2026, 10, 20, 9, 0, 0, 0, time.UTC), time.Date(2026, 10, 20, 9, 0, 0, 0, time.UTC)))
	expectMemberGroups(mock, 21, 42)
	root := t.TempDir()
	store, err := newQuestionFileStore(root)
	if err != nil {
		t.Fatal(err)
	}
	service := &Service{db: db, files: store}
	_, err = service.OpenFile(context.Background(), Actor{ID: 21, RoleName: model.RoleNameUser}, 7)
	assertQuestionStatus(t, err, http.StatusNotFound)
}

func assertQuestionStatus(t *testing.T, err error, status int) {
	t.Helper()
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) || serviceErr.Status != status {
		t.Fatalf("service error = %v, want HTTP %d", err, status)
	}
}
