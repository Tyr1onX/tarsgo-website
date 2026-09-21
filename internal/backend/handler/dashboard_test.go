package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/service/dashboard"
)

type changingDashboardService struct{ calls int }

func (s *changingDashboardService) Get(context.Context, dashboard.Actor) (*dashboard.Data, error) {
	s.calls++
	return &dashboard.Data{
		TotalUsers:        int64(s.calls),
		GroupDistribution: []dashboard.GroupDistributionItem{},
		RecentActivities:  []dashboard.RecentActivityItem{},
		GeneratedAt:       time.Now(),
	}, nil
}

func TestDashboardHandlerLoadsFreshDataWithoutCaching(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := &changingDashboardService{}
	handler := NewDashboardHandler(service)

	for expected := 1; expected <= 2; expected++ {
		recorder, ctx := newPlainContext(http.MethodGet, "/api/admin/dashboard")
		handler.Get(ctx)

		if recorder.Code != http.StatusOK {
			t.Fatalf("request %d: expected 200, got %d", expected, recorder.Code)
		}
		if cacheControl := recorder.Header().Get("Cache-Control"); cacheControl != "no-store" {
			t.Fatalf("request %d: expected no-store cache policy, got %q", expected, cacheControl)
		}

		var response struct {
			Code int `json:"code"`
			Data struct {
				TotalUsers int64 `json:"totalUsers"`
			} `json:"data"`
		}
		if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
			t.Fatalf("request %d: decode response: %v", expected, err)
		}
		if response.Code != http.StatusOK || response.Data.TotalUsers != int64(expected) {
			t.Fatalf("request %d: expected fresh response, got %s", expected, recorder.Body.String())
		}
	}
}
