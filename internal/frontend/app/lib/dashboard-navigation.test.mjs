import assert from "node:assert/strict";
import test from "node:test";

import { canAccessDashboardAdminPath, getDefaultDashboardPath, getUserDashboardMenu, getVisibleAdminDashboardMenu } from "./dashboard-navigation.ts";

test("default dashboard follows the authenticated system role", () => {
  assert.equal(getDefaultDashboardPath("user"), "/dashboard/users/registrations");
  assert.equal(getDefaultDashboardPath("admin"), "/dashboard/admin");
  assert.equal(getDefaultDashboardPath("super_admin"), "/dashboard/admin");
});

test("recruitment navigation is grouped and OAuth settings stay restricted", () => {
  const menu = getVisibleAdminDashboardMenu("super_admin");
  assert.equal(menu[0]?.label, "招新工作台");
  assert.equal(menu.find((item) => item.key === "candidate-processing")?.label, "候选人处理");
  const recruitmentSettings = menu.find((item) => item.key === "recruitment-settings");
  assert.ok(recruitmentSettings && "children" in recruitmentSettings);
  assert.deepEqual(recruitmentSettings.children.map((item) => item.label), ["届次与报名字段", "面试场次", "招新组别"]);
  assert.equal(menu.some((item) => item.key === "portal-content" || item.key === "recruitment-statistics"), false);
  const systemConfig = menu.find((item) => item.key === "system-config");
  assert.ok(systemConfig && "children" in systemConfig);
  assert.ok(systemConfig.children.some((child) => child.label === "第三方登录" && child.href === "/dashboard/admin/system-config/oauth"));
});

test("candidate navigation has one recruitment destination and admin tools stay restricted", () => {
  assert.deepEqual(getUserDashboardMenu().map((item) => item.href), ["/dashboard/users/registrations"]);
  assert.equal(getUserDashboardMenu()[0]?.label, "我的招新");
  const adminMenu = getVisibleAdminDashboardMenu("admin");
  assert.equal(adminMenu.some((item) => item.key === "system-config"), false);
  assert.equal(adminMenu.some((item) => item.key === "recruitment-settings" || item.key === "accounts"), false);
});

test("admin routes require an exact workbench match and each route's own menu permission", () => {
  const cases = [
    ["/dashboard/admin", true],
    ["/dashboard/admin/registrations", true],
    ["/dashboard/admin/interview-sessions", false],
    ["/dashboard/admin/recruitment-settings", false],
    ["/dashboard/admin/recruitment-groups", false],
    ["/dashboard/admin/users", false],
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
    "/dashboard/admin/interview-sessions",
    "/dashboard/admin/recruitment-settings",
    "/dashboard/admin/recruitment-groups",
    "/dashboard/admin/users",
    "/dashboard/admin/system-config/oauth",
  ];

  for (const pathname of paths) {
    assert.equal(canAccessDashboardAdminPath("super_admin", pathname), true, pathname);
  }
});
