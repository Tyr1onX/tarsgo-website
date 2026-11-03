import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const navigation = await readFile(new URL("./dashboard-navigation.ts", import.meta.url), "utf8");
const layout = await readFile(new URL("../routes/dashboard/layout.tsx", import.meta.url), "utf8");
const routeConfig = await readFile(new URL("../routes.ts", import.meta.url), "utf8");
const personalWorkbench = await readFile(new URL("../routes/dashboard/workbench.tsx", import.meta.url), "utf8");
const personalWorkbenchCache = await readFile(new URL("./personal-workbench-cache.ts", import.meta.url), "utf8");
const weeklyReports = await readFile(new URL("../routes/dashboard/weekly-reports.tsx", import.meta.url), "utf8");
const adminWorkbench = await readFile(new URL("../routes/admin/dashboard.tsx", import.meta.url), "utf8");
const timetable = await readFile(new URL("../routes/dashboard/timetable.tsx", import.meta.url), "utf8");

test("the personal landing route is a status-first overview backed by existing user data", () => {
  assert.match(routeConfig, /route\("workbench", "routes\/dashboard\/workbench\.tsx"\)/);
  assert.match(personalWorkbench, /getWeeklyReportStatus\(\)/);
  assert.match(personalWorkbench, /import\("~\/lib\/weekly-report-client"\)/);
  assert.match(personalWorkbenchCache, /import type \{ WeeklyReportStatus \} from "\.\/weekly-report-client\.ts"/);
  assert.doesNotMatch(personalWorkbench, /^import \{[^\n]*getWeeklyReportStatus[^\n]*\} from "~\/lib\/weekly-report-client"/m);
  assert.match(personalWorkbench, /assignmentClient\.listTodos\(\)/);
  assert.match(personalWorkbench, /leaveClient\.leaveAccess\(\)/);
  assert.match(personalWorkbench, /hasAssignmentGroupAccess\(groupResolution\?\.groups\)/);
  assert.match(personalWorkbench, /本周已提交/);
  assert.match(personalWorkbench, /本周待填写/);
  assert.match(personalWorkbench, /填写本周工作周报/);
  assert.match(personalWorkbench, /待处理/);
  assert.match(personalWorkbench, /getPersonalWorkbenchSnapshot\(snapshotKey\)/);
  assert.match(personalWorkbench, /rememberPersonalWorkbenchSnapshot\(snapshotKey, next\)/);
  assert.doesNotMatch(personalWorkbench, /setSnapshot\(emptySnapshot\)/);
  assert.match(personalWorkbench, /getPersonalWorkbenchSnapshot\(snapshotKey\) \?\? emptyPersonalSnapshot/);
  assert.match(personalWorkbench, /我的作业/);
  assert.match(personalWorkbench, /请假事务/);
  assert.doesNotMatch(personalWorkbench, /<form|<textarea/);
  assert.doesNotMatch(personalWorkbench, /课程表|工作手册/);
});

test("the management landing route prioritizes real candidate, assignment, and leave work", () => {
  assert.match(adminWorkbench, /getAdminWorkbenchSummary\(currentUser\.id\)/);
  assert.match(adminWorkbench, /assignmentClient\.adminTodos\(\)/);
  assert.match(adminWorkbench, /leaveClient\.schoolSummary\(\)/);
  assert.match(adminWorkbench, /候选人待初筛/);
  assert.match(adminWorkbench, /候选人待面试/);
  assert.match(adminWorkbench, /作业待批改/);
  assert.match(adminWorkbench, /请假事项待处理/);
  assert.match(adminWorkbench, /目前没有待处理事项/);
  assert.doesNotMatch(adminWorkbench, /listAdminInterviewSessions|近期面试场次|招新总览/);
  assert.match(navigation, /label: "招新"/);
  assert.match(navigation, /label: "成员与培养"/);
  assert.match(navigation, /label: "协作与运营"/);
});

test("personal timetable and help content are reachable outside permanent business navigation", () => {
  assert.match(timetable, /Navigate to=\{`\/dashboard\/members\/\$\{currentUser\.id\}\?tab=settings#timetable`\}/);
  assert.match(layout, /帮助与工作手册/);
  assert.match(layout, /navigate\(`\/dashboard\/members\/\$\{currentUser\.id\}\$\{tab === "overview" \? "" : `\?tab=\$\{tab\}`\}`\)/);
  assert.doesNotMatch(navigation, /label: "课程表"|label: "工作手册"/);
  assert.match(routeConfig, /route\("team", "routes\/dashboard\/team-redirect\.tsx"\)/);
  assert.match(routeConfig, /route\("admin\/organization-preview", "routes\/dashboard\/team-redirect\.tsx", \{ id: "dashboard-admin-organization-preview" \}\)/);
  assert.match(layout, /redirect\("\/dashboard\/workbench\/organization"\)/);
  assert.match(routeConfig, /route\("workbench\/organization", "routes\/organization-preview\.tsx"\)/);
});

test("personal and team weekly data stay independent and loads remain deferred past route auth", () => {
  // Settlement order and partial failures are exercised with deferred promises
  // in personal-workbench-cache.test.mjs, not source-shape assertions.
  assert.match(weeklyReports, /if \(teamExpanded && dashboard\?\.canViewTeam/);
  assert.match(weeklyReports, /const isEditing = searchParams\.get\("edit"\) === "1"/);
  assert.match(layout, /export async function clientLoader/);
  assert.doesNotMatch(layout.slice(layout.indexOf("export async function clientLoader"), layout.indexOf("clientLoader.hydrate")), /getWeeklyReportStatus|getAdminWorkbenchSummary|assignmentClient/);
});
