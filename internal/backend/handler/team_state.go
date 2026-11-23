package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	teamStateBaseToken     = "Ol5lb0qEuaJc4us14Ngc84zUn6f"
	teamStateProjectsTable = "tbl1fc86p1WR5GdR"
	teamStateTasksTable    = "tbl3uMJN70j3FedT"
	teamStateMembersTable  = "tblCbjOqc8v3TjGW"
	teamStateBaseURL       = "https://t0ekqtnsg8e.feishu.cn/base/" + teamStateBaseToken
	teamWikiURL            = "https://t0ekqtnsg8e.feishu.cn/wiki/"
	teamWeeklySpace        = "7674174386240261422"
	teamWeeklyFolder       = "WGEIwBJuYiAwjSk8E6ZcMRSTnbe"
	teamRadarSpace         = "7649688251808124101"
	teamRadarFolder        = "HI55wqFy2iWdrFk5neac3UcFnef"
)

type teamSource struct {
	Name     string `json:"name"`
	Status   string `json:"status"`
	Detail   string `json:"detail,omitempty"`
	URL      string `json:"url,omitempty"`
	SetupURL string `json:"setupUrl,omitempty"`
}

type teamTask struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Assignees   []string `json:"assignees"`
	Status      string   `json:"status"`
	Priority    string   `json:"priority,omitempty"`
	Due         string   `json:"due,omitempty"`
	CompletedAt string   `json:"completedAt,omitempty"`
	Overdue     bool     `json:"overdue"`
}

type teamMeetingRecord struct {
	Date       string   `json:"date"`
	Updates    []string `json:"updates"`
	Blocker    string   `json:"blocker,omitempty"`
	NextAction string   `json:"nextAction,omitempty"`
	URL        string   `json:"url"`
	excerpt    string
}

type teamProject struct {
	ID                       string              `json:"id"`
	Name                     string              `json:"name"`
	Owner                    string              `json:"owner,omitempty"`
	TasksLoaded              bool                `json:"tasksLoaded"`
	Tasks                    []teamTask          `json:"tasks"`
	Completed                int                 `json:"completed"`
	InProgress               int                 `json:"inProgress"`
	NotStarted               int                 `json:"notStarted"`
	Stalled                  int                 `json:"stalled"`
	MissingCompletedDate     int                 `json:"missingCompletedDate"`
	ConflictingCompletedDate int                 `json:"conflictingCompletedDate"`
	History                  []teamMeetingRecord `json:"history"`
	LastMeetingDate          string              `json:"lastMeetingDate,omitempty"`
	Updates                  []string            `json:"updates"`
	Blocker                  string              `json:"blocker,omitempty"`
	NextAction               string              `json:"nextAction,omitempty"`
	MeetingExcerpt           string              `json:"meetingExcerpt,omitempty"`
	MeetingURL               string              `json:"meetingUrl,omitempty"`
	URL                      string              `json:"url"`
}

type teamSummary struct {
	Total                    int `json:"total"`
	Completed                int `json:"completed"`
	InProgress               int `json:"inProgress"`
	NotStarted               int `json:"notStarted"`
	Stalled                  int `json:"stalled"`
	MissingCompletedDate     int `json:"missingCompletedDate"`
	ConflictingCompletedDate int `json:"conflictingCompletedDate"`
}

type teamStateResponse struct {
	GeneratedAt   time.Time          `json:"generatedAt"`
	Sources       []teamSource       `json:"sources"`
	Summary       *teamSummary       `json:"summary"`
	Projects      []teamProject      `json:"projects"`
	WeeklyMeeting *teamMeetingRecord `json:"weeklyMeeting,omitempty"`
	Refreshing    bool               `json:"refreshing,omitempty"`
}

const (
	teamStateMaxAge       = 5 * time.Minute
	teamStateRefreshAfter = 1 * time.Minute
)

type teamStateLoad struct {
	done   chan struct{}
	result *teamStateResponse
}

