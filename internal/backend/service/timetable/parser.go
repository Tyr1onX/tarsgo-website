package timetable

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

type sheet struct{ rows map[int]map[int]string }

var courseTitle = regexp.MustCompile("(?i)^([a-z][a-z0-9]*)-(.+?)(?:\\[\\d+\\])?$")
var weekClause = regexp.MustCompile("^([0-9,，、\\-－~～ ]+)周(?:[（(]([单双])[）)]|([单双]))?[,，]?星期([1-7一二三四五六日天])[,，]?第(\\d+)节[-－~～至]第?(\\d+)节(.*)$")
var sectionLabel = regexp.MustCompile("^第(\\d+)节[-－~～至]第?(\\d+)节$")
var unknownCourse = regexp.MustCompile("^(.+?)\\s*\\[[A-Za-z0-9]+\\]\\s*(上课周次\\s*[0-9,，、\\-]+周)")
var adjustment = regexp.MustCompile("^【调课】(.+?)\\[([A-Za-z0-9]+)\\],从(\\d+)周星期([1-7])的(\\d+)-(\\d+)节调整为(\\d+)周星期([1-7])的(\\d+)-(\\d+)节(?:,(.*))?$")

var semesterLabel = regexp.MustCompile("[0-9]{4}-[0-9]{4}学年第[一二12]学期")

// DetectSemester reads only academic-term metadata; student identity is ignored.
func DetectSemester(data []byte) string {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return ""
	}
	var shared []string
	for _, f := range reader.File {
		if f.Name == "xl/sharedStrings.xml" {
			shared, _ = readSharedStrings(f)
			break
		}
	}
	for _, f := range reader.File {
		if !strings.HasPrefix(f.Name, "xl/worksheets/sheet") || !strings.HasSuffix(f.Name, ".xml") {
			continue
		}
		sh, err := readSheet(f, shared)
		if err != nil {
			continue
		}
		for _, cells := range sh.rows {
			for _, value := range cells {
				if term := semesterLabel.FindString(value); term != "" {
					return term
				}
			}
		}
	}
	return ""
}

