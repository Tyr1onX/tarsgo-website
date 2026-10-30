import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessDashboardAdminPath,
  getCoreDashboardMenu,
  getDailyDashboardMenu,
  getDefaultDashboardPath,
  getUserDashboardMenu,
  getVisibleAdminDashboardMenu,
  hasAssignmentGroupAccess,
  hasDashboardAdminAccess,
  isAssignmentGroupName,
  isDashboardMenuPathActive,
  isTemporarilyUnavailableDashboardPath,
} from "./dashboard-navigation.ts";

test("all authenticated roles get daily reports, self-service leave, and the guide", () => {
  for (const role of ["user", "admin", "super_admin"]) {
    assert.equal(getDefaultDashboardPath(role), "/dashboard");
  }
  assert.deepEqual(getCoreDashboardMenu().map(({ href }) => href), ["/dashboard"]);
  assert.deepEqual(getDailyDashboardMenu("user").map(({ key, href }) => [key, href]), [
    ["weekly-reports", "/dashboard/weekly-reports"],
    ["leave-workbench", "/dashboard/leave"],
    ["usage-guide", "/dashboard/guide"],
  ]);
  for (const role of ["admin", "super_admin"]) {
    assert.deepEqual(getDailyDashboardMenu(role).map(({ key }) => key), [
      "weekly-reports", "leave-workbench", "leave-management", "usage-guide",
    ]);
  }
});

test("leave management stays with existing admin roles and is placed in daily affairs", () => {
  assert.equal(getDailyDashboardMenu("admin").find(({ key }) => key === "leave-management")?.href, "/dashboard/admin/leave");
  assert.equal(getDailyDashboardMenu("super_admin").find(({ key }) => key === "leave-management")?.href, "/dashboard/admin/leave");
  assert.equal(getDailyDashboardMenu("user").some(({ key }) => key === "leave-management"), false);
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
  assert.equal(hasDashboardAdminAccess("admin"), true);
  assert.equal(hasDashboardAdminAccess("user"), false);
});

test("paused member and admin routes reject direct entry for every role", () => {
  const pausedPaths = [
    "/dashboard/base",
    "/dashboard/practice-projects",
    "/dashboard/questions/12",
    "/dashboard/growth?tab=skills",
    "/dashboard/skills",
    "/dashboard/capabilities",
    "/dashboard/expedition/projects",
    "/dashboard/admin/training/practice-projects",
    "/dashboard/admin/training/questions/12",
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