type teamBaseRows struct {
	Fields    []string            `json:"fields"`
	Data      [][]json.RawMessage `json:"data"`
	RecordIDs []string            `json:"record_id_list"`
	HasMore   bool                `json:"has_more"`
}

func (r teamBaseRows) records() []map[string]json.RawMessage {
	result := make([]map[string]json.RawMessage, 0, len(r.Data))
	for _, cells := range r.Data {
		record := make(map[string]json.RawMessage, len(r.Fields))
		for i, field := range r.Fields {
			if i < len(cells) {
				record[field] = cells[i]
			}
		}
		result = append(result, record)
	}
	return result
}
func teamText(value json.RawMessage) string {
	var s string
	if json.Unmarshal(value, &s) == nil {
		return s
	}
	var stringsList []string
	if json.Unmarshal(value, &stringsList) == nil {
		return strings.Join(stringsList, ", ")
	}
	var parts []struct {
		Name string `json:"name"`
		Text string `json:"text"`
	}
	if json.Unmarshal(value, &parts) == nil {
		var out []string
		for _, p := range parts {
			if p.Name != "" {
				out = append(out, p.Name)
			} else if p.Text != "" {
				out = append(out, p.Text)
			}
		}
		return strings.Join(out, ", ")
	}
	return ""
}
func teamLinks(value json.RawMessage) []string {
	var links []struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(value, &links) != nil {
		return nil
	}
	ids := make([]string, 0, len(links))
	for _, link := range links {
		if link.ID != "" {
			ids = append(ids, link.ID)
		}
	}
	return ids
}
func teamDate(value string) time.Time {
	if parsed, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return parsed
	}
	if parsed, err := time.Parse(time.DateOnly, value); err == nil {
		return parsed
	}
	return time.Time{}
}
func teamClip(s string, n int) string {
	chars := []rune(strings.TrimSpace(s))
	if len(chars) <= n {
		return string(chars)
	}
	return string(chars[:n]) + "…"
}

func (h *FeishuHandler) teamStateBaseRows(ctx context.Context, token, table string) (teamBaseRows, error) {
	query := url.Values{"limit": {"2000"}, "offset": {"0"}}
	var result teamBaseRows
	endpoint := "https://open.feishu.cn/open-apis/base/v3/bases/" + teamStateBaseToken + "/tables/" + table + "/records"
	if err := h.bitableRequest(ctx, http.MethodGet, endpoint, query, nil, "", token, &result); err != nil {
		return result, err
	}
	// Missing pages must never produce a seemingly complete dashboard.
	if result.HasMore || len(result.Data) != len(result.RecordIDs) {
		return teamBaseRows{}, fmt.Errorf("incomplete Base records for %s", table)
	}
	return result, nil
}

func (h *FeishuHandler) teamStateDoc(ctx context.Context, token, documentID string) (string, error) {
	var result struct {
		Content string `json:"content"`
	}
	endpoint := "https://open.feishu.cn/open-apis/docx/v1/documents/" + documentID + "/raw_content"
	if err := h.bitableRequest(ctx, http.MethodGet, endpoint, nil, nil, "", token, &result); err != nil {
		return "", err
	}
	return result.Content, nil
}

var teamMeetingHeading = regexp.MustCompile(`^\s*(?:#{1,5}\s*)?(?:(20\d{2})[./-])?(\d{1,2})[./-](\d{1,2}).*(?:会议|组会|周会)`)
var teamMeetingHeadingSuffix = regexp.MustCompile(`^\s*(?:#{1,5}\s*)?.{1,20}?(?:会议|组会|周会)\s*(?:(20\d{2})[./-])?(\d{1,2})[./-](\d{1,2})(?:\D|$)`)

