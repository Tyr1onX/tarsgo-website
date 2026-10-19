import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getCandidateTodoCount, getShanghaiDate, getUpcomingInterviewSessions } from "./admin-workbench.ts";

const dashboardLayout = await readFile(new URL("../routes/dashboard/layout.tsx", import.meta.url), "utf8");
const registrationsRoute = await readFile(new URL("../routes/admin/registrations.tsx", import.meta.url), "utf8");
const registrationsClient = await readFile(new URL("./registrations-client.ts", import.meta.url), "utf8");

test("candidate sidebar count includes only actionable screening and interview queues", () => {
  const summary = { total: 30, pendingScreening: 2, pendingInterview: 1, admitted: 10, rejected: 12, withdrawn: 5 };
  assert.equal(getCandidateTodoCount(true, summary), 3);
  assert.equal(getCandidateTodoCount(false, summary), 0);
  assert.equal(getCandidateTodoCount(true, { ...summary, pendingScreening: -1, pendingInterview: 0 }), 0);
});

test("sidebar todo count reuses the permission-scoped summary and refreshes after candidate actions", () => {
  assert.match(dashboardLayout, /hasDashboardAdminAccess\(currentUser\.role\.name\)[\s\S]*?getAdminWorkbenchSummary\(userId, force\)/);
  assert.match(dashboardLayout, /getCandidateTodoCount\(response\.currentFormAvailable, response\.summary\)/);
  assert.match(dashboardLayout, /item\.children\.some\(\(child\) => child\.key === "candidate-processing"\) \? candidateTodoCount : undefined/);
  assert.match(dashboardLayout, /child\.key === "candidate-processing" && \(badgeCount \?\? 0\) > 0/);
  assert.ok(dashboardLayout.includes("candidateTodoState.roleName === currentUser.role.name"));
  assert.ok(registrationsClient.includes("const pending = pendingWorkbenchSummaryRequests.get(accountId);"));
  assert.ok(registrationsClient.includes("if (pending && !force) return pending;"));
  assert.ok(registrationsRoute.includes("void refreshCandidateTodoCount(true)"));
});

test("workbench's current interview date uses Asia/Shanghai at day boundaries", () => {
  assert.equal(getShanghaiDate(new Date("2026-10-12T15:59:59Z")), "2026-10-12");
  assert.equal(getShanghaiDate(new Date("2026-10-12T16:00:00Z")), "2026-10-13");
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
