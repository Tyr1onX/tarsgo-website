package handler

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

func testWeChatFollowersHTML(rows ...string) []byte {
	return []byte(`<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head>
	<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"></head><body>
	<table><tr><th colspan="5">用户增长（2026-08-19至2026-11-17）</th></tr>
	<tr><th>时间</th><th>新关注人数</th><th>取消关注人数</th><th>净增关注人数</th><th>累积关注人数</th></tr>` +
		strings.Join(rows, "") + `</table></body></html>`)
}

func weChatFollowerRow(values ...string) string {
	var row strings.Builder
	row.WriteString("<tr>")
	for _, value := range values {
		fmt.Fprintf(&row, "<td>%s</td>", value)
	}
	row.WriteString("</tr>")
	return row.String()
}

func TestParseWeChatFollowerExport(t *testing.T) {
	now := time.Date(2026, 11, 18, 8, 0, 0, 0, time.UTC)
	file := testWeChatFollowersHTML(
		weChatFollowerRow("2026-08-18", "-", "-", "-", "-"),
		weChatFollowerRow("2026-11-15", "0", "0", "0", "3,431"),
		weChatFollowerRow("2026-11-16", "0", "2", "-2", "3,429"),
		weChatFollowerRow("2026-11-17", "1", "5", "-4", "3,425"),
	)
	rows, err := parseWeChatFollowerExport(file, now)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 3 || rows[0].ObservedOn != "2026-11-15" || rows[0].Followers != 3431 {
		t.Fatalf("missing and valid days should be kept distinct: %+v", rows)
	}
	last := rows[2]
	if last.Platform != "wechat" || last.Source != "admin_export" ||
		last.ObservedOn != "2026-11-17" || last.Followers != 3425 ||
		last.NewFollowers == nil || *last.NewFollowers != 1 ||
		last.Unfollows == nil || *last.Unfollows != 5 {
		t.Fatalf("imported daily follower counts are wrong: %+v", last)
	}
}

func TestParseWeChatFollowerExportRejectsInvalidData(t *testing.T) {
	now := time.Date(2026, 11, 18, 8, 0, 0, 0, time.UTC)
	valid := weChatFollowerRow("2026-11-16", "0", "2", "-2", "3429")
	for _, test := range []struct {
		name string
		file []byte
	}{
		{"not a growth export", []byte("<table><tr><td>2026-11-17</td><td>1</td></tr></table>")},
		{"no available days", testWeChatFollowersHTML(weChatFollowerRow("2026-11-17", "-", "-", "-", "-"))},
		{"invalid values", testWeChatFollowersHTML(weChatFollowerRow("2026-11-17", "1人", "5", "-4", "3425"))},
		{"mismatched changes", testWeChatFollowersHTML(weChatFollowerRow("2026-11-17", "1", "5", "4", "3425"))},
		{"partial missing day", testWeChatFollowersHTML(weChatFollowerRow("2026-11-17", "-", "5", "-4", "-"))},
		{"future and incomplete day", testWeChatFollowersHTML(weChatFollowerRow("2026-11-18", "0", "0", "0", "3425"))},
		{"duplicate day", testWeChatFollowersHTML(valid, valid)},
		{"mismatched cumulative followers", testWeChatFollowersHTML(valid, weChatFollowerRow("2026-11-17", "1", "5", "-4", "3430"))},
		{"unsorted dates", testWeChatFollowersHTML(weChatFollowerRow("2026-11-17", "1", "5", "-4", "3425"), valid)},
	} {
		t.Run(test.name, func(t *testing.T) {
			if _, err := parseWeChatFollowerExport(test.file, now); err == nil {
				t.Fatal("accepted invalid account-growth export")
			}
		})
	}
}
