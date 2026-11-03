import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canAccessDashboardAdminPath,
  getDashboardSectionKey,
  getDashboardSectionMenu,
  getDefaultDashboardPath,
  getMyWorkbenchMenu,
  getUserDashboardMenu,
  getVisibleAdminDashboardMenu,
  hasAssignmentGroupAccess,
  hasDashboardAdminAccess,
  hasOperationsWorkManualAccess,
  isAssignmentGroupName,
  isDashboardMenuPathActive,
  isTemporarilyUnavailableDashboardPath,
} from "./dashboard-navigation.ts";

test("primary navigation adds the signed-in member profile before role-gated Management", () => {
  const account = (name, id = 42) => ({ id, role: { name } });
  assert.deepEqual(getDashboardSectionMenu(account("user")).map(({ key, label, href }) => [key, label, href]), [
    ["community", "社区", "/dashboard"],
    ["workbench", "工作台", "/dashboard/workbench"],
    ["my-profile", "我的主页", "/dashboard/members/42"],
  ]);
  for (const role of ["admin", "super_admin"]) {
    assert.deepEqual(getDashboardSectionMenu(account(role)).map(({ key, href }) => [key, href]), [
      ["community", "/dashboard"],
      ["workbench", "/dashboard/workbench"],
      ["my-profile", "/dashboard/members/42"],
      ["management", "/dashboard/admin"],
    ]);
  }
  assert.equal(getDefaultDashboardPath("user"), "/dashboard");
  assert.equal(getDefaultDashboardPath("super_admin"), "/dashboard");
  assert.equal(hasDashboardAdminAccess("user"), false);
  assert.equal(hasDashboardAdminAccess("admin"), true);
});

test("personal workbench groups my tasks and member lookup without a team top-level section", () => {
  const memberMenu = getMyWorkbenchMenu("user", false);
  assert.deepEqual(memberMenu.map(({ key, label }) => [key, label]), [["my-work", "我的事务"], ["people-directory", "成员信息"]]);
  assert.deepEqual(memberMenu[0]?.children.map(({ key, href }) => [key, href]), [
    ["weekly-reports", "/dashboard/weekly-reports"],
    ["leave-workbench", "/dashboard/leave"],
    ["users-registrations", "/dashboard/users/registrations"],
  ]);
  assert.deepEqual(memberMenu[1]?.children.map(({ key, href }) => [key, href]), [["organization", "/dashboard/workbench/organization"]]);
  assert.deepEqual(getMyWorkbenchMenu("user", true)[0]?.children.map(({ key }) => key), ["weekly-reports", "my-assignments", "leave-workbench", "users-registrations"]);
  assert.deepEqual(getMyWorkbenchMenu("admin", true)[0]?.children.map(({ key }) => key), ["weekly-reports", "my-assignments", "leave-workbench"]);
  assert.deepEqual(getMyWorkbenchMenu("super_admin", false)[0]?.children.map(({ key }) => key), ["weekly-reports", "leave-workbench"]);
  assert.equal(memberMenu.flatMap(({ children }) => children).some(({ key }) => key === "timetable" || key === "work-manual"), false);
});

test("route classification keeps community, personal work, and management distinct", () => {
  assert.equal(getDashboardSectionKey("/dashboard"), "community");
  assert.equal(getDashboardSectionKey("/dashboard/community/42"), "community");
  assert.equal(getDashboardSectionKey("/dashboard/workbench"), "workbench");
  assert.equal(getDashboardSectionKey("/dashboard/workbench/organization"), "workbench");
  assert.equal(getDashboardSectionKey("/dashboard/weekly-reports"), "workbench");
  assert.equal(getDashboardSectionKey("/dashboard/assignments"), "workbench");
  assert.equal(getDashboardSectionKey("/dashboard/team"), "workbench");
  assert.equal(getDashboardSectionKey("/dashboard/members/42"), "workbench");
  assert.equal(getDashboardSectionKey("/dashboard/members/42", "user", 42), "profile");
  assert.equal(getDashboardSectionKey("/dashboard/members/43", "user", 42), "workbench");
  assert.equal(getDashboardSectionKey("/dashboard/admin/registrations"), "management");
  assert.equal(getDashboardSectionKey("/dashboard/leave", "user"), "workbench");
  assert.equal(getDashboardSectionKey("/dashboard/leave", "admin"), "management");
  assert.equal(getDashboardSectionKey("/dashboard/members/42", "user", 42), "profile");
  assert.equal(isDashboardMenuPathActive("/dashboard/admin/registrations/42", "/dashboard/admin/registrations"), true);
  assert.equal(isDashboardMenuPathActive("/dashboard/admin", "/dashboard/admin/registrations"), false);
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
  assert.deepEqual(getUserDashboardMenu("user", true).map(({ key }) => key), ["users-registrations", "my-assignments"]);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/training/assignments", false), false);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/training/assignments", true), true);
  assert.equal(canAccessDashboardAdminPath("super_admin", "/dashboard/admin/training/submissions", false), true);
  assert.equal(canAccessDashboardAdminPath("user", "/dashboard/admin/training/submissions", true), false);
});

