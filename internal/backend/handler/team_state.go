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
	"time"

	"github.com/gin-gonic/gin"

	"tarsgo-backend/model"
)

const (
	teamStateBaseToken     = "Ol5lb0qEuaJc4us14Ngc84zUn6f"
	teamStateProjectsTable = "tbl1fc86p1WR5GdR"
	teamStateTasksTable    = "tbl3uMJN70j3FedT"
	teamStateMembersTable  = "tblCbjOqc8v3TjGW"
	teamStateBaseURL       = "https://t0ekqtnsg8e.feishu.cn/base/" + teamStateBaseToken
	teamStatePlanURL       = "https://t0ekqtnsg8e.feishu.cn/wiki/Ei9Fw52nLiZeVnkZZi7cuv9Jnlb"
)

type teamSource struct {
	Name     string `json:"name"`
	Status   string `json:"status"`
	Detail   string `json:"detail,omitempty"`
	URL      string `json:"url,omitempty"`
	SetupURL string `json:"setupUrl,omitempty"`
}
type teamGoal struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Target string `json:"target"`
	URL    string `json:"url"`
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
type teamProject struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	Owner          string     `json:"owner,omitempty"`
	Members        string     `json:"members,omitempty"`
	Status         string     `json:"status,omitempty"`
	TasksLoaded    bool       `json:"tasksLoaded"`
	Tasks          []teamTask `json:"tasks"`
	Completed      int        `json:"completed"`
	Goals          []teamGoal `json:"goals"`
	PlanExcerpt    string     `json:"planExcerpt,omitempty"`
	MeetingExcerpt string     `json:"meetingExcerpt,omitempty"`
	MeetingURL     string     `json:"meetingUrl,omitempty"`
	URL            string     `json:"url"`
}
type teamReport struct {
	ID        uint64 `json:"id"`
	Member    string `json:"member"`
	Group     string `json:"group"`
	Week      string `json:"week"`
	Completed string `json:"completed,omitempty"`
	Blockers  string `json:"blockers,omitempty"`
	NextPlan  string `json:"nextPlan,omitempty"`
}
type teamOperations struct {
	Active  int64  `json:"active"`
	Blocked int64  `json:"blocked"`
	URL     string `json:"url"`
}
type teamInsight struct {
	Kind      string `json:"kind"`
	Text      string `json:"text"`
	SourceURL string `json:"sourceUrl"`
}
type teamSummary struct {
	Total                int `json:"total"`
	Completed            int `json:"completed"`
	InProgress           int `json:"inProgress"`
	NotStarted           int `json:"notStarted"`
	Stalled              int `json:"stalled"`
	Overdue              int `json:"overdue"`
	MissingCompletedDate int `json:"missingCompletedDate"`
}
type teamStateResponse struct {
	GeneratedAt time.Time       `json:"generatedAt"`
	Sources     []teamSource    `json:"sources"`
	Summary     *teamSummary    `json:"summary"`
	Insights    []teamInsight   `json:"insights"`
	Projects    []teamProject   `json:"projects"`
	Reports     []teamReport    `json:"reports"`
	Operations  *teamOperations `json:"operations"`
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

func teamSentryGoals(content string) []teamGoal {
	lines := strings.Split(content, "\n")
	goals := make([]teamGoal, 0, 5)
	for i, line := range lines {
		id := strings.TrimSpace(line)
		if !strings.HasPrefix(id, "哨兵-00") || len(id) != len("哨兵-001") {
			continue
		}
		values := make([]string, 0, 3)
		for j := i + 1; j < len(lines) && j < i+12 && len(values) < 3; j++ {
			value := strings.TrimSpace(lines[j])
			if value != "" {
				values = append(values, value)
			}
		}
		if len(values) < 2 {
			continue
		}
		goals = append(goals, teamGoal{ID: id, Title: teamClip(values[0], 100), Target: teamClip(values[1], 280), URL: teamStatePlanURL})
	}
	return goals
}

var teamMeetingHeading = regexp.MustCompile(`^\s*(?:#{1,5}\s*)?(?:(20\d{2})[./-])?(\d{1,2})[./-](\d{1,2}).*(?:会议|组会|周会)`)

func teamMeetingDate(line string) int {
	match := teamMeetingHeading.FindStringSubmatch(strings.TrimSpace(line))
	if match == nil {
		return 0
	}
	year := 2026
	if match[1] != "" {
		fmt.Sscanf(match[1], "%d", &year)
	}
	var month, day int
	fmt.Sscanf(match[2], "%d", &month)
	fmt.Sscanf(match[3], "%d", &day)
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
	excerpt := []string{strings.TrimSpace(lines[start])}
	for i := start + 1; i < len(lines) && len(excerpt) < 7; i++ {
		line := strings.TrimSpace(lines[i])
		if teamMeetingDate(line) > 0 {
			break
		}
		if line == "" || len([]rune(line)) < 8 {
			continue
		}
		excerpt = append(excerpt, teamClip(line, 135))
	}
	if len(excerpt) == 1 {
		return ""
	}
	return strings.Join(excerpt, "\n")
}

func (h *FeishuHandler) teamRadarMeeting(ctx context.Context, token string) (string, string, error) {
	var blocks struct {
		Items []struct {
			Text struct {
				Elements []struct {
					MentionDoc *struct {
						Title string `json:"title"`
						Token string `json:"token"`
						URL   string `json:"url"`
					} `json:"mention_doc"`
				} `json:"elements"`
			} `json:"text"`
		} `json:"items"`
	}
	endpoint := "https://open.feishu.cn/open-apis/docx/v1/documents/IisUdYmbMo1ypMxKVTWcSjdcnje/blocks"
	if err := h.bitableRequest(ctx, http.MethodGet, endpoint, url.Values{"page_size": {"100"}}, nil, "", token, &blocks); err != nil {
		return "", "", err
	}
	latest, nodeToken, link := 0, "", ""
	for _, block := range blocks.Items {
		for _, element := range block.Text.Elements {
			doc := element.MentionDoc
			if doc != nil {
				if date := teamMeetingDate(doc.Title); date > latest {
					latest, nodeToken, link = date, doc.Token, doc.URL
				}
			}
		}
	}
	if nodeToken == "" {
		return "", "", fmt.Errorf("radar meeting index has no dated document")
	}
	var node struct {
		Node struct {
			ObjToken string `json:"obj_token"`
		} `json:"node"`
	}
	endpoint = "https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node"
	if err := h.bitableRequest(ctx, http.MethodGet, endpoint, url.Values{"token": {nodeToken}, "obj_type": {"wiki"}}, nil, "", token, &node); err != nil {
		return "", link, err
	}
	if node.Node.ObjToken == "" {
		return "", link, fmt.Errorf("radar meeting document has no object token")
	}
	content, err := h.teamStateDoc(ctx, token, node.Node.ObjToken)
	if err != nil {
		return "", link, err
	}
	return teamMeetingExcerpt(content), link, nil
}

// Show only explicit project requirements, without interpreting meeting notes as acceptance.
func teamPlanExcerpt(content, projectName string) string {
	section := map[string]string{
		"27赛季步兵":  "二、兵种战术需求",
		"27赛季哨兵":  "二、兵种战术需求",
		"27赛季重装":  "功能需求变化",
		"27赛季飞镖":  "需求更改",
		"27赛季无人机": "需求（按顺序）",
	}[projectName]
	if section == "" {
		return ""
	}
	lines := strings.Split(content, "\n")
	for i, line := range lines {
		if strings.TrimSpace(line) != section {
			continue
		}
		out := make([]string, 0, 6)
		for _, raw := range lines[i+1:] {
			value := strings.TrimSpace(raw)
			if value == "" {
				continue
			}
			if len(out) > 0 && (strings.HasPrefix(value, "三、") || strings.HasPrefix(value, "技术方案") || strings.HasPrefix(value, "主要风险")) {
				break
			}
			out = append(out, teamClip(value, 130))
			if len(out) == 6 {
				break
			}
		}
		return strings.Join(out, "\n")
	}
	return ""
}

func teamSourceSetupURL(appID string, scopes ...string) string {
	if appID == "" {
		return ""
	}
	return "https://open.feishu.cn/page/scope-apply?" + url.Values{"clientID": {appID}, "scopes": {strings.Join(scopes, ",")}}.Encode()
}

func (h *FeishuHandler) teamStateProjects(ctx context.Context, result *teamStateResponse) {
	if !h.enabled() {
		result.Sources = append(result.Sources, teamSource{Name: "飞书项目管理", Status: "unavailable", Detail: "飞书应用未配置", URL: teamStateBaseURL})
		return
	}
	token, err := h.tenantToken(ctx)
	if err != nil {
		log.Printf("team state Feishu authentication: %v", err)
		result.Sources = append(result.Sources, teamSource{Name: "飞书项目管理", Status: "unavailable", Detail: "飞书应用身份无法授权", URL: teamStateBaseURL})
		return
	}

	projects, projectErr := h.teamStateBaseRows(ctx, token, teamStateProjectsTable)
	if projectErr == nil {
		var tasks, members teamBaseRows
		tasks, projectErr = h.teamStateBaseRows(ctx, token, teamStateTasksTable)
		if projectErr == nil {
			members, projectErr = h.teamStateBaseRows(ctx, token, teamStateMembersTable)
		}
		if projectErr == nil {
			buildTeamProjects(result, projects, tasks, members)
		}
	}
	if projectErr != nil {
		log.Printf("team state Feishu project read: %v", projectErr)
		detail, setup := "项目任务读取失败，请核查应用对原表的访问权限", ""
		if strings.Contains(projectErr.Error(), "99991672") {
			detail, setup = "飞书应用缺少项目记录读取权限", teamSourceSetupURL(h.cfg.AppID, "base:record:read")
		}
		result.Sources = append(result.Sources, teamSource{Name: "飞书项目管理", Status: "unavailable", Detail: detail, URL: teamStateBaseURL, SetupURL: setup})
	} else {
		result.Sources = append(result.Sources, teamSource{Name: "飞书项目管理", Status: "available", URL: teamStateBaseURL})
	}

	docs := map[string]struct{ ID, URL string }{
		"27赛季步兵":  {"Wsu7drksCoDYIEx6sTQcyHDFnSg", "https://t0ekqtnsg8e.feishu.cn/wiki/Zbe0wCYqciOrOnkXUL4cNVIMnde"},
		"27赛季哨兵":  {"Wsu7drksCoDYIEx6sTQcyHDFnSg", "https://t0ekqtnsg8e.feishu.cn/wiki/Zbe0wCYqciOrOnkXUL4cNVIMnde"},
		"27赛季重装":  {"SygqdJVZGoQhGhx8tgNcp0etnC7", "https://t0ekqtnsg8e.feishu.cn/wiki/K0FAwMdRQik3pWkdSZ8cd5nvn9g"},
		"27赛季飞镖":  {"YtTWd7MtIovj5bxdSfscKDpAnde", "https://t0ekqtnsg8e.feishu.cn/wiki/Cu8fwUbizirOaZkC9whcHwMen1b"},
		"27赛季无人机": {"Q1H3dnqBFoDbZxxIZ51c80Ohnef", "https://t0ekqtnsg8e.feishu.cn/wiki/PwJpwv3pMiJYhIk5WS5cVUYWngf"},
		"27赛季雷达":  {"IisUdYmbMo1ypMxKVTWcSjdcnje", "https://t0ekqtnsg8e.feishu.cn/wiki/DZISwXt0eisxN8kDhcYcmaEgncd"},
	}
	if len(result.Projects) == 0 {
		for name, doc := range docs {
			result.Projects = append(result.Projects, teamProject{ID: "doc-" + name, Name: name, Tasks: []teamTask{}, Goals: []teamGoal{}, URL: doc.URL})
		}
		sort.Slice(result.Projects, func(i, j int) bool { return result.Projects[i].Name < result.Projects[j].Name })
	}

	read, failed := 0, 0
	var firstDocErr error
	for i := range result.Projects {
		project := &result.Projects[i]
		doc, ok := docs[project.Name]
		if !ok {
			continue
		}
		project.MeetingURL = doc.URL
		content, err := h.teamStateDoc(ctx, token, doc.ID)
		if err != nil {
			if firstDocErr == nil {
				firstDocErr = err
			}
			failed++
			continue
		}
		if project.Name == "27赛季雷达" {
			latestNote, latestURL, radarErr := h.teamRadarMeeting(ctx, token)
			if radarErr != nil {
				if firstDocErr == nil {
					firstDocErr = radarErr
				}
				failed++
				continue
			}
			project.MeetingExcerpt = latestNote
			project.MeetingURL = latestURL
		} else {
			project.MeetingExcerpt = teamMeetingExcerpt(content)
		}
		project.PlanExcerpt = teamPlanExcerpt(content, project.Name)
		read++
	}
	docStatus, docDetail, docSetup := "available", "", ""
	if failed > 0 {
		docStatus, docDetail = "partial", fmt.Sprintf("%d 个项目的研发记录无法读取", failed)
		if read == 0 {
			docStatus, docDetail = "unavailable", "研发文档暂不可读取"
		}
		if firstDocErr != nil && strings.Contains(firstDocErr.Error(), "99991672") {
			docDetail = "飞书应用缺少文档读取权限"
			docSetup = teamSourceSetupURL(h.cfg.AppID, "docx:document:readonly", "wiki:node:read")
		}
		log.Printf("team state Feishu documents: read=%d failed=%d: %v", read, failed, firstDocErr)
	}
	result.Sources = append(result.Sources, teamSource{Name: "研发与组会记录", Status: docStatus, Detail: docDetail, URL: "https://t0ekqtnsg8e.feishu.cn/wiki/Jcy4wGbeoiF1ltkCa2Yc4txDnzd", SetupURL: docSetup})

	plan, err := h.teamStateDoc(ctx, token, "P22VdnfycoSB1ZxPQGHcxnMCnBc")
	if err != nil {
		log.Printf("team state Feishu goal read: %v", err)
		setup := ""
		if strings.Contains(err.Error(), "99991672") {
			setup = teamSourceSetupURL(h.cfg.AppID, "docx:document:readonly", "wiki:node:read")
		}
		result.Sources = append(result.Sources, teamSource{Name: "赛季验收要求", Status: "unavailable", Detail: "赛季目标文档暂不可读取", URL: teamStatePlanURL, SetupURL: setup})
		return
	}
	goals := teamSentryGoals(plan)
	if len(goals) == 0 {
		result.Sources = append(result.Sources, teamSource{Name: "赛季验收要求", Status: "unavailable", Detail: "未识别出有效的验收要求", URL: teamStatePlanURL})
		return
	}
	for i := range result.Projects {
		if result.Projects[i].Name == "27赛季哨兵" {
			result.Projects[i].Goals = goals
		}
	}
	result.Sources = append(result.Sources, teamSource{Name: "赛季验收要求", Status: "available", Detail: "已关联哨兵验收指标，其余项目展示各自研发需求", URL: teamStatePlanURL})
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
	ids := map[string]int{}
	for i, row := range projects.records() {
		name := teamText(row["项目名称"])
		if name == "" {
			continue
		}
		ids[projects.RecordIDs[i]] = len(result.Projects)
		result.Projects = append(result.Projects, teamProject{ID: projects.RecordIDs[i], Name: name, Owner: teamText(row["总负责人"]), Members: teamText(row["成员"]), Status: teamText(row["状态"]), TasksLoaded: true, Tasks: []teamTask{}, Goals: []teamGoal{}, URL: teamStateBaseURL})
	}
	today := time.Now().In(time.FixedZone("CST", 8*60*60)).Format(time.DateOnly)
	summary := &teamSummary{}
	for i, row := range tasks.records() {
		status := teamText(row["状态"])
		complete := status == "已完成"
		due := teamText(row["截止时间"])
		finished := teamText(row["实际完成时间"])
		overdue := !complete && !teamDate(due).IsZero() && teamDate(due).Format(time.DateOnly) < today
		task := teamTask{ID: tasks.RecordIDs[i], Title: teamText(row["任务"]), Status: status, Priority: teamText(row["优先级"]), Due: due, CompletedAt: finished, Overdue: overdue, Assignees: []string{}}
		for _, person := range teamLinks(row["任务执行人"]) {
			if name := people[person]; name != "" {
				task.Assignees = append(task.Assignees, name)
			}
		}
		summary.Total++
		switch status {
		case "已完成":
			summary.Completed++
			if finished == "" {
				summary.MissingCompletedDate++
			}
		case "进行中":
			summary.InProgress++
		case "未开始":
			summary.NotStarted++
		case "已停滞":
			summary.Stalled++
		}
		if overdue {
			summary.Overdue++
		}
		for _, projectID := range teamLinks(row["所属项目"]) {
			index, ok := ids[projectID]
			if !ok {
				continue
			}
			result.Projects[index].Tasks = append(result.Projects[index].Tasks, task)
			if complete {
				result.Projects[index].Completed++
			}
		}
	}
	sort.Slice(result.Projects, func(i, j int) bool { return result.Projects[i].Name < result.Projects[j].Name })
	result.Summary = summary
	if summary.Overdue > 0 {
		result.Insights = append(result.Insights, teamInsight{Kind: "推断", Text: fmt.Sprintf("%d 条未完成任务已过原定截止日期，可能延期或尚未更新。", summary.Overdue), SourceURL: teamStateBaseURL})
	}
	if summary.MissingCompletedDate > 0 {
		result.Insights = append(result.Insights, teamInsight{Kind: "事实", Text: fmt.Sprintf("%d 条已完成任务未填写实际完成日期。", summary.MissingCompletedDate), SourceURL: teamStateBaseURL})
	}
}

func (h *FeishuHandler) teamStateLocal(ctx context.Context, result *teamStateResponse) {
	if h.db == nil {
		return
	}
	var weekly []model.WeeklyReport
	since := time.Now().In(time.FixedZone("CST", 8*3600)).AddDate(0, 0, -21).Format(time.DateOnly)
	err := h.db.WithContext(ctx).Preload("User").Preload("Group").
		Where("week_start >= ?", since).Order("week_start DESC").Order("updated_at DESC").Limit(18).Find(&weekly).Error
	if err != nil {
		log.Printf("team state weekly reports: %v", err)
		result.Sources = append(result.Sources, teamSource{Name: "网站周报", Status: "unavailable", Detail: "周报暂不可读取"})
	} else {
		for _, report := range weekly {
			name := "成员"
			if report.User.RealName != nil && *report.User.RealName != "" {
				name = *report.User.RealName
			}
			group := ""
			if report.GroupID != nil {
				group = report.Group.Name
			}
			result.Reports = append(result.Reports, teamReport{ID: report.ID, Member: name, Group: group, Week: string(report.WeekStart),
				Completed: teamClip(report.Completed, 250), Blockers: teamClip(report.Blockers, 250), NextPlan: teamClip(report.NextPlan, 250)})
		}
		result.Sources = append(result.Sources, teamSource{Name: "网站周报", Status: "available", URL: "/dashboard/weekly-reports"})
	}
	var active, blocked int64
	err = h.db.WithContext(ctx).Model(&model.OperationsProgressItem{}).
		Where("status <> ? AND kind <> ?", "done", "channel").Count(&active).Error
	if err == nil {
		err = h.db.WithContext(ctx).Model(&model.OperationsProgressStep{}).Where("status = ?", "blocked").Count(&blocked).Error
	}
	if err != nil {
		log.Printf("team state operations: %v", err)
		result.Sources = append(result.Sources, teamSource{Name: "运营动态", Status: "unavailable", Detail: "运营数据暂不可读取"})
	} else {
		result.Operations = &teamOperations{Active: active, Blocked: blocked, URL: "/dashboard/workbench/operations"}
		result.Sources = append(result.Sources, teamSource{Name: "运营动态", Status: "available", URL: "/dashboard/workbench/operations"})
	}
}

func (h *FeishuHandler) GetTeamState(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	result := &teamStateResponse{GeneratedAt: time.Now(), Sources: []teamSource{}, Projects: []teamProject{}, Reports: []teamReport{}}
	h.teamStateLocal(ctx, result)
	h.teamStateProjects(ctx, result)
	writeAPI(c, http.StatusOK, "获取战队运行状态成功", result)
}
