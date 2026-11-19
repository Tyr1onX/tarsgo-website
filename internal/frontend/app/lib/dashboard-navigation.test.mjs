import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canAccessDashboardAdminPath,
  getDashboardSectionKey,
  getDashboardSectionMenu,
  getDefaultDashboardPath,
  getUnifiedDashboardMenu,
  hasAssignmentGroupAccess,
  hasDashboardAdminAccess,
  hasOperationsWorkManualAccess,
  isAssignmentGroupName,
  isDashboardMenuPathActive,
  isDashboardSectionItemActive,
} from "./dashboard-navigation.ts";

const account = (name, workbenchAccess = true) => ({ id: 42, workbenchAccess, role: { name } });
const menuKeys = (groups) => groups.map(({ key }) => key);
const linkKeys = (group) => group?.children.map(({ key }) => key);

test("community and profile remain the only global entries for every role", () => {
  for (const role of ["user", "admin", "super_admin"]) {
    for (const access of [true, false]) {
      assert.deepEqual(getDashboardSectionMenu(account(role, access)).map(({ key, label, href }) => [key, label, href]), [
        ["community", "社区", "/dashboard"],
        ["my-profile", "我的主页", "/dashboard/members/42"],
      ]);
    }
  }
  assert.equal(getDefaultDashboardPath("user"), "/dashboard");
  assert.equal(getDefaultDashboardPath("super_admin"), "/dashboard");
  assert.equal(hasDashboardAdminAccess("user"), false);
  assert.equal(hasDashboardAdminAccess("admin"), true);
});

test("one stable business directory exposes only accessible member functions", () => {
  const memberMenu = getUnifiedDashboardMenu(account("user"), false);
  assert.deepEqual(memberMenu.map(({ key, label }) => [key, label]), [["daily-work", "日常事务"], ["team-information", "战队信息"]]);
  assert.deepEqual(memberMenu[0]?.children.map(({ key, href }) => [key, href]), [
    ["weekly-reports", "/dashboard/weekly-reports"],
    ["training-materials", "/dashboard/training-materials"],
    ["leave-workbench", "/dashboard/leave"],
    ["users-registrations", "/dashboard/users/registrations"],
  ]);
  assert.deepEqual(memberMenu[1]?.children.map(({ key, href }) => [key, href]), [
    ["team-status", "/dashboard/workbench/operations"],
    ["people-directory", "/dashboard/workbench/organization"],
  ]);
  assert.deepEqual(linkKeys(getUnifiedDashboardMenu(account("user"), true)[0]), ["weekly-reports", "my-assignments", "training-materials", "leave-workbench", "users-registrations"]);
  assert.deepEqual(getUnifiedDashboardMenu(account("user", false)).map(({ key, children }) => [key, linkKeys({ children })]), [
    ["daily-work", ["training-materials", "users-registrations"]],
  ]);
  assert.deepEqual(linkKeys(getUnifiedDashboardMenu(account("admin"), true)[0]), ["weekly-reports", "my-assignments", "training-materials", "leave-workbench"]);
  assert.equal(memberMenu.flatMap(({ children }) => children).some(({ key }) => key === "timetable" || key === "work-manual"), false);
});

test("the active global entry does not switch menus on business routes", () => {
  assert.equal(getDashboardSectionKey("/dashboard"), "community");
  assert.equal(getDashboardSectionKey("/dashboard/community/42"), "community");
  assert.equal(getDashboardSectionKey("/dashboard/workbench"), null);
  assert.equal(getDashboardSectionKey("/dashboard/admin"), null);
  for (const path of ["/dashboard/admin/registrations", "/dashboard/leave", "/dashboard/weekly-reports", "/dashboard/workbench/operations", "/dashboard/assignments", "/dashboard/team"]) {
    assert.equal(getDashboardSectionKey(path, 42), null, path);
  }
  assert.equal(getDashboardSectionKey("/dashboard/members/42", 42), "profile");
  assert.equal(getDashboardSectionKey("/dashboard/members/43", 42), null);
  assert.equal(isDashboardMenuPathActive("/dashboard/admin/registrations/42", "/dashboard/admin/registrations"), true);
  assert.equal(isDashboardMenuPathActive("/dashboard/admin", "/dashboard/admin/registrations"), false);
});

test("the personal profile route highlights its top-level navigation entry", () => {
  assert.equal(isDashboardSectionItemActive("profile", "my-profile"), true);
  assert.equal(isDashboardSectionItemActive("community", "my-profile"), false);
});

test("work manual access stays limited to operations members and super admins", () => {
  assert.equal(hasOperationsWorkManualAccess("user", [{ name: "运营组" }]), true);
  assert.equal(hasOperationsWorkManualAccess("admin", [{ name: "运营组" }]), true);
  assert.equal(hasOperationsWorkManualAccess("admin", [{ name: "机械组" }]), false);
  assert.equal(hasOperationsWorkManualAccess("user", []), false);
  assert.equal(hasOperationsWorkManualAccess("super_admin", []), true);
});

