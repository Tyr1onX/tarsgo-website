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

func TestBuildTeamProjectsKeepsTaskAndGoalEvidenceSeparate(t *testing.T) {
	rows := func(fields []string, ids []string, values [][]any) teamBaseRows {
		table := teamBaseRows{Fields: fields, RecordIDs: ids}
		for _, row := range values {
			serialized := make([]json.RawMessage, len(row))
			for i, cell := range row {
				serialized[i], _ = json.Marshal(cell)
			}
			table.Data = append(table.Data, serialized)
		}
		return table
	}
	projects := rows([]string{"项目名称"}, []string{"project1"}, [][]any{{"27赛季哨兵"}})
	tasks := rows([]string{"任务", "任务执行人", "状态", "截止时间", "实际完成时间", "所属项目"},
		[]string{"task1", "task2"}, [][]any{
			{"过洞里程计算法", []any{map[string]string{"id": "person1"}}, []string{"已完成"}, "2026-09-30T00:00:00+08:00", nil, []any{map[string]string{"id": "project1"}}},
			{"小脑决策", []any{map[string]string{"id": "person1"}}, []string{"进行中"}, "2026-11-01T00:00:00+08:00", nil, []any{map[string]string{"id": "project1"}}},
		})
	members := rows([]string{"账号"}, []string{"person1"}, [][]any{{[]any{map[string]string{"name": "小白"}}}})
	response := &teamStateResponse{}
	buildTeamProjects(response, projects, tasks, members)
	if response.Summary == nil || response.Summary.Completed != 1 || response.Summary.Overdue != 1 || response.Summary.MissingCompletedDate != 1 {
		t.Fatalf("incorrect summary %+v", response.Summary)
	}
	if len(response.Projects) != 1 || len(response.Projects[0].Tasks) != 2 {
		t.Fatalf("unexpected projects %+v", response.Projects)
	}
	if got := response.Projects[0].Tasks[0].Assignees; len(got) != 1 || got[0] != "小白" {
		t.Fatalf("unresolved assignee %+v", got)
	}
	if len(response.Projects[0].Goals) != 0 {
		t.Fatal("task status must never imply goal acceptance")
	}
	if len(response.Insights) != 2 || response.Insights[0].Kind != "推断" || response.Insights[1].Kind != "事实" {
		t.Fatalf("facts and inference must be distinguished: %+v", response.Insights)
	}
}

func TestTeamMeetingExcerptUsesLatestSection(t *testing.T) {
	content := "## 11.14会议记录\n早期联调任务持续进行，代码正在修改\n## 12.02组会记录\n最新联调结果需要重新验收，下一阶段继续测试"
	got := teamMeetingExcerpt(content)
	if !strings.Contains(got, "12.02组会记录") || !strings.Contains(got, "最新联调结果") || strings.Contains(got, "早期联调") {
		t.Fatalf("wrong meeting section: %q", got)
	}
}

func TestTeamSentryGoalsRequireActualTargetText(t *testing.T) {
	content := "需求ID\n哨兵-002\n优化导航\n\n五分钟内过洞、上坡、跨越全场\n高\n张坤杰\n\n哨兵-003\n优化决策\n七分钟二十次位移\n"
	goals := teamSentryGoals(content)
	if len(goals) != 2 || goals[0].Target != "五分钟内过洞、上坡、跨越全场" || goals[1].ID != "哨兵-003" {
		t.Fatalf("unexpected goals: %+v", goals)
	}
	if len(teamSentryGoals("仅有任务完成率，未记录赛季目标")) != 0 {
		t.Fatal("must not invent goals")
	}
}

type teamStateMockTransport func(*http.Request) (*http.Response, error)

func (f teamStateMockTransport) RoundTrip(req *http.Request) (*http.Response, error) { return f(req) }

