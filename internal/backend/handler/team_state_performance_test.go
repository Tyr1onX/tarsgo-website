package handler

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/config"
)

func teamStatePerfTransport(counter, active, peak *atomic.Int32, gate func()) http.RoundTripper {
	return teamStateMockTransport(func(req *http.Request) (*http.Response, error) {
		counter.Add(1)
		body := `{"code":0,"data":{}}`
		switch {
		case strings.HasSuffix(req.URL.Path, "/tenant_access_token/internal"):
			if gate != nil {
				gate()
			}
			body = `{"code":0,"tenant_access_token":"test-token"}`
		default:
			now := active.Add(1)
			for {
				old := peak.Load()
				if now <= old || peak.CompareAndSwap(old, now) {
					break
				}
			}
			time.Sleep(12 * time.Millisecond)
			active.Add(-1)
			switch {
			case strings.Contains(req.URL.Path, "/tables/"):
				body = `{"code":0,"data":{"fields":[],"data":[],"record_id_list":[],"has_more":false}}`
			case strings.HasSuffix(req.URL.Path, "/raw_content"):
				body = `{"code":0,"data":{"content":"11.14会议记录\n车体装配已完成"}}`
			case strings.HasSuffix(req.URL.Path, "/blocks"):
				body = `{"code":0,"data":{"items":[]}}`
			}
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})
}

func teamStateRequest(h *FeishuHandler, path string, ctx context.Context) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	request := httptest.NewRequest(http.MethodGet, path, nil)
	if ctx != nil {
		request = request.WithContext(ctx)
	}
	c.Request = request
	h.GetTeamState(c)
	return recorder
}

func TestTeamStateParallelAndCacheHits(t *testing.T) {
	var requests, active, peak atomic.Int32
	h := &FeishuHandler{
		cfg:    config.FeishuConfig{AppID: "app", AppSecret: "secret"},
		client: &http.Client{Transport: teamStatePerfTransport(&requests, &active, &peak, nil)},
	}
	first := teamStateRequest(h, "/api/admin/team-state", nil)
	if first.Code != http.StatusOK || h.teamStateCache == nil || h.teamStateCache.Summary == nil {
		t.Fatalf("cold load failed: status=%d body=%s", first.Code, first.Body.String())
	}
	if peak.Load() < 2 {
		t.Fatalf("independent Feishu requests must run concurrently, max active=%d", peak.Load())
	}
	count := requests.Load()
	second := teamStateRequest(h, "/api/admin/team-state", nil)
	if second.Code != http.StatusOK || requests.Load() != count {
		t.Fatalf("warm request must return cached snapshot without touching Feishu, calls %d -> %d", count, requests.Load())
	}
	if second.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("super-admin response must not be cached by browser or proxy: %q", second.Header().Get("Cache-Control"))
	}
	forced := teamStateRequest(h, "/api/admin/team-state?refresh=1", nil)
	if forced.Code != http.StatusOK || requests.Load() <= count {
		t.Fatalf("manual refresh must bypass snapshot, status=%d calls=%d", forced.Code, requests.Load())
	}
}

func TestTeamStateRefreshReturnsSnapshotImmediatelyAndDeduplicates(t *testing.T) {
	var calls, active, peak atomic.Int32
	gate := make(chan struct{})
	var blockToken atomic.Bool
	h := &FeishuHandler{
		cfg: config.FeishuConfig{AppID: "app", AppSecret: "secret"},
		client: &http.Client{Transport: teamStatePerfTransport(&calls, &active, &peak, func() {
			if blockToken.Load() {
				<-gate
			}
		})},
	}
	if got := teamStateRequest(h, "/api/admin/team-state", nil); got.Code != 200 {
		t.Fatalf("cannot prepare cache: %d", got.Code)
	}
	h.teamStateMu.Lock()
	h.teamStateCache.GeneratedAt = time.Now().Add(-2 * time.Minute)
	h.teamStateLastRefresh = time.Now().Add(-2 * time.Minute)
	h.teamStateMu.Unlock()
	blockToken.Store(true)
	start := time.Now()
	cached := teamStateRequest(h, "/api/admin/team-state", nil)
	if cached.Code != 200 || time.Since(start) > 150*time.Millisecond ||
		!strings.Contains(cached.Body.String(), "\"refreshing\":true") {
		t.Fatalf("background refresh must not block a usable snapshot: %d %s", cached.Code, cached.Body.String())
	}
	h.teamStateMu.Lock()
	pending := h.teamStateLoading
	h.teamStateMu.Unlock()
	if pending == nil {
		t.Fatal("old-but-valid snapshot must schedule background refresh")
	}
	const simultaneous = 8
	var wg sync.WaitGroup
	for i := 0; i < simultaneous; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if got := teamStateRequest(h, "/api/admin/team-state", nil); got.Code != 200 {
				t.Errorf("parallel cache request failed: %d", got.Code)
			}
		}()
	}
	wg.Wait()
	close(gate)
	select {
	case <-pending.done:
	case <-time.After(2 * time.Second):
		t.Fatal("background refresh did not complete")
	}
	if refreshed := teamStateRequest(h, "/api/admin/team-state", nil); refreshed.Code != 200 ||
		strings.Contains(refreshed.Body.String(), "\"refreshing\":true") {
		t.Fatalf("background result was not published: %d %s", refreshed.Code, refreshed.Body.String())
	}
	if calls.Load() > 19 {
		t.Fatalf("concurrent viewers must share one refresh, Feishu calls=%d", calls.Load())
	}
}

