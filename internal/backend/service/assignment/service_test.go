package assignment

import (
	"bytes"
	"context"
	"errors"
	"mime/multipart"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/model"
)

func newAssignmentMockGorm(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
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

func expectTechnicalGroupIDs(mock sqlmock.Sqlmock, userID uint64, ids ...uint64) {
	pattern := "(?s)SELECT `user_group_members`.`group_id` FROM `user_group_members` JOIN user_groups ON .* JOIN users ON .*WHERE user_group_members\\.user_id = \\? AND user_groups\\.name IN \\(\\?,\\?,\\?,\\?\\) AND user_groups\\.status = \\? AND users\\.status = \\?.*ORDER BY user_group_members\\.group_id ASC"
	rows := sqlmock.NewRows([]string{"group_id"})
	for _, id := range ids {
		rows.AddRow(id)
	}
	mock.ExpectQuery(pattern).WithArgs(userID, groupMechanical, groupEmbedded, groupVision, groupAI, model.UserGroupStatusActive, model.UserStatusEnabled).WillReturnRows(rows)
}

func TestListMineRejectsAccountsWithoutTechnicalGroup(t *testing.T) {
	db, mock := newAssignmentMockGorm(t)
	expectTechnicalGroupIDs(mock, 22)
	service := &Service{db: db, now: func() time.Time { return time.Date(2026, 10, 19, 0, 0, 0, 0, time.UTC) }}
	_, err := service.ListMine(context.Background(), Actor{ID: 22, RoleName: model.RoleNameUser})
	assertAssignmentStatus(t, err, 403)
}

func TestAdminCannotManageAnotherTechnicalGroup(t *testing.T) {
	db, mock := newAssignmentMockGorm(t)
	mock.ExpectBegin()
	expectTechnicalGroupIDs(mock, 8, 41)
	mock.ExpectRollback()
	service := &Service{db: db, now: time.Now}
	_, err := service.Create(context.Background(), Actor{ID: 8, RoleName: model.RoleNameAdmin}, CreateInput{
		GroupID: 42, Title: "测试作业", Description: "说明", DueAt: time.Now().Add(time.Hour), IsGroupWide: true,
	})
	assertAssignmentStatus(t, err, 403)
}

func TestOrdinaryMemberCannotUseAdminAssignmentManagement(t *testing.T) {
	service := &Service{}
	_, err := service.ListAdmin(context.Background(), Actor{ID: 9, RoleName: model.RoleNameUser}, 0)
	assertAssignmentStatus(t, err, 403)
	_, err = service.Review(context.Background(), Actor{ID: 9, RoleName: model.RoleNameUser}, 1, ReviewInput{Score: 100, Decision: model.AssignmentReviewPassed})
	assertAssignmentStatus(t, err, 403)
}

func TestGroupAdminCannotDownloadAnotherGroupsSubmissionFile(t *testing.T) {
	db, mock := newAssignmentMockGorm(t)
	created := time.Date(2026, 10, 19, 10, 0, 0, 0, time.UTC)
	mock.ExpectQuery("(?s)SELECT \\* FROM `assignment_submission_files` WHERE .*id` = \\? ORDER BY.*LIMIT \\?").
		WithArgs(uint64(71), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "submission_id", "file_name", "storage_path", "content_type", "size", "created_at"}).
			AddRow(71, 81, "答案.pdf", "81/22/key.pdf", "application/pdf", 15, created))
	mock.ExpectQuery("(?s)SELECT \\* FROM `assignment_submissions` WHERE .*id` = \\? ORDER BY.*LIMIT \\?").
		WithArgs(uint64(81), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "assignment_id", "user_id", "attempt", "submitted_at", "is_late", "created_at"}).
			AddRow(81, 91, 22, 1, created, false, created))
	mock.ExpectQuery("(?s)SELECT \\* FROM `assignments` WHERE .*id` = \\? ORDER BY.*LIMIT \\?").
		WithArgs(uint64(91), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "group_id", "creator_id", "title", "description", "due_at", "attachment_requirements", "is_group_wide", "created_at", "updated_at"}).
			AddRow(91, 42, 8, "作业", "说明", created.Add(time.Hour), "", true, created, created))
	expectTechnicalGroupIDs(mock, 8, 41)
	service := &Service{db: db}
	_, err := service.OpenFile(context.Background(), Actor{ID: 8, RoleName: model.RoleNameAdmin}, 71)
	assertAssignmentStatus(t, err, 403)
}

func TestCreateInputUsesShanghaiDeadlineAndRejectsPastTime(t *testing.T) {
	location := time.FixedZone("Asia/Shanghai", 8*60*60)
	now := time.Date(2026, 10, 19, 12, 0, 0, 0, location)
	input, err := normalizeCreateInput(CreateInput{
		GroupID: 1, Title: "作业", Description: "说明", DueAt: time.Date(2026, 10, 20, 18, 30, 0, 0, location), IsGroupWide: true,
	}, now)
	if err != nil {
		t.Fatalf("normalize valid input: %v", err)
	}
	if input.DueAt.Location().String() != "Asia/Shanghai" || input.DueAt.Hour() != 18 || input.DueAt.Minute() != 30 {
		t.Fatalf("deadline was not kept in Shanghai time: %s", input.DueAt)
	}
	if _, err := normalizeCreateInput(CreateInput{GroupID: 1, Title: "作业", Description: "说明", DueAt: now.Add(-time.Minute), IsGroupWide: true}, now); err == nil {
		t.Fatal("past deadline was accepted")
	}
}