func teamMeetingDate(line string) int {
	m := teamMeetingHeading.FindStringSubmatch(strings.TrimSpace(line))
	if m == nil {
		m = teamMeetingHeadingSuffix.FindStringSubmatch(strings.TrimSpace(line))
	}
	if m == nil {
		return 0
	}
	year := 2026 // Current 2027 season meeting records start in 2026.
	if m[1] != "" {
		fmt.Sscanf(m[1], "%d", &year)
	}
	var month, day int
	fmt.Sscanf(m[2], "%d", &month)
	fmt.Sscanf(m[3], "%d", &day)
	if month < 1 || month > 12 || day < 1 || day > 31 {
		return 0
	}
	return year*10000 + month*100 + day
}

func teamMeetingExcerpt(content string) string {
	lines := strings.Split(content, "\n")
	start, latest := -1, 0
	for i, line := range lines {
		if date := teamMeetingDate(line); date > latest {
			latest, start = date, i
		}
	}
	if start < 0 {
		return ""
	}
	out := []string{strings.TrimSpace(lines[start])}
	for _, line := range lines[start+1:] {
		line = strings.TrimSpace(line)
		if teamMeetingDate(line) > 0 {
			break
		}
		if line == "" {
			continue
		}
		out = append(out, line)
		if len(out) >= 110 {
			break
		}
	}
	if len(out) < 2 {
		return ""
	}
	return strings.Join(out, "\n")
}

func teamBrief(name, excerpt string) (notes []string, blocker, next string) {
	if excerpt == "" {
		return []string{}, "", ""
	}
	lines := strings.Split(excerpt, "\n")
	// 步兵和哨兵共用一份组会，不能把步兵造车记录当成哨兵成果。
	if name == "27赛季哨兵" {
		start := -1
		for i, line := range lines {
			if strings.EqualFold(strings.TrimSpace(line), "ai") {
				start = i + 1
			}
		}
		if start >= 0 {
			lines = lines[start:]
		}
	} else if name == "27赛季步兵" {
		for i, line := range lines {
			if strings.EqualFold(strings.TrimSpace(line), "ai") {
				lines = lines[:i]
				break
			}
		}
	}
	heading := ""
	inNextSection := false
	fallback := []string{}
	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" || teamMeetingDate(line) > 0 {
			continue
		}
		if strings.HasPrefix(line, "后续安排") || strings.HasPrefix(line, "下周测试任务") {
			inNextSection = true
			heading = ""
			continue
		}
		if strings.HasPrefix(line, "上周已完成进度") || strings.HasPrefix(line, "本周已完成") {
			inNextSection = false
			heading = ""
			continue
		}
		if strings.HasPrefix(line, "议程") {
			inNextSection = false
			heading = ""
			continue
		}
		if inNextSection {
			if next == "" {
				next = teamClip(line, 145)
			}
			continue
		}
		if len([]rune(line)) <= 9 && !strings.ContainsAny(line, "。；，:：") &&
			!strings.Contains(line, "下周") && !strings.Contains(line, "已") &&
			!strings.Contains(line, "待") && !strings.Contains(line, "测试") &&
			!strings.Contains(line, "完成") && !strings.Contains(line, "联调") &&
			!strings.Contains(line, "正在") && !strings.Contains(line, "准备") &&
			!strings.Contains(line, "继续") {
			heading = line
			continue
		}
		if strings.HasPrefix(line, "会议主题") || strings.HasPrefix(line, "参会人员") {
			continue
		}
		evidence := strings.Contains(line, "已完成") || strings.Contains(line, "完成") ||
			strings.Contains(line, "已装") || strings.Contains(line, "成功") ||
			strings.Contains(line, "已通") || strings.Contains(line, "可行") ||
			strings.Contains(line, "第一次联调") || strings.Contains(line, "可以开始")
		planning := strings.Contains(line, "计划完成") || strings.Contains(line, "预计完成")
		text := line
		if name != "全队周会" && heading != "" && heading != "上周已完成进度✅：" && heading != "上周已完成进度✅" {
			text = heading + "：" + line
		}
		text = teamClip(text, 145)
		if len(fallback) < 2 {
			fallback = append(fallback, text)
		}
		if evidence && !planning && len(notes) < 2 {
			notes = append(notes, text)
		}
		if blocker == "" && (strings.Contains(line, "bug") || strings.Contains(line, "BUG") ||
			strings.Contains(line, "干涉") || strings.Contains(line, "卡弹") ||
			strings.Contains(line, "超重") || strings.Contains(line, "故障") ||
			strings.Contains(line, "仍有问题") || strings.Contains(line, "还未")) {
			blocker = text
		}
		if next == "" && (strings.Contains(line, "下周") || strings.Contains(line, "后续") ||
			strings.HasPrefix(line, "待") || strings.Contains(line, "预计") ||
			strings.Contains(line, "继续调试")) {
			next = text
		}
	}
	if len(notes) == 0 {
		notes = fallback
	}
	return notes, blocker, next
}

