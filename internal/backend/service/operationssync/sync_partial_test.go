package operationssync

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestPublicBilibiliKeepsFetchedPagesWhenLaterPageIsBlocked(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Query().Get("pn") {
		case "1":
			fmt.Fprint(w, `{"code":0,"data":{"page":{"total":31},"archives":[{"bvid":"BV1Cz4h6cEDe","title":"培训会议","upMid":488284486,"pubdate":1793891736,"stat":{"view":294}}]}}`)
		case "2":
			w.WriteHeader(http.StatusPreconditionFailed)
			fmt.Fprint(w, "blocked")
		default:
			t.Errorf("unexpected page %s", r.URL.Query().Get("pn"))
		}
	}))
	defer server.Close()
	collector := &Collector{apiURL: server.URL, client: server.Client(), now: func() time.Time {
		return time.Date(2026, 11, 13, 12, 0, 0, 0, time.UTC)
	}}
	posts, err := collector.fetchPosts(context.Background())
	if err == nil || len(posts) != 1 || posts[0].ExternalID != "BV1Cz4h6cEDe" {
		t.Fatalf("partial collection lost: posts=%+v, err=%v", posts, err)
	}
}
