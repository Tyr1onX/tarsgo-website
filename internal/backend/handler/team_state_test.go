package handler

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"tarsgo-backend/config"
)

type teamStateMockTransport func(*http.Request) (*http.Response, error)

func (f teamStateMockTransport) RoundTrip(req *http.Request) (*http.Response, error) { return f(req) }

func mockTeamRows(fields, ids []string, data [][]any) teamBaseRows {
	table := teamBaseRows{Fields: fields, RecordIDs: ids, Data: [][]json.RawMessage{}}
	for _, values := range data {
		row := make([]json.RawMessage, len(values))
		for i, value := range values {
			row[i], _ = json.Marshal(value)
		}
		table.Data = append(table.Data, row)
	}
	return table
}

func TestTechnicalProjectsAggregateOnlySixKnownGroups(t *testing.T) {
	projects := mockTeamRows([]string{"项目名称"}, []string{"infantry", "sentry", "misc"}, [][]any{
		{"27赛季步兵"}, {"27赛季哨兵"}, {"修改老车结构适应新装甲板尺寸"},
	})
	tasks := mockTeamRows([]string{"任务", "所属项目", "任务执行人", "状态", "实际完成时间", "截止时间"}, []string{"t1", "t2", "t3", "t4", "t5"}, [][]any{
		{"过洞测试", []any{map[string]string{"id": "infantry"}}, []any{map[string]string{"id": "member"}}, []string{"已完成"}, nil, nil},
		{"底盘联调", []any{map[string]string{"id": "infantry"}}, nil, []string{"进行中"}, "2026-10-12T00:00:00+08:00", nil},
		{"定位测试", []any{map[string]string{"id": "sentry"}}, nil, []string{"已停滞"}, nil, nil},
		{"决策计划", []any{map[string]string{"id": "sentry"}}, nil, []string{"未开始"}, nil, nil},
		{"老车改造", []any{map[string]string{"id": "misc"}}, nil, []string{"已完成"}, nil, nil},
	})
	members := mockTeamRows([]string{"账号"}, []string{"member"}, [][]any{{[]any{map[string]string{"name": "工程成员"}}}})
	result := &teamStateResponse{Projects: []teamProject{}}
	buildTeamProjects(result, projects, tasks, members)
	if result.Summary == nil || result.Summary.Total != 4 || result.Summary.Completed != 1 ||
		result.Summary.InProgress != 1 || result.Summary.NotStarted != 1 ||
		result.Summary.Stalled != 1 || result.Summary.MissingCompletedDate != 1 || result.Summary.ConflictingCompletedDate != 1 {
		t.Fatalf("incorrect task summary: %+v", result.Summary)
	}
	if len(result.Projects) != 2 || result.Projects[0].Completed != 1 || result.Projects[1].Stalled != 1 {
		t.Fatalf("unknown project must not distort six-group summary: %+v", result.Projects)
	}
	if result.Projects[0].MissingCompletedDate != 1 || result.Projects[0].ConflictingCompletedDate != 1 {
		t.Fatalf("data-quality issues must be attributed to the owning project: %+v", result.Projects[0])
	}
	if result.Projects[0].Tasks[0].Assignees[0] != "工程成员" {
		t.Fatalf("person relation was not resolved: %+v", result.Projects[0].Tasks)
	}
	if result.Projects[1].LastMeetingDate != "" {
		t.Fatal("task dates must not masquerade as last meeting update")
	}
}

func TestTechnicalMeetingNewestSectionEvenInReverseOrder(t *testing.T) {
	content := "2026/11.15会议记录\n基站结构已完成，待继续联调\n2026/11.8会议记录\n之前任务仍在推进"
	got := teamMeetingExcerpt(content)
	if !strings.Contains(got, "11.15") || strings.Contains(got, "之前任务") {
		t.Fatalf("should only include latest meeting: %q", got)
	}
	if teamMeetingISO(got) != "2026-11-15" {
		t.Fatalf("meeting date should be derived from source heading: %q", teamMeetingISO(got))
	}
	if teamMeetingISO("未标注具体会议日期\n已完成测试") != "" {
		t.Fatal("meeting date must not be invented")
	}
	if got := teamMeetingDate("飞机周会 11.21"); got != 20261121 {
		t.Fatalf("title-first meeting date was ignored: %d", got)
	}
	if got := teamMeetingDate("2026.11.22雷达站与自定义终端会议记录"); got != 20261122 {
		t.Fatalf("date-first meeting title was ignored: %d", got)
	}
	if got := teamMeetingDate("预计 11.29 完成任务"); got != 0 {
		t.Fatalf("task due dates must not be treated as meetings: %d", got)
	}
	flight := teamMeetingHistory("27赛季无人机", "飞机周会 11.21\n定位在不同光照条件下已稳定悬停\n11.14飞机周会记录\n上周完成装配", "https://example.com/flight")
	if len(flight) != 2 || flight[0].Date != "2026-11-21" || !strings.Contains(flight[0].Updates[0], "定位") {
		t.Fatalf("drone's prefix-dated weekly meeting must be visible: %+v", flight)
	}
}