func teamMeetingISO(excerpt string) string {
	if excerpt == "" {
		return ""
	}
	date := teamMeetingDate(strings.Split(excerpt, "\n")[0])
	if date == 0 {
		return ""
	}
	return fmt.Sprintf("%04d-%02d-%02d", date/10000, date/100%100, date%100)
}

// Group meetings are already present in the same Docx payload. Extract dated
// sections without synthesizing task completion trends from a mutable task table.
func teamMeetingHistory(name, content, sourceURL string) []teamMeetingRecord {
	lines := strings.Split(content, "\n")
	records := []teamMeetingRecord{}
	start := -1
	add := func(end int) {
		if start < 0 {
			return
		}
		raw := strings.Join(lines[start:end], "\n")
		excerpt := teamMeetingExcerpt(raw)
		if excerpt == "" {
			return
		}
		// The sentry and infantry share a document; only a distinct AI subsection
		// can be attributed to sentry without mixing infantry work into its history.
		if name == "27赛季哨兵" && !strings.Contains("\n"+excerpt+"\n", "\nai\n") {
			return
		}
		updates, blocker, next := teamBrief(name, excerpt)
		if len(updates) == 0 && blocker == "" && next == "" {
			return
		}
		records = append(records, teamMeetingRecord{
			Date: teamMeetingISO(excerpt), Updates: updates, Blocker: blocker,
			NextAction: next, URL: sourceURL, excerpt: excerpt,
		})
	}
	for i, line := range lines {
		if teamMeetingDate(line) == 0 {
			continue
		}
		add(i)
		start = i
	}
	add(len(lines))
	sort.SliceStable(records, func(i, j int) bool { return records[i].Date > records[j].Date })
	unique := records[:0]
	for _, record := range records {
		if len(unique) > 0 && unique[len(unique)-1].Date == record.Date {
			continue
		}
		unique = append(unique, record)
		if len(unique) >= 4 {
			break
		}
	}
	return unique
}

