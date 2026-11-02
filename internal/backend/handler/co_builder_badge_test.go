package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/service/auth"
	"tarsgo-backend/service/cobuilderbadge"
)

type stubCoBuilderBadgeService struct {
	grantFn func(context.Context, cobuilderbadge.Actor, uint64) (*cobuilderbadge.Summary, error)
}

func (stubCoBuilderBadgeService) GetMine(context.Context, cobuilderbadge.Actor) (*cobuilderbadge.Summary, error) {
	return nil, nil
}

func (stubCoBuilderBadgeService) GetForAdmin(context.Context, cobuilderbadge.Actor, uint64) (*cobuilderbadge.Summary, error) {
	return nil, nil
}

func (s stubCoBuilderBadgeService) Grant(ctx context.Context, actor cobuilderbadge.Actor, userID uint64) (*cobuilderbadge.Summary, error) {
	return s.grantFn(ctx, actor, userID)
}

func (stubCoBuilderBadgeService) Revoke(context.Context, cobuilderbadge.Actor, uint64, uint64) (*cobuilderbadge.Summary, error) {
	return nil, nil
}

func (stubCoBuilderBadgeService) ClaimUnlock(context.Context, cobuilderbadge.Actor) (*cobuilderbadge.UnlockNotice, error) {
	return nil, nil
}

func (stubCoBuilderBadgeService) AcknowledgeUnlock(context.Context, cobuilderbadge.Actor, string) error {
	return nil
}

func TestGrantAcceptsDirectNoBodyRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)
	called := false
	handler := NewCoBuilderBadgeHandler(stubCoBuilderBadgeService{
		grantFn: func(_ context.Context, actor cobuilderbadge.Actor, userID uint64) (*cobuilderbadge.Summary, error) {
			called = true
			if actor.ID != 1 || actor.RoleName != "super_admin" || userID != 7 {
				t.Fatalf("unexpected grant actor=%#v userID=%d", actor, userID)
			}
			return &cobuilderbadge.Summary{ContributionCount: 1}, nil
		},
	})
	router := gin.New()
	router.POST("/api/admin/users/:id/co-builder-badge/contributions", func(c *gin.Context) {
		c.Set("sessionUser", &auth.SessionUser{ID: 1, Role: auth.SessionRole{Name: "super_admin"}})
		c.Next()
	}, handler.Grant)

	request := httptest.NewRequest(http.MethodPost, "/api/admin/users/7/co-builder-badge/contributions", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || !called {
		t.Fatalf("status=%d called=%v response=%s", recorder.Code, called, recorder.Body.String())
	}
}
