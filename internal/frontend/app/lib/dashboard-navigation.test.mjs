import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canAccessDashboardAdminPath,
  getDailyDashboardMenu,
  getDashboardSectionKey,
  getDashboardSectionMenu,
  getDefaultDashboardPath,
  getMyTransactionsMenu,
  getUserDashboardMenu,
  getVisibleAdminDashboardLinks,
  getVisibleAdminDashboardMenu,
  hasAssignmentGroupAccess,
  hasDashboardAdminAccess,
  hasOperationsWorkManualAccess,
  isAssignmentGroupName,
  isDashboardMenuPathActive,
  isTemporarilyUnavailableDashboardPath,
} from "./dashboard-navigation.ts";

test("all authenticated roles get daily reports, self-service leave, and one work manual entry", () => {
  for (const role of ["user", "admin", "super_admin"]) {
    assert.equal(getDefaultDashboardPath(role), "/dashboard");
    assert.deepEqual(getDashboardSectionMenu(role).map(({ key }) => key), role === "user"
      ? ["community", "transactions", "team"]
      : ["community", "transactions", "team", "management"]);
  }
  assert.deepEqual(getDashboardSectionMenu("user").map(({ href }) => href), ["/dashboard", "/dashboard/weekly-reports", "/dashboard/team"]);
  assert.equal(new Set(getDashboardSectionMenu("super_admin").map(({ iconKey }) => iconKey)).size, 4);
  assert.deepEqual(getDailyDashboardMenu("user").map(({ key, href }) => [key, href]), [
    ["weekly-reports", "/dashboard/weekly-reports"],
    ["leave-workbench", "/dashboard/leave"],
    ["work-manual", "/dashboard/guide"],
  ]);
  for (const role of ["admin", "super_admin"]) {
    assert.deepEqual(getDailyDashboardMenu(role).map(({ key, href }) => [key, href]), [
      ["weekly-reports", "/dashboard/weekly-reports"],
      ["leave-workbench", "/dashboard/leave"],
      ["work-manual", "/dashboard/guide"],
    ]);
  }
  assert.deepEqual(getMyTransactionsMenu("user", false).map(({ key }) => key), ["users-registrations", "weekly-reports", "timetable", "leave-workbench", "work-manual"]);
  assert.deepEqual(getMyTransactionsMenu("user", true).map(({ key }) => key), ["users-registrations", "my-assignments", "weekly-reports", "timetable", "leave-workbench", "work-manual"]);
  assert.deepEqual(getMyTransactionsMenu("admin", true).map(({ key }) => key), ["weekly-reports", "timetable", "work-manual"]);
  assert.equal(getMyTransactionsMenu({ id: 25, role: { name: "user" } }, false).find(({ key }) => key === "timetable")?.href, "/dashboard/members/25?tab=settings#timetable");
});

test("four top-level entries classify real routes and keep personal settings distinct", () => {
  assert.equal(getDashboardSectionKey("/dashboard"), "community");
  assert.equal(getDashboardSectionKey("/dashboard/community/42"), "community");
  assert.equal(getDashboardSectionKey("/dashboard/weekly-reports"), "transactions");
  assert.equal(getDashboardSectionKey("/dashboard/members/42"), "team");
  assert.equal(getDashboardSectionKey("/dashboard/team"), "team");
  assert.equal(getDashboardSectionKey("/dashboard/admin/registrations"), "management");
  assert.equal(getDashboardSectionKey("/dashboard/admin/organization-preview"), "team");
  assert.equal(getDashboardSectionKey("/dashboard/leave", "", "user"), "transactions");
  assert.equal(getDashboardSectionKey("/dashboard/leave", "", "admin"), "management");
  assert.equal(getDashboardSectionKey("/dashboard/members/42", "?tab=settings"), "team");
  assert.equal(getDashboardSectionKey("/dashboard/members/42", "?tab=settings", "user", "#timetable"), "transactions");
});

test("operations SOP visibility follows operations membership or super-admin role", () => {
  assert.equal(hasOperationsWorkManualAccess("user", [{ name: "运营组" }]), true);
  assert.equal(hasOperationsWorkManualAccess("admin", [{ name: "运营组" }]), true);
  assert.equal(hasOperationsWorkManualAccess("admin", [{ name: "机械组" }]), false);
  assert.equal(hasOperationsWorkManualAccess("user", []), false);
  assert.equal(hasOperationsWorkManualAccess("super_admin", []), true);
});

test("legacy admin leave URL retains role restrictions without a duplicate menu entry", () => {
  for (const role of ["user", "admin", "super_admin"]) {
    assert.equal(getDailyDashboardMenu(role).filter(({ key }) => key === "leave-workbench").length, 1);
    assert.equal(getDailyDashboardMenu(role).some(({ key }) => key === "leave-management"), false);
  }
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/leave"), true);
  assert.equal(canAccessDashboardAdminPath("super_admin", "/dashboard/admin/leave"), true);
  assert.equal(canAccessDashboardAdminPath("user", "/dashboard/admin/leave"), false);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/leave/access-requests"), false);
});

