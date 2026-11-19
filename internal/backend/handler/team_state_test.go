package handler

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
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
		{"底盘联调", []any{map[string]string{"id": "infantry"}}, nil, []string{"进行中"}, nil, nil},
		{"定位测试", []any{map[string]string{"id": "sentry"}}, nil, []string{"已停滞"}, nil, nil},
		{"决策计划", []any{map[string]string{"id": "sentry"}}, nil, []string{"未开始"}, nil, nil},
		{"老车改造", []any{map[string]string{"id": "misc"}}, nil, []string{"已完成"}, nil, nil},
	})
	members := mockTeamRows([]string{"账号"}, []string{"member"}, [][]any{{[]any{map[string]string{"name": "工程成员"}}}})
	result := &teamStateResponse{Projects: []teamProject{}}
	buildTeamProjects(result, projects, tasks, members)
	if result.Summary == nil || result.Summary.Total != 4 || result.Summary.Completed != 1 ||
		result.Summary.InProgress != 1 || result.Summary.NotStarted != 1 ||
		result.Summary.Stalled != 1 || result.Summary.MissingCompletedDate != 1 {
		t.Fatalf("incorrect task summary: %+v", result.Summary)
	}
	if len(result.Projects) != 2 || result.Projects[0].Completed != 1 || result.Projects[1].Stalled != 1 {
		t.Fatalf("unknown project must not distort six-group summary: %+v", result.Projects)
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

func TestTechnicalRadarMeetingReadsLatestReferencedWiki(t *testing.T) {
	calls := []string{}
	client := &http.Client{Transport: teamStateMockTransport(func(req *http.Request) (*http.Response, error) {
		calls = append(calls, req.URL.Path)
		body := `{"code":0,"data":{}}`
		switch {
		case strings.HasSuffix(req.URL.Path, "/blocks"):
			body = `{"code":0,"data":{"items":[{"text":{"elements":[{"mention_doc":{"title":"2026.11.15雷达站会议记录","token":"wiki_new","url":"https://example.com/latest"}}]}},{"text":{"elements":[{"mention_doc":{"title":"2026.11.8雷达站会议记录","token":"wiki_old","url":"https://example.com/old"}}]}}]}}`
		case strings.HasSuffix(req.URL.Path, "/get_node"):
			if req.URL.Query().Get("token") != "wiki_new" {
				t.Fatalf("wrong wiki document: %s", req.URL)
			}
			body = `{"code":0,"data":{"node":{"obj_token":"doc_new"}}}`
		case strings.HasSuffix(req.URL.Path, "/raw_content"):
			if !strings.Contains(req.URL.Path, "doc_new") {
				t.Fatalf("wrong document: %s", req.URL)
			}
			body = `{"code":0,"data":{"content":"2026.11.15雷达站会议记录\n第一次联调完成，后续继续测试"}}`
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}
	h := &FeishuHandler{client: client}
	excerpt, link, err := h.teamRadarMeeting(context.Background(), "token")
	if err != nil || link != "https://example.com/latest" || !strings.Contains(excerpt, "第一次联调完成") || len(calls) != 3 {
		t.Fatalf("radar source chain wrong: excerpt=%q link=%q err=%v calls=%v", excerpt, link, err, calls)
	}
}

func TestTechnicalDashboardReadOnlyAndDoesNotInventTaskProgressWhenUnauthorized(t *testing.T) {
	methods := []string{}
	client := &http.Client{Transport: teamStateMockTransport(func(req *http.Request) (*http.Response, error) {
		methods = append(methods, req.Method+" "+req.URL.Path)
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
	if len(result.Sources) != 2 || result.Sources[0].Status != "unavailable" ||
		!strings.Contains(result.Sources[0].SetupURL, "base%3Arecord%3Aread") {
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