test("management functions appear in three permission-filtered business groups", () => {
  const adminMenu = getVisibleAdminDashboardMenu("admin", true);
  assert.deepEqual(adminMenu.map(({ key, label }) => [key, label]), [
    ["recruitment", "招新"],
    ["members-training", "成员与培养"],
    ["collaboration-operations", "协作与运营"],
  ]);
  assert.deepEqual(adminMenu[0]?.children.map(({ key }) => key), ["candidate-processing"]);
  assert.deepEqual(adminMenu[1]?.children.map(({ key }) => key), ["assignment-management", "assignment-submissions"]);
  assert.deepEqual(adminMenu[2]?.children.map(({ key }) => key), ["leave-workbench", "timetable-availability"]);
  const restrictedAdminMenu = getVisibleAdminDashboardMenu("admin", false);
  assert.deepEqual(restrictedAdminMenu.map(({ key }) => key), ["recruitment", "collaboration-operations"]);
  assert.equal(restrictedAdminMenu[1]?.children.some(({ key }) => key === "timetable-availability"), true);

  const superAdminMenu = getVisibleAdminDashboardMenu("super_admin");
  assert.deepEqual(superAdminMenu.map(({ key }) => key), ["recruitment", "members-training", "collaboration-operations"]);
  assert.deepEqual(superAdminMenu[0]?.children.map(({ key }) => key), ["candidate-processing", "recruitment-management", "recruitment-analytics"]);
  assert.deepEqual(superAdminMenu[1]?.children.map(({ key }) => key), ["accounts", "assignment-management", "assignment-submissions"]);
  assert.deepEqual(superAdminMenu[2]?.children.map(({ key }) => key), ["leave-workbench", "timetable-availability", "email-management"]);
  assert.equal(getVisibleAdminDashboardMenu("user", true).length, 0);
});

test("management deep links keep role restrictions without broadening page access", () => {
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/registrations"), true);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/recruitment"), false);
  assert.equal(canAccessDashboardAdminPath("super_admin", "/dashboard/admin/recruitment-analytics"), true);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/leave"), true);
  assert.equal(canAccessDashboardAdminPath("user", "/dashboard/admin/leave"), false);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/leave/access-requests"), false);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/organization-preview"), false);
});

test("paused member and admin routes still reject direct entry", () => {
  const pausedPaths = [
    "/dashboard/base",
    "/dashboard/practice-projects",
    "/dashboard/growth?tab=skills",
    "/dashboard/skills",
    "/dashboard/capabilities",
    "/dashboard/expedition/projects",
    "/dashboard/admin/training/practice-projects",
    "/dashboard/admin/training/skills",
    "/dashboard/admin/training/capabilities",
    "/dashboard/admin/training/expedition",
    "/dashboard/admin/cultivation",
  ];
  for (const value of pausedPaths) {
    const pathname = value.split("?")[0];
    assert.equal(isTemporarilyUnavailableDashboardPath(pathname), true, pathname);
  }
  for (const pathname of ["/dashboard/weekly-reports", "/dashboard/leave", "/dashboard/guide", "/dashboard/admin/timetable-availability"]) {
    assert.equal(isTemporarilyUnavailableDashboardPath(pathname), false, pathname);
  }
});

test("legacy team, timetable, profile, and help paths remain reachable through the new hierarchy", async () => {
  const routes = await readFile(new URL("../routes.ts", import.meta.url), "utf8");
  const teamRedirect = await readFile(new URL("../routes/dashboard/team-redirect.tsx", import.meta.url), "utf8");
  const timetable = await readFile(new URL("../routes/dashboard/timetable.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("../routes/dashboard/layout.tsx", import.meta.url), "utf8");
  const sideNavigation = await readFile(new URL("../components/dashboard-section-navigation.tsx", import.meta.url), "utf8");
  assert.match(routes, /route\("workbench", "routes\/dashboard\/workbench\.tsx"\)/);
  assert.match(routes, /route\("workbench\/organization", "routes\/organization-preview\.tsx"\)/);
  assert.match(routes, /route\("team", "routes\/dashboard\/team-redirect\.tsx"\)/);
  assert.match(teamRedirect, /Navigate to="\/dashboard\/workbench\/organization" replace/);
  assert.match(timetable, /tab=settings#timetable/);
  assert.match(layout, /navigate\(`\/dashboard\/members\/\$\{currentUser\.id\}\$\{tab === "overview" \? "" : `\?tab=\$\{tab\}`\}`\)/);
  assert.match(layout, /帮助与工作手册/);
  assert.match(sideNavigation, /getMyWorkbenchMenu\(currentUser, hasAssignmentGroup\)/);
  assert.match(layout, /getDashboardSectionMenu\(currentUser\)/);
  assert.match(layout, /aria-label="返回 TARSGO 官网"/);
  assert.match(layout, /切换账号/);
  assert.match(layout, /退出当前账号/);
});
