package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/service/auth"
	"tarsgo-backend/service/recruitmentanalytics"
)

type analyticsServiceStub struct {
	role string
	err  error
}

func (s *analyticsServiceStub) GetReport(_ context.Context, role string) (*recruitmentanalytics.Report, error) {
	s.role = role
	if s.err != nil {
		return nil, s.err
	}
	return &recruitmentanalytics.Report{HasCohorts: true, CohortCount: 1}, nil
}

func TestRecruitmentAnalyticsHandlerPassesRoleAndReturnsAggregateReport(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := &analyticsServiceStub{}
	handler := NewRecruitmentAnalyticsHandler(service)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/admin/recruitment-analytics", nil)
	ctx.Set("sessionUser", &auth.SessionUser{Role: auth.SessionRole{Name: "super_admin"}})

	handler.GetReport(ctx)
	if recorder.Code != http.StatusOK || service.role != "super_admin" {
		t.Fatalf("expected super-admin aggregate response, status=%d role=%q body=%s", recorder.Code, service.role, recorder.Body.String())
	}
	if recorder.Body.String() == "" || containsAny(recorder.Body.String(), "contactName", "contactEmail", "contactPhone", "formData") {
		t.Fatalf("unexpected analytics payload: %s", recorder.Body.String())
	}
}

func TestRecruitmentAnalyticsHandlerRequiresSessionContext(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := &analyticsServiceStub{}
	handler := NewRecruitmentAnalyticsHandler(service)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/admin/recruitment-analytics", nil)

	handler.GetReport(ctx)
	if recorder.Code != http.StatusUnauthorized || service.role != "" {
		t.Fatalf("missing session should not reach analytics service: status=%d role=%q", recorder.Code, service.role)
	}
}

func containsAny(value string, candidates ...string) bool {
	for _, candidate := range candidates {
		if strings.Contains(value, candidate) {
			return true
		}
	}
	return false
}