func TestTechnicalBriefDoesNotMixInfantryAndSentry(t *testing.T) {
	content := "11.14会议记录\n造车\n车体结构装配已完成，准备测试\n仍有卡弹问题，继续调试\nai\n控制器、里程计与过洞整合已完成\n下周重写追击策略"
	infantry, issue, _ := teamBrief("27赛季步兵", content)
	if len(infantry) == 0 || !strings.Contains(infantry[0], "车体") ||
		strings.Contains(strings.Join(infantry, " "), "里程计") || !strings.Contains(issue, "卡弹") {
		t.Fatalf("infantry summary is unrelated: updates=%v issue=%q", infantry, issue)
	}
	sentry, _, next := teamBrief("27赛季哨兵", content)
	if len(sentry) == 0 || !strings.Contains(sentry[0], "里程计") ||
		strings.Contains(strings.Join(sentry, " "), "车体结构") || !strings.Contains(next, "追击") {
		t.Fatalf("sentry summary is unrelated: updates=%v next=%q", sentry, next)
	}
}

func TestTechnicalRadarMeetingsDiscoverNewestFolderEntries(t *testing.T) {
	calls := 0
	var mu sync.Mutex
	client := &http.Client{Transport: teamStateMockTransport(func(req *http.Request) (*http.Response, error) {
		mu.Lock()
		calls++
		mu.Unlock()
		body := `{"code":0,"data":{}}`
		switch {
		case strings.HasSuffix(req.URL.Path, "/nodes"):
			if req.URL.Query().Get("parent_node_token") != teamRadarFolder {
				t.Errorf("unexpected wiki folder: %s", req.URL)
			}
			if req.URL.Query().Get("page_token") == "" {
				body = `{"code":0,"data":{"items":[{"title":"2026.11.8雷达站会议记录","node_token":"wiki_old","obj_token":"doc_old","obj_type":"docx"}],"has_more":true,"page_token":"next"}}`
			} else {
				body = `{"code":0,"data":{"items":[{"title":"2026.11.22雷达站与自定义终端会议记录","node_token":"wiki_new","obj_token":"doc_new","obj_type":"docx"},{"title":"技术方案","node_token":"ignored","obj_token":"ignored","obj_type":"docx"}],"has_more":false}}`
			}
		case strings.HasSuffix(req.URL.Path, "/raw_content"):
			if strings.Contains(req.URL.Path, "doc_new") {
				body = `{"code":0,"data":{"content":"2026.11.22雷达站与自定义终端会议记录\n本周已完成：\n行为树demo已经跑通\n后续安排：\n调整数据集标注脚本"}}`
			} else {
				body = `{"code":0,"data":{"content":"2026.11.8雷达站会议记录\n信息波部署已完成"}}`
			}
		default:
			t.Errorf("unexpected API request: %s", req.URL)
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}
	h := &FeishuHandler{client: client}
	history, err := h.teamFolderMeetings(context.Background(), "token", teamRadarSpace, teamRadarFolder, "27赛季雷达", 4)
	if err != nil || len(history) != 2 || calls != 4 {
		t.Fatalf("expected both pages and two source documents: history=%+v err=%v calls=%d", history, err, calls)
	}
	if history[0].Date != "2026-11-22" || history[1].Date != "2026-11-08" ||
		history[0].URL != teamWikiURL+"wiki_new" || history[1].URL != teamWikiURL+"wiki_old" ||
		!strings.Contains(history[0].Updates[0], "行为树") || strings.Contains(strings.Join(history[0].Updates, " "), "本周已完成：") ||
		!strings.Contains(history[0].NextAction, "数据集") {
		t.Fatalf("latest radar meeting must be attributed and separated from plans: %+v", history)
	}
}

func TestTechnicalWeeklyMeetingReadsNewDocumentWithoutManualIndex(t *testing.T) {
	client := &http.Client{Transport: teamStateMockTransport(func(req *http.Request) (*http.Response, error) {
		body := `{"code":0,"data":{}}`
		switch {
		case strings.HasSuffix(req.URL.Path, "/nodes"):
			if req.URL.Query().Get("parent_node_token") != teamWeeklyFolder {
				t.Errorf("unexpected weekly folder: %s", req.URL)
			}
			body = `{"code":0,"data":{"items":[{"title":"11.15周会","node_token":"old","obj_token":"old_doc","obj_type":"docx"},{"title":"11.22周会","node_token":"new","obj_token":"new_doc","obj_type":"docx"}],"has_more":false}}`
		case strings.HasSuffix(req.URL.Path, "/new_doc/raw_content"):
			body = `{"code":0,"data":{"content":"11.22周会\n一、进度\n步哨\n重装 大臂等待零件，11.30预计完成\n飞镖 制导11.29待测试\n2026.11.22雷达站与自定义终端会议记录\n下周继续联调"}}`
		default:
			t.Errorf("unexpected API request: %s", req.URL)
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}
	h := &FeishuHandler{client: client}
	history, err := h.teamFolderMeetings(context.Background(), "token", teamWeeklySpace, teamWeeklyFolder, "全队周会", 1)
	if err != nil || len(history) != 1 || history[0].Date != "2026-11-22" ||
		history[0].URL != teamWikiURL+"new" || len(history[0].Updates) == 0 ||
		!strings.HasPrefix(history[0].Updates[0], "重装") || strings.Contains(history[0].Updates[0], "步哨：") {
		t.Fatalf("latest team-wide meeting should be discovered without editing an index: %+v, %v", history, err)
	}
}

func TestTechnicalMeetingHistoryLatestFirstAndWithoutFabricatedTrend(t *testing.T) {
	content := "2026/11.15会议记录\n换弹结构已完成\n后续安排：\n11.22准备调试\n" +
		"2026/11.8会议记录\n第一阶段调试完成\n" +
		"11.1号周会\n正在优化镖架\n" +
		"10.25组会\n准备加工零件\n" +
		"10.18组会\n继续优化发射机构"
	history := teamMeetingHistory("27赛季飞镖", content, "https://example.com/meetings")
	if len(history) != 4 || history[0].Date != "2026-11-15" ||
		history[1].Date != "2026-11-08" || history[2].Date != "2026-11-01" ||
		history[3].Date != "2026-10-25" {
		t.Fatalf("must preserve last four real meeting dates: %+v", history)
	}
	if history[0].URL != "https://example.com/meetings" ||
		!strings.Contains(history[0].Updates[0], "换弹结构已完成") ||
		!strings.Contains(history[0].NextAction, "准备调试") ||
		strings.Contains(strings.Join(history[0].Updates, " "), "准备调试") {
		t.Fatalf("reported outcomes and future plans must stay separate: %+v", history[0])
	}
	if undated := teamMeetingHistory("27赛季飞镖", "一些没有日期的研发信息", "https://example.com"); len(undated) != 0 {
		t.Fatalf("must not invent dates: %+v", undated)
	}
}

func TestTechnicalSharedMeetingHistoryDoesNotAttributeInfantryToSentry(t *testing.T) {
	content := "11.14会议记录\n造车\n27新过洞已经装配完成\nai\n测试控制器和里程计整合已完成\n" +
		"11.7会议记录\n造车\n底盘已出图\n" +
		"10.31会议记录\n造车\n派件完成\nai\n哨兵定位测试完成"
	sentry := teamMeetingHistory("27赛季哨兵", content, "https://example.com/shared")
	infantry := teamMeetingHistory("27赛季步兵", content, "https://example.com/shared")
	if len(sentry) != 2 || sentry[0].Date != "2026-11-14" || sentry[1].Date != "2026-10-31" ||
		strings.Contains(strings.Join(sentry[0].Updates, " "), "过洞") ||
		!strings.Contains(strings.Join(sentry[0].Updates, " "), "里程计") {
		t.Fatalf("sentry must only use its distinct subsection: %+v", sentry)
	}
	if len(infantry) != 3 || strings.Contains(strings.Join(infantry[0].Updates, " "), "里程计") {
		t.Fatalf("infantry must exclude the sentry subsection: %+v", infantry)
	}
}

func TestTechnicalDashboardReadOnlyAndDoesNotInventTaskProgressWhenUnauthorized(t *testing.T) {
	methods := []string{}
	var methodsMu sync.Mutex
	client := &http.Client{Transport: teamStateMockTransport(func(req *http.Request) (*http.Response, error) {
		methodsMu.Lock()
		methods = append(methods, req.Method+" "+req.URL.Path)
		methodsMu.Unlock()
		body := `{"code":99991672,"msg":"missing scope"}`
		if strings.HasSuffix(req.URL.Path, "/tenant_access_token/internal") {
			body = `{"code":0,"tenant_access_token":"token"}`
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}
	h := &FeishuHandler{cfg: config.FeishuConfig{AppID: "cli_test", AppSecret: "secret"}, client: client}
	result := &teamStateResponse{Projects: []teamProject{}, Sources: []teamSource{}}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	h.teamStateProjects(ctx, result)
	if result.Summary != nil || len(result.Projects) != 6 {
		t.Fatalf("cannot show zero progress if Base permission is missing: %+v", result)
	}
	for _, project := range result.Projects {
		if project.TasksLoaded || len(project.Tasks) != 0 {
			t.Fatalf("unknown task counts must be marked unavailable: %+v", project)
		}
	}
	if len(result.Sources) != 3 || result.Sources[1].Status != "unavailable" ||
		!strings.Contains(result.Sources[1].SetupURL, "base%3Arecord%3Aread") {
		t.Fatalf("permission issues must be actionable: %+v", result.Sources)
	}
	for _, call := range methods {
		if !strings.HasPrefix(call, "GET ") && !strings.HasPrefix(call, "POST /open-apis/auth/") {
			t.Fatalf("dashboard must never write source data: %s", call)
		}
	}
}

func TestTechnicalBriefRadarKeepsFuturePlanSeparateFromCompletedProgress(t *testing.T) {
	excerpt := "2026.11.15雷达站会议记录\n上周已完成进度✅：\n所有模块第一次联调压力测试（ALL 11.15）\n信息波离线版部署已完成\n后续安排：\n购买镜头并测试效果（11.22）\n大模型决策第一版准备下周测试"
	updates, _, next := teamBrief("27赛季雷达", excerpt)
	if len(updates) != 2 || !strings.Contains(updates[0], "第一次联调") ||
		strings.Contains(strings.Join(updates, " "), "购买镜头") || !strings.Contains(next, "购买镜头") {
		t.Fatalf("must separate reported progress from future plan: updates=%v next=%q", updates, next)
	}
}

func TestTechnicalTeamStateAutoDiscoversWeeklyAndRadarFromFolders(t *testing.T) {
	client := &http.Client{Transport: teamStateMockTransport(func(req *http.Request) (*http.Response, error) {
		body := `{"code":0,"data":{}}`
		switch {
		case strings.HasSuffix(req.URL.Path, "/tenant_access_token/internal"):
			body = `{"code":0,"tenant_access_token":"test-token"}`
		case strings.Contains(req.URL.Path, "/tables/"):
			body = `{"code":0,"data":{"fields":[],"data":[],"record_id_list":[],"has_more":false}}`
		case strings.HasSuffix(req.URL.Path, "/nodes"):
			if strings.Contains(req.URL.Path, teamRadarSpace) {
				body = `{"code":0,"data":{"items":[{"title":"2026.11.22雷达站与自定义终端会议记录","node_token":"radar_new","obj_token":"radar_doc","obj_type":"docx"}]}}`
			} else {
				body = `{"code":0,"data":{"items":[{"title":"11.22周会","node_token":"weekly_new","obj_token":"weekly_doc","obj_type":"docx"}]}}`
			}
		case strings.HasSuffix(req.URL.Path, "/raw_content"):
			content := "11.21组会\n造车\n底盘联调已完成\nai\n哨兵定位联调已完成"
			if strings.Contains(req.URL.Path, "weekly_doc") {
				content = "11.22周会\n重装 大臂等件中，预计11.30出实物\n飞镖 制导预计11.29完成"
			} else if strings.Contains(req.URL.Path, "radar_doc") {
				content = "2026.11.22雷达站与自定义终端会议记录\n已经跑通行为树demo"
			}
			quoted, _ := json.Marshal(content)
			body = `{"code":0,"data":{"content":` + string(quoted) + `}}`
		default:
			t.Errorf("unrecognized upstream request: %s", req.URL)
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}
	h := &FeishuHandler{cfg: config.FeishuConfig{AppID: "app", AppSecret: "secret"}, client: client}
	result := &teamStateResponse{Projects: []teamProject{}, Sources: []teamSource{}}
	h.teamStateProjects(context.Background(), result)
	if result.WeeklyMeeting == nil || result.WeeklyMeeting.Date != "2026-11-22" ||
		result.WeeklyMeeting.URL != teamWikiURL+"weekly_new" {
		t.Fatalf("latest weekly meeting missing from snapshot: %+v", result.WeeklyMeeting)
	}
	if result.Summary == nil || result.Summary.Total != 0 || len(result.Projects) != 6 {
		t.Fatalf("meeting updates must never fabricate task progress: %+v", result)
	}
	foundRadar := false
	for _, project := range result.Projects {
		if project.Name == "27赛季雷达" {
			foundRadar = true
			if project.LastMeetingDate != "2026-11-22" || project.MeetingURL != teamWikiURL+"radar_new" {
				t.Fatalf("radar must follow the new folder document: %+v", project)
			}
		}
	}
	if !foundRadar || len(result.Sources) != 3 || result.Sources[0].Status != "available" ||
		result.Sources[2].Status != "available" {
		t.Fatalf("weekly and group sources must be available: %+v", result.Sources)
	}
}
