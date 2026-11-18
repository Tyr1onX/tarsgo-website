package handler

import (
	"archive/zip"
	"bytes"
	"fmt"
	"strings"
	"testing"
	"time"
)

func makeDouyinXLSX(t *testing.T, date, status, views string) []byte {
	t.Helper()
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	shared, err := writer.Create("xl/sharedStrings.xml")
	if err != nil {
		t.Fatal(err)
	}
	labels := []string{"作品名称", "发布时间", "体裁", "审核状态", "播放量", "点赞量", "分享量", "评论量", "收藏量", "主页访问量", "粉丝增量", "标题第一行\n详细说明", date, status, "1min-视频"}
	fmt.Fprint(shared, `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`)
	for _, label := range labels {
		fmt.Fprintf(shared, "<si><t>%s</t></si>", label)
	}
	fmt.Fprint(shared, "</sst>")
	sheet, err := writer.Create("xl/worksheets/sheet1.xml")
	if err != nil {
		t.Fatal(err)
	}
	fmt.Fprintf(sheet, `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
		<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c><c r="K1" t="s"><v>5</v></c><c r="L1" t="s"><v>6</v></c><c r="M1" t="s"><v>7</v></c><c r="N1" t="s"><v>8</v></c><c r="O1" t="s"><v>9</v></c><c r="P1" t="s"><v>10</v></c></row>
		<row r="2"><c r="A2" t="s"><v>11</v></c><c r="B2" t="s"><v>12</v></c><c r="C2" t="s"><v>14</v></c><c r="D2" t="s"><v>13</v></c><c r="E2"><v>%s</v></c><c r="K2"><v>727</v></c><c r="L2"><v>220</v></c><c r="M2"><v>45</v></c><c r="N2"><v>80</v></c><c r="O2"><v>689</v></c><c r="P2"><v>49</v></c></row>
	</sheetData></worksheet>`, views)
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func TestParseDouyinExport(t *testing.T) {
	now := time.Date(2026, 11, 18, 8, 0, 0, 0, time.UTC)
	bin := makeDouyinXLSX(t, "2026-11-02 10:52:35", "公开", "15485")
	posts, err := parseDouyinExport(bytes.NewReader(bin), int64(len(bin)), now)
	if err != nil {
		t.Fatal(err)
	}
	if len(posts) != 1 || posts[0].Platform != "douyin" || posts[0].Title != "标题第一行" ||
		posts[0].ViewCount != 15485 || posts[0].URL != "" || posts[0].MediaType != "video" ||
		posts[0].LikeCount != 727 || posts[0].CommentCount != 45 || posts[0].ShareCount != 220 || posts[0].FavoriteCount != 80 ||
		posts[0].ProfileVisits == nil || *posts[0].ProfileVisits != 689 || posts[0].FollowerGain == nil || *posts[0].FollowerGain != 49 ||
		posts[0].PublishedAt.Format(time.RFC3339) != "2026-11-02T02:52:35Z" ||
		posts[0].ExternalID != fmt.Sprint(posts[0].PublishedAt.Unix()) {
		t.Fatalf("unexpected imported post: %+v", posts)
	}
}

func TestParseDouyinExportRejectsInvalidData(t *testing.T) {
	now := time.Date(2026, 11, 18, 8, 0, 0, 0, time.UTC)
	for _, test := range []struct {
		name, date, status, views string
	}{
		{"no public posts", "2026-11-02 10:52:35", "仅自己可见", "123"},
		{"invalid date", "2026/11/02", "公开", "123"},
		{"future publication", "2027-11-02 10:52:35", "公开", "123"},
		{"invalid views", "2026-11-02 10:52:35", "公开", "-2"},
		{"nonnumeric views", "2026-11-02 10:52:35", "公开", "123万"},
	} {
		t.Run(test.name, func(t *testing.T) {
			bin := makeDouyinXLSX(t, test.date, test.status, test.views)
			if _, err := parseDouyinExport(bytes.NewReader(bin), int64(len(bin)), now); err == nil {
				t.Fatalf("accepted invalid %s", test.name)
			}
		})
	}
	if _, err := parseDouyinExport(strings.NewReader("not an XLSX"), 11, now); err == nil {
		t.Fatal("accepted non-xlsx data")
	}
}

