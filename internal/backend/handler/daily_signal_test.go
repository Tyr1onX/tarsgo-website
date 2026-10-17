package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/service/dailysignal"
)

type dailySignalServiceStub struct{}

func (dailySignalServiceStub) GetArchive(_ context.Context, _ *uint64, year int) (*dailysignal.Archive, error) {
	return &dailysignal.Archive{Year: year, Today: "2026-10-16", Days: []string{}, Moods: []dailysignal.MoodEntry{}}, nil
}

func (dailySignalServiceStub) SendToday(context.Context, uint64, *string) (*dailysignal.SendResult, error) {
	return nil, nil
}

func (dailySignalServiceStub) SetTodayMood(context.Context, uint64, *string) (*dailysignal.SendResult, error) {
	return nil, nil
}

func TestDailySignalArchiveDisablesCaching(t *testing.T) {
	gin.SetMode(gin.TestMode)
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/daily-signals?year=2026", nil)

	NewDailySignalHandler(dailySignalServiceStub{}).GetArchive(context)

	if response.Code != http.StatusOK {
		t.Fatalf("GetArchive status = %d, want %d", response.Code, http.StatusOK)
	}
	if got := response.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store for private account data", got)
	}
}
