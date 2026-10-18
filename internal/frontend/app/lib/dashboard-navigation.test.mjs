import assert from "node:assert/strict";
import test from "node:test";

import { canAccessDashboardAdminPath, getCoreDashboardMenu, getDefaultDashboardPath, getUserDashboardMenu, getVisibleAdminDashboardMenu } from "./dashboard-navigation.ts";

test("every authenticated role opens the same personal workbench", () => {
  assert.equal(getDefaultDashboardPath("user"), "/dashboard");
  assert.equal(getDefaultDashboardPath("admin"), "/dashboard");
  assert.equal(getDefaultDashboardPath("super_admin"), "/dashboard");
});

test("every role has only the personal-workbench core navigation entry", () => {
  assert.deepEqual(getCoreDashboardMenu().map(({ key, label, href }) => ({ key, label, href })), [
    { key: "personal-workspace", label: "个人工作台", href: "/dashboard" },
  ]);
});

test("weekly reports are visible only to operations group members", () => {
  assert.deepEqual(getCoreDashboardMenu(true).map(({ key, label, href }) => ({ key, label, href })), [
    { key: "personal-workspace", label: "个人工作台", href: "/dashboard" },
    { key: "weekly-reports", label: "工作周报", href: "/dashboard/weekly-reports" },
  ]);
  assert.equal(getCoreDashboardMenu(false).some((item) => item.key === "weekly-reports"), false);
});

test("recruitment administration exposes email management as a first-level entry", () => {
  const menu = getVisibleAdminDashboardMenu("super_admin");
  assert.equal(menu[0]?.label, "招新总览");
  assert.equal(menu.find((item) => item.key === "candidate-processing")?.label, "候选人处理");
  assert.equal(menu.find((item) => item.key === "recruitment-analytics")?.label, "招新数据分析");
  assert.equal(menu.find((item) => item.key === "recruitment-management")?.label, "招新管理");
  assert.equal(menu.find((item) => item.key === "accounts")?.label, "账号与权限");
  assert.equal(menu.some((item) => item.key === "portal-content" || item.key === "recruitment-statistics"), false);
  const emailManagement = menu.find((item) => item.key === "email-management");
  assert.deepEqual(emailManagement, {
    key: "email-management",
    label: "邮件管理",
    href: "/dashboard/admin/email",
    iconKey: "settings",
  });
  assert.equal(menu.some((item) => item.key === "system-config"), false);
});

test("member navigation keeps recruitment and exposes leave while admin tools stay restricted", () => {
  assert.deepEqual(getUserDashboardMenu("user").map((item) => item.href), ["/dashboard/users/registrations", "/dashboard/leave"]);
  assert.equal(getUserDashboardMenu("user")[0]?.label, "我的招新");
  assert.deepEqual(getUserDashboardMenu("admin"), []);
  assert.deepEqual(getUserDashboardMenu("super_admin"), []);
  const adminMenu = getVisibleAdminDashboardMenu("admin");
  assert.equal(adminMenu.some((item) => item.key === "email-management"), false);
  assert.equal(adminMenu.some((item) => item.key === "recruitment-management" || item.key === "accounts" || item.key === "recruitment-analytics"), false);
  assert.deepEqual(adminMenu.find((item) => item.key === "leave-management"), {
    key: "leave-management",
    label: "请假管理",
    href: "/dashboard/admin/leave",
    iconKey: "report",
  });
  assert.equal(getVisibleAdminDashboardMenu("super_admin").some((item) => item.key === "leave-management"), true);
});

test("admin routes require an exact workbench match and each route's own menu permission", () => {
  const cases = [
    ["/dashboard/admin", true],
    ["/dashboard/admin/registrations", true],
    ["/dashboard/admin/recruitment-analytics", false],
    ["/dashboard/admin/recruitment", false],
    ["/dashboard/admin/interview-sessions", false],
    ["/dashboard/admin/recruitment-settings", false],
    ["/dashboard/admin/recruitment-groups", false],
    ["/dashboard/admin/users", false],
    ["/dashboard/admin/email", false],
    ["/dashboard/admin/leave", true],
    ["/dashboard/admin/system-config/email", false],
    ["/dashboard/admin/system-config/oauth", false],
  ];

  for (const [pathname, expected] of cases) {
    assert.equal(canAccessDashboardAdminPath("admin", pathname), expected, pathname);
  }
});

test("super admin can access every listed admin route", () => {
  const paths = [
    "/dashboard/admin",
    "/dashboard/admin/registrations",
    "/dashboard/admin/recruitment",
    "/dashboard/admin/recruitment-analytics",
    "/dashboard/admin/users",
    "/dashboard/admin/email",
    "/dashboard/admin/leave",
  ];

  for (const pathname of paths) {
    assert.equal(canAccessDashboardAdminPath("super_admin", pathname), true, pathname);
  }
});