func TestTeamStateRemoteReadIsReadOnlyAndPartialWhenGoalsUnavailable(t *testing.T) {
	requests := []string{}
	client := &http.Client{Transport: teamStateMockTransport(func(req *http.Request) (*http.Response, error) {
		requests = append(requests, req.Method+" "+req.URL.Path)
		body := `{"code":0,"data":{"fields":[],"data":[],"record_id_list":[],"has_more":false}}`
		switch {
		case strings.HasSuffix(req.URL.Path, "tenant_access_token/internal"):
			body = `{"code":0,"tenant_access_token":"token"}`
		case strings.Contains(req.URL.Path, "/documents/"):
			body = `{"code":999,"msg":"not shared"}`
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}
	h := &FeishuHandler{cfg: config.FeishuConfig{AppID: "app", AppSecret: "secret"}, client: client}
	snapshot := &teamStateResponse{Projects: []teamProject{}}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	h.teamStateProjects(ctx, snapshot)
	if snapshot.Summary == nil || snapshot.Summary.Total != 0 {
		t.Fatalf("empty records should be valid: %+v", snapshot.Summary)
	}
	if len(snapshot.Sources) != 4 || snapshot.Sources[0].Status != "available" || snapshot.Sources[1].Status != "unavailable" || snapshot.Sources[3].Status != "unavailable" {
		t.Fatalf("partial source status lost: %+v", snapshot.Sources)
	}
	for _, call := range requests {
		if !strings.HasPrefix(call, "GET ") && !strings.HasPrefix(call, "POST /open-apis/auth/") {
			t.Fatalf("unexpected write: %s", call)
		}
	}
}

func TestTeamMeetingExcerptFindsNewestEvenWhenDocumentIsReverseChronological(t *testing.T) {
	content := "2026/11.15会议记录\n已完成第一次测试，后续需要检查验收结果\n2026/11.8会议记录\n旧版测试暂时延期，还未进入新阶段"
	got := teamMeetingExcerpt(content)
	if !strings.Contains(got, "11.15") || strings.Contains(got, "旧版测试") {
		t.Fatalf("should show newest meeting, not last document section: %q", got)
	}
}

func TestTeamPlanExcerptUsesExplicitRequirements(t *testing.T) {
	original := "前言\n功能需求变化\n稳定兑矿、自定义控制器\n需要较大的载弹量\n需要研发自瞄\n主要风险\n风险与验收需要分开\n"
	got := teamPlanExcerpt(original, "27赛季重装")
	if !strings.Contains(got, "需要研发自瞄") || strings.Contains(got, "风险与验收") {
		t.Fatalf("requirements extraction crossed source section: %q", got)
	}
	if teamPlanExcerpt(original, "27赛季雷达") != "" {
		t.Fatal("must not invent project requirements without source")
	}
}

func TestTeamStateMissingAppScopeDoesNotInventZeroProgress(t *testing.T) {
	client := &http.Client{Transport: teamStateMockTransport(func(req *http.Request) (*http.Response, error) {
		body := `{"code":99991672,"msg":"missing scope"}`
		if strings.HasSuffix(req.URL.Path, "tenant_access_token/internal") {
			body = `{"code":0,"tenant_access_token":"test-token"}`
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}
	h := &FeishuHandler{cfg: config.FeishuConfig{AppID: "cli_real_app_id", AppSecret: "test-secret"}, client: client}
	result := &teamStateResponse{Projects: []teamProject{}}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	h.teamStateProjects(ctx, result)
	if result.Summary != nil {
		t.Fatalf("must not show zero when Base is forbidden: %+v", result.Summary)
	}
	if len(result.Projects) != 6 {
		t.Fatalf("document index must stay independently reachable: %+v", result.Projects)
	}
	for _, project := range result.Projects {
		if project.TasksLoaded || len(project.Tasks) != 0 {
			t.Fatalf("unknown task counts must not be presented as true: %+v", project)
		}
	}
	if len(result.Sources) != 4 || result.Sources[0].Status != "unavailable" ||
		!strings.Contains(result.Sources[0].SetupURL, "base%3Arecord%3Aread") ||
		!strings.Contains(result.Sources[1].SetupURL, "docx%3Adocument%3Areadonly") {
		t.Fatalf("wrong remediation for missing scopes: %+v", result.Sources)
	}
}

func TestTeamRadarMeetingFollowsLatestWikiReference(t *testing.T) {
	calls := []string{}
	client := &http.Client{Transport: teamStateMockTransport(func(req *http.Request) (*http.Response, error) {
		calls = append(calls, req.URL.Path)
		body := `{"code":0,"data":{}}`
		switch {
		case strings.HasSuffix(req.URL.Path, "/blocks"):
			body = `{"code":0,"data":{"items":[{"text":{"elements":[{"mention_doc":{"title":"2026.11.15雷达站会议记录","token":"wiki_new","url":"https://example.com/latest"}}]}},{"text":{"elements":[{"mention_doc":{"title":"2026.11.8雷达站会议记录","token":"wiki_old","url":"https://example.com/old"}}]}}]}}`
		case strings.HasSuffix(req.URL.Path, "/get_node"):
			if req.URL.Query().Get("token") != "wiki_new" {
				t.Fatalf("wrong wiki chosen: %s", req.URL)
			}
			body = `{"code":0,"data":{"node":{"obj_token":"doc_new"}}}`
		case strings.HasSuffix(req.URL.Path, "/raw_content"):
			if !strings.Contains(req.URL.Path, "doc_new") {
				t.Fatalf("wrong document selected: %s", req.URL)
			}
			body = `{"code":0,"data":{"content":"2026.11.15雷达站会议记录\n完成雷达联调测试，目前仍有指标需要核实"}}`
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}
	h := &FeishuHandler{client: client}
	text, link, err := h.teamRadarMeeting(context.Background(), "token")
	if err != nil || link != "https://example.com/latest" || !strings.Contains(text, "雷达联调") || len(calls) != 3 {
		t.Fatalf("wrong radar latest meeting: text=%q link=%q err=%v calls=%v", text, link, err, calls)
	}
}

func TestTeamInfantryGoalsOnlyUseP0Requirements(t *testing.T) {
	content := "功能清单\nP0:需要且必要\n研发舵轮过洞，弹容量至少400发\n优化底盘算法，改善爬坡功率分配\nP1:需要但不紧急\n预研轮腿\n"
	goals := teamInfantryGoals(content, "https://example.com/infantry")
	if len(goals) != 2 || goals[0].Title != "研发舵轮过洞" ||
		goals[0].Status != "无法判断" || goals[1].URL != "https://example.com/infantry" {
		t.Fatalf("unexpected infantry goals: %+v", goals)
	}
}

func TestTeamDroneGoalsRequireExplicitP0HeadingAndDescription(t *testing.T) {
	content := "功能清单\nP0 必要且现在就应该做\n双目视觉惯性定位\n今年计划实现无GPS赛场稳定定位，并完成自主起飞与导航的多项联调测试，建立统一位姿基准。\n图片.png\n灯板设计\n航行灯采用轻量化PCB，适配飞行器制作规范，控制重量和机体空间，并兼容可见光通信需求。\nP1 必要但不紧急\n自主冲击制导\n"
	goals := teamDroneGoals(content, "https://example.com/drone")
	if len(goals) != 2 || goals[0].Title != "双目视觉惯性定位" ||
		goals[1].Title != "灯板设计" || goals[0].Status != "无法判断" {
		t.Fatalf("unexpected drone goals: %+v", goals)
	}
}

func TestTeamDartProgressIsNotMarkedAccepted(t *testing.T) {
	content := "五、现有功能清单\n已研发 —— 镖架视觉测距\n已建立测距方案，后续仍需验收实际精度。\n研发中 —— 有控镖舵面精准制导\n当前仍在联调相关控制模块，尚未完成完整链路测试。\n待研发 —— 赛场快速标定\n需要测试现场快速标定的目标精度和耗时。\n"
	goals := teamDartGoals(content, "https://example.com/dart")
	if len(goals) != 3 || goals[0].Status != "有成果待验收" ||
		goals[1].Status != "无法判断" || goals[2].Status != "无法判断" {
		t.Fatalf("reported milestones must not count as acceptance: %+v", goals)
	}
}

func TestTeamStatePlansAreSourceBackedAndDoNotClaimAcceptance(t *testing.T) {
	client := &http.Client{Transport: teamStateMockTransport(func(req *http.Request) (*http.Response, error) {
		body := `{"code":0,"data":{"fields":[],"data":[],"record_id_list":[],"has_more":false}}`
		switch {
		case strings.HasSuffix(req.URL.Path, "tenant_access_token/internal"):
			body = `{"code":0,"tenant_access_token":"token"}`
		case strings.Contains(req.URL.Path, "/documents/MaoodCINCoF3iHxUYcvcofFmnId/"):
			raw, _ := json.Marshal(map[string]any{"code": 0, "data": map[string]string{"content": "赛季产出：计划完成4期人物纪实，每期3—5分钟。\n执行与产出：两项赛事各计划1期纪实短片。"}})
			body = string(raw)
		case strings.Contains(req.URL.Path, "/documents/JCi8dAso7oOSeMxCWDicdRXFnzd/"):
			raw, _ := json.Marshal(map[string]any{"code": 0, "data": map[string]string{"content": "方向\n机械\n入门阶段\n电控\n综合实践\n视觉\nAI\n完成或通过标准"}})
			body = string(raw)
		case strings.Contains(req.URL.Path, "/documents/"):
			body = `{"code":999,"msg":"not shared"}`
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}
	h := &FeishuHandler{cfg: config.FeishuConfig{AppID: "app", AppSecret: "secret"}, client: client}
	result := &teamStateResponse{Projects: []teamProject{}}
	h.teamStateProjects(context.Background(), result)
	if len(result.Focus) != 3 || result.Focus[0].Domain != "运营" ||
		result.Focus[1].Domain != "运营" || result.Focus[2].Domain != "组织" {
		t.Fatalf("unexpected domain planning records: %+v", result.Focus)
	}
	if !strings.Contains(result.Focus[2].Target, "通过标准") || result.Focus[2].URL == "" {
		t.Fatalf("missing source-backed organization plan: %+v", result.Focus[2])
	}
	if result.Summary != nil && result.Summary.Completed != 0 {
		t.Fatalf("planning must not count as completed tasks: %+v", result.Summary)
	}
}