// Read the meeting folder itself, rather than an index document that must be
// updated manually. Both the team-wide weekly folder and radar use this path.
func (h *FeishuHandler) teamFolderMeetings(ctx context.Context, token, spaceID, folderID, name string, max int) ([]teamMeetingRecord, error) {
	type candidate struct {
		date        int
		docID, link string
	}
	candidates := []candidate{}
	endpoint := "https://open.feishu.cn/open-apis/wiki/v2/spaces/" + spaceID + "/nodes"
	pageToken := ""
	for {
		var page struct {
			Items []struct {
				Title     string `json:"title"`
				NodeToken string `json:"node_token"`
				ObjToken  string `json:"obj_token"`
				ObjType   string `json:"obj_type"`
			} `json:"items"`
			HasMore   bool   `json:"has_more"`
			PageToken string `json:"page_token"`
		}
		query := url.Values{"parent_node_token": {folderID}, "page_size": {"50"}}
		if pageToken != "" {
			query.Set("page_token", pageToken)
		}
		if err := h.bitableRequest(ctx, http.MethodGet, endpoint, query, nil, "", token, &page); err != nil {
			return nil, err
		}
		for _, node := range page.Items {
			if node.ObjType != "docx" || node.ObjToken == "" || node.NodeToken == "" {
				continue
			}
			if date := teamMeetingDate(node.Title); date > 0 {
				candidates = append(candidates, candidate{date, node.ObjToken, teamWikiURL + node.NodeToken})
			}
		}
		if !page.HasMore {
			break
		}
		if page.PageToken == "" || page.PageToken == pageToken {
			return nil, fmt.Errorf("incomplete meeting folder listing")
		}
		pageToken = page.PageToken
	}
	if len(candidates) == 0 {
		return nil, fmt.Errorf("meeting folder has no dated documents")
	}
	sort.Slice(candidates, func(i, j int) bool { return candidates[i].date > candidates[j].date })
	if len(candidates) > max {
		candidates = candidates[:max]
	}
	results := make([]teamMeetingRecord, len(candidates))
	errs := make([]error, len(candidates))
	var wg sync.WaitGroup
	for i, item := range candidates {
		wg.Add(1)
		go func(i int, item candidate) {
			defer wg.Done()
			content, err := h.teamStateDoc(ctx, token, item.docID)
			if err != nil {
				errs[i] = err
				return
			}
			if name == "全队周会" {
				updates, blocker, next := teamBrief(name, content)
				results[i] = teamMeetingRecord{
					Date:    fmt.Sprintf("%04d-%02d-%02d", item.date/10000, item.date/100%100, item.date%100),
					Updates: updates, Blocker: blocker, NextAction: next, URL: item.link, excerpt: content,
				}
				return
			}
			parsed := teamMeetingHistory(name, content, item.link)
			if len(parsed) == 0 {
				errs[i] = fmt.Errorf("meeting %s has no dated content", item.link)
				return
			}
			results[i] = parsed[0]
			results[i].Date = fmt.Sprintf("%04d-%02d-%02d", item.date/10000, item.date/100%100, item.date%100)
		}(i, item)
	}
	wg.Wait()
	history := []teamMeetingRecord{}
	var firstErr error
	for i, entry := range results {
		if errs[i] != nil && firstErr == nil {
			firstErr = errs[i]
		}
		if entry.Date != "" {
			history = append(history, entry)
		}
	}
	if len(history) == 0 && firstErr == nil {
		firstErr = fmt.Errorf("meeting folder has no usable records")
	}
	return history, firstErr
}

func teamSourceSetupURL(appID string, scopes ...string) string {
	if appID == "" {
		return ""
	}
	return "https://open.feishu.cn/page/scope-apply?" + url.Values{"clientID": {appID}, "scopes": {strings.Join(scopes, ",")}}.Encode()
}

var teamMeetingDocs = map[string]struct{ ID, URL string }{
	"27赛季步兵":  {"Wsu7drksCoDYIEx6sTQcyHDFnSg", "https://t0ekqtnsg8e.feishu.cn/wiki/Zbe0wCYqciOrOnkXUL4cNVIMnde"},
	"27赛季哨兵":  {"Wsu7drksCoDYIEx6sTQcyHDFnSg", "https://t0ekqtnsg8e.feishu.cn/wiki/Zbe0wCYqciOrOnkXUL4cNVIMnde"},
	"27赛季重装":  {"SygqdJVZGoQhGhx8tgNcp0etnC7", "https://t0ekqtnsg8e.feishu.cn/wiki/K0FAwMdRQik3pWkdSZ8cd5nvn9g"},
	"27赛季飞镖":  {"YtTWd7MtIovj5bxdSfscKDpAnde", "https://t0ekqtnsg8e.feishu.cn/wiki/Cu8fwUbizirOaZkC9whcHwMen1b"},
	"27赛季无人机": {"Q1H3dnqBFoDbZxxIZ51c80Ohnef", "https://t0ekqtnsg8e.feishu.cn/wiki/PwJpwv3pMiJYhIk5WS5cVUYWngf"},
	"27赛季雷达":  {"IisUdYmbMo1ypMxKVTWcSjdcnje", "https://t0ekqtnsg8e.feishu.cn/wiki/DZISwXt0eisxN8kDhcYcmaEgncd"},
}