func TestTeamStateExpiredSnapshotNotServedBeyondFiveMinutes(t *testing.T) {
	var calls, active, peak atomic.Int32
	gate := make(chan struct{})
	var block atomic.Bool
	h := &FeishuHandler{
		cfg: config.FeishuConfig{AppID: "app", AppSecret: "secret"},
		client: &http.Client{Transport: teamStatePerfTransport(&calls, &active, &peak, func() {
			if block.Load() {
				<-gate
			}
		})},
	}
	if got := teamStateRequest(h, "/api/admin/team-state", nil); got.Code != 200 {
		t.Fatal("cannot prepare cache")
	}
	h.teamStateMu.Lock()
	h.teamStateCache.GeneratedAt = time.Now().Add(-6 * time.Minute)
	h.teamStateMu.Unlock()
	block.Store(true)
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Millisecond)
	defer cancel()
	expired := teamStateRequest(h, "/api/admin/team-state", ctx)
	if expired.Code != http.StatusGatewayTimeout {
		t.Fatalf("expired cache must not be returned, got %d body=%s", expired.Code, expired.Body.String())
	}
	close(gate)
}

func TestTeamStateConcurrentColdRequestsShareOneFetch(t *testing.T) {
	var calls, active, peak atomic.Int32
	gate := make(chan struct{})
	h := &FeishuHandler{
		cfg:    config.FeishuConfig{AppID: "app", AppSecret: "secret"},
		client: &http.Client{Transport: teamStatePerfTransport(&calls, &active, &peak, func() { <-gate })},
	}
	var wg sync.WaitGroup
	ready := make(chan struct{}, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ready <- struct{}{}
			if got := teamStateRequest(h, "/api/admin/team-state", nil); got.Code != 200 {
				t.Errorf("cold request status=%d", got.Code)
			}
		}()
	}
	for i := 0; i < 8; i++ {
		<-ready
	}
	time.Sleep(15 * time.Millisecond)
	close(gate)
	wg.Wait()
	if calls.Load() != 9 {
		t.Fatalf("8 concurrent viewers should share 1 token + 3 Base + 5 document requests, got %d", calls.Load())
	}
}

func TestTeamStateRefreshCooldownPreventsRepeatedFailures(t *testing.T) {
	var calls, active, peak atomic.Int32
	h := &FeishuHandler{
		cfg:                  config.FeishuConfig{AppID: "app", AppSecret: "secret"},
		client:               &http.Client{Transport: teamStatePerfTransport(&calls, &active, &peak, nil)},
		teamStateCache:       &teamStateResponse{GeneratedAt: time.Now().Add(-2 * time.Minute), Summary: &teamSummary{}},
		teamStateLastRefresh: time.Now(), // Recent failed attempt: don't immediately retry it.
	}
	for i := 0; i < 3; i++ {
		got := teamStateRequest(h, "/api/admin/team-state", nil)
		if got.Code != 200 || strings.Contains(got.Body.String(), "\"refreshing\":true") {
			t.Fatalf("still-valid snapshot should not start another refresh immediately: %s", got.Body.String())
		}
	}
	if calls.Load() != 0 {
		t.Fatalf("automatic refresh must respect cooldown, got %d requests", calls.Load())
	}
}

func TestTeamStateFailedBackgroundRefreshKeepsValidCache(t *testing.T) {
	var calls, active, peak atomic.Int32
	normal := teamStatePerfTransport(&calls, &active, &peak, nil)
	var rejectTasks atomic.Bool
	h := &FeishuHandler{
		cfg: config.FeishuConfig{AppID: "app", AppSecret: "secret"},
		client: &http.Client{Transport: teamStateMockTransport(func(req *http.Request) (*http.Response, error) {
			if rejectTasks.Load() && strings.Contains(req.URL.Path, teamStateTasksTable) {
				return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"code":99991672,"msg":"missing scope"}`)), Header: make(http.Header)}, nil
			}
			return normal.RoundTrip(req)
		})},
	}
	if got := teamStateRequest(h, "/api/admin/team-state", nil); got.Code != 200 {
		t.Fatal("cannot prepare snapshot")
	}
	h.teamStateMu.Lock()
	h.teamStateCache.GeneratedAt = time.Now().Add(-2 * time.Minute)
	old := h.teamStateCache
	h.teamStateLastRefresh = time.Now().Add(-2 * time.Minute)
	h.teamStateMu.Unlock()
	rejectTasks.Store(true)
	if got := teamStateRequest(h, "/api/admin/team-state", nil); got.Code != 200 {
		t.Fatalf("existing snapshot must remain readable while retrying: %d", got.Code)
	}
	h.teamStateMu.Lock()
	load := h.teamStateLoading
	h.teamStateMu.Unlock()
	if load == nil {
		t.Fatal("background refresh must have started")
	}
	select {
	case <-load.done:
	case <-time.After(2 * time.Second):
		t.Fatal("failed background refresh did not finish")
	}
	h.teamStateMu.Lock()
	preserved := h.teamStateCache == old
	h.teamStateMu.Unlock()
	if !preserved {
		t.Fatal("failed upstream data must not overwrite a valid snapshot")
	}
	if got := teamStateRequest(h, "/api/admin/team-state?refresh=1", nil); got.Code != http.StatusBadGateway {
		t.Fatalf("manual refresh failure should be explicit, got %d", got.Code)
	}
}
