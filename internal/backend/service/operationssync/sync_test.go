package operationssync

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestPublicBilibiliParsing(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/x/relation/stat", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("vmid") != "488284486" {
			t.Error("incorrect member ID")
		}
		fmt.Fprint(w, `{"code":0,"data":{"mid":488284486,"follower":2805}}`)
	})
	mux.HandleFunc("/x/series/recArchivesByKeywords", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("mid") != "488284486" {
			t.Error("incorrect member ID")
		}
		switch r.URL.Query().Get("pn") {
		case "1":
			fmt.Fprint(w, `{"code":0,"data":{"page":{"total":31},"archives":[{"bvid":"BV1Cz4h6cEDe","title":" 机器人电源系统培训会议 ","upMid":488284486,"pubdate":1793891736,"stat":{"view":294}},{"bvid":"bad","upMid":488284486,"pubdate":1793891736}]}}`)
		case "2":
			fmt.Fprint(w, `{"code":0,"data":{"page":{"total":31},"archives":[{"bvid":"BV1XYxh63EJu","title":"像素动画MV","upMid":488284486,"pubdate":1793587311,"stat":{"view":899}}]}}`)
		default:
			t.Errorf("unexpected page: %s", r.URL.Query().Get("pn"))
			fmt.Fprint(w, `{"code":0,"data":{"page":{"total":31},"archives":[]}}`)
		}
	})
	server := httptest.NewServer(mux)
	defer server.Close()
	collector := &Collector{apiURL: server.URL, client: server.Client(), now: func() time.Time {
		return time.Date(2026, 11, 13, 12, 0, 0, 0, time.UTC)
	}}
	followers, err := collector.fetchFollowers(context.Background())
	if err != nil || followers != 2805 {
		t.Fatalf("followers = %d, err = %v", followers, err)
	}
	posts, err := collector.fetchPosts(context.Background())
	if err != nil || len(posts) != 2 {
		t.Fatalf("posts = %d, err = %v", len(posts), err)
	}
	if posts[0].Title != "机器人电源系统培训会议" || posts[0].URL != "https://www.bilibili.com/video/BV1Cz4h6cEDe" {
		t.Fatalf("incorrect first post: %+v", posts[0])
	}
	if posts[1].ExternalID != "BV1XYxh63EJu" || posts[1].ViewCount != 899 {
		t.Fatal("incorrect second post")
	}
}

func TestPublicBilibiliBlockedResponsesAreNotTreatedAsEmptyHistory(t *testing.T) {
	for _, response := range []struct {
		status int
		body   string
	}{
		{http.StatusTooManyRequests, "rate limited"},
		{http.StatusOK, `{"code":-352,"message":"blocked"}`},
	} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(response.status)
			fmt.Fprint(w, response.body)
		}))
		collector := &Collector{apiURL: server.URL, client: server.Client(), now: time.Now}
		posts, err := collector.fetchPosts(context.Background())
		if err == nil || posts != nil {
			t.Fatalf("must fail instead of erasing posts: %d", response.status)
		}
		server.Close()
	}
}
