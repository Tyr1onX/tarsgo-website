package assignment

import (
	"bytes"
	"context"
	"encoding/base64"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"tarsgo-backend/model"
)

const testReviewImageToken = "abcdefghijklmnop"

func reviewImageHeader(t *testing.T, filename string, content []byte) *multipart.FileHeader {
	t.Helper()
	body := new(bytes.Buffer)
	writer := multipart.NewWriter(body)
	file, err := writer.CreateFormFile("files", filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body.Bytes()))
	request.Header.Set("Content-Type", writer.FormDataContentType())
	if err := request.ParseMultipartForm(1 << 20); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = request.MultipartForm.RemoveAll() })
	return request.MultipartForm.File["files"][0]
}

func TestReviewImagesRequireBoundValidImageFiles(t *testing.T) {
	data, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9cZszUUAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	file := reviewImageHeader(t, "screenshot.png", data)
	comment := "请核对这里：![截图](community-upload://" + testReviewImageToken + ")"
	uploads, err := validateReviewImages(comment, []*multipart.FileHeader{file}, []string{testReviewImageToken})
	if err != nil || len(uploads) != 1 || uploads[0].file.contentType != "image/png" {
		t.Fatalf("valid image rejected: uploads=%#v err=%v", uploads, err)
	}
	cases := []struct {
		name    string
		comment string
		files   []*multipart.FileHeader
		tokens  []string
	}{
		{"missing image", comment, nil, nil},
		{"unknown reference", comment, []*multipart.FileHeader{file}, []string{"qrstuvwxyzABCDEF"}},
		{"not embedded", "图片 community-upload://" + testReviewImageToken, []*multipart.FileHeader{file}, []string{testReviewImageToken}},
		{"duplicate token", comment + comment, []*multipart.FileHeader{file}, []string{testReviewImageToken}},
		{"raw blob", "![图片](blob:local)", nil, nil},
		{"raw data", "![图片](data:image/png;base64,aaaa)", nil, nil},
		{"bad extension", comment, []*multipart.FileHeader{reviewImageHeader(t, "screenshot.txt", data)}, []string{testReviewImageToken}},
		{"spoofed mime", comment, []*multipart.FileHeader{reviewImageHeader(t, "screenshot.png", []byte("not an image"))}, []string{testReviewImageToken}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := validateReviewImages(tc.comment, tc.files, tc.tokens); err == nil {
				t.Fatal("invalid image binding accepted")
			}
		})
	}
	if images, err := validateReviewImages("普通文字评语", nil, nil); err != nil || len(images) != 0 {
		t.Fatalf("plain text review failed: %v", err)
	}
}

func TestReviewImageIsPrivateToSubmissionOwner(t *testing.T) {
	db, mock := newAssignmentMockGorm(t)
	mock.ExpectQuery("FROM `assignment_review_images`").WithArgs(uint64(55), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "review_id", "submission_id", "storage_path", "content_type"}).
			AddRow(55, 15, 81, "test.png", "image/png"))
	mock.ExpectQuery("FROM `assignment_submissions`").WithArgs(uint64(81), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "assignment_id", "user_id"}).
			AddRow(81, 91, 22))
	mock.ExpectQuery("FROM `assignments`").WithArgs(uint64(91), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "group_id"}).
			AddRow(91, 41))
	_, err := (&Service{db: db}).OpenReviewImage(context.Background(), Actor{ID: 23, RoleName: model.RoleNameUser}, 55)
	assertAssignmentStatus(t, err, http.StatusForbidden)
}
