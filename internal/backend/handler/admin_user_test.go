package handler

import (
	"bytes"
	"context"
	"encoding/json"
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

func TestAdminUserTeamIdentityBindsManualEvidenceAndReason(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	body, _ := json.Marshal(map[string]any{
		"status": "formal_member", "reason": "正式考核通过，负责人已核验",
		"assessmentPassed": true, "leaderConfirmed": true,
	})
	ctx.Request = httptest.NewRequest(http.MethodPatch, "/api/admin/users/12/team-identity", bytes.NewReader(body))
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Params = gin.Params{{Key: "id", Value: "12"}}
	ctx.Set("sessionUser", &auth.SessionUser{ID: 3, Role: auth.SessionRole{Name: model.RoleNameSuperAdmin}})
	service := &captureTeamIdentityService{}

	NewAdminUserHandler(service).UpdateTeamIdentity(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("UpdateTeamIdentity status = %d, want %d: %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	if service.userID != 12 || service.actor.ID != 3 || service.input.Status != model.TeamIdentityFormalMember || service.input.Reason != "正式考核通过，负责人已核验" || !service.input.AssessmentPassed || !service.input.LeaderConfirmed {
		t.Fatalf("handler did not pass the administrator evidence to the service: %#v", service)
	}
}

func TestAdminUserListPassesConcreteGroupID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/admin/users?groupId=73", nil)
	ctx.Set("sessionUser", &auth.SessionUser{Role: auth.SessionRole{Name: model.RoleNameSuperAdmin}})
	service := &captureListUsersService{}
	NewAdminUserHandler(service).ListUsers(ctx)
	if recorder.Code != http.StatusOK || service.input.GroupID != 73 {
		t.Fatalf("group filter response/status = %d, groupId=%d; want 200 and 73", recorder.Code, service.input.GroupID)
	}
}

type captureListUsersService struct {
	adminUserService
	input adminuser.ListUsersInput
}

type captureTeamIdentityService struct {
	adminUserService
	actor  adminuser.Actor
	userID uint64
	input  adminuser.UpdateTeamIdentityInput
}

func (s *captureTeamIdentityService) UpdateTeamIdentity(_ context.Context, actor adminuser.Actor, userID uint64, input adminuser.UpdateTeamIdentityInput) (*adminuser.UserDetail, error) {
	s.actor, s.userID, s.input = actor, userID, input
	return &adminuser.UserDetail{ID: userID, TeamIdentityStatus: input.Status, TeamIdentityHistory: []adminuser.TeamIdentityHistoryItem{}}, nil
}

func (s *captureListUsersService) ListUsers(_ context.Context, _ adminuser.Actor, input adminuser.ListUsersInput) (*adminuser.ListUsersResult, error) {
	s.input = input
	return &adminuser.ListUsersResult{Items: []adminuser.UserListItem{}}, nil
}