test("assignment access follows the existing five groups for both member and admin navigation", () => {
  const groups = ["机械组", "电控组", "视觉组", "AI组", "运营组"];
  for (const name of groups) {
    assert.equal(isAssignmentGroupName(name), true, name);
    assert.equal(hasAssignmentGroupAccess([{ name }]), true, name);
  }
  for (const name of ["临时组", "招新组", "未知组"]) {
    assert.equal(isAssignmentGroupName(name), false, name);
    assert.equal(hasAssignmentGroupAccess([{ name }]), false, name);
  }
  assert.ok(linkKeys(getUnifiedDashboardMenu(account("user"), true)[0]).includes("my-assignments"));
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/training/assignments", false), false);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/training/assignments", true), true);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/training/assessments", false), false);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/training/assessments", true), true);
  assert.equal(canAccessDashboardAdminPath("super_admin", "/dashboard/admin/training/submissions", false), true);
  assert.equal(canAccessDashboardAdminPath("user", "/dashboard/admin/training/submissions", true), false);
});

test("admin capabilities extend the same directory without duplicate leave links", () => {
  const adminMenu = getUnifiedDashboardMenu(account("admin"), true);
  assert.deepEqual(menuKeys(adminMenu), ["daily-work", "members-training", "recruitment", "collaboration-operations", "team-information"]);
  assert.deepEqual(linkKeys(adminMenu[2]), ["candidate-processing"]);
  assert.deepEqual(linkKeys(adminMenu[1]), ["assignment-management", "training-assessments"]);
  assert.deepEqual(linkKeys(adminMenu[3]), ["collection-forms", "timetable-availability"]);
  assert.equal(adminMenu.flatMap(({ children }) => children).filter(({ href }) => href === "/dashboard/leave").length, 1);

  const restrictedAdminMenu = getUnifiedDashboardMenu(account("admin"), false);
  assert.deepEqual(menuKeys(restrictedAdminMenu), ["daily-work", "recruitment", "collaboration-operations", "team-information"]);

  const adminWithoutWorkbench = getUnifiedDashboardMenu(account("admin", false), true);
  assert.deepEqual(menuKeys(adminWithoutWorkbench), ["daily-work", "members-training", "recruitment", "collaboration-operations"]);
  assert.equal(adminWithoutWorkbench.flatMap(({ children }) => children).some(({ href }) => href === "/dashboard/leave"), false);
  assert.deepEqual(linkKeys(adminWithoutWorkbench[0]), ["training-materials"]);

  const superAdminMenu = getUnifiedDashboardMenu(account("super_admin"), false);
  assert.deepEqual(menuKeys(superAdminMenu), ["daily-work", "members-training", "recruitment", "collaboration-operations", "team-information"]);
  assert.deepEqual(linkKeys(superAdminMenu[2]), ["candidate-processing", "recruitment-management", "recruitment-analytics"]);
  assert.deepEqual(linkKeys(superAdminMenu[1]), ["accounts", "assignment-management", "training-assessments"]);
  assert.deepEqual(linkKeys(superAdminMenu[3]), ["team-state", "collection-forms", "timetable-availability", "email-management"]);
  assert.deepEqual(menuKeys(getUnifiedDashboardMenu(account("super_admin", false))), ["daily-work", "members-training", "recruitment", "collaboration-operations"]);
});

test("management deep links keep role restrictions without broadening page access", () => {
  for (const path of ["/dashboard/admin", "/dashboard/admin/"]) {
    assert.equal(canAccessDashboardAdminPath("admin", path), true);
    assert.equal(canAccessDashboardAdminPath("super_admin", path), true);
    assert.equal(canAccessDashboardAdminPath("user", path), false);
  }
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/forms"), true);
  assert.equal(canAccessDashboardAdminPath("super_admin", "/dashboard/admin/forms"), true);
  assert.equal(canAccessDashboardAdminPath("user", "/dashboard/admin/forms"), false);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/registrations"), true);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/recruitment"), false);
  assert.equal(canAccessDashboardAdminPath("super_admin", "/dashboard/admin/recruitment-analytics"), true);
  assert.equal(canAccessDashboardAdminPath("super_admin", "/dashboard/admin/team-state"), true);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/team-state"), false);
  assert.equal(canAccessDashboardAdminPath("user", "/dashboard/admin/team-state"), false);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/leave"), true);
  assert.equal(canAccessDashboardAdminPath("user", "/dashboard/admin/leave"), false);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/leave/access-requests"), false);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/organization-preview"), false);
});

