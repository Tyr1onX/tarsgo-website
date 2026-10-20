package handler

import (
	"context"
	"net/http"
	"testing"

	"tarsgo-backend/service/growth"
)

type growthServiceStub struct {
	userID uint64
	result *growth.Profile
}

func (s *growthServiceStub) GetMine(_ context.Context, userID uint64) (*growth.Profile, error) {
	s.userID = userID
	return s.result, nil
}

func TestGrowthHandlerUsesAuthenticatedUserInsteadOfRequestedUserID(t *testing.T) {
	service := &growthServiceStub{result: &growth.Profile{DisplayName: "成员甲"}}
	handler := NewGrowthHandler(service)
	recorder, ctx := newPlainContext(http.MethodGet, "/api/growth/me?userId=999")
	setAdminSessionUser(ctx)

	handler.GetMine(ctx)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", recorder.Code, recorder.Body.String())
	}
	if service.userID != 1 {
		t.Fatalf("growth lookup user ID = %d, want authenticated session ID 1", service.userID)
	}
}