func buildTeamProjects(result *teamStateResponse, projects, tasks, members teamBaseRows) {
	people := map[string]string{}
	for i, row := range members.records() {
		name := teamText(row["账号"])
		if name == "" {
			name = teamText(row["成员"])
		}
		people[members.RecordIDs[i]] = name
	}
	indices := map[string]int{}
	for i, row := range projects.records() {
		name := teamText(row["项目名称"])
		if _, ok := teamMeetingDocs[name]; !ok {
			continue
		}
		indices[projects.RecordIDs[i]] = len(result.Projects)
		result.Projects = append(result.Projects, teamProject{
			ID: projects.RecordIDs[i], Name: name, Owner: teamText(row["总负责人"]),
			TasksLoaded: true, Tasks: []teamTask{}, Updates: []string{}, History: []teamMeetingRecord{}, URL: teamStateBaseURL,
		})
	}
	summary := &teamSummary{}
	today := time.Now().In(time.FixedZone("CST", 8*60*60)).Format(time.DateOnly)
	for i, row := range tasks.records() {
		ids := teamLinks(row["所属项目"])
		if len(ids) == 0 {
			continue
		}
		index, found := -1, false
		for _, id := range ids {
			if ix, ok := indices[id]; ok {
				index, found = ix, true
				break
			}
		}
		if !found {
			continue
		}
		status := teamText(row["状态"])
		done := status == "已完成"
		due, finished := teamText(row["截止时间"]), teamText(row["实际完成时间"])
		overdue := !done && !teamDate(due).IsZero() && teamDate(due).Format(time.DateOnly) < today
		task := teamTask{ID: tasks.RecordIDs[i], Title: teamText(row["任务"]), Status: status,
			Priority: teamText(row["优先级"]), Due: due, CompletedAt: finished, Overdue: overdue, Assignees: []string{}}
		for _, id := range teamLinks(row["任务执行人"]) {
			if name := people[id]; name != "" {
				task.Assignees = append(task.Assignees, name)
			}
		}
		p := &result.Projects[index]
		p.Tasks = append(p.Tasks, task)
		if done && finished == "" {
			p.MissingCompletedDate++
			summary.MissingCompletedDate++
		}
		if !done && finished != "" {
			p.ConflictingCompletedDate++
			summary.ConflictingCompletedDate++
		}
		summary.Total++
		switch status {
		case "已完成":
			p.Completed++
			summary.Completed++
		case "进行中":
			p.InProgress++
			summary.InProgress++
		case "未开始":
			p.NotStarted++
			summary.NotStarted++
		case "已停滞":
			p.Stalled++
			summary.Stalled++
		}
	}
	result.Summary = summary
}

