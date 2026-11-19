package handler

import (
	"bytes"
	"crypto/sha256"
	"encoding/csv"
	"fmt"
	"strings"
	"testing"
	"time"
)

var channelsPostHeaders = []string{
	"视频描述", "视频ID", "发布时间", "完播率", "平均播放时长",
	"播放量", "推荐", "喜欢", "评论量", "分享量", "关注量",
	"转发聊天和朋友圈", "设为铃声", "设为状态", "设为朋友圈封面",
	"企微链接点击次数", "企微链接点击人数", "添加到通讯录次数", "添加到通讯录人数",
}

func channelsPostRow(title, id, date, views, recommend, likes, comments, shares, follows string) []string {
	return []string{
		title, id, date, "20.46%", "15.56秒",
		views, recommend, likes, comments, shares, follows,
		"8", "0", "0", "0", "", "", "", "",
	}
}

func channelsPostCSV(rows ...[]string) []byte {
	var out bytes.Buffer
	out.Write([]byte{0xef, 0xbb, 0xbf})
	writer := csv.NewWriter(&out)
	_ = writer.Write(channelsPostHeaders)
	for _, row := range rows {
		_ = writer.Write(row)
	}
	writer.Flush()
	return out.Bytes()
}

func expectedVideoPostID(raw string) string {
	return fmt.Sprintf("wxv:%x", sha256.Sum256([]byte(raw)))
}

func TestParseWeChatVideoPostExport(t *testing.T) {
	now := time.Date(2026, 11, 19, 8, 0, 0, 0, time.UTC)
	longID := "export/" + strings.Repeat("x", 96) // The actual export contains 103-byte IDs.
	csvData := channelsPostCSV(
		channelsPostRow("2026RMUL高校联盟赛 东北站 即将开始！", longID, "2026/03/26", "1007", "18", "26", "1", "8", "2"),
		channelsPostRow("第二篇\n 同日作品", "export/video-2", "2026/03/26", "902", "11", "15", "0", "20", ""),
	)
	posts, err := parseWeChatVideoPostExport(csvData, now)
	if err != nil {
		t.Fatal(err)
	}
	if len(posts) != 2 {
		t.Fatalf("expected 2 videos on same day, got %d", len(posts))
	}
	post := posts[0]
	if post.Platform != "wechat_video" || post.ExternalID != expectedVideoPostID(longID) ||
		post.Title != "2026RMUL高校联盟赛 东北站 即将开始！" ||
		post.ViewCount != 1007 || post.RecommendCount != 18 || post.LikeCount != 26 ||
		post.CommentCount != 1 || post.ShareCount != 8 || post.FollowerGain == nil ||
		*post.FollowerGain != 2 || post.MediaType != "video" || post.URL != "" ||
		post.PublishedAt.Format(time.RFC3339) != "2026-03-25T16:00:00Z" {
		t.Fatalf("import did not map actual video fields correctly: %+v", post)
	}
	if posts[1].FollowerGain != nil || posts[1].Title != "第二篇 同日作品" {
		t.Fatalf("missing follower gain and multiline titles were interpreted incorrectly: %+v", posts[1])
	}
}

func TestParseWeChatVideoPostExportRejectsInvalidData(t *testing.T) {
	now := time.Date(2026, 11, 19, 8, 0, 0, 0, time.UTC)
	valid := channelsPostRow("作品", "export/1", "2026/01/13", "100", "8", "20", "1", "2", "0")
	for _, tc := range []struct {
		name string
		data []byte
	}{
		{"all-videos daily aggregate", []byte("视频号视频详情数据,,,,,\n时间,播放,推荐,喜欢,评论,分享,关注\n2026/11/18,1,0,0,0,0,0")},
		{"empty", channelsPostCSV()},
		{"duplicate id", channelsPostCSV(valid, valid)},
		{"missing id", channelsPostCSV(channelsPostRow("作品", "", "2026/01/13", "100", "8", "20", "1", "2", "0"))},
		{"invalid date", channelsPostCSV(channelsPostRow("作品", "export/1", "2026/02/30", "100", "8", "20", "1", "2", "0"))},
		{"future date", channelsPostCSV(channelsPostRow("作品", "export/1", "2027/01/13", "100", "8", "20", "1", "2", "0"))},
		{"invalid views", channelsPostCSV(channelsPostRow("作品", "export/1", "2026/01/13", "100万", "8", "20", "1", "2", "0"))},
		{"negative likes", channelsPostCSV(channelsPostRow("作品", "export/1", "2026/01/13", "100", "8", "-20", "1", "2", "0"))},
		{"invalid follows", channelsPostCSV(channelsPostRow("作品", "export/1", "2026/01/13", "100", "8", "20", "1", "2", "错误"))},
		{"missing column", func() []byte {
			content := channelsPostCSV(valid)
			return []byte(strings.Replace(string(content), "视频ID", "错误列名", 1))
		}()},
		{"wrong column count", channelsPostCSV([]string{"作品", "export/1", "2026/01/13"})},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := parseWeChatVideoPostExport(tc.data, now); err == nil {
				t.Fatalf("accepted invalid video export: %s", tc.name)
			}
		})
	}
}