test("assignment entry and group selector support exactly the five requested groups", () => {
  const groups = ["机械组", "电控组", "视觉组", "AI组", "运营组"];
  for (const name of groups) {
    assert.equal(isAssignmentGroupName(name), true, name);
    assert.equal(hasAssignmentGroupAccess([{ name }]), true, name);
  }
  for (const name of ["临时组", "招新组", "", "未知组"]) {
    assert.equal(isAssignmentGroupName(name), false, name);
    assert.equal(hasAssignmentGroupAccess([{ name }]), false, name);
  }
  assert.deepEqual(getUserDashboardMenu("user", true).map(({ key }) => key), ["users-registrations", "my-assignments"]);
  assert.deepEqual(getUserDashboardMenu("admin", true).map(({ key }) => key), []);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/training/assignments", false), false);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/training/assignments", true), true);
  assert.equal(canAccessDashboardAdminPath("super_admin", "/dashboard/admin/training/assignments", false), true);
  assert.equal(canAccessDashboardAdminPath("user", "/dashboard/admin/training/submissions", true), false);
});

test("admin navigation keeps open recruitment, account, assignment, and timetable tools", () => {
  const adminMenu = getVisibleAdminDashboardMenu("admin", true);
  assert.deepEqual(adminMenu.map(({ key }) => key), ["recruitment-operations", "newcomer-training", "member-management"]);
  assert.deepEqual(adminMenu[0]?.children.map(({ key }) => key), ["admin-panel", "candidate-processing"]);
  assert.deepEqual(adminMenu[1]?.children.map(({ key }) => key), ["assignment-management", "assignment-submissions"]);
  assert.deepEqual(adminMenu[2]?.children.map(({ key }) => key), ["timetable-availability"]);
  assert.equal(getVisibleAdminDashboardMenu("admin", false).some(({ key }) => key === "newcomer-training"), false);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/timetable-availability"), true);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/registrations"), true);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/recruitment"), false);

  const superAdminMenu = getVisibleAdminDashboardMenu("super_admin");
  assert.deepEqual(superAdminMenu.map(({ key }) => key), ["recruitment-operations", "newcomer-training", "member-management", "email-management"]);
  assert.deepEqual(superAdminMenu.find(({ key }) => key === "newcomer-training")?.children.map(({ key }) => key), ["assignment-management", "assignment-submissions"]);
  assert.deepEqual(superAdminMenu.find(({ key }) => key === "member-management")?.children.map(({ key }) => key), ["accounts", "timetable-availability"]);
  assert.deepEqual(getVisibleAdminDashboardLinks("admin", true).map(({ key }) => key), ["admin-panel", "candidate-processing", "assignment-management", "assignment-submissions", "timetable-availability", "leave-workbench"]);
  assert.equal(getVisibleAdminDashboardLinks("user", true).length, 0);
  assert.equal(getVisibleAdminDashboardLinks("super_admin").some(({ key }) => key === "recruitment-analytics"), true);
  assert.equal(getVisibleAdminDashboardLinks("admin", true).some(({ key }) => key === "recruitment-analytics"), false);
  assert.equal(canAccessDashboardAdminPath("super_admin", "/dashboard/admin/organization-preview"), false);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/organization-preview"), false);
  assert.equal(canAccessDashboardAdminPath("user", "/dashboard/admin/organization-preview"), false);
  assert.equal(hasDashboardAdminAccess("admin"), true);
  assert.equal(hasDashboardAdminAccess("user"), false);
});

test("paused member and admin routes reject direct entry for every role", () => {
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
    for (const role of ["user", "admin", "super_admin"]) {
      if (pathname.startsWith("/dashboard/admin/")) {
        assert.equal(canAccessDashboardAdminPath(role, pathname, true), false, `${role}: ${pathname}`);
      }
    }
  }
  for (const pathname of ["/dashboard/weekly-reports", "/dashboard/leave", "/dashboard/guide", "/dashboard/admin/timetable-availability"]) {
    assert.equal(isTemporarilyUnavailableDashboardPath(pathname), false, pathname);
  }
});

test("nested admin routes keep their parent menu active without broadening access", () => {
  assert.equal(isDashboardMenuPathActive("/dashboard/admin", "/dashboard/admin"), true);
  assert.equal(isDashboardMenuPathActive("/dashboard/admin/registrations/42", "/dashboard/admin/registrations"), true);
  assert.equal(isDashboardMenuPathActive("/dashboard/admin", "/dashboard/admin/registrations"), false);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/interview-sessions"), false);
  assert.equal(canAccessDashboardAdminPath("super_admin", "/dashboard/admin/email"), true);
});

test("collapsed sidebar retains labels and account actions without duplicate site or profile links", async () => {
  const layout = await readFile(new URL("../routes/dashboard/layout.tsx", import.meta.url), "utf8");
  const legacyLeaveRoute = await readFile(new URL("../routes/admin/leave-workbench.tsx", import.meta.url), "utf8");
  assert.match(layout, /aria-label=\{hasBadge \? `\$\{item\.label\}/);
  assert.match(layout, /title=\{title\}/);
  assert.ok(layout.includes("getDashboardSectionMenu(currentUser)"));
  assert.ok(layout.includes("我的主页"));
  assert.ok(layout.includes("切换账号"));
  assert.ok(layout.includes("退出当前账号"));
  assert.match(layout, /aria-label="返回 TARSGO 官网"/);
  assert.doesNotMatch(layout, /返回官网/);
  assert.match(legacyLeaveRoute, /<Navigate to="\/dashboard\/leave" replace \/>/);
  assert.equal(getDailyDashboardMenu("user").filter(({ label }) => label === "工作手册").length, 1);
});
