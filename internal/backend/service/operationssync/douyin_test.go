package operationssync

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func testDouyin(now time.Time) *Douyin {
	d := NewDouyin(nil, "test-client", "test-secret", "long-test-encryption-secret")
	d.now = func() time.Time { return now }
	return d
}

func TestDouyinOAuthStateAndEncryption(t *testing.T) {
	now := time.Date(2026, 11, 18, 11, 0, 0, 0, time.UTC)
	d := testDouyin(now)
	link, err := url.Parse(d.AuthorizeURL(42))
	if err != nil || link.Host != "open.douyin.com" || link.Query().Get("scope") != "user_info,video.list,data.external.user" {
		t.Fatalf("invalid OAuth URL: %v", link)
	}
	state := link.Query().Get("state")
	if !d.verifyState(42, state) || d.verifyState(41, state) || d.verifyState(42, state+"X") {
		t.Fatal("OAuth state did not enforce user-bound signature")
	}
	d.now = func() time.Time { return now.Add(11 * time.Minute) }
	if d.verifyState(42, state) { t.Fatal("expired OAuth state was accepted") }
	original := douyinTokens{Access: "access-test", Refresh: "refresh-test"}
	ciphertext, err := d.encodeTokens(original)
	if err != nil || strings.Contains(ciphertext, original.Access) { t.Fatal("OAuth secret was not encrypted") }
	recovered, err := d.decodeTokens(ciphertext)
	if err != nil || recovered != original { t.Fatalf("invalid decrypted token: %+v %v", recovered, err) }
	other := testDouyin(now)
	other.secret[0] ^= 1
	if _, err := other.decodeTokens(ciphertext); err == nil { t.Fatal("incorrect encryption key was accepted") }
}

func TestDouyinAPIParsingExcludesPrivateAndPreservesDay(t *testing.T) {
	mux := http.NewServeMux()
	now := time.Date(2026, 11, 18, 12, 0, 0, 0, time.UTC)
	validTimestamp := time.Date(2026, 11, 2, 2, 52, 35, 0, time.UTC).Unix()
	mux.HandleFunc("/data/external/user/fans/", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("access-token") != "valid" { t.Error("missing access-token") }
		fmt.Fprint(w, `{"data":{"error_code":0,"result_list":[{"date":"2026-11-17","total_fans":"801"},{"date":"2026-11-18","total_fans":802},{"date":"2026-11-19","total_fans":"803"},{"date":"invalid","total_fans":"804"}]}}`)
	})
	mux.HandleFunc("/video/list/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("open_id") != "team" || r.URL.Query().Get("count") != "20" {
			t.Errorf("incorrect query: %v", r.URL.Query())
		}
		switch r.URL.Query().Get("cursor") {
		case "0":
			fmt.Fprintf(w, `{"data":{"error_code":0,"has_more":true,"cursor":55,"list":[
			{"title":"我愿意呀。｜吉甲大师《你》像素MV","create_time":%d,"is_reviewed":true,"video_status":5,
			"share_url":"https://www.douyin.com/video/123","statistics":{"play_count":15485}},
			{"title":"私人作品","create_time":%d,"is_reviewed":false,"video_status":5,"statistics":{"play_count":20}},
			{"title":"审核中","create_time":%d,"is_reviewed":true,"video_status":4,"statistics":{"play_count":10}}
			]}}`, validTimestamp, validTimestamp+100, validTimestamp+200)
		case "55":
			fmt.Fprint(w, `{"data":{"error_code":0,"has_more":false,"list":[]}}`)
		default:
			t.Errorf("unexpected cursor %s", r.URL.Query().Get("cursor"))
		}
	})
	server := httptest.NewServer(mux)
	defer server.Close()
	d := testDouyin(now)
	d.baseURL, d.client = server.URL, server.Client()
	snapshots, err := d.fetchFollowers(context.Background(), "valid")
	if err != nil || len(snapshots) != 2 || snapshots[0].Followers != 801 || snapshots[1].Followers != 802 {
		t.Fatalf("unexpected followers: %+v, %v", snapshots, err)
	}
	posts, err := d.fetchVideos(context.Background(), "valid", "team")
	if err != nil || len(posts) != 1 { t.Fatalf("unexpected posts: %+v, %v", posts, err) }
	if posts[0].ExternalID != fmt.Sprint(validTimestamp) || posts[0].ViewCount != 15485 ||
		posts[0].URL != "https://www.douyin.com/video/123" {
		t.Fatalf("incorrect post: %+v", posts[0])
	}
}

func TestDouyinAPIFailureIsNotAZeroCount(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"data":{"error_code":2100005,"result_list":[{"date":"2026-11-18","total_fans":0}],"list":[]}}`)
	}))
	defer server.Close()
	d := testDouyin(time.Now())
	d.baseURL, d.client = server.URL, server.Client()
	if _, err := d.fetchFollowers(context.Background(), "token"); err == nil {
		t.Fatal("rejected Douyin API request must not create zero followers")
	}
	if _, err := d.fetchVideos(context.Background(), "token", "team"); err == nil {
		t.Fatal("rejected Douyin API request must not erase existing works")
	}
}

func TestDouyinTokenResponseAcceptsQuotedDurations(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"data":{"error_code":0,"access_token":"access","refresh_token":"refresh","open_id":"team","expires_in":"86400","refresh_expires_in":"2592000","scope":"user_info,video.list,data.external.user"}}`)
	}))
	defer server.Close()
	d := testDouyin(time.Now())
	d.baseURL, d.client = server.URL, server.Client()
	response, err := d.tokenRequest(context.Background(), "/oauth/access_token/", url.Values{})
	if err != nil { t.Fatal(err) }
	access, err := response.Data.ExpiresIn.Int64()
	if err != nil || access != 86400 { t.Fatalf("invalid quoted access expiry: %d %v", access, err) }
	refresh, err := response.Data.RefreshExpiresIn.Int64()
	if err != nil || refresh != 2592000 { t.Fatalf("invalid quoted refresh expiry: %d %v", refresh, err) }
}
