package database

import (
	"strings"
	"testing"
	"time"
)

func TestWeChatVideoPostsV85MatchesPublisherObservation(t *testing.T) {
	syncedAt := time.Date(2026, 11, 19, 15, 0, 0, 0, time.FixedZone("Beijing", 8*3600))
	posts, err := parseWeChatVideoPostsV85(weChatVideoPostsV85, syncedAt)
	if err != nil {
		t.Fatal(err)
	}
	if len(posts) != 35 {
		t.Fatalf("want 35 video records, got %d", len(posts))
	}
	latest := posts[0]
	if latest.Platform != "wechat_video" || latest.ViewCount != 1007 ||
		latest.LikeCount != 18 || latest.CommentCount != 1 ||
		latest.ShareCount != 8 || latest.RecommendCount != 26 ||
		latest.PublishedAt.In(time.FixedZone("Beijing", 8*3600)).Format("2006-01-02 15:04") != "2026-03-26 11:40" {
		t.Fatalf("unexpected latest video: %#v", latest)
	}
	unlabeled := 0
	for _, post := range posts {
		if post.URL != "" {
			t.Fatalf("unverified public video URL: %s", post.URL)
		}
		if strings.HasPrefix(post.Title, "未显示标题（") {
			unlabeled++
		}
	}
	if unlabeled != 3 {
		t.Fatalf("want three videos without visible titles, got %d", unlabeled)
	}
}

func TestWeChatVideoPostsV85RejectsDuplicateAndInvalidCounts(t *testing.T) {
	header := "published_at,title,view_count,like_count,comment_count,share_count,recommend_count\n"
	record := "2026年03月26日 11:40,标题,1007,18,1,8,26\n"
	if _, err := parseWeChatVideoPostsV85(header+record+record, time.Now()); err == nil {
		t.Fatal("duplicate publication minute must fail")
	}
	if _, err := parseWeChatVideoPostsV85(header+"2026年03月26日 11:40,标题,-1,18,1,8,26\n", time.Now()); err == nil {
		t.Fatal("negative engagement count must fail")
	}
}
