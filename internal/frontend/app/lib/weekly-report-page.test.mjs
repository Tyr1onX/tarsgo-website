import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../routes/dashboard/weekly-reports.tsx", import.meta.url), "utf8");
const style = await readFile(new URL("../routes/dashboard/weekly-reports.css", import.meta.url), "utf8");
const client = await readFile(new URL("./weekly-report-client.ts", import.meta.url), "utf8");
const service = await readFile(new URL("../../../backend/service/weeklyreport/service.go", import.meta.url), "utf8");
const repository = await readFile(new URL("../../../backend/service/weeklyreport/repository.go", import.meta.url), "utf8");

test("weekly report defaults to submission status and saved history; editing requires an explicit action", () => {
  assert.match(route, /const isEditing = searchParams\.get\("edit"\) === "1"/);
  assert.match(route, /!isEditing && selectedReport/);
  assert.match(route, /!isEditing && !selectedReport[\s\S]*?填写周报/);
  assert.match(route, /isEditing \? <form className="weekly-report__form"/);
  assert.match(route, /修改本周周报/);
  assert.match(route, /历史记录/);
  assert.match(route, /dashboard\.reports\.map\(\(report\)/);
  assert.match(route, /setEditing\(true\)/);
  assert.doesNotMatch(route, /默认展开编辑|自动进入编辑/);
});

test("team submission names load only after a permitted leader expands the disclosure", () => {
  assert.match(route, /const \[teamExpanded, setTeamExpanded\] = useState\(false\)/);
  assert.match(route, /if \(teamExpanded && dashboard\?\.canViewTeam/);
  assert.match(route, /aria-expanded=\{teamExpanded\}/);
  assert.match(route, /teamExpanded \? <>[\s\S]*?teamWeek\.members\.map/);
  assert.match(route, /teamWeek\.members\.map\(\(member\)/);
  assert.match(repository, /users\.status = \? AND users\.last_login_at >= \?/);
  assert.match(service, /adminuser\.AccountActivityCutoff\(s\.now\(\)\)/);
});

test("team history choices come from stored weeks and arbitrary weeks are rejected server-side", () => {
  assert.match(client, /availableWeeks: string\[\]/);
  assert.match(route, /teamAvailableWeeks\.map\(\(weekStart\)/);
  assert.match(repository, /Distinct\("week_start"\)[\s\S]*?Where\("group_id = \?", groupID\)/);
  assert.match(service, /ListReportWeeks\(ctx, group\.GroupID\)/);
  assert.match(service, /weekStart != currentWeek && !containsWeek\(availableWeeks, weekStart\)/);
});

test("the team list remains a compact one-column disclosure when opened", () => {
  assert.match(route, /<details className="weekly-report__member weekly-report__member--submitted"/);
  assert.match(route, /<summary className="weekly-report__member-heading">/);
  assert.match(route, /已提交/);
  assert.match(route, /未提交/);
  assert.match(style, /\.weekly-report__member-list \{\s*display: grid;\s*border-top:/);
  assert.doesNotMatch(style, /grid-template-columns:\s*repeat\(auto-fill/);
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

test("the course schedule stays under personal profile settings", async () => {
  const routeConfig = await readFile(new URL("../routes.ts", import.meta.url), "utf8");
  const timetable = await readFile(new URL("../routes/dashboard/timetable.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("../routes/dashboard/layout.tsx", import.meta.url), "utf8");
  assert.match(routeConfig, /route\("timetable", "routes\/dashboard\/timetable\.tsx"\)/);
  assert.match(timetable, /Navigate to=\{`\/dashboard\/members\/\$\{currentUser\.id\}\?tab=settings#timetable`\}/);
  assert.match(layout, /navigate\(`\/dashboard\/members\/\$\{currentUser\.id\}\$\{tab === "overview" \? "" : `\?tab=\$\{tab\}`\}`\)/);
});

test("the in-workbench guide documents open daily and assignment flows", async () => {
  const guide = await readFile(new URL("../routes/dashboard/guide.tsx", import.meta.url), "utf8");
  const routeConfig = await readFile(new URL("../routes.ts", import.meta.url), "utf8");
  assert.match(routeConfig, /route\("guide", "routes\/dashboard\/guide\.tsx"\)/);
  for (const phrase of ["我的主页", "资料设置", "课程时间", "工作周报", "请假工作台", "我的作业", "提交记录", "时间协调", "其他培养入口暂未开放"]) {
    assert.match(guide, new RegExp(phrase));
  }
  assert.match(guide, /提交成果并查看批改反馈/);
  assert.doesNotMatch(guide, /to="\/dashboard\/(practice-projects|growth|questions|skills|capabilities|expedition)/);
});
