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
	if len(snapshot.Sources) != 3 || snapshot.Sources[0].Status != "available" || snapshot.Sources[1].Status != "unavailable" {
		t.Fatalf("partial source status lost: %+v", snapshot.Sources)
	}
	for _, call := range requests {
		if !strings.HasPrefix(call, "GET ") && !strings.HasPrefix(call, "POST /open-apis/auth/") {
			t.Fatalf("unexpected write: %s", call)
		}
	}
}
