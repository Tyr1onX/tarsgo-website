package handler

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

func channelsFollowersCSV(rows ...string) []byte {
	return []byte("\xef\xbb\xbf视频号关注者增长详情数据,,,,,\r\n" +
		"由于服务器缓存，以及指标计算方法和统计时间的差异，数据可能存在微小误差，一般在1%左右，不影响分析结果。,,,,,\r\n" +
		"\"时间\",\"净增关注\",\"新增关注\",\"取消关注\",\"关注者总数\"\r\n" +
		strings.Join(rows, "\r\n"))
}

func TestParseWeChatVideoFollowerExport(t *testing.T) {
	now := time.Date(2026, 11, 19, 5, 30, 0, 0, time.UTC)
	data := channelsFollowersCSV(
		"\"2026/11/18\",0,0,0,441",
		"\"2026/11/17\",-2,1,3,441",
		"\"2026/11/16\",1,1,0,443",
		"\"2026/11/15\",-, -,-,-",
		"\"2026/11/14\",0,0,0,442",
	)
	snapshots, err := parseWeChatVideoFollowerExport(data, now)
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshots) != 4 || snapshots[0].ObservedOn != "2026-11-14" ||
		snapshots[3].ObservedOn != "2026-11-18" {
		t.Fatalf("CSV should keep valid days in ascending order: %+v", snapshots)
	}
	day := snapshots[2]
	if day.Platform != "wechat_video" || day.Followers != 441 || day.NewFollowers == nil ||
		*day.NewFollowers != 1 || day.Unfollows == nil || *day.Unfollows != 3 ||
		day.Source != "admin_export" {
		t.Fatalf("incorrect video account growth metrics: %+v", day)
	}
}

func TestParseWeChatVideoFollowerExportRejectsInvalidData(t *testing.T) {
	now := time.Date(2026, 11, 19, 5, 30, 0, 0, time.UTC)
	valid := "\"2026/11/18\",0,0,0,441"
	cases := []struct {
		name string
		csv  []byte
	}{
		{"wrong platform", []byte("时间,净增关注,新增关注,取消关注,关注者总数\n" + valid)},
		{"wrong header", []byte("视频号关注者增长详情数据,,,,,\n时间,点赞,新增关注,取消关注,关注者总数\n" + valid)},
		{"empty", channelsFollowersCSV("\"2026/11/18\",-,-,-,-")},
		{"partial missing", channelsFollowersCSV("\"2026/11/18\",-,-,0,-")},
		{"invalid count", channelsFollowersCSV("\"2026/11/18\",0,0,0,441人")},
		{"negative followers", channelsFollowersCSV("\"2026/11/18\",0,0,0,-1")},
		{"inconsistent net", channelsFollowersCSV("\"2026/11/18\",3,0,0,441")},
		{"incomplete current day", channelsFollowersCSV("\"2026/11/19\",0,0,0,441")},
		{"future", channelsFollowersCSV("\"2026/11/20\",0,0,0,441")},
		{"duplicate", channelsFollowersCSV(valid, valid)},
		{"wrong sort", channelsFollowersCSV("\"2026/11/17\",0,0,0,441", valid)},
		{"invalid date", channelsFollowersCSV("\"2026/13/18\",0,0,0,441")},
		{"not CSV", []byte("<html><body>视频号关注者增长详情数据</body></html>")},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := parseWeChatVideoFollowerExport(tc.csv, now); err == nil {
				t.Fatal(fmt.Sprintf("invalid file %s unexpectedly accepted", tc.name))
			}
		})
	}
}