func TestAssignmentStateKeepsSubmissionAndReviewOutcomesDistinct(t *testing.T) {
	now := time.Date(2026, 10, 19, 12, 0, 0, 0, time.UTC)
	dueAt := now.Add(-time.Hour)
	if got := memberStatus(nil, dueAt, now); got != "overdue" {
		t.Fatalf("unsubmitted past-due status = %q", got)
	}
	if got := memberStatus(nil, now.Add(time.Hour), now); got != "pending" {
		t.Fatalf("unsubmitted future status = %q", got)
	}
	history := []SubmissionView{{ID: 1, Status: "submitted", IsLate: true}}
	if got := memberStatus(history, dueAt, now); got != "submitted" {
		t.Fatalf("unreviewed submission status = %q", got)
	}
	history[0].Status = "graded"
	history[0].Decision = model.AssignmentReviewPassed
	if got := memberStatus(history, dueAt, now); got != model.AssignmentReviewPassed {
		t.Fatalf("passed status = %q", got)
	}
	history[0].Decision = model.AssignmentReviewNeedsRedo
	if got := memberStatus(history, dueAt, now); got != model.AssignmentReviewNeedsRedo {
		t.Fatalf("redo status = %q", got)
	}
}

func TestValidateUploadsAcceptsPDFAndOfficeArchiveAndRejectsMismatchedContent(t *testing.T) {
	pdf := multipartHeader(t, "作业.pdf", []byte("%PDF-1.7\ncontent"))
	docx := multipartHeader(t, "报告.docx", []byte{'P', 'K', 3, 4, 0, 0, 0, 0})
	valid, err := validateUploads([]*multipart.FileHeader{pdf, docx})
	if err != nil || len(valid) != 2 || valid[0].fileName != "作业.pdf" {
		t.Fatalf("valid documents rejected: %#v, %v", valid, err)
	}
	if _, err := validateUploads([]*multipart.FileHeader{multipartHeader(t, "payload.pdf", []byte("#!/bin/sh\necho no"))}); err == nil {
		t.Fatal("extension/signature mismatch was accepted")
	}
	if _, err := validateUploads(make([]*multipart.FileHeader, maxAssignmentFiles+1)); err == nil {
		t.Fatal("too many attachments were accepted")
	}
}

func TestFileStoreKeepsFilesInsidePrivateRootAndUsesOpaqueNames(t *testing.T) {
	root := t.TempDir()
	store, err := newAssignmentFileStore(root)
	if err != nil {
		t.Fatal(err)
	}
	header := multipartHeader(t, "../../资料.pdf", []byte("%PDF-1.7\nfile"))
	validated, err := validateUploads([]*multipart.FileHeader{header})
	if err != nil {
		t.Fatal(err)
	}
	saved, err := store.save(context.Background(), 12, 22, validated[0], time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if saved.fileName != "资料.pdf" || saved.storagePath == "../资料.pdf" || saved.storagePath == "12/22/资料.pdf" {
		t.Fatalf("unsafe storage metadata: %#v", saved)
	}
	content, err := store.open(saved.storagePath)
	if err != nil || !bytes.Equal(content, []byte("%PDF-1.7\nfile")) {
		t.Fatalf("saved attachment not readable: %q, %v", content, err)
	}
	if _, err := store.resolve("../../outside"); err == nil {
		t.Fatal("path traversal escaped the assignment upload root")
	}
}

func TestReadStoredUTCWallPreservesBeijingDeadlineInstant(t *testing.T) {
	beijing := time.FixedZone("Asia/Shanghai", 8*60*60)
	want := time.Date(2026, 10, 20, 18, 30, 0, 0, beijing)
	stored := storeUTCWall(want)
	got := readStoredUTCWall(stored)
	if !got.Equal(want) || got.Format(time.RFC3339) != "2026-10-20T10:30:00Z" {
		t.Fatalf("UTC wall conversion = %s, want %s", got, want)
	}
}

func TestTechnicalMembershipQueryOnlyAcceptsFourTechnologyGroups(t *testing.T) {
	db, mock := newAssignmentMockGorm(t)
	expectTechnicalGroupIDs(mock, 14, 3)
	ids, err := technicalGroupIDs(db, 14)
	if err != nil || len(ids) != 1 || ids[0] != 3 {
		t.Fatalf("unexpected technical groups: %#v, %v", ids, err)
	}
	if len(technicalGroupNames) != 4 || technicalGroupNames[0] != "机械组" || technicalGroupNames[1] != "电控组" || technicalGroupNames[2] != "视觉组" || technicalGroupNames[3] != "AI组" {
		t.Fatalf("unexpected technical group allowlist: %#v", technicalGroupNames)
	}
}

func multipartHeader(t *testing.T, filename string, content []byte) *multipart.FileHeader {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("files", filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest("POST", "/", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	if err := request.ParseMultipartForm(1024); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if request.MultipartForm != nil {
			_ = request.MultipartForm.RemoveAll()
		}
	})
	return request.MultipartForm.File["files"][0]
}

func assertAssignmentStatus(t *testing.T, err error, status int) {
	t.Helper()
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) || serviceErr.Status != status {
		t.Fatalf("error = %v, want service status %d", err, status)
	}
}
