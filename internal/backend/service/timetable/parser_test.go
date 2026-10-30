package timetable

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

// Fixture covers the teaching-week grid, unknown-time list and reschedule entry
// used by the parser regressions, without student identity.
func schoolWorkbook(override string, reschedule ...string) []byte {
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
		rows[20]["G20"] = override
	}
	if len(reschedule) > 0 {
		rows[11]["D11"] = reschedule[0]
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

func TestRealSchoolExportStructureUsesGridInsteadOfReschedule(t *testing.T) {
	if got := DetectSemester(schoolWorkbook("")); got != "2026-2027学年第1学期" {
		t.Fatalf("unexpected semester %q", got)
	}
	courses, notes, err := ParseXLSX(schoolWorkbook(""))
	if err != nil {
		t.Fatal(err)
	}
	if len(courses) != 12 {
		t.Fatalf("course positions = %d, want 12", len(courses))
	}
	if len(notes) != 7 {
		t.Fatalf("undetermined courses = %d, want 7", len(notes))
	}
	if maxWeek(courses) != 17 {
		t.Fatalf("maxWeek = %d, want 17", maxWeek(courses))
	}
	var sourcePreserved, relocated, monday bool
	for _, course := range courses {
		if course.Name != "通信与网络" {
			continue
		}
		if course.Weekday == 3 && course.StartSection == 3 {
			sourcePreserved = course.Active(3) && course.Active(4)
		}
		if course.Weekday == 4 && course.StartSection == 11 {
			relocated = true
		}
		if course.Weekday == 1 {
			monday = course.Active(3) && course.Active(9) && course.Active(14) && !course.Active(15)
		}
	}
	if !sourcePreserved || relocated || !monday {
		t.Fatalf("grid occupancy: sourcePreserved=%v relocated=%v monday=%v: %#v", sourcePreserved, relocated, monday, courses)
	}
}

func TestTimetableIgnoresRescheduleMetadata(t *testing.T) {
	base, notes, err := ParseXLSX(schoolWorkbook(""))
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range []string{
		"【调课】不完整记录",
		"【调课】课程甲[C001],从6周星期6的1-2节调整为6周星期6的1-2节",
		"【调课】课程甲[C001],从3周星期1的5-6节调整为6周星期6的1-2节",
	} {
		got, gotNotes, err := ParseXLSX(schoolWorkbook("", entry))
		if err != nil || !reflect.DeepEqual(got, base) || !reflect.DeepEqual(gotNotes, notes) {
			t.Fatalf("reschedule metadata should not affect grid parsing: courses=%d notes=%d err=%v", len(got), len(gotNotes), err)
		}
	}
}

func TestParityAndRanges(t *testing.T) {
	got, e := parseCourseCell("C001-课程甲\n1-8周(单),星期1,第1节-第2节教室A", 1, 1, 2)
	if e != nil {
		t.Fatal(e)
	}
	if got[0].Parity != "all" || !reflect.DeepEqual(got[0].Weeks, []int{1, 3, 5, 7}) || !got[0].Active(1) || got[0].Active(2) || !got[0].Active(7) {
		t.Fatal("odd week filtering failed")
	}
	got, e = parseCourseCell("C001-课程甲\n1-8周(双),星期1,第1节-第2节教室A", 1, 1, 2)
	if e != nil {
		t.Fatal(e)
	}
	if got[0].Parity != "all" || !reflect.DeepEqual(got[0].Weeks, []int{2, 4, 6, 8}) || got[0].Active(1) || !got[0].Active(2) || !got[0].Active(8) {
		t.Fatal("even week filtering failed")
	}
	got, e = parseCourseCell("C001-课程甲\n1-8周单 星期一 第1-2节教室A", 1, 1, 2)
	if e != nil || got[0].Parity != "all" || !reflect.DeepEqual(got[0].Weeks, []int{1, 3, 5, 7}) || got[0].Weekday != 1 || got[0].StartSection != 1 || got[0].EndSection != 2 {
		t.Fatalf("alternate course text format: %#v err=%v", got, e)
	}
	got, e = parseCourseCell("C001-课程甲\n1-8周,第1-2节,星期一教室A", 1, 1, 2)
	if e != nil || got[0].Weekday != 1 || got[0].StartSection != 1 || got[0].EndSection != 2 || got[0].Location != "教室A" {
		t.Fatalf("reordered time fields: %#v err=%v", got, e)
	}
	for _, bad := range []string{"0周", "8-3周", "31周"} {
		if _, e := parseWeeks(bad[:len(bad)-len("周")]); e == nil {
			t.Fatalf("accepted invalid %s", bad)
		}
	}
	if got, err := parseCourseCell("C001-课程甲\n1-8周,星期1,第25-26节", 1, 1, 2); err == nil || len(got) != 0 {
		t.Fatalf("invalid explicit sections must not be replaced by grid time: courses=%+v err=%v", got, err)
	}
}

func TestCompoundWeekFragmentsExpandToActualWeeks(t *testing.T) {
	tests := []struct {
		expression string
		weeks      []int
	}{
		{"3-4周,6-14周(双)", []int{3, 4, 6, 8, 10, 12, 14}},
		{"3-5周(单),7-15周", []int{3, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15}},
		{"3,5,7周", []int{3, 5, 7}},
		{"3-5周,5-7周", []int{3, 4, 5, 6, 7}},
		{"4周,6-16周", []int{4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16}},
		{"3周,5-15周", []int{3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15}},
		{"7周,13周", []int{7, 13}},
		{"3-5周(单),9-11周(单),15-17周(单)", []int{3, 5, 9, 11, 15, 17}},
		{"7-8周,11-12周", []int{7, 8, 11, 12}},
		{"6周,9-10周,13周", []int{6, 9, 10, 13}},
	}
	for _, tt := range tests {
		t.Run(tt.expression, func(t *testing.T) {
			got, err := parseCourseCell("C001-课程甲\n"+tt.expression+",星期3,第5-8节教室A", 1, 1, 2)
			if err != nil {
				t.Fatal(err)
			}
			if len(got) != 1 || !reflect.DeepEqual(got[0].Weeks, tt.weeks) || got[0].Parity != "all" {
				t.Fatalf("weeks/parity = %v/%q, want %v/all", got[0].Weeks, got[0].Parity, tt.weeks)
			}
			if got[0].Weekday != 3 || got[0].StartSection != 5 || got[0].EndSection != 8 {
				t.Fatalf("explicit weekday and section range = %d %d-%d, want 3 5-8", got[0].Weekday, got[0].StartSection, got[0].EndSection)
			}
		})
	}

	if _, err := parseCourseCell("C001-课程甲\n3周,6--14周,星期3,第1节", 1, 1, 2); err == nil {
		t.Fatal("malformed later week fragment was silently ignored")
	}
	if _, err := parseCourseCell("C001-课程甲\n3周,星期3,6周,第1节", 1, 1, 2); err == nil {
		t.Fatal("week fragment after an explicit weekday was silently ignored")
	}
	if _, err := parseCourseCell("C001-课程甲\n2周(单),星期3,第1节", 1, 1, 2); err == nil {
		t.Fatal("empty result after parity filtering was accepted")
	}
}

func TestSuppliedRealTimetableSamples(t *testing.T) {
	paths := []string{
		os.Getenv("TARSGO_TIMETABLE_SAMPLE_1"),
		os.Getenv("TARSGO_TIMETABLE_SAMPLE_2"),
		os.Getenv("TARSGO_TIMETABLE_SAMPLE_3"),
	}
	provided := 0
	for _, path := range paths {
		if path != "" {
			provided++
		}
	}
	if provided == 0 {
		t.Skip("set all three TARSGO_TIMETABLE_SAMPLE_n paths to run the supplied-file regression")
	}
	if provided != len(paths) {
		t.Fatal("all three supplied timetable sample paths are required")
	}

	type expectedCourse struct {
		weekday, start, end int
		weeks               []int
	}
	tests := []struct {
		courseCount, noteCount int
		knownCourses           []expectedCourse
	}{
		{24, 1, []expectedCourse{
			{3, 1, 2, []int{3, 4, 6, 8, 10, 12, 14}},
			{5, 1, 4, []int{6, 7, 8, 9, 10, 12}},
			{1, 7, 8, []int{7, 8, 11, 12}},
			{1, 7, 8, []int{6, 9, 10, 13}},
			{6, 5, 8, []int{4, 5, 6, 7, 8, 9, 10, 11}},
			{6, 9, 11, []int{3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13}},
			{4, 9, 12, []int{3, 4, 5, 6}},
		}},
		{35, 0, []expectedCourse{
			{2, 3, 4, []int{3, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15}},
			{4, 3, 4, []int{3, 4, 5, 6, 9, 15}},
			{4, 3, 4, []int{7, 11, 13}},
			{2, 5, 6, []int{4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16}},
			{6, 5, 6, []int{7, 8, 11, 12}},
			{6, 5, 6, []int{6, 9, 10, 13}},
			{4, 5, 8, []int{5, 6, 7, 8, 9, 10, 11, 12, 13, 14}},
			{3, 9, 11, []int{3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13}},
		}},
		{33, 0, []expectedCourse{
			{2, 1, 2, []int{4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16}},
			{2, 3, 4, []int{3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15}},
			{4, 3, 4, []int{7, 13}},
			{4, 3, 4, []int{3, 5, 9, 11, 15, 17}},
			{6, 7, 8, []int{7, 8, 11, 12}},
			{6, 7, 8, []int{6, 9, 10, 13}},
			{5, 5, 8, []int{5, 6, 7, 8, 9, 10, 11, 12, 13, 14}},
			{4, 9, 11, []int{4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14}},
			{5, 9, 12, []int{3, 4, 5}},
			{5, 9, 12, []int{6, 7}},
		}},
	}
	for index, path := range paths {
		t.Run(fmt.Sprintf("sample_%d", index+1), func(t *testing.T) {
			data, err := os.ReadFile(path)
			if err != nil {
				t.Fatal("could not read supplied timetable sample")
			}
			courses, notes, err := ParseXLSX(data)
			if err != nil {
				t.Fatal("supplied timetable sample did not parse completely")
			}
			if detected := DetectSemester(data); detected != "" && detected != CurrentSemester {
				t.Fatal("supplied timetable semester differs from current configuration")
			}
			want := tests[index]
			if len(courses) != want.courseCount || len(notes) != want.noteCount {
				t.Fatalf("parsed courses/uncertain notes = %d/%d, want %d/%d", len(courses), len(notes), want.courseCount, want.noteCount)
			}
			for _, course := range courses {
				if course.Weekday < 1 || course.Weekday > 7 || course.StartSection < 1 || course.EndSection < course.StartSection || course.EndSection > 24 || course.Parity != "all" || !strictlyIncreasing(course.Weeks) {
					t.Fatalf("invalid actual-week occupancy: day=%d sections=%d-%d weeks=%v parity=%s", course.Weekday, course.StartSection, course.EndSection, course.Weeks, course.Parity)
				}
			}
			for _, expected := range want.knownCourses {
				if !hasCourseOccupancy(courses, expected.weekday, expected.start, expected.end, expected.weeks) {
					t.Fatalf("missing occupancy day=%d sections=%d-%d weeks=%v", expected.weekday, expected.start, expected.end, expected.weeks)
				}
			}

			service, mock := mockService(t)
			mock.ExpectQuery("SELECT GET_LOCK\\(\\?, 30\\)").WithArgs(lifecycleLockName).
				WillReturnRows(sqlmock.NewRows([]string{"GET_LOCK"}).AddRow(1))
			mock.ExpectBegin()
			mock.ExpectExec("INSERT INTO `personal_timetables`").WillReturnResult(sqlmock.NewResult(1, 1))
			mock.ExpectCommit()
			mock.ExpectQuery("SELECT RELEASE_LOCK\\(\\?\\)").WithArgs(lifecycleLockName).
				WillReturnRows(sqlmock.NewRows([]string{"RELEASE_LOCK"}).AddRow(1))
			stored, err := service.Import(context.Background(), uint64(index+1), filepath.Base(path), data)
			if err != nil || stored == nil || !reflect.DeepEqual(stored.Courses, courses) || !reflect.DeepEqual(stored.Notes, notes) {
				t.Fatal("supplied timetable did not preserve parsed occupancy through import")
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal("supplied timetable import did not complete its storage transaction")
			}
		})
	}
}

func hasCourseOccupancy(courses []Course, weekday, start, end int, weeks []int) bool {
	for _, course := range courses {
		if course.Weekday == weekday && course.StartSection == start && course.EndSection == end && reflect.DeepEqual(course.Weeks, weeks) {
			return true
		}
	}
	return false
}

func strictlyIncreasing(weeks []int) bool {
	if len(weeks) == 0 {
		return false
	}
	for index := 1; index < len(weeks); index++ {
		if weeks[index] <= weeks[index-1] {
			return false
		}
	}
	return true
}

func TestSeparateScheduleLinesUnionWeeksWithoutDuplicates(t *testing.T) {
	courses, _, err := ParseXLSX(schoolWorkbook("C001-课程甲\n7周,星期5,第5-8节教室A\nC001-课程甲\n13周,星期5,第5-8节教室A"))
	if err != nil {
		t.Fatal(err)
	}
	var matches []Course
	for _, course := range courses {
		if course.Code == "C001" {
			matches = append(matches, course)
		}
	}
	if len(matches) != 1 || !reflect.DeepEqual(matches[0].Weeks, []int{7, 13}) || matches[0].Parity != "all" {
		t.Fatalf("combined course fragments = %+v", matches)
	}
}

func TestInvalidCourseKeepsOtherParseResultsAndRejectsImport(t *testing.T) {
	if courses, _, err := ParseXLSX([]byte("not xlsx")); err == nil || len(courses) != 0 {
		t.Fatalf("accepted invalid workbook: courses=%d err=%v", len(courses), err)
	}
	courses, _, err := ParseXLSX(schoolWorkbook("C001-课程甲\n8-3周,星期3,第3节-第4节教室A"))
	if err == nil || len(courses) < 12 || !strings.Contains(err.Error(), "课程甲") || !strings.Contains(err.Error(), "旧课表未更改") {
		t.Fatalf("bad course should be reported while preserving other parsed courses: courses=%d err=%v", len(courses), err)
	}
}

func TestExplicitCourseTimeResolvesGridMismatch(t *testing.T) {
	courses, _, err := ParseXLSX(schoolWorkbook("C001-课程甲\n8周,星期4,第5节-第6节南湖-第1教学楼-四阶"))
	if err != nil {
		t.Fatal(err)
	}
	for _, course := range courses {
		if course.Code == "C001" {
			if course.Weekday != 4 || course.StartSection != 5 || course.EndSection != 6 {
				t.Fatalf("course text should determine explicit time despite grid mismatch: %+v", course)
			}
			return
		}
	}
	t.Fatal("mismatched course was not retained")
}

func TestMissingTimeFieldsAreFilledOnlyFromReliableGrid(t *testing.T) {
	courses, _, err := ParseXLSX(schoolWorkbook("C001-课程甲\n8周,星期4"))
	if err != nil {
		t.Fatal(err)
	}
	for _, course := range courses {
		if course.Code == "C001" {
			if course.Weekday != 4 || course.StartSection != 3 || course.EndSection != 4 {
				t.Fatalf("partial text should use its explicit weekday and fill sections from the grid: %+v", course)
			}
			return
		}
	}
	t.Fatal("partially specified course was not retained")
}

func TestMergedGridCellProvidesCombinedSectionRange(t *testing.T) {
	courses, notes, err := ParseXLSX(mergedGridWorkbook("C001-合并课程\n8周"))
	if err != nil {
		t.Fatal(err)
	}
	if len(notes) != 0 || len(courses) != 1 {
		t.Fatalf("merged grid result: courses=%+v notes=%+v", courses, notes)
	}
	if course := courses[0]; course.Weekday != 1 || course.StartSection != 1 || course.EndSection != 4 {
		t.Fatalf("merged cell did not resolve the full grid range: %+v", course)
	}
}

func TestMissingTimeWithoutReliableGridContextRemainsUnresolved(t *testing.T) {
	courses, err := parseCourseCell("C001-课程甲\n8周,星期3", 0, 0, 0)
	if err == nil || len(courses) != 0 || !strings.Contains(err.Error(), "节次") {
		t.Fatalf("missing section should remain unresolved: courses=%+v err=%v", courses, err)
	}
}

func mergedGridWorkbook(course string) []byte {
	values := map[string]string{
		"A13": "节次/星期", "C13": "星期一", "D13": "星期二", "E13": "星期三",
		"F13": "星期四", "G13": "星期五", "H13": "星期六", "I13": "星期日",
		"A14": "第1节-第2节", "C14": course, "A15": "第3节-第4节",
	}
	var buffer bytes.Buffer
	z := zip.NewWriter(&buffer)
	f, _ := z.Create("xl/worksheets/sheet1.xml")
	_, _ = f.Write([]byte("<worksheet><sheetData>"))
	for _, row := range []int{13, 14, 15} {
		_, _ = fmt.Fprintf(f, "<row r=%q>", fmt.Sprint(row))
		refs := []string{}
		for ref := range values {
			if strings.TrimLeft(ref, "ABCDEFGHIJKLMNOPQRSTUVWXYZ") == fmt.Sprint(row) {
				refs = append(refs, ref)
			}
		}
		sort.Strings(refs)
		for _, ref := range refs {
			var escaped bytes.Buffer
			_ = xml.EscapeText(&escaped, []byte(values[ref]))
			_, _ = fmt.Fprintf(f, "<c r=%q t=\"inlineStr\"><is><t>%s</t></is></c>", ref, escaped.String())
		}
		_, _ = f.Write([]byte("</row>"))
	}
	_, _ = f.Write([]byte("</sheetData><mergeCells count=\"1\"><mergeCell ref=\"C14:C15\"/></mergeCells></worksheet>"))
	_ = z.Close()
	return buffer.Bytes()
}

func mergedSectionRangesWorkbook() []byte {
	values := map[string]string{
		"A13": "节次/星期", "C13": "星期一", "D13": "星期二", "E13": "星期三",
		"F13": "星期四", "G13": "星期五", "H13": "星期六", "I13": "星期日",
		"A14": "第5节-第6节", "A15": "第7节-第8节",
		"A16": "第9节-第10节", "A17": "第11节-第12节",
		"C14": "C001-合并课甲\n7周,星期1,第5-8节教室A\nC001-合并课甲\n7周,星期1,第5-8节教室A",
		"D16": "C002-合并课乙\n7周,星期2,第9-11节教室B",
		"E16": "C003-合并课丙\n7周,星期3,第9-12节教室C",
	}
	var buffer bytes.Buffer
	z := zip.NewWriter(&buffer)
	f, _ := z.Create("xl/worksheets/sheet1.xml")
	_, _ = f.Write([]byte("<worksheet><sheetData>"))
	for _, row := range []int{13, 14, 15, 16, 17} {
		_, _ = fmt.Fprintf(f, "<row r=%q>", fmt.Sprint(row))
		refs := []string{}
		for ref := range values {
			if strings.TrimLeft(ref, "ABCDEFGHIJKLMNOPQRSTUVWXYZ") == fmt.Sprint(row) {
				refs = append(refs, ref)
			}
		}
		sort.Strings(refs)
		for _, ref := range refs {
			var escaped bytes.Buffer
			_ = xml.EscapeText(&escaped, []byte(values[ref]))
			_, _ = fmt.Fprintf(f, "<c r=%q t=\"inlineStr\"><is><t>%s</t></is></c>", ref, escaped.String())
		}
		_, _ = f.Write([]byte("</row>"))
	}
	_, _ = f.Write([]byte("</sheetData><mergeCells count=\"3\"><mergeCell ref=\"C14:C15\"/><mergeCell ref=\"D16:D17\"/><mergeCell ref=\"E16:E17\"/></mergeCells></worksheet>"))
	_ = z.Close()
	return buffer.Bytes()
}

func TestMergedGridRangesKeepFullExplicitSectionsAndDeduplicateRecords(t *testing.T) {
	courses, notes, err := ParseXLSX(mergedSectionRangesWorkbook())
	if err != nil {
		t.Fatal(err)
	}
	if len(notes) != 0 || len(courses) != 3 {
		t.Fatalf("courses=%+v notes=%+v, want three unique merged-cell courses and no notes", courses, notes)
	}
	want := map[int][2]int{1: {5, 8}, 2: {9, 11}, 3: {9, 12}}
	for _, course := range courses {
		sections, ok := want[course.Weekday]
		if !ok || course.StartSection != sections[0] || course.EndSection != sections[1] || !reflect.DeepEqual(course.Weeks, []int{7}) {
			t.Fatalf("merged course time = weekday %d sections %d-%d weeks %v", course.Weekday, course.StartSection, course.EndSection, course.Weeks)
		}
		delete(want, course.Weekday)
	}
	if len(want) != 0 {
		t.Fatalf("missing merged-grid weekdays %v", want)
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
	if err != nil || len(courses) != 12 || len(notes) != 7 {
		t.Fatalf("shared strings workbook: %d courses %d notes err %v", len(courses), len(notes), err)
	}
}
