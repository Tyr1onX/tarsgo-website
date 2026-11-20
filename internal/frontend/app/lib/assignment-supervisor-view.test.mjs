import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const management = await readFile(new URL("../routes/admin/assignment-management.tsx", import.meta.url), "utf8");
const overview = await readFile(new URL("../routes/admin/assignment-overview.tsx", import.meta.url), "utf8");
const reviews = await readFile(new URL("../routes/admin/assignment-submissions.tsx", import.meta.url), "utf8");
const sidebar = await readFile(new URL("../components/dashboard-section-navigation.tsx", import.meta.url), "utf8");
const dashboardTasks = await readFile(new URL("../components/dashboard-steady-ui.tsx", import.meta.url), "utf8");
const legacy = await readFile(new URL("../routes/dashboard/workbench.tsx", import.meta.url), "utf8");

test("super administrators default to a non-editable overview, but explicit review links still work", () => {
  assert.match(management, /requestedView === "list" \|\| requestedView === "review" \? requestedView : isSuperAdmin \? "overview" : "review"/);
  assert.match(management, /\{isSuperAdmin \? <button[^>]*[\s\S]*?跨组概览<\/button>/);
  assert.match(management, /view === "overview" \? <AssignmentOverview/);
  assert.match(management, /!composerOpen && view !== "overview"/);
  assert.match(legacy, /currentUser\.role\.name === "super_admin"[\s\S]*?"\/dashboard\/admin\/training\/assignments"/);
  assert.doesNotMatch(overview, /assignmentClient\.(create|review|update|remove|publish)/);
});

test("group selection is owned by the page and scoped to authorized options", () => {
  assert.match(management, /assignmentGroups\.some\(\(group\) => group\.groupId === requestedGroupId\)/);
  assert.match(management, /view === "overview" \? <option value=\{0\}>全部组别<\/option>/);
  assert.match(management, /selectedGroupId=\{selectedGroupId\}/);
  assert.match(management, /assignments\?view=review&groupId=\$\{groupId\}&assignmentId=\$\{item\.id\}/);
  assert.doesNotMatch(sidebar, /按技术组批改|reviewGroup\.groupId/);
  assert.match(dashboardTasks, /canReview = currentUser\.role\.name === "admin" && hasAssignmentGroup/);
});

test("overview reads existing assignment and exact review summaries; review details avoid duplicated title cards", () => {
  assert.match(overview, /assignmentClient\.listAdmin\(\)/);
  assert.match(overview, /assignmentClient\.adminTodos\(\)/);
  assert.match(overview, /已交 \/ 应交人次/);
  assert.match(overview, /view=list&groupId=\$\{group\.groupId\}/);
  assert.match(reviews, /<label className="admin-field-label">作业<select/);
  assert.match(reviews, /aria-label="作业信息"/);
  assert.doesNotMatch(reviews, /<strong className="text-\[var\(--admin-text\)\]">\{assignment\.title\}<\/strong>/);
});
