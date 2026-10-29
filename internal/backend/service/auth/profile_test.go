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

	"github.com/DATA-DOG/go-sqlmock"

	"tarsgo-backend/model"
)

func TestUpdateProfileOnlyWritesEditableFields(t *testing.T) {
	db, mock := newAuthSQLMock(t)
	service := &Service{db: db}
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `users` WHERE `users`.`id` = ? ORDER BY `users`.`id` LIMIT ?")).
		WithArgs(uint64(7), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "role_id", "email", "real_name", "status"}).
			AddRow(uint64(7), uint64(3), "member@example.test", "张三", model.UserStatusEnabled))
	mock.ExpectQuery("SELECT \\* FROM `roles` WHERE `roles`.`id` = \\?").
		WithArgs(uint64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "display_name"}).
			AddRow(uint64(3), model.RoleNameUser, "成员"))
	mock.ExpectBegin()
	mock.ExpectExec("UPDATE `users` SET `nickname`=\\?,`phone`=\\?,`updated_at`=\\? WHERE id = \\? AND status = \\?").
		WithArgs("新昵称", "13900139000", sqlmock.AnyArg(), uint64(7), model.UserStatusEnabled).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	updated, err := service.UpdateProfile(context.Background(), 7, ProfileInput{
		Nickname: " 新昵称 ", Phone: "13900139000",
	})
	if err != nil {
		t.Fatalf("update profile: %v", err)
	}
	if updated.ID != 7 || updated.Nickname == nil || *updated.Nickname != "新昵称" ||
		updated.Phone == nil || *updated.Phone != "13900139000" ||
		updated.RealName == nil || *updated.RealName != "张三" ||
		updated.Email != "member@example.test" || updated.Role.Name != model.RoleNameUser {
		t.Fatalf("unexpected profile: %#v", updated)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestUpdateProfileRejectsInvalidInputsBeforeDatabaseAccess(t *testing.T) {
	service := &Service{}
	for _, input := range []ProfileInput{
		{Nickname: strings.Repeat("中", 101), Phone: "13900139000"},
		{Nickname: "a\nb", Phone: "13900139000"},
		{Nickname: "valid", Phone: "12345"},
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
