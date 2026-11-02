package auth

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"

	"tarsgo-backend/model"
)

func TestUpdateProfileAllowsSuperAdminToChangeCanonicalName(t *testing.T) {
	db, mock := newAuthSQLMock(t)
	service := &Service{db: db}
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `users` WHERE `users`.`id` = ? ORDER BY `users`.`id` LIMIT ?")).
		WithArgs(uint64(7), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "role_id", "email", "real_name", "status"}).
			AddRow(uint64(7), uint64(3), "admin@example.test", "张三", model.UserStatusEnabled))
	mock.ExpectQuery("SELECT \\* FROM `roles` WHERE `roles`.`id` = \\?").
		WithArgs(uint64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "display_name"}).
			AddRow(uint64(3), model.RoleNameSuperAdmin, "超级管理员"))
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT \\* FROM `users` WHERE id = \\? AND status = \\? LIMIT \\? FOR UPDATE").
		WithArgs(uint64(7), model.UserStatusEnabled, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "role_id", "status", "avatar_url"}).
			AddRow(uint64(7), uint64(3), model.UserStatusEnabled, nil))
	mock.ExpectExec("UPDATE `users` SET `phone`=\\?,`real_name`=\\?,`updated_at`=\\? WHERE id = \\? AND status = \\?").
		WithArgs("13900139000", "李四", sqlmock.AnyArg(), uint64(7), model.UserStatusEnabled).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	updated, err := service.UpdateProfile(context.Background(), 7, ProfileInput{
		RealName: "李四",
		Phone:    "13900139000",
	})
	if err != nil {
		t.Fatalf("update profile: %v", err)
	}
	if updated.ID != 7 || updated.Phone == nil || *updated.Phone != "13900139000" ||
		updated.RealName == nil || *updated.RealName != "李四" ||
		updated.Email != "admin@example.test" || updated.Role.Name != model.RoleNameSuperAdmin {
		t.Fatalf("unexpected profile: %#v", updated)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestUpdateProfileAwardsFirstCustomAvatarOnlyOnce(t *testing.T) {
	t.Chdir(t.TempDir())
	db, mock := newAuthSQLMock(t)
	service := &Service{db: db}
	service.now = func() time.Time { return time.Date(2026, time.November, 2, 3, 0, 0, 0, time.UTC) }

	expectProfileAvatarLoad(mock, nil)
	expectProfileAvatarLock(mock, nil)
	mock.ExpectExec("UPDATE `users`").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO `community_experience_events`").WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	first, err := service.UpdateProfile(context.Background(), 7, ProfileInput{RealName: "张三", Avatar: profileAvatarFile(t)})
	if err != nil || first.AvatarURL == nil || !strings.HasPrefix(*first.AvatarURL, avatarURLPrefix) {
		t.Fatalf("first custom avatar upload failed: profile=%#v err=%v", first, err)
	}
	firstAvatarURL := *first.AvatarURL

	expectProfileAvatarLoad(mock, &firstAvatarURL)
	expectProfileAvatarLock(mock, &firstAvatarURL)
	mock.ExpectExec("UPDATE `users`").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO `community_experience_events`").WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectCommit()

	second, err := service.UpdateProfile(context.Background(), 7, ProfileInput{RealName: "张三", Avatar: profileAvatarFile(t)})
	if err != nil || second.AvatarURL == nil || *second.AvatarURL == firstAvatarURL {
		t.Fatalf("replacing a custom avatar failed: profile=%#v err=%v", second, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestUpdateProfileRejectsInvalidInputsBeforeDatabaseAccess(t *testing.T) {
	service := &Service{}
	for _, input := range []ProfileInput{
		{RealName: "李四", Phone: "12345"},
		{RealName: " "},
		{RealName: "LiSi"},
		{RealName: "李 A"},
		{RealName: strings.Repeat("李", 101)},
	} {
		_, err := service.UpdateProfile(context.Background(), 7, input)
		if serviceErr, ok := err.(*ServiceError); !ok || serviceErr.Status != http.StatusBadRequest {
			t.Fatalf("expected validation rejection for %#v, got %v", input, err)
		}
	}
}

func TestReadProfileAvatarValidatesImageContentsAndSize(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 1, 1))
	img.Set(0, 0, color.NRGBA{R: 255, A: 255})
	var pngBytes bytes.Buffer
	if err := png.Encode(&pngBytes, img); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name      string
		data      []byte
		wantError bool
	}{
		{name: "valid image", data: pngBytes.Bytes()},
		{name: "invalid image", data: []byte("not an image"), wantError: true},
		{name: "truncated image", data: pngBytes.Bytes()[:16], wantError: true},
		{name: "too large", data: make([]byte, maxAvatarBytes+1), wantError: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var body bytes.Buffer
			writer := multipart.NewWriter(&body)
			part, err := writer.CreateFormFile("avatar", "avatar.png")
			if err != nil {
				t.Fatal(err)
			}
			if _, err := part.Write(tc.data); err != nil {
				t.Fatal(err)
			}
			if err := writer.Close(); err != nil {
				t.Fatal(err)
			}
			request := httptest.NewRequest(http.MethodPost, "/", &body)
			request.Header.Set("Content-Type", writer.FormDataContentType())
			if err := request.ParseMultipartForm(2 << 20); err != nil {
				t.Fatal(err)
			}
			defer request.MultipartForm.RemoveAll()
			_, extension, err := readProfileAvatar(request.MultipartForm.File["avatar"][0])
			if tc.wantError && err == nil || !tc.wantError && (err != nil || extension != "png") {
				t.Fatalf("extension=%q error=%v", extension, err)
			}
		})
	}
}

func expectProfileAvatarLoad(mock sqlmock.Sqlmock, avatarURL *string) {
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `users` WHERE `users`.`id` = ? ORDER BY `users`.`id` LIMIT ?")).
		WithArgs(uint64(7), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "role_id", "email", "real_name", "status", "avatar_url"}).AddRow(
			uint64(7), uint64(3), "member@example.test", "张三", model.UserStatusEnabled, avatarURL,
		))
	mock.ExpectQuery("SELECT \\* FROM `roles` WHERE `roles`.`id` = \\?").
		WithArgs(uint64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "display_name"}).AddRow(uint64(3), model.RoleNameUser, "普通用户"))
}

func expectProfileAvatarLock(mock sqlmock.Sqlmock, avatarURL *string) {
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT \\* FROM `users` WHERE id = \\? AND status = \\? LIMIT \\? FOR UPDATE").
		WithArgs(uint64(7), model.UserStatusEnabled, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "role_id", "status", "avatar_url"}).AddRow(
			uint64(7), uint64(3), model.UserStatusEnabled, avatarURL,
		))
}

func profileAvatarFile(t *testing.T) *multipart.FileHeader {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, 1, 1))
	img.Set(0, 0, color.NRGBA{R: 80, G: 120, B: 200, A: 255})
	var imageBytes bytes.Buffer
	if err := png.Encode(&imageBytes, img); err != nil {
		t.Fatal(err)
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("avatar", "avatar.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(imageBytes.Bytes()); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	if err := request.ParseMultipartForm(2 << 20); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = request.MultipartForm.RemoveAll() })
	return request.MultipartForm.File["avatar"][0]
}