func ParseXLSX(data []byte) ([]Course, []Note, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, nil, errors.New("不是有效的 XLSX 工作簿，旧课表未更改")
	}
	if len(reader.File) > 100 {
		return nil, nil, errors.New("Excel 文件包含过多内部文件，旧课表未更改")
	}
	var totalUncompressed uint64
	for _, f := range reader.File {
		totalUncompressed += f.UncompressedSize64
		if f.UncompressedSize64 > 12<<20 || totalUncompressed > 32<<20 {
			return nil, nil, errors.New("Excel 解压内容过大，旧课表未更改")
		}
	}
	var shared []string
	for _, f := range reader.File {
		if f.Name == "xl/sharedStrings.xml" {
			shared, err = readSharedStrings(f)
			if err != nil {
				return nil, nil, errors.New("无法读取 Excel 文本，旧课表未更改")
			}
		}
	}
	courses := []Course{}
	notes := []Note{}
	adjustments := []string{}
	gridCount := 0
	for _, f := range reader.File {
		if !strings.HasPrefix(f.Name, "xl/worksheets/sheet") || !strings.HasSuffix(f.Name, ".xml") {
			continue
		}
		sh, e := readSheet(f, shared)
		if e != nil {
			return nil, nil, errors.New("Excel 工作表无法读取，旧课表未更改")
		}
		for row, cells := range sh.rows {
			for _, value := range cells {
				if strings.Contains(value, "上课时间暂未确定的课程：") {
					for r := row; r <= row+20; r++ {
						data := sh.rows[r]
						if data == nil {
							break
						}
						if containsLabel(data, "调课信息：") {
							break
						}
						for _, entry := range data {
							if m := unknownCourse.FindStringSubmatch(strings.TrimSpace(entry)); m != nil {
								notes = append(notes, Note{Name: strings.TrimSpace(m[1]), Reason: m[2] + "，时间未确定（不计入占用）"})
							}
						}
					}
				}
				if strings.HasPrefix(strings.TrimSpace(value), "【调课】") {
					adjustments = append(adjustments, strings.TrimSpace(value))
				}
			}
		}
		indices := make([]int, 0, len(sh.rows))
		for row := range sh.rows {
			indices = append(indices, row)
		}
		sort.Ints(indices)
		for _, headerRow := range indices {
			weekdays := map[int]int{}
			for col, value := range sh.rows[headerRow] {
				if day := weekdayHeader(strings.TrimSpace(value)); day > 0 {
					weekdays[col] = day
				}
			}
			if len(weekdays) < 5 {
				continue
			}
			sectionRows := 0
			for row := headerRow + 1; row <= headerRow+40; row++ {
				start, end, ok := sectionAt(sh.rows[row], minColumn(weekdays))
				if !ok {
					continue
				}
				sectionRows++
				for col, day := range weekdays {
					raw := strings.TrimSpace(sh.rows[row][col])
					if raw == "" || raw == "无" || raw == "暂无" || raw == "调课" {
						continue
					}
					parsed, e := parseCourseCell(raw, day, start, end)
					if e != nil {
						return nil, nil, fmt.Errorf("课表第%d行星期%d的课程无法可靠解析：%v；旧课表未更改", row, day, e)
					}
					courses = append(courses, parsed...)
				}
			}
			if sectionRows >= 2 {
				gridCount++
			}
		}
	}
	if gridCount == 0 {
		return nil, nil, errors.New("未找到有效的星期/节次课程网格，旧课表未更改")
	}
	courses = combine(courses)
	for _, raw := range adjustments {
		for _, line := range strings.Split(raw, "\n") {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			if !strings.HasPrefix(line, "【调课】") {
				return nil, nil, errors.New("存在无法识别的调课记录，旧课表未更改")
			}
			if err := applyAdjustment(&courses, line); err != nil {
				return nil, nil, fmt.Errorf("%v，旧课表未更改", err)
			}
		}
	}
	courses = combine(courses)
	if len(courses) == 0 {
		return nil, nil, errors.New("未识别到确定时间的课程，旧课表未更改")
	}
	sort.Slice(courses, func(i, j int) bool {
		a, b := courses[i], courses[j]
		if a.Weekday != b.Weekday {
			return a.Weekday < b.Weekday
		}
		if a.StartSection != b.StartSection {
			return a.StartSection < b.StartSection
		}
		return a.Name < b.Name
	})
	return courses, notes, nil
}

