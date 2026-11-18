package database

import (
	"strings"
	"testing"
)

func TestWeChatHistoryV71IsCompleteAndDoesNotExposeTemporaryLinks(t *testing.T) {
	posts, snapshots, err := parseWeChatHistoryV71()
	if err != nil {
		t.Fatal(err)
	}
	if len(posts) != 383 || len(snapshots) != 91 {
		t.Fatalf("unexpected history size: posts=%d followers=%d", len(posts), len(snapshots))
	}
	seen := make(map[string]bool, len(posts))
	var permanent int
	for _, post := range posts {
		if seen[post.ExternalID] {
			t.Fatalf("duplicate article id: %s", post.ExternalID)
		}
		seen[post.ExternalID] = true
		if post.URL != "" {
			if !strings.HasPrefix(post.URL, "https://mp.weixin.qq.com/s/") {
				t.Fatalf("non-permanent article link: %s", post.URL)
			}
			permanent++
		}
	}
	if permanent != 343 {
		t.Fatalf("permanent article links=%d, want 343", permanent)
	}
	if posts[0].ExternalID != "jamVxvx2V6RLw72oHCUmBQ" || posts[0].ViewCount != 297 {
		t.Fatalf("latest article was not updated: %+v", posts[0])
	}
	if posts[len(posts)-1].PublishedAt.In(posts[0].PublishedAt.Location()).Year() != 2019 {
		t.Fatalf("historical articles do not extend to 2019")
	}
	if first, last := snapshots[0], snapshots[len(snapshots)-1]; first.ObservedOn != "2026-08-19" || first.Followers != 3245 ||
		last.ObservedOn != "2026-11-17" || last.Followers != 3425 ||
		last.NewFollowers == nil || *last.NewFollowers != 1 ||
		last.Unfollows == nil || *last.Unfollows != 5 {
		t.Fatalf("unexpected follower history boundaries: %+v / %+v", first, last)
	}
}
