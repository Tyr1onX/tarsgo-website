package handler

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"strings"
	"testing"
	"time"
)

func makeDouyinFansXLSX(t *testing.T, rows [][]string) []byte {
	t.Helper()
	var buffer bytes.Buffer
	archive := zip.NewWriter(&buffer)
	file, err := archive.Create("xl/worksheets/sheet1.xml")
	if err != nil {
		t.Fatal(err)
	}
	fmt.Fprint(file, `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`)
	for rowIndex, row := range rows {
		fmt.Fprintf(file, `<row r="%d">`, rowIndex+1)
		for index, value := range row {
			var escaped bytes.Buffer
			if err := xml.EscapeText(&escaped, []byte(value)); err != nil {
				t.Fatal(err)
			}
			fmt.Fprintf(file, `<c r="%c%d" t="inlineStr"><is><t>%s</t></is></c>`, 'A'+index, rowIndex+1, escaped.String())
		}
		fmt.Fprint(file, `</row>`)
	}
	fmt.Fprint(file, `</sheetData></worksheet>`)
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func TestParseDouyinFansExport(t *testing.T) {
	rows := [][]string{
		{"日期", "总粉丝量", "粉丝净增", "吸粉量", "脱粉量", "回访粉丝量"},
		{"2026-11-16", "795", "3", "3", "0", "1"},
		{"2026-11-17", "801", "6", "6", "0", "5"},
	}
	bin := makeDouyinFansXLSX(t, rows)
	actual, err := parseDouyinFansExport(bytes.NewReader(bin), int64(len(bin)), time.Date(2026, 11, 18, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if len(actual) != 2 || actual[0].Platform != "douyin" || actual[0].ObservedOn != "2026-11-16" || actual[0].Followers != 795 || actual[0].Source != "creator_export" || actual[0].NewFollowers == nil || *actual[0].NewFollowers != 3 || actual[0].Unfollows == nil || *actual[0].Unfollows != 0 || actual[1].ReturningFans == nil || *actual[1].ReturningFans != 5 {
		t.Fatalf("unexpected snapshots: %+v", actual)
	}
}

func TestParseDouyinFansExportRejectsInvalid(t *testing.T) {
	now := time.Date(2026, 11, 18, 0, 0, 0, 0, time.UTC)
	header := []string{"日期", "总粉丝量", "粉丝净增", "吸粉量", "脱粉量", "回访粉丝量"}
	valid := []string{"2026-11-17", "801", "6", "6", "0", "5"}
	for _, tt := range []struct {
		name                  string
		header, first, second []string
	}{
		{"invalid header", []string{"日期", "总粉丝量", "粉丝净增", "吸粉量", "脱粉量", "视频播放量"}, valid, nil},
		{"invalid date", header, []string{"2026-11-31", "801", "6", "6", "0", "5"}, nil},
		{"future date", header, []string{"2026-11-19", "801", "6", "6", "0", "5"}, nil},
		{"negative followers", header, []string{"2026-11-17", "-1", "6", "6", "0", "5"}, nil},
		{"inconsistent net", header, []string{"2026-11-17", "801", "7", "6", "0", "5"}, nil},
		{"non-numeric fans", header, []string{"2026-11-17", "801粉", "6", "6", "0", "5"}, nil},
		{"duplicate date", header, valid, valid},
	} {
		t.Run(tt.name, func(t *testing.T) {
			rows := [][]string{tt.header, tt.first}
			if tt.second != nil {
				rows = append(rows, tt.second)
			}
			bin := makeDouyinFansXLSX(t, rows)
			if _, err := parseDouyinFansExport(bytes.NewReader(bin), int64(len(bin)), now); err == nil {
				t.Fatal("accepted invalid data")
			}
		})
	}
	if _, err := parseDouyinFansExport(strings.NewReader("invalid"), 7, now); err == nil {
		t.Fatal("accepted non-xlsx")
	}
	// Explicitly reject uploading an artwork file to the fan route.
	bin := makeDouyinXLSX(t, "2026-11-02 10:52:35", "公开", "123")
	if _, err := parseDouyinFansExport(bytes.NewReader(bin), int64(len(bin)), now); err == nil {
		t.Fatal("accepted artwork XLSX")
	}
}