func (h *FeishuHandler) teamStateProjects(ctx context.Context, result *teamStateResponse) {
	if !h.enabled() {
		result.Sources = append(result.Sources, teamSource{Name: "飞书项目任务", Status: "unavailable", Detail: "飞书应用未配置", URL: teamStateBaseURL})
		return
	}
	token, err := h.tenantToken(ctx)
	if err != nil {
		log.Printf("technical dashboard authorization: %v", err)
		result.Sources = append(result.Sources, teamSource{Name: "飞书项目任务", Status: "unavailable", Detail: "飞书应用授权失败", URL: teamStateBaseURL})
		return
	}

	// The three Base tables and five distinct meeting documents are independent.
	// Fetch them together rather than making every group wait for the previous one.
	var projects, tasks, members teamBaseRows
	var projectsErr, tasksErr, membersErr error
	type meetingResult struct {
		content string
		history []teamMeetingRecord
		url     string
		err     error
	}
	names := []string{"27赛季步兵", "27赛季重装", "27赛季飞镖", "27赛季无人机", "27赛季雷达"}
	meetings := make([]meetingResult, len(names))
	var wg sync.WaitGroup
	var weekly []teamMeetingRecord
	var weeklyErr error
	wg.Add(4 + len(names))
	go func() {
		defer wg.Done()
		projects, projectsErr = h.teamStateBaseRows(ctx, token, teamStateProjectsTable)
	}()
	go func() { defer wg.Done(); tasks, tasksErr = h.teamStateBaseRows(ctx, token, teamStateTasksTable) }()
	go func() { defer wg.Done(); members, membersErr = h.teamStateBaseRows(ctx, token, teamStateMembersTable) }()
	go func() {
		defer wg.Done()
		weekly, weeklyErr = h.teamFolderMeetings(ctx, token, teamWeeklySpace, teamWeeklyFolder, "全队周会", 1)
	}()
	for i, name := range names {
		go func(i int, name string) {
			defer wg.Done()
			if name == "27赛季雷达" {
				meetings[i].history, meetings[i].err = h.teamFolderMeetings(ctx, token, teamRadarSpace, teamRadarFolder, name, 4)
				return
			}
			doc := teamMeetingDocs[name]
			content, readErr := h.teamStateDoc(ctx, token, doc.ID)
			if readErr == nil {
				meetings[i].content = content
			}
			meetings[i].url, meetings[i].err = doc.URL, readErr
		}(i, name)
	}
	wg.Wait()

	weeklySource := teamSource{Name: "全队周会", Status: "available", URL: teamWikiURL + teamWeeklyFolder}
	if len(weekly) > 0 {
		result.WeeklyMeeting = &weekly[0]
	}
	if weeklyErr != nil {
		weeklySource.Status, weeklySource.Detail = "unavailable", "最新全队周会暂不可读取"
		if result.WeeklyMeeting != nil {
			weeklySource.Status, weeklySource.Detail = "partial", "部分周会记录暂不可读取"
		}
		if strings.Contains(weeklyErr.Error(), "99991672") {
			weeklySource.SetupURL = teamSourceSetupURL(h.cfg.AppID, "wiki:node:read", "docx:document:readonly")
		}
		log.Printf("technical dashboard weekly meeting source: %v", weeklyErr)
	}
	result.Sources = append(result.Sources, weeklySource)

	baseErr := projectsErr
	if baseErr == nil {
		baseErr = tasksErr
	}
	if baseErr == nil {
		baseErr = membersErr
	}
	if baseErr == nil {
		buildTeamProjects(result, projects, tasks, members)
		result.Sources = append(result.Sources, teamSource{Name: "飞书项目任务", Status: "available", URL: teamStateBaseURL})
	} else {
		log.Printf("technical dashboard task source: %v", baseErr)
		detail, setup := "项目任务暂不可读取", ""
		if strings.Contains(baseErr.Error(), "99991672") {
			detail, setup = "飞书应用缺少项目记录读取权限", teamSourceSetupURL(h.cfg.AppID, "base:record:read")
		}
		result.Sources = append(result.Sources, teamSource{Name: "飞书项目任务", Status: "unavailable", Detail: detail, URL: teamStateBaseURL, SetupURL: setup})
	}
	if len(result.Projects) == 0 {
		for name, doc := range teamMeetingDocs {
			result.Projects = append(result.Projects, teamProject{ID: "doc-" + name, Name: name, Tasks: []teamTask{}, Updates: []string{}, History: []teamMeetingRecord{}, URL: doc.URL})
		}
	}

	byName := make(map[string]meetingResult, len(names)+1)
	for i, name := range names {
		byName[name] = meetings[i]
	}
	byName["27赛季哨兵"] = byName["27赛季步兵"]
	read, failed := 0, 0
	var firstErr error
	for i := range result.Projects {
		p := &result.Projects[i]
		meeting, ok := byName[p.Name]
		if !ok {
			continue
		}
		p.MeetingURL = teamMeetingDocs[p.Name].URL
		history := meeting.history
		if p.Name != "27赛季雷达" && meeting.err == nil {
			history = teamMeetingHistory(p.Name, meeting.content, meeting.url)
		}
		if meeting.err != nil {
			failed++
			if firstErr == nil {
				firstErr = meeting.err
			}
		}
		if len(history) == 0 {
			if meeting.err == nil {
				failed++
			}
			continue
		}
		p.History = history
		latest := history[0]
		p.MeetingExcerpt, p.LastMeetingDate = latest.excerpt, latest.Date
		p.MeetingURL = latest.URL
		p.Updates, p.Blocker, p.NextAction = latest.Updates, latest.Blocker, latest.NextAction
		read++
	}
	sort.Slice(result.Projects, func(i, j int) bool { return result.Projects[i].Name < result.Projects[j].Name })
	status, detail, setup := "available", "", ""
	if failed > 0 {
		status, detail = "partial", fmt.Sprintf("%d 份兵种组会记录暂不可读取", failed)
		if read == 0 {
			status = "unavailable"
		}
		if firstErr != nil && strings.Contains(firstErr.Error(), "99991672") {
			setup = teamSourceSetupURL(h.cfg.AppID, "docx:document:readonly", "wiki:node:read")
		}
		log.Printf("technical dashboard meeting source: read=%d failed=%d: %v", read, failed, firstErr)
	}
	result.Sources = append(result.Sources, teamSource{Name: "兵种组会", Status: status, Detail: detail, URL: "https://t0ekqtnsg8e.feishu.cn/wiki/Jcy4wGbeoiF1ltkCa2Yc4txDnzd", SetupURL: setup})
}

