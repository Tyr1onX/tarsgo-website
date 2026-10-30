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

type cellRange struct{ firstRow, lastRow, firstCol, lastCol int }
type sheet struct {
	rows   map[int]map[int]string
	merged []cellRange
}

func (s sheet) rangeAt(row, col int) (cellRange, bool) {
	for _, area := range s.merged {
		if row >= area.firstRow && row <= area.lastRow && col >= area.firstCol && col <= area.lastCol {
			return area, true
		}
	}
	return cellRange{firstRow: row, lastRow: row, firstCol: col, lastCol: col}, false
}

var courseTitle = regexp.MustCompile("(?i)^([a-z][a-z0-9_.]*)\\s*[-－—–]\\s*(.+?)(?:\\s*\\[\\d+\\])?$")
var weekPrefix = regexp.MustCompile("^(?:上课周次\\s*)?(?:第\\s*)?([0-9,，、\\-－—–~～至\\s]+?)\\s*周(?:\\s*[（(]([单双])(?:周)?[）)]|\\s*([单双])(?:周)?)?")
var weekdayAnywhere = regexp.MustCompile("(?:^|[,，、;；\\s])(?:星期|周)\\s*([1-7一二三四五六日天])")
var sectionLabel = regexp.MustCompile("^第\\s*(\\d+)\\s*节\\s*[-－—–~～至]\\s*(?:第\\s*)?(\\d+)\\s*节?$")
var compactSectionLabel = regexp.MustCompile("^第\\s*(\\d+)\\s*[-－—–~～至]\\s*(\\d+)\\s*节$")
var bareSectionRange = regexp.MustCompile("^(\\d+)\\s*[-－—–~～至]\\s*(\\d+)\\s*节$")
var singleSectionLabel = regexp.MustCompile("^(?:第\\s*)?(\\d+)\\s*节$")
var sectionPrefixPatterns = []*regexp.Regexp{
	regexp.MustCompile("^第\\s*(\\d+)\\s*节\\s*[-－—–~～至]\\s*(?:第\\s*)?(\\d+)\\s*节?"),
	regexp.MustCompile("^第\\s*(\\d+)\\s*[-－—–~～至]\\s*(\\d+)\\s*节"),
	regexp.MustCompile("^(\\d+)\\s*[-－—–~～至]\\s*(\\d+)\\s*节"),
}
var singleSectionPrefix = regexp.MustCompile("^(?:第\\s*)?(\\d+)\\s*节")
var sectionRangeInText = regexp.MustCompile("^(?:第\\s*\\d+|\\d+)\\s*(?:节|[-－—–~～至])")
var malformedWeekPrefix = regexp.MustCompile("^[0-9第].*周")
var weekdayHeaderPattern = regexp.MustCompile("^(?:星期|周)([1-7一二三四五六日天])(?:[(][^)]*[)])?$")
var unknownCourse = regexp.MustCompile("^(.+?)\\s*\\[[A-Za-z0-9]+\\]\\s*(上课周次\\s*[0-9,，、\\-]+周)")
var adjustment = regexp.MustCompile("^【调课】(.+?)\\[([A-Za-z0-9]+)\\],从(\\d+)周星期([1-7])的(\\d+)-(\\d+)节调整为(\\d+)周星期([1-7])的(\\d+)-(\\d+)节(?:,(.*))?$")
var cellReference = regexp.MustCompile("^\\$?([A-Za-z]+)\\$?(\\d+)$")

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
	issues := []parseIssue{}
	gridCount := 0
	for _, f := range reader.File {
		if !strings.HasPrefix(f.Name, "xl/worksheets/sheet") || !strings.HasSuffix(f.Name, ".xml") {
			continue
		}
		sh, e := readSheet(f, shared)
		if e != nil {
			return nil, nil, errors.New("Excel 工作表无法读取，旧课表未更改")
		}
		indices := sortedRows(sh.rows)
		for _, row := range indices {
			cells := sh.rows[row]
			for _, col := range sortedColumns(cells) {
				value := cells[col]
				if strings.Contains(value, "上课时间暂未确定的课程：") {
					for r := row; r <= row+20; r++ {
						data := sh.rows[r]
						if r > row && containsLabel(data, "调课信息：") {
							break
						}
						for _, entryCol := range sortedColumns(data) {
							entry := data[entryCol]
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
		for _, headerRow := range indices {
			weekdays := map[int]int{}
			for col, value := range sh.rows[headerRow] {
				if day := weekdayHeader(value); day > 0 {
					weekdays[col] = day
				}
			}
			for _, area := range sh.merged {
				if area.firstRow != headerRow {
					continue
				}
				if day := weekdayHeader(sh.rows[area.firstRow][area.firstCol]); day > 0 {
					for col := area.firstCol; col <= area.lastCol; col++ {
						weekdays[col] = day
					}
				}
			}
			if uniqueWeekdays(weekdays) < 5 {
				continue
			}
			weekdayColumns := sortedWeekdayColumns(weekdays)
			sectionRows := 0
			for row := headerRow + 1; row <= headerRow+40; row++ {
				_, _, hasSection := sectionAtSheet(sh, row, minColumn(weekdays))
				if hasSection {
					sectionRows++
				}
				for _, col := range weekdayColumns {
					raw := strings.TrimSpace(sh.rows[row][col])
					if raw == "" || raw == "无" || raw == "暂无" || raw == "调课" {
						continue
					}
					if !hasSection && !looksLikeCourseCell(raw) {
						continue
					}
					context := contextAt(sh, weekdays, row, col)
					parsed, cellIssues := parseCourseCellDetailed(raw, context)
					courses = append(courses, parsed...)
					for _, issue := range cellIssues {
						issue.Row = row
						issues = append(issues, issue)
					}
				}
			}
			if sectionRows >= 1 {
				gridCount++
			}
		}
	}
	if gridCount == 0 {
		return nil, nil, errors.New("未找到有效的星期/节次课程网格，旧课表未更改")
	}
	notes = uniqueNotes(notes)
	if len(issues) > 0 {
		return courses, notes, fmt.Errorf("%s；旧课表未更改", summarizeIssues(issues))
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
	if len(courses) == 0 && len(notes) == 0 {
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

type parseIssue struct {
	Name   string
	Reason string
	Row    int
}

type gridContext struct {
	day, start, end     int
	hasDay, hasSections bool
}

type scheduleInfo struct {
	weeks               []int
	parity              string
	day, start, end     int
	hasDay, hasSections bool
	location            string
}

func sortedRows(rows map[int]map[int]string) []int {
	indices := make([]int, 0, len(rows))
	for row := range rows {
		indices = append(indices, row)
	}
	sort.Ints(indices)
	return indices
}

func sortedColumns(cells map[int]string) []int {
	columns := make([]int, 0, len(cells))
	for col := range cells {
		columns = append(columns, col)
	}
	sort.Ints(columns)
	return columns
}

func sortedWeekdayColumns(days map[int]int) []int {
	columns := make([]int, 0, len(days))
	for col := range days {
		columns = append(columns, col)
	}
	sort.Ints(columns)
	return columns
}

func uniqueWeekdays(days map[int]int) int {
	seen := map[int]bool{}
	for _, day := range days {
		seen[day] = true
	}
	return len(seen)
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
	for _, col := range sortedColumns(cells) {
		if col >= firstDayCol {
			continue
		}
		start, end, ok := parseSectionLabel(strings.TrimSpace(cells[col]))
		if !ok {
			continue
		}
		if start > 0 && end >= start && end <= 24 {
			return start, end, true
		}
	}
	return 0, 0, false
}

func sectionAtSheet(sh sheet, row, firstDayCol int) (int, int, bool) {
	cells := sh.rows[row]
	for _, area := range sh.merged {
		if row < area.firstRow || row > area.lastRow || area.firstCol >= firstDayCol {
			continue
		}
		value := sh.rows[area.firstRow][area.firstCol]
		if value == "" || cells[area.firstCol] != "" {
			continue
		}
		if cells == nil {
			cells = map[int]string{}
		} else {
			copyOfCells := make(map[int]string, len(cells)+1)
			for col, existing := range cells {
				copyOfCells[col] = existing
			}
			cells = copyOfCells
		}
		cells[area.firstCol] = value
	}
	return sectionAt(cells, firstDayCol)
}

func parseSectionLabel(value string) (int, int, bool) {
	for _, pattern := range []*regexp.Regexp{sectionLabel, compactSectionLabel, bareSectionRange} {
		if match := pattern.FindStringSubmatch(value); match != nil {
			start, _ := strconv.Atoi(match[1])
			end, _ := strconv.Atoi(match[2])
			if start > 0 && end >= start && end <= 24 {
				return start, end, true
			}
		}
	}
	if match := singleSectionLabel.FindStringSubmatch(value); match != nil {
		section, _ := strconv.Atoi(match[1])
		if section > 0 && section <= 24 {
			return section, section, true
		}
	}
	return 0, 0, false
}

func weekdayHeader(value string) int {
	value = strings.NewReplacer("　", "", " ", "", "（", "(", "）", ")").Replace(strings.TrimSpace(value))
	match := weekdayHeaderPattern.FindStringSubmatch(value)
	if match == nil {
		return 0
	}
	return parseDay(match[1])
}

func parseDay(v string) int {
	switch v {
	case "一":
		return 1
	case "二":
		return 2
	case "三":
		return 3
	case "四":
		return 4
	case "五":
		return 5
	case "六":
		return 6
	case "日", "天":
		return 7
	}
	day, err := strconv.Atoi(v)
	if err != nil || day < 1 || day > 7 {
		return 0
	}
	return day
}

func parseCourseCell(value string, gridDay, gridStart, gridEnd int) ([]Course, error) {
	context := gridContext{day: gridDay, start: gridStart, end: gridEnd,
		hasDay:      gridDay >= 1 && gridDay <= 7,
		hasSections: gridStart >= 1 && gridEnd >= gridStart && gridEnd <= 24}
	courses, issues := parseCourseCellDetailed(value, context)
	if len(issues) > 0 {
		return courses, errors.New(issues[0].Reason)
	}
	return courses, nil
}

func contextAt(sh sheet, weekdays map[int]int, row, col int) gridContext {
	context := gridContext{}
	area, _ := sh.rangeAt(row, col)
	for mergedCol := area.firstCol; mergedCol <= area.lastCol; mergedCol++ {
		day, ok := weekdays[mergedCol]
		if !ok {
			continue
		}
		if !context.hasDay {
			context.day, context.hasDay = day, true
			continue
		}
		if context.day != day {
			context.hasDay = false
			break
		}
	}

	covered := map[int]bool{}
	firstDayCol := minColumn(weekdays)
	for mergedRow := area.firstRow; mergedRow <= area.lastRow; mergedRow++ {
		start, end, ok := sectionAtSheet(sh, mergedRow, firstDayCol)
		if !ok {
			continue
		}
		for section := start; section <= end; section++ {
			covered[section] = true
		}
	}
	if len(covered) == 0 {
		return context
	}
	context.start, context.end = 25, 0
	for section := range covered {
		if section < context.start {
			context.start = section
		}
		if section > context.end {
			context.end = section
		}
	}
	context.hasSections = context.start > 0 && context.end <= 24 && len(covered) == context.end-context.start+1
	return context
}

func looksLikeCourseCell(value string) bool {
	for _, line := range strings.Split(strings.ReplaceAll(value, "\r", ""), "\n") {
		line = strings.TrimSpace(line)
		if courseTitle.MatchString(line) || weekPrefix.MatchString(line) || strings.Contains(line, "周") && strings.Contains(line, "星期") {
			return true
		}
	}
	return false
}

func parseCourseCellDetailed(value string, context gridContext) ([]Course, []parseIssue) {
	lines := strings.Split(strings.ReplaceAll(value, "\r", ""), "\n")
	result := []Course{}
	issues := []parseIssue{}
	currentCode, currentName := "", ""
	foundForCurrent, issueForCurrent := false, false
	addIssue := func(name, reason string) {
		issues = append(issues, parseIssue{Name: strings.TrimSpace(name), Reason: reason})
		issueForCurrent = true
	}
	finishCurrent := func() {
		if currentName != "" && !foundForCurrent && !issueForCurrent {
			addIssue(currentName, "缺少有效教学周")
		}
	}
	resolve := func(info scheduleInfo) {
		if currentName == "" {
			addIssue("未命名课程", "缺少课程名称")
			return
		}
		day, start, end := info.day, info.start, info.end
		// Explicit course text is the primary time source; the grid only fills missing fields.
		if !info.hasDay {
			day = context.day
		}
		if !info.hasSections {
			start, end = context.start, context.end
		}
		if day < 1 || day > 7 {
			addIssue(currentName, "课程文字缺少星期，且网格星期无法可靠确认")
			return
		}
		if start < 1 || end < start || end > 24 {
			addIssue(currentName, "课程文字缺少节次，且网格节次无法可靠确认")
			return
		}
		result = append(result, Course{Code: currentCode, Name: currentName, Weekday: day, StartSection: start, EndSection: end, Weeks: info.weeks, Parity: info.parity, Location: info.location})
		foundForCurrent = true
	}
	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" || line == "调课" {
			continue
		}
		if m := courseTitle.FindStringSubmatch(line); m != nil {
			finishCurrent()
			currentCode, currentName = m[1], strings.TrimSpace(m[2])
			foundForCurrent, issueForCurrent = false, false
			if currentName == "" {
				addIssue("未命名课程", "课程名称为空")
			}
			continue
		}
		info, candidate, err := parseScheduleLine(line)
		if candidate {
			if err != nil {
				addIssue(currentNameOrPlaceholder(currentName), err.Error())
				continue
			}
			resolve(info)
			continue
		}
		if currentName != "" && (strings.Contains(line, "周") || strings.Contains(line, "星期")) && !foundForCurrent {
			addIssue(currentName, "周次或星期格式无法识别")
		}
	}
	finishCurrent()
	if currentName == "" && len(result) == 0 && len(issues) == 0 {
		issues = append(issues, parseIssue{Name: "未命名课程", Reason: "非空单元格未包含有效课程"})
	}
	return result, issues
}

func currentNameOrPlaceholder(name string) string {
	if strings.TrimSpace(name) == "" {
		return "未命名课程"
	}
	return name
}

func parseScheduleLine(line string) (scheduleInfo, bool, error) {
	match := weekPrefix.FindStringSubmatch(line)
	if match == nil {
		if malformedWeekPrefix.MatchString(line) {
			return scheduleInfo{}, true, errors.New("周次格式无法识别")
		}
		return scheduleInfo{}, false, nil
	}
	weeks, err := parseWeeks(match[1])
	if err != nil {
		return scheduleInfo{}, true, err
	}
	if len(weeks) == 0 {
		return scheduleInfo{}, true, errors.New("课程教学周为空")
	}
	info := scheduleInfo{weeks: weeks, parity: "all"}
	parity := match[2]
	if parity == "" {
		parity = match[3]
	}
	if parity == "单" {
		info.parity = "odd"
	} else if parity == "双" {
		info.parity = "even"
	}
	rest := strings.TrimLeft(strings.TrimSpace(line[len(match[0]):]), ",，、;； \t")
	if dayMatch := weekdayAnywhere.FindStringSubmatchIndex(rest); dayMatch != nil {
		info.day = parseDay(rest[dayMatch[2]:dayMatch[3]])
		info.hasDay = info.day > 0
		rest = rest[:dayMatch[0]] + rest[dayMatch[1]:]
	} else if strings.Contains(rest, "星期") || regexp.MustCompile("(?:^|[,，、;；\\s])周").MatchString(rest) {
		return scheduleInfo{}, true, errors.New("星期格式无法识别")
	}
	rest = strings.TrimLeft(strings.TrimSpace(rest), ",，、;； \t")
	if sectionMatch, size := findSectionPrefix(rest); size > 0 {
		info.start, _ = strconv.Atoi(sectionMatch[1])
		info.end, _ = strconv.Atoi(sectionMatch[2])
		if info.start < 1 || info.end < info.start || info.end > 24 {
			return scheduleInfo{}, true, errors.New("课程节次超出1-24或范围倒置")
		}
		info.hasSections = true
		rest = strings.TrimLeft(strings.TrimSpace(rest[size:]), ",，、;； \t")
	} else if sectionRangeInText.MatchString(rest) {
		return scheduleInfo{}, true, errors.New("节次格式无法识别")
	}
	if strings.ContainsAny(rest, "\r\n") {
		return scheduleInfo{}, true, errors.New("课程地点格式无法识别")
	}
	info.location = strings.Trim(strings.TrimSpace(rest), ",，、;； ")
	return info, true, nil
}

func findSectionPrefix(value string) ([]string, int) {
	for _, pattern := range sectionPrefixPatterns {
		if loc := pattern.FindStringIndex(value); loc != nil && loc[0] == 0 {
			return pattern.FindStringSubmatch(value), loc[1]
		}
	}
	if match := singleSectionPrefix.FindStringSubmatchIndex(value); match != nil {
		submatch := singleSectionPrefix.FindStringSubmatch(value)
		return []string{submatch[0], submatch[1], submatch[1]}, match[1]
	}
	return nil, 0
}

func summarizeIssues(issues []parseIssue) string {
	items := make([]string, 0, len(issues))
	seen := map[string]bool{}
	for _, issue := range issues {
		name := strings.TrimSpace(issue.Name)
		if name == "" {
			name = "未命名课程"
		}
		name = truncateRunes(strings.ReplaceAll(name, "\n", " "), 40)
		item := fmt.Sprintf("「%s」%s", name, issue.Reason)
		if issue.Row > 0 {
			item = fmt.Sprintf("第%d行%s", issue.Row, item)
		}
		key := item
		if seen[key] {
			continue
		}
		seen[key] = true
		items = append(items, item)
	}
	const maxIssues = 5
	if len(items) > maxIssues {
		items = append(items[:maxIssues], fmt.Sprintf("另有%d门课程未能确认", len(items)-maxIssues))
	}
	return "以下课程时间无法可靠确认：" + strings.Join(items, "；")
}

func truncateRunes(value string, max int) string {
	runes := []rune(value)
	if len(runes) <= max {
		return value
	}
	return string(runes[:max]) + "…"
}

func uniqueNotes(notes []Note) []Note {
	result := make([]Note, 0, len(notes))
	seen := map[string]bool{}
	for _, note := range notes {
		key := note.Name + "\x00" + note.Reason
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, note)
	}
	return result
}
func parseWeeks(raw string) ([]int, error) {
	raw = strings.NewReplacer("，", ",", "、", ",", "－", "-", "—", "-", "–", "-", "~", "-", "～", "-", "至", "-", " ", "", "\t", "").Replace(raw)
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
			case "mergeCell":
				for _, a := range t.Attr {
					if a.Name.Local != "ref" {
						continue
					}
					area, ok := parseCellRange(a.Value)
					if !ok {
						return sheet{}, errors.New("invalid merged-cell range")
					}
					result.merged = append(result.merged, area)
					if len(result.merged) > 10000 {
						return sheet{}, errors.New("too many merged-cell ranges")
					}
				}
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

func parseCellRange(ref string) (cellRange, bool) {
	parts := strings.Split(strings.TrimSpace(ref), ":")
	if len(parts) == 1 {
		parts = append(parts, parts[0])
	}
	if len(parts) != 2 {
		return cellRange{}, false
	}
	parse := func(value string) (int, int, bool) {
		match := cellReference.FindStringSubmatch(strings.ToUpper(strings.TrimSpace(value)))
		if match == nil {
			return 0, 0, false
		}
		row, err := strconv.Atoi(match[2])
		if err != nil || row < 1 || row > 1048576 {
			return 0, 0, false
		}
		col := cellColumn(match[1])
		return row, col, col >= 1 && col <= 16384
	}
	firstRow, firstCol, ok := parse(parts[0])
	if !ok {
		return cellRange{}, false
	}
	lastRow, lastCol, ok := parse(parts[1])
	if !ok {
		return cellRange{}, false
	}
	if firstRow > lastRow {
		firstRow, lastRow = lastRow, firstRow
	}
	if firstCol > lastCol {
		firstCol, lastCol = lastCol, firstCol
	}
	if lastRow-firstRow > 100 || lastCol-firstCol > 60 {
		return cellRange{}, false
	}
	return cellRange{firstRow: firstRow, lastRow: lastRow, firstCol: firstCol, lastCol: lastCol}, true
}

func cellColumn(ref string) int {
	col := 0
	for _, r := range strings.ToUpper(ref) {
		if r < 'A' || r > 'Z' {
			break
		}
		col = col*26 + int(r-'A') + 1
	}
	return col
}
