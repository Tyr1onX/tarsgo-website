import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../routes/dashboard/weekly-reports.tsx", import.meta.url), "utf8");
const style = await readFile(new URL("../routes/dashboard/weekly-reports.css", import.meta.url), "utf8");
const client = await readFile(new URL("./weekly-report-client.ts", import.meta.url), "utf8");
const service = await readFile(new URL("../../../backend/service/weeklyreport/service.go", import.meta.url), "utf8");
const repository = await readFile(new URL("../../../backend/service/weeklyreport/repository.go", import.meta.url), "utf8");

test("weekly report opens on the current week and history lists saved records only", () => {
  assert.match(route, /useState\("current"\)/);
  assert.match(route, /已有周报/);
  assert.match(route, /dashboard\.reports\.map\(\(report\)/);
  assert.match(route, /仅显示已保存的记录/);
  assert.match(route, /返回本周/);
  assert.doesNotMatch(route, /选择要查看的周报|type="week"/);
});

test("team history choices come from stored weeks and arbitrary weeks are rejected server-side", () => {
  assert.match(client, /availableWeeks: string\[\]/);
  assert.match(route, /teamAvailableWeeks\.map\(\(weekStart\)/);
  assert.match(repository, /Distinct\("week_start"\)[\s\S]*?Where\("group_id = \?", groupID\)/);
  assert.match(service, /ListReportWeeks\(ctx, group\.GroupID\)/);
  assert.match(service, /weekStart != currentWeek && !containsWeek\(availableWeeks, weekStart\)/);
});

test("the team list is a compact one-column disclosure instead of uneven cards", () => {
  assert.match(route, /<details className="weekly-report__member weekly-report__member--submitted"/);
  assert.match(route, /<summary className="weekly-report__member-heading">/);
  assert.match(route, /已提交/);
  assert.match(route, /未提交/);
  assert.match(style, /\.weekly-report__member-list \{\s*display: grid;\s*border-top:/);
  assert.doesNotMatch(style, /grid-template-columns:\s*repeat\(auto-fill/);
});

test("team roster uses the same enabled-account and last-login boundary as account management", () => {
  assert.match(repository, /users\.status = \? AND users\.last_login_at >= \?/);
  assert.match(service, /adminuser\.AccountActivityCutoff\(s\.now\(\)\)/);
});

test("team filters adapt to the available workbench width", () => {
  assert.match(style, /\.weekly-report__panel-heading\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(style, /\.weekly-report__team-filters\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(style, /\.weekly-report__team-filters\s+\.weekly-report__week-select\s*\{[^}]*min-width:\s*0/);
  assert.match(style, /\.weekly-report__week-select select,[\s\S]*?\.weekly-report__field textarea\s*\{[^}]*min-width:\s*0/);
});

test("weekly reports support retryable private attachment upload, download, and removal", () => {
  assert.match(route, /uploadWeeklyReportAttachments\(saved\.id, pendingFiles\)/);
  assert.match(route, /deleteWeeklyReportAttachment\(selectedReport\.id, fileID\)/);
  assert.match(route, /附件上传失败/);
  assert.match(route, /file\.downloadUrl/);
  assert.match(client, /formData\.append\("files", file\)/);
  assert.match(service, /OpenAttachment\(ctx context\.Context, actor Actor, reportID, fileID uint64\)/);
  assert.match(service, /CreateReportAttachments\(ctx, actor\.ID, reportID, rows\)/);
});

test("the in-workbench guide documents open daily and assignment flows", async () => {
  const guide = await readFile(new URL("../routes/dashboard/guide.tsx", import.meta.url), "utf8");
  const routeConfig = await readFile(new URL("../routes.ts", import.meta.url), "utf8");
  assert.match(routeConfig, /route\("guide", "routes\/dashboard\/guide\.tsx"\)/);
  for (const phrase of ["个人资料", "课程时间", "工作周报", "请假工作台", "我的作业", "提交记录", "时间协调", "其他培养入口暂未开放"]) {
    assert.match(guide, new RegExp(phrase));
  }
  assert.match(guide, /提交成果并查看批改反馈/);
  assert.doesNotMatch(guide, /to="\/dashboard\/(practice-projects|growth|questions|skills|capabilities|expedition)/);
  assert.doesNotMatch(guide, /原始作业分数|项目内部评分/);
});