// One in-memory snapshot is shared by super-admin viewers. The snapshot is
// never served older than five minutes, and an in-flight refresh is deduplicated.
func (h *FeishuHandler) startTeamStateLoadLocked() *teamStateLoad {
	load := &teamStateLoad{done: make(chan struct{})}
	h.teamStateLoading = load
	h.teamStateLastRefresh = time.Now()
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		started := time.Now()
		result := &teamStateResponse{Sources: []teamSource{}, Projects: []teamProject{}}
		h.teamStateProjects(ctx, result)
		result.GeneratedAt = time.Now()

		h.teamStateMu.Lock()
		load.result = result
		if result.Summary != nil {
			h.teamStateCache = result
		}
		h.teamStateLoading = nil
		close(load.done)
		h.teamStateMu.Unlock()
		log.Printf("technical dashboard data refresh: duration=%s taskData=%t", time.Since(started).Round(time.Millisecond), result.Summary != nil)
	}()
	return load
}

func (h *FeishuHandler) GetTeamState(c *gin.Context) {
	c.Header("Cache-Control", "private, no-store")
	h.teamStateMu.Lock()
	cached := h.teamStateCache
	now := time.Now()
	fresh := cached != nil && now.Sub(cached.GeneratedAt) < teamStateMaxAge
	force := c.Query("refresh") == "1"
	load := h.teamStateLoading

	if fresh && !force {
		if now.Sub(cached.GeneratedAt) >= teamStateRefreshAfter &&
			now.Sub(h.teamStateLastRefresh) >= teamStateRefreshAfter && load == nil {
			load = h.startTeamStateLoadLocked()
		}
		view := *cached
		view.Refreshing = load != nil
		h.teamStateMu.Unlock()
		writeAPI(c, http.StatusOK, "获取技术研发进度成功", &view)
		return
	}

	if load == nil {
		load = h.startTeamStateLoadLocked()
	}
	h.teamStateMu.Unlock()

	select {
	case <-load.done:
		// If a refresh fails, do not discard a still-valid snapshot.
		if load.result.Summary == nil && fresh {
			writeAPI(c, http.StatusBadGateway, "飞书数据刷新失败，已保留原有数据", nil)
			return
		}
		writeAPI(c, http.StatusOK, "获取技术研发进度成功", load.result)
	case <-c.Request.Context().Done():
		writeAPI(c, http.StatusGatewayTimeout, "技术研发数据读取超时，请重试", nil)
	}
}
