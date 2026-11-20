import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getShanghaiDate } from "./admin-workbench.ts";

const dashboardLayout = await readFile(new URL("../routes/dashboard/layout.tsx", import.meta.url), "utf8");
const adminDashboard = await readFile(new URL("../routes/admin/dashboard.tsx", import.meta.url), "utf8");
const personalWorkbench = await readFile(new URL("../routes/dashboard/workbench.tsx", import.meta.url), "utf8");
const registrationsRoute = await readFile(new URL("../routes/admin/registrations.tsx", import.meta.url), "utf8");
const registrationsClient = await readFile(new URL("./registrations-client.ts", import.meta.url), "utf8");
const guide = await readFile(new URL("../components/resource-guides.tsx", import.meta.url), "utf8");
const sectionNavigation = await readFile(new URL("../components/dashboard-section-navigation.tsx", import.meta.url), "utf8");
const dashboardTasks = await readFile(new URL("../components/dashboard-steady-ui.tsx", import.meta.url), "utf8");

test("the sidebar shows actionable task indicators instead of a duplicate management overview", () => {
  assert.match(adminDashboard, /export \{ default \} from "~\/routes\/dashboard\/workbench"/);
  assert.match(personalWorkbench, /<Navigate to=\{destination\} replace/);
  assert.match(dashboardTasks, /getAdminWorkbenchSummary\(currentUser\.id\)/);
  assert.match(dashboardTasks, /assignmentClient\.adminTodos\(\)/);
  assert.match(dashboardTasks, /getWeeklyReportStatus\(\)/);
  assert.match(dashboardTasks, /assignmentClient\.listTodos\(\)/);
  assert.match(dashboardTasks, /reviewCount: value\.reviewCount/);
  assert.doesNotMatch(sectionNavigation, /aria-label="按技术组批改"/);
  assert.match(sectionNavigation, /dashboard-nav-badge/);
  assert.match(dashboardLayout, /<DashboardSectionNavigation[\s\S]*?counts=\{taskCounts\}/);
  assert.doesNotMatch(sectionNavigation, /leaveClient|schoolSummary|leaveActionableCount/);
  assert.doesNotMatch(dashboardLayout, /managementLabel|请假待审批|leaveActionableState|candidateTodoCount/);
  assert.ok(registrationsClient.includes("const pending = pendingWorkbenchSummaryRequests.get(accountId);"));
  assert.ok(registrationsClient.includes("if (pending && !force) return pending;"));
  assert.doesNotMatch(registrationsRoute, /refreshCandidateTodoCount/);
});

test("workbench's current interview date uses Asia/Shanghai at day boundaries", () => {
  assert.equal(getShanghaiDate(new Date("2026-10-12T15:59:59Z")), "2026-10-12");
  assert.equal(getShanghaiDate(new Date("2026-10-12T16:00:00Z")), "2026-10-13");
});

test("interview refresh follows today without overriding a selected historical date or double-listening to return events", () => {
  assert.match(registrationsRoute, /interviewDate: "",/);
  assert.match(registrationsRoute, /listAdminRegistrations\(interviewWorkbench && !query\.interviewDate \? \{ \.\.\.query, interviewDate: getShanghaiDate\(\) \} : query\)/);
  assert.match(registrationsRoute, /value=\{query\.interviewDate \|\| getShanghaiDate\(\)\}/);
  assert.match(registrationsRoute, /interviewDate: current\.interviewDate,/);
  assert.match(registrationsRoute, /window\.addEventListener\("focus", refreshWhenVisible\)/);
  assert.doesNotMatch(registrationsRoute, /document\.addEventListener\("visibilitychange", refreshWhenVisible\)/);
});

test("workbench guide shows only the signed-in role's instructions", () => {
  assert.match(guide, /const canManage = hasWorkbench && \["admin", "super_admin"\]\.includes\(currentUser\.role\.name\)/);
  assert.match(guide, /\{!canManage && hasWorkbench \? <section[^>]*aria-labelledby="member-guide-title"/);
  assert.match(guide, /\{canManage \? <section[^>]*aria-labelledby="admin-guide-title"/);
  assert.match(guide, /currentUser\.role\.name === "super_admin" \? <li>/);
  assert.match(guide, /canUseAssignments \? <li>.*\/dashboard\/assignments/s);
  assert.match(guide, /授权审批仍仅限超级管理员/);
  assert.match(guide, /入门与技术学习资料统一在/);
  assert.doesNotMatch(guide, /能力雷达/);
});