func containsLabel(cells map[int]string, target string) bool {
	for _, v := range cells {
		if strings.Contains(v, target) {
			return true
		}
	}
	return false
}
func minColumn(days map[int]int) int {
	min := 999
	for col := range days {
		if col < min {
			min = col
		}
	}
	return min
}
func sectionAt(cells map[int]string, firstDayCol int) (int, int, bool) {
	for col, v := range cells {
		if col >= firstDayCol {
			continue
		}
		m := sectionLabel.FindStringSubmatch(strings.TrimSpace(v))
		if m == nil {
			continue
		}
		a, _ := strconv.Atoi(m[1])
		b, _ := strconv.Atoi(m[2])
		if a > 0 && b >= a && b <= 24 {
			return a, b, true
		}
	}
	return 0, 0, false
}
func weekdayHeader(value string) int {
	switch value {
	case "星期一", "星期1":
		return 1
	case "星期二", "星期2":
		return 2
	case "星期三", "星期3":
		return 3
	case "星期四", "星期4":
		return 4
	case "星期五", "星期5":
		return 5
	case "星期六", "星期6":
		return 6
	case "星期日", "星期天", "星期7":
		return 7
	}
	return 0
}
func parseDay(v string) int {
	if len(v) == 1 {
		if day, err := strconv.Atoi(v); err == nil {
			return day
		}
	}
	return weekdayHeader("星期" + v)
}
func parseCourseCell(value string, gridDay, gridStart, gridEnd int) ([]Course, error) {
	lines := strings.Split(strings.ReplaceAll(value, "\r", ""), "\n")
	result := []Course{}
	currentCode, currentName := "", ""
	found := false
	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" || line == "调课" {
			continue
		}
		if m := courseTitle.FindStringSubmatch(line); m != nil {
			currentCode, currentName = m[1], strings.TrimSpace(m[2])
			found = false
			if currentName == "" {
				return nil, errors.New("课程名称为空")
			}
			continue
		}
		if m := weekClause.FindStringSubmatch(line); m != nil {
			if currentName == "" {
				return nil, errors.New("缺少课程名称")
			}
			weeks, e := parseWeeks(m[1])
			if e != nil {
				return nil, e
			}
			parity := "all"
			flag := m[2]
			if flag == "" {
				flag = m[3]
			}
			if flag == "单" {
				parity = "odd"
			} else if flag == "双" {
				parity = "even"
			}
			day := parseDay(m[4])
			start, _ := strconv.Atoi(m[5])
			end, _ := strconv.Atoi(m[6])
			if day != gridDay || start != gridStart || end != gridEnd {
				return nil, errors.New("网格星期或节次与课程文字不一致")
			}
			location := strings.Trim(strings.TrimSpace(m[7]), ",，;； ")
			if strings.Contains(location, "\n") {
				return nil, errors.New("地点信息无效")
			}
			if len(weeks) == 0 {
				return nil, errors.New("课程教学周为空")
			}
			result = append(result, Course{Code: currentCode, Name: currentName, Weekday: day, StartSection: start, EndSection: end, Weeks: weeks, Parity: parity, Location: location})
			found = true
			continue
		}
		if currentName != "" && !found {
			return nil, fmt.Errorf("课程 %s 缺少完整周次/节次信息", currentName)
		}
		// Ignore annotation only after a fully parsed course segment.
	}
	if currentName != "" && !found {
		return nil, errors.New("最后一门课程缺少有效教学周")
	}
	if len(result) == 0 {
		return nil, errors.New("非空单元格未包含有效课程")
	}
	return result, nil
}
func parseWeeks(raw string) ([]int, error) {
	raw = strings.NewReplacer("，", ",", "、", ",", "－", "-", "~", "-", "～", "-", " ", "").Replace(raw)
	seen := map[int]bool{}
	for _, part := range strings.Split(raw, ",") {
		if part == "" {
			return nil, errors.New("周次格式无效")
		}
		bits := strings.Split(part, "-")
		if len(bits) > 2 {
			return nil, errors.New("周次范围无效")
		}
		a, e := strconv.Atoi(bits[0])
		if e != nil {
			return nil, errors.New("周次格式无效")
		}
		b := a
		if len(bits) == 2 {
			b, e = strconv.Atoi(bits[1])
			if e != nil {
				return nil, errors.New("周次格式无效")
			}
		}
		if a < 1 || b < a || b > 30 {
			return nil, errors.New("周次超出1-30周或范围倒置")
		}
		for w := a; w <= b; w++ {
			seen[w] = true
		}
	}
	out := make([]int, 0, len(seen))
	for w := range seen {
		out = append(out, w)
	}
	sort.Ints(out)
	return out, nil
}
func combine(items []Course) []Course {
	out := []Course{}
	keys := map[string]int{}
	for _, c := range items {
		if len(c.Weeks) == 0 {
			continue
		}
		key := fmt.Sprintf("%s|%s|%d|%d|%d|%s|%s", c.Code, c.Name, c.Weekday, c.StartSection, c.EndSection, c.Parity, c.Location)
		if idx, ok := keys[key]; ok {
			weeks := append(out[idx].Weeks, c.Weeks...)
			seen := map[int]bool{}
			for _, w := range weeks {
				seen[w] = true
			}
			out[idx].Weeks = out[idx].Weeks[:0]
			for w := range seen {
				out[idx].Weeks = append(out[idx].Weeks, w)
			}
			sort.Ints(out[idx].Weeks)
		} else {
			keys[key] = len(out)
			out = append(out, c)
		}
	}
	return out
}
func applyAdjustment(courses *[]Course, raw string) error {
	m := adjustment.FindStringSubmatch(raw)
	if m == nil {
		return errors.New("调课格式无法识别")
	}
	code := m[2]
	fromWeek, _ := strconv.Atoi(m[3])
	fromDay, _ := strconv.Atoi(m[4])
	fromStart, _ := strconv.Atoi(m[5])
	fromEnd, _ := strconv.Atoi(m[6])
	toWeek, _ := strconv.Atoi(m[7])
	toDay, _ := strconv.Atoi(m[8])
	toStart, _ := strconv.Atoi(m[9])
	toEnd, _ := strconv.Atoi(m[10])
	if fromWeek < 1 || toWeek < 1 || toWeek > 30 || fromDay < 1 || fromDay > 7 || toDay < 1 || toDay > 7 || fromStart < 1 || fromEnd < fromStart || toStart < 1 || toEnd < toStart || toEnd > 24 {
		return errors.New("调课日期或节次无效")
	}
	for i := range *courses {
		c := &(*courses)[i]
		if c.Code != code || c.Weekday != fromDay || c.StartSection != fromStart || c.EndSection != fromEnd {
			continue
		}
		for idx, week := range c.Weeks {
			if week != fromWeek {
				continue
			}
			if !c.Active(fromWeek) {
				return errors.New("调课源教学周不在有效单双周内")
			}
			moved := *c
			moved.Weeks = []int{toWeek}
			moved.Weekday = toDay
			moved.StartSection = toStart
			moved.EndSection = toEnd
			moved.Parity = "all"
			if suffix := strings.TrimSpace(m[11]); suffix != "" {
				location := strings.Split(suffix, ",")[0]
				if location != "" {
					moved.Location = location
				}
			}
			c.Weeks = append(c.Weeks[:idx], c.Weeks[idx+1:]...)
			*courses = append(*courses, moved)
			return nil
		}
	}
	return errors.New("调课源课程或教学周无法匹配")
}
func readSharedStrings(f *zip.File) ([]string, error) {
	r, e := f.Open()
	if e != nil {
		return nil, e
	}
	defer r.Close()
	decoder := xml.NewDecoder(r)
	values := []string{}
	inSI, inText := false, false
	var value strings.Builder
	for {
		token, e := decoder.Token()
		if e == io.EOF {
			break
		}
		if e != nil {
			return nil, e
		}
		switch t := token.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "si":
				inSI = true
				value.Reset()
			case "t":
				if inSI {
					inText = true
				}
			}
		case xml.CharData:
			if inSI && inText {
				value.Write([]byte(t))
			}
		case xml.EndElement:
			switch t.Name.Local {
			case "t":
				inText = false
			case "si":
				values = append(values, value.String())
				inSI = false
			}
		}
	}
	return values, nil
}
func readSheet(f *zip.File, shared []string) (sheet, error) {
	r, e := f.Open()
	if e != nil {
		return sheet{}, e
	}
	defer r.Close()
	decoder := xml.NewDecoder(r)
	result := sheet{rows: map[int]map[int]string{}}
	row, col := 0, 0
	ctype := ""
	var buf strings.Builder
	inValue := false
	for {
		token, e := decoder.Token()
		if e == io.EOF {
			break
		}
		if e != nil {
			return sheet{}, e
		}
		switch t := token.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "row":
				for _, a := range t.Attr {
					if a.Name.Local == "r" {
						row, _ = strconv.Atoi(a.Value)
					}
				}
			case "c":
				col = 0
				ctype = ""
				buf.Reset()
				for _, a := range t.Attr {
					if a.Name.Local == "r" {
						col = cellColumn(a.Value)
					}
					if a.Name.Local == "t" {
						ctype = a.Value
					}
				}
			case "v", "t":
				inValue = true
			}
		case xml.CharData:
			if inValue {
				buf.Write([]byte(t))
			}
		case xml.EndElement:
			switch t.Name.Local {
			case "v", "t":
				inValue = false
			case "c":
				value := buf.String()
				if ctype == "s" {
					idx, err := strconv.Atoi(value)
					if err != nil || idx < 0 || idx >= len(shared) {
						return sheet{}, errors.New("shared string index invalid")
					}
					value = shared[idx]
				}
				if value != "" && col > 0 && row > 0 {
					if result.rows[row] == nil {
						result.rows[row] = map[int]string{}
					}
					result.rows[row][col] = value
				}
			}
		}
	}
	return result, nil
}
func cellColumn(ref string) int {
	col := 0
	for _, r := range ref {
		if r < 'A' || r > 'Z' {
			break
		}
		col = col*26 + int(r-'A') + 1
	}
	return col
}
