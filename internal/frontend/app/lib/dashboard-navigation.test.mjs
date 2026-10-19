import assert from "node:assert/strict";
import test from "node:test";

import { canAccessDashboardAdminPath, getCoreDashboardMenu, getDefaultDashboardPath, getUserDashboardMenu, getVisibleAdminDashboardMenu, isDashboardMenuPathActive } from "./dashboard-navigation.ts";

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

test("admin navigation groups recruitment and member tools while keeping email standalone", () => {
  const menu = getVisibleAdminDashboardMenu("super_admin");
  const [recruitment, members] = menu;

  assert.equal(recruitment?.label, "招新事务");
  assert.deepEqual(recruitment?.children.map(({ label }) => label), ["招新总览", "候选人处理", "招新管理", "招新数据分析"]);
  assert.equal(members?.label, "成员管理");
  assert.deepEqual(members?.children.map(({ label }) => label), ["账号与权限", "请假管理"]);
  assert.equal(menu.length, 3);
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
  assert.deepEqual(adminMenu.map(({ key }) => key), ["recruitment-operations", "member-management"]);
  assert.deepEqual(adminMenu[0]?.children.map(({ key }) => key), ["admin-panel", "candidate-processing"]);
  assert.deepEqual(adminMenu[1]?.children.map(({ key }) => key), ["leave-management"]);
  assert.equal(getVisibleAdminDashboardMenu("user").length, 0);
});

test("nested admin routes keep their parent submenu active without highlighting the overview", () => {
  assert.equal(isDashboardMenuPathActive("/dashboard/admin", "/dashboard/admin"), true);
  assert.equal(isDashboardMenuPathActive("/dashboard/admin/registrations/42", "/dashboard/admin/registrations"), true);
  assert.equal(isDashboardMenuPathActive("/dashboard/admin/recruitment/settings", "/dashboard/admin/recruitment"), true);
  assert.equal(isDashboardMenuPathActive("/dashboard/admin/leave", "/dashboard/admin"), false);
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
