package timetable

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"regexp"
	"sort"
	"testing"
)

// Fixture transcribes the actual teaching-week grid, unknown-time list and
// reschedule entry from the user-provided school export, without student identity.
func schoolWorkbook(override string) []byte {
	rows := map[int]map[string]string{
		3:  {"A3": "　　2026-2027学年第1学期"},
		4:  {"A4": "上课时间暂未确定的课程：", "D4": "单片机原理实验 [ae22203008] 上课周次 3-8周"},
		5:  {"D5": "计算思维与操作系统课程设计 [ae22203020] 上课周次 3-16周"},
		6:  {"D6": "高频电子技术实验 [ae22203042] 上课周次 3-10周"},
		7:  {"D7": "通信原理综合实验 [ae22203043] 上课周次 3-11周"},
		8:  {"D8": "数电实验 [ae22203044] 上课周次 2周"},
		9:  {"D9": "认识实习（通信工程） [ae22203051] 上课周次 5-6周"},
		10: {"D10": "工程训练C [ae22493003] 上课周次 1周"},
		11: {"A11": "调课信息：", "D11": "【调课】通信与网络[ae22202129],从3周星期3的3-4节调整为6周星期4的11-12节,南湖-第1教学楼-四阶"},
		13: {"A13": "节次/星期", "C13": "星期一", "D13": "星期二", "E13": "星期三", "F13": "星期四", "G13": "星期五", "H13": "星期六", "I13": "星期日"},
		14: {"A14": "第1节-第2节", "C14": "ae22202129-通信与网络[03]\n9周,星期1,第1节-第2节南湖-第1教学楼-四阶,\nae22202129-通信与网络[03]\n10-14周,星期1,第1节-第2节南湖-第1教学楼-四阶,\nae22202129-通信与网络[03]\n3-8周,星期1,第1节-第2节南湖-第1教学楼-四阶", "E14": "ae22201009-单片机原理及其应用[04]\n6-13周,星期3,第1节-第2节南湖-第1教学楼-三阶"},
		20: {"A20": "第3节-第4节", "C20": "ae22201041-信息论[04]\n3-10周,星期1,第3节-第4节南湖-第1教学楼-四阶", "D20": "ae22201033-数字信号处理A[03]\n3-14周,星期2,第3节-第4节南湖-第1教学楼-七阶", "E20": "ae22202129-通信与网络[03]\n9周,星期3,第3节-第4节南湖-第1教学楼-四阶,\n调课\nae22202129-通信与网络[03]\n3-8周,星期3,第3节-第4节南湖-第1教学楼-四阶,\nae22202129-通信与网络[03]\n10-14周,星期3,第3节-第4节南湖-第1教学楼-四阶", "F20": "ae22201040-高频电子技术[03]\n3-10周,星期4,第3节-第4节南湖-第1教学楼-七阶"},
		26: {"A26": "第5节-第6节", "C26": "ae22201009-单片机原理及其应用[04]\n6-13周,星期1,第5节-第6节南湖-第1教学楼-三阶", "E26": "ae22201040-高频电子技术[03]\n3-10周,星期3,第5节-第6节南湖-第1教学楼-七阶", "F26": "ae22201041-信息论[04]\n3-10周,星期4,第5节-第6节南湖-第1教学楼-四阶", "G26": "ae22201033-数字信号处理A[03]\n3-14周,星期5,第5节-第6节南湖-第1教学楼-七阶"},
		32: {"A32": "第7节-第8节", "F32": "ae22202134-服务机器人[03]\n8-17周,星期4,第7节-第8节南湖-第1教学楼-四阶", "H32": "ae22202059-现场总线技术[03]\n8-17周,星期6,第7节-第8节南湖-第1教学楼-四阶"},
	}
	if override != "" {
		rows[20]["E20"] = override
	}
	var buffer bytes.Buffer
	z := zip.NewWriter(&buffer)
	f, _ := z.Create("xl/worksheets/sheet1.xml")
	_, _ = f.Write([]byte("<worksheet><sheetData>"))
	indices := make([]int, 0, len(rows))
	for row := range rows {
		indices = append(indices, row)
	}
	sort.Ints(indices)
	for _, row := range indices {
		_, _ = fmt.Fprintf(f, "<row r=%q>", fmt.Sprint(row))
		cells := rows[row]
		keys := make([]string, 0, len(cells))
		for col := range cells {
			keys = append(keys, col)
		}
		sort.Strings(keys)
		for _, ref := range keys {
			var escaped bytes.Buffer
			_ = xml.EscapeText(&escaped, []byte(cells[ref]))
			_, _ = fmt.Fprintf(f, "<c r=%q t=\"inlineStr\"><is><t>%s</t></is></c>", ref, escaped.String())
		}
		_, _ = f.Write([]byte("</row>"))
	}
	_, _ = f.Write([]byte("</sheetData></worksheet>"))
	_ = z.Close()
	return buffer.Bytes()
}

