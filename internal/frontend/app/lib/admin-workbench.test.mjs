import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getCandidateTodoCount, getShanghaiDate, getUpcomingInterviewSessions } from "./admin-workbench.ts";

const dashboardLayout = await readFile(new URL("../routes/dashboard/layout.tsx", import.meta.url), "utf8");
const adminDashboard = await readFile(new URL("../routes/admin/dashboard.tsx", import.meta.url), "utf8");
const registrationsRoute = await readFile(new URL("../routes/admin/registrations.tsx", import.meta.url), "utf8");
const registrationsClient = await readFile(new URL("./registrations-client.ts", import.meta.url), "utf8");
const guide = await readFile(new URL("../routes/dashboard/guide.tsx", import.meta.url), "utf8");
const sectionNavigation = await readFile(new URL("../components/dashboard-section-navigation.tsx", import.meta.url), "utf8");

test("candidate todo totals include only actionable screening and interview queues", () => {
  const summary = { total: 30, pendingScreening: 2, pendingInterview: 1, admitted: 10, rejected: 12, withdrawn: 5 };
  assert.equal(getCandidateTodoCount(true, summary), 3);
  assert.equal(getCandidateTodoCount(false, summary), 0);
  assert.equal(getCandidateTodoCount(true, { ...summary, pendingScreening: -1, pendingInterview: 0 }), 0);
});

test("management todos stay in the home modules and do not appear in navigation", () => {
  assert.match(adminDashboard, /getAdminWorkbenchSummary\(currentUser\.id\)/);
  assert.doesNotMatch(adminDashboard, /leaveClient|schoolSummary|leaveActionableCount/);
  assert.match(adminDashboard, /pendingScreening > 0[\s\S]*?候选人待初筛/);
  assert.doesNotMatch(adminDashboard, /Promise\.allSettled/);
  assert.doesNotMatch(dashboardLayout, /managementLabel|报名待处理|请假待审批|leaveActionableState|candidateTodoCount/);
  assert.doesNotMatch(sectionNavigation, /candidateTodoCount|leaveActionableCount|dashboard-nav-badge/);
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

test("workbench shows enabled sessions from today through the next 14 days in local schedule order", () => {
  const sessions = [
    { id: 1, date: "2026-10-05", label: "上午", startTime: "09:00", endTime: "10:00", enabled: true },
    { id: 2, date: "2026-10-05", label: "下午", startTime: "14:00", endTime: "16:00", enabled: true },
    { id: 3, date: "2026-10-04", label: "昨天", startTime: "09:00", endTime: "11:00", enabled: true },
    { id: 4, date: "2026-10-06", label: "停用", startTime: "09:00", endTime: "11:00", enabled: false },
    { id: 5, date: "2026-10-20", label: "超出近期", startTime: "09:00", endTime: "11:00", enabled: true },
  ];
  const visible = getUpcomingInterviewSessions(sessions, new Date("2026-10-05T04:00:00Z"));
  assert.deepEqual(visible.map(({ id }) => id), [2]);
});

test("workbench guide shows only the signed-in role's instructions", () => {
  assert.match(guide, /const canManage = \["admin", "super_admin"\]\.includes\(currentUser\.role\.name\)/);
  assert.match(guide, /\{!canManage \? <section[^>]*aria-labelledby="member-guide-title"/);
  assert.match(guide, /\{canManage \? <section[^>]*aria-labelledby="admin-guide-title"/);
  assert.match(guide, /currentUser\.role\.name === "super_admin" \? <li>/);
  assert.match(guide, /canUseAssignments \? <li>.*\/dashboard\/assignments/s);
  assert.match(guide, /授权审批仍仅限超级管理员/);
  assert.match(guide, /其他培养入口和 TARS BASE 暂未开放/);
  assert.doesNotMatch(guide, /能力雷达/);
});