test("legacy team, timetable, profile, and help paths remain reachable through the new hierarchy", async () => {
  const routes = await readFile(new URL("../routes.ts", import.meta.url), "utf8");
  const timetable = await readFile(new URL("../routes/dashboard/timetable.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("../routes/dashboard/layout.tsx", import.meta.url), "utf8");
  const sideNavigation = await readFile(new URL("../components/dashboard-section-navigation.tsx", import.meta.url), "utf8");
  assert.match(routes, /route\("workbench", "routes\/dashboard\/workbench\.tsx"\)/);
  assert.match(routes, /route\("workbench\/organization", "routes\/organization-preview\.tsx"\)/);
  assert.match(routes, /route\("team", "routes\/organization-preview\.tsx", \{ id: "dashboard-team-legacy" \}\)/);
  assert.match(routes, /route\("admin\/organization-preview", "routes\/organization-preview\.tsx"/);
  assert.match(layout, /if \(legacyOrganizationAlias\) \{\s*throw redirect\("\/dashboard\/workbench\/organization"\)/);
  assert.doesNotMatch(routes, /team-redirect\.tsx/);
  assert.match(timetable, /tab=settings#timetable/);
  assert.doesNotMatch(routes, /route\("base", "routes\/dashboard\/base\.tsx"\)/);
  assert.doesNotMatch(layout, /currentPath\.pathname === "\/dashboard\/base"/);
  assert.match(layout, /navigate\(`\/dashboard\/members\/\$\{currentUser\.id\}\$\{tab === "overview" \? "" : `\?tab=\$\{tab\}`\}`\)/);
  assert.match(layout, /帮助与工作手册/);
  assert.match(layout, /<AccountMenuActionIcon name="my-profile" \/>[\s\S]*?我的主页/);
  assert.match(layout, /getDashboardSectionMenu\(currentUser\)\.filter\(\(\{ key \}\) => key !== "my-profile"\)/);
  assert.match(sideNavigation, /getUnifiedDashboardMenu\(currentUser, hasAssignmentGroup\)/);
  assert.match(layout, /getDashboardSectionMenu\(currentUser\)/);
  assert.match(layout, /aria-label="返回 TARSGO 官网"/);
  assert.match(layout, /<AccountSessionChoices/);
  assert.match(layout, /退出登录/);
});

test("historical archive is restricted to super administrators", () => {
  assert.equal(canAccessDashboardAdminPath("super_admin", "/dashboard/admin/history"), true);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/history"), false);
  assert.equal(canAccessDashboardAdminPath("user", "/dashboard/admin/history"), false);
});

test("training materials retain the uploaded group routes and the shared video references", async () => {
  const routes = await readFile(new URL("../routes.ts", import.meta.url), "utf8");
  const content = await readFile(new URL("../routes/dashboard/training-materials.tsx", import.meta.url), "utf8");
  assert.match(routes, /route\("training-materials", "routes\/dashboard\/training-materials\.tsx"\)/);
  for (const group of ["electrical", "hardware", "joint", "vision", "ai", "mechanical"]) {
    assert.match(content, new RegExp('id: "' + group + '"'));
  }
  for (const bv of ["BV15i9UBhEZ2", "BV1UwPgziE3F", "BV1Y8aL6SEit", "BV1LwHv6LEYz", "BV1cq421w72c", "BV1Cc41127B9", "BV1rpWjevEip", "BV1Dk4y1j7oj"]) {
    assert.ok(content.includes(bv), bv);
  }
  assert.ok(content.includes("阶段考核：？？？"));
  assert.ok(content.includes("硬件组学习全部软件组内容"));
});

test("common foundations link directly to tutorials and preserve original team routes", async () => {
  const content = await readFile(new URL("../routes/dashboard/training-materials.tsx", import.meta.url), "utf8");
  const tree = await readFile(new URL("../../../backend/handler/training_document_tree.go", import.meta.url), "utf8");
  const computer = await readFile(new URL("../content/training/computer-basics.md", import.meta.url), "utf8");
  const git = await readFile(new URL("../content/training/git-and-github.md", import.meta.url), "utf8");

  assert.ok(tree.includes('ID: "foundation-folder", Title: "通用基础"'));
  assert.ok(tree.includes('computerGuideNode()'));
  assert.ok(tree.includes('ID: "git", ParentID: "foundation-folder"'));
  assert.ok(!tree.includes('Title: "通用基础概览"'));
  assert.ok(content.includes("computer: computerMarkdown"));
  assert.ok(content.includes("git: gitMarkdown"));
  assert.ok(!content.includes("foundationMarkdown"));
  assert.ok(!computer.includes("?group=foundation") && !git.includes("?group=foundation"));
  for (const group of ["electrical", "hardware", "joint", "vision", "ai", "mechanical"]) {
    assert.ok(content.includes('id: "' + group + '"'), group);
  }
  for (const bv of ["BV15i9UBhEZ2", "BV1UwPgziE3F", "BV1Y8aL6SEit", "BV1LwHv6LEYz"]) {
    assert.ok((computer + git).includes(bv), bv);
  }
});