func TestRealSchoolExportStructureWeekAndReschedule(t *testing.T) {
	if got := DetectSemester(schoolWorkbook("")); got != "2026-2027学年第1学期" {
		t.Fatalf("unexpected semester %q", got)
	}
	courses, notes, err := ParseXLSX(schoolWorkbook(""))
	if err != nil {
		t.Fatal(err)
	}
	if len(courses) != 13 {
		t.Fatalf("course positions = %d, want 13", len(courses))
	}
	if len(notes) != 7 {
		t.Fatalf("undetermined courses = %d, want 7", len(notes))
	}
	if maxWeek(courses) != 17 {
		t.Fatalf("maxWeek = %d, want 17", maxWeek(courses))
	}
	var removed, added, monday bool
	for _, course := range courses {
		if course.Name != "通信与网络" {
			continue
		}
		if course.Weekday == 3 && course.StartSection == 3 {
			removed = !course.Active(3) && course.Active(4)
		}
		if course.Weekday == 4 && course.StartSection == 11 {
			added = course.Active(6) && !course.Active(3)
		}
		if course.Weekday == 1 {
			monday = course.Active(3) && course.Active(9) && course.Active(14) && !course.Active(15)
		}
	}
	if !removed || !added || !monday {
		t.Fatalf("reschedule/week mapping: removed=%v added=%v monday=%v: %#v", removed, added, monday, courses)
	}
}

func TestParityAndRanges(t *testing.T) {
	got, e := parseCourseCell("C001-课程甲\n1-8周(单),星期1,第1节-第2节教室A", 1, 1, 2)
	if e != nil {
		t.Fatal(e)
	}
	if !got[0].Active(1) || got[0].Active(2) || !got[0].Active(7) {
		t.Fatal("odd week filtering failed")
	}
	got, e = parseCourseCell("C001-课程甲\n1-8周(双),星期1,第1节-第2节教室A", 1, 1, 2)
	if e != nil {
		t.Fatal(e)
	}
	if got[0].Active(1) || !got[0].Active(2) || !got[0].Active(8) {
		t.Fatal("even week filtering failed")
	}
	for _, bad := range []string{"0周", "8-3周", "31周"} {
		if _, e := parseWeeks(bad[:len(bad)-len("周")]); e == nil {
			t.Fatalf("accepted invalid %s", bad)
		}
	}
}

func TestInvalidGridOrAdjustmentPreservesNoOutput(t *testing.T) {
	for _, data := range [][]byte{
		[]byte("not xlsx"), schoolWorkbook("C001-课程\n8-3周,星期3,第3节-第4节教室A"),
	} {
		if courses, _, err := ParseXLSX(data); err == nil || len(courses) != 0 {
			t.Fatalf("accepted bad workbook: courses=%d err=%v", len(courses), err)
		}
	}
}

func TestSharedStringCellsLikeRealSchoolExport(t *testing.T) {
	original := schoolWorkbook("")
	input, e := zip.NewReader(bytes.NewReader(original), int64(len(original)))
	if e != nil {
		t.Fatal(e)
	}
	f, e := input.File[0].Open()
	if e != nil {
		t.Fatal(e)
	}
	body, e := io.ReadAll(f)
	_ = f.Close()
	if e != nil {
		t.Fatal(e)
	}
	cellRe := regexp.MustCompile(`(?s)<c r="([^"]+)" t="inlineStr"><is><t>(.*?)</t></is></c>`)
	values := []string{}
	sheetXML := cellRe.ReplaceAllStringFunc(string(body), func(s string) string {
		m := cellRe.FindStringSubmatch(s)
		values = append(values, m[2])
		return fmt.Sprintf(`<c r="%s" t="s"><v>%d</v></c>`, m[1], len(values)-1)
	})
	var buffer bytes.Buffer
	z := zip.NewWriter(&buffer)
	part, _ := z.Create("xl/worksheets/sheet1.xml")
	_, _ = part.Write([]byte(sheetXML))
	part, _ = z.Create("xl/sharedStrings.xml")
	_, _ = part.Write([]byte("<sst>"))
	for _, value := range values {
		_, _ = part.Write([]byte("<si><t>" + value + "</t></si>"))
	}
	_, _ = part.Write([]byte("</sst>"))
	_ = z.Close()
	courses, notes, err := ParseXLSX(buffer.Bytes())
	if err != nil || len(courses) != 13 || len(notes) != 7 {
		t.Fatalf("shared strings workbook: %d courses %d notes err %v", len(courses), len(notes), err)
	}
}
