package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/model"
	"tarsgo-backend/service/adminuser"
	"tarsgo-backend/service/auth"
)

func TestAdminUserListPassesAllAccountsToggleToService(t *testing.T) {
	for _, testCase := range []struct {
		name            string
		query           string
		includeInactive bool
	}{
		{name: "default active-only list"},
		{name: "all accounts", query: "?includeInactive=true", includeInactive: true},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			gin.SetMode(gin.TestMode)
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = httptest.NewRequest(http.MethodGet, "/api/admin/users"+testCase.query, nil)
			ctx.Set("sessionUser", &auth.SessionUser{Role: auth.SessionRole{Name: model.RoleNameSuperAdmin}})
			service := &captureListUsersService{}

			NewAdminUserHandler(service).ListUsers(ctx)

			if recorder.Code != http.StatusOK {
				t.Fatalf("ListUsers status = %d, want %d: %s", recorder.Code, http.StatusOK, recorder.Body.String())
			}
			if service.input.IncludeInactive != testCase.includeInactive {
				t.Fatalf("IncludeInactive = %t, want %t", service.input.IncludeInactive, testCase.includeInactive)
			}
		})
	}
}

type captureListUsersService struct {
	adminUserService
	input adminuser.ListUsersInput
}

func (s *captureListUsersService) ListUsers(_ context.Context, _ adminuser.Actor, input adminuser.ListUsersInput) (*adminuser.ListUsersResult, error) {
	s.input = input
	return &adminuser.ListUsersResult{Items: []adminuser.UserListItem{}}, nil
}
