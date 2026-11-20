import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");
const navigation = await read("./dashboard-navigation.ts");
const sidebar = await read("../components/dashboard-section-navigation.tsx");
const layout = await read("../routes/dashboard/layout.tsx");
const routes = await read("../routes.ts");
const oldOverview = await read("../routes/dashboard/workbench.tsx");
const adminOverview = await read("../routes/admin/dashboard.tsx");
const assignmentManagement = await read("../routes/admin/assignment-management.tsx");
const review = await read("../routes/admin/assignment-submissions.tsx");
const weeklyReports = await read("../routes/dashboard/weekly-reports.tsx");

test("old overview paths lead to tasks instead of a second navigation page", () => {
  assert.match(routes, /route\("workbench", "routes\/dashboard\/workbench\.tsx"\)/);
  assert.match(routes, /route\("admin", "routes\/admin\/dashboard\.tsx"\)/);
  assert.match(adminOverview, /export \{ default \} from "~\/routes\/dashboard\/workbench"/);
  assert.match(oldOverview, /<Navigate to=\{destination\} replace/);
  assert.match(oldOverview, /currentUser\.role\.name === "super_admin"/);
  assert.match(oldOverview, /hasAssignmentGroupAccess\(groupResolution\?\.groups\)/);
  assert.match(oldOverview, /"\/dashboard\/admin\/training\/assignments\?view=review"/);
  assert.match(oldOverview, /"\/dashboard\/admin\/registrations"/);
  assert.match(oldOverview, /"\/dashboard\/assignments"/);
  assert.match(oldOverview, /"\/dashboard\/weekly-reports"/);
  assert.doesNotMatch(navigation, /label: "概览"/);
});

test("sidebar indicators come from authorized work sources without separate score state", () => {
  assert.match(sidebar, /hasWorkbenchAccess\(currentUser\)/);
  assert.match(sidebar, /if \(!visible\) return/);
  assert.match(sidebar, /canReview = currentUser\.role\.name === "admin" && hasAssignmentGroup/);
  assert.match(sidebar, /void getWeeklyReportStatus\(\)/);
  assert.match(sidebar, /void assignmentClient\.listTodos\(\)/);
  assert.match(sidebar, /void getAdminWorkbenchSummary\(currentUser\.id\)/);
  assert.match(sidebar, /void assignmentClient\.adminTodos\(\)/);
  assert.match(sidebar, /previous\.scope === scope/);
  assert.match(sidebar, /if \(active\) setTaskCounts/);
  assert.match(sidebar, /reviewCount: value\.reviewCount/);
  assert.doesNotMatch(sidebar, /reviewGroups\.length|reviewGroup\.groupId/);
  assert.doesNotMatch(sidebar, /leaveClient|Promise\.all\(/);
});

test("review groups are resolved from the URL with permission checks and kept during drill-down", () => {
  assert.match(assignmentManagement, /const requestedGroupId = Number\(searchParams\.get\("groupId"\)\)/);
  assert.match(assignmentManagement, /assignmentGroups\.some\(\(group\) => group\.groupId === requestedGroupId\)/);
  assert.match(assignmentManagement, /setSearchParams\(nextGroupID \? \{ view, groupId: String\(nextGroupID\) \} : \{ view \}/);
  assert.match(review, /setSearchParams\(\{ view: "review", groupId: String\(groupId\), assignmentId: String\(nextID\) \}/);
  assert.match(review, /groupId: String\(groupId\), assignmentId: String\(id\)/);
});

test("team pages and personal settings remain reachable after removing the overview", async () => {
  const timetable = await read("../routes/dashboard/timetable.tsx");
  assert.match(routes, /route\("team", "routes\/organization-preview\.tsx", \{ id: "dashboard-team-legacy" \}\)/);
  assert.match(routes, /route\("workbench\/organization", "routes\/organization-preview\.tsx"\)/);
  assert.match(layout, /redirect\("\/dashboard\/workbench\/organization"\)/);
  assert.match(layout, /<AccountMenuActionIcon name="community" \/>[\s\S]*?社区/);
  assert.match(timetable, /tab=settings#timetable/);
  assert.match(weeklyReports, /getWeeklyDashboardSnapshot\(currentUser\.id\)/);
  assert.match(layout, /export async function clientLoader/);
  assert.doesNotMatch(layout.slice(layout.indexOf("export async function clientLoader"), layout.indexOf("clientLoader.hydrate")), /getWeeklyReportStatus|getAdminWorkbenchSummary|assignmentClient/);
});
