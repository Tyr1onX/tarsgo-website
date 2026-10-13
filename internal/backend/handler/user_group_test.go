package handler

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"testing"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/model"
	"tarsgo-backend/service/auth"
	"tarsgo-backend/service/usergroup"
)

func TestUserGroupHandlerCreateGroup_JSON(t *testing.T) {
	service := &stubUserGroupService{
		createFn: func(_ context.Context, actor usergroup.Actor, input usergroup.CreateGroupInput) (*usergroup.GroupDetail, error) {
			if actor.RoleName != model.RoleNameAdmin {
				t.Fatalf("expected admin actor, got %q", actor.RoleName)
			}
			if input.Logo != nil {
				t.Fatalf("expected json create not to include logo")
			}
			if input.Name != "视觉组" {
				t.Fatalf("expected name 视觉组, got %q", input.Name)
			}
			return &usergroup.GroupDetail{ID: 7, Name: input.Name}, nil
		},
	}
	handler := NewUserGroupHandler(service)

	recorder, ctx := newJSONContext(t, http.MethodPost, "/api/admin/user-groups", map[string]any{
		"name":        "视觉组",
		"description": "图像相关",
		"tags":        []string{"图像", "感知"},
		"isDefault":   false,
		"show":        1,
		"status":      1,
	})
	setAdminSessionUser(ctx)

	handler.CreateGroup(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}
}

func TestUserGroupHandlerUpdateGroup_Multipart(t *testing.T) {
	service := &stubUserGroupService{
		updateFn: func(_ context.Context, actor usergroup.Actor, groupID uint64, input usergroup.UpdateGroupInput) (*usergroup.GroupDetail, error) {
			if actor.RoleName != model.RoleNameAdmin {
				t.Fatalf("expected admin actor, got %q", actor.RoleName)
			}
			if groupID != 9 {
				t.Fatalf("expected group id 9, got %d", groupID)
			}
			if input.Logo == nil || input.Logo.Filename != "group-logo.png" {
				t.Fatalf("expected multipart logo file, got %#v", input.Logo)
			}
			if !input.RemoveLogo {
				t.Fatalf("expected removeLogo=true")
			}
			if len(input.Tags) != 2 || input.Tags[0] != "机械" || input.Tags[1] != "硬件" {
				t.Fatalf("unexpected tags: %#v", input.Tags)
			}
			return &usergroup.GroupDetail{ID: groupID, Name: input.Name}, nil
		},
	}
	handler := NewUserGroupHandler(service)

	recorder, ctx := newMultipartContext(t, http.MethodPatch, "/api/admin/user-groups/9", map[string][]string{
		"name":        {"机械组"},
		"description": {"机械相关"},
		"tags":        {"机械", "硬件"},
		"isDefault":   {"false"},
		"show":        {"1"},
		"status":      {"1"},
		"removeLogo":  {"true"},
	}, "logo", "group-logo.png", "image/png", []byte("png"))
	ctx.Params = gin.Params{{Key: "id", Value: "9"}}
	setAdminSessionUser(ctx)

	handler.UpdateGroup(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}
}

type stubUserGroupService struct {
	createFn func(ctx context.Context, actor usergroup.Actor, input usergroup.CreateGroupInput) (*usergroup.GroupDetail, error)
	updateFn func(ctx context.Context, actor usergroup.Actor, groupID uint64, input usergroup.UpdateGroupInput) (*usergroup.GroupDetail, error)
}

func (s *stubUserGroupService) ListGroups(_ context.Context, _ usergroup.Actor, _ usergroup.ListGroupsInput) (*usergroup.ListGroupsResult, error) {
	return nil, nil
}

func (s *stubUserGroupService) ListGroupOptions(_ context.Context, _ usergroup.Actor) ([]usergroup.GroupOption, error) {
	return nil, nil
}

func (s *stubUserGroupService) CreateGroup(ctx context.Context, actor usergroup.Actor, input usergroup.CreateGroupInput) (*usergroup.GroupDetail, error) {
	if s.createFn == nil {
		return nil, nil
	}
	return s.createFn(ctx, actor, input)
}

func (s *stubUserGroupService) UpdateGroup(ctx context.Context, actor usergroup.Actor, groupID uint64, input usergroup.UpdateGroupInput) (*usergroup.GroupDetail, error) {
	if s.updateFn == nil {
		return nil, nil
	}
	return s.updateFn(ctx, actor, groupID, input)
}

func (s *stubUserGroupService) UploadAdmissionQRCode(context.Context, usergroup.Actor, uint64, *multipart.FileHeader) (*usergroup.AdmissionQRCodeConfiguration, error) {
	return nil, nil
}

func (s *stubUserGroupService) RemoveAdmissionQRCode(context.Context, usergroup.Actor, uint64) (*usergroup.AdmissionQRCodeConfiguration, error) {
	return nil, nil
}

func (s *stubUserGroupService) OpenAdmissionQRCode(context.Context, usergroup.Actor, string) (*usergroup.AdmissionQRCodeImage, error) {
	return nil, nil
}

func setAdminSessionUser(ctx *gin.Context) {
	ctx.Set("sessionUser", &auth.SessionUser{
		ID:    1,
		Email: "admin@example.com",
		Role: auth.SessionRole{
			ID:          2,
			Name:        model.RoleNameAdmin,
			DisplayName: "管理员",
		},
	})
}

func newMultipartContext(
	t *testing.T,
	method string,
	target string,
	fields map[string][]string,
	fileField string,
	fileName string,
	contentType string,
	fileContent []byte,
) (*httptest.ResponseRecorder, *gin.Context) {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, values := range fields {
		for _, value := range values {
			if err := writer.WriteField(key, value); err != nil {
				t.Fatalf("write multipart field: %v", err)
			}
		}
	}
	if fileField != "" {
		header := make(textproto.MIMEHeader)
		header.Set("Content-Disposition", `form-data; name="`+fileField+`"; filename="`+fileName+`"`)
		if contentType != "" {
			header.Set("Content-Type", contentType)
		}
		part, err := writer.CreatePart(header)
		if err != nil {
			t.Fatalf("create multipart file part: %v", err)
		}
		if _, err := part.Write(fileContent); err != nil {
			t.Fatalf("write multipart file content: %v", err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	recorder, ctx := newPlainContext(method, target)
	ctx.Request.Body = ioNopCloser(bytes.NewReader(body.Bytes()))
	ctx.Request.ContentLength = int64(body.Len())
	ctx.Request.Header.Set("Content-Type", writer.FormDataContentType())
	return recorder, ctx
}
