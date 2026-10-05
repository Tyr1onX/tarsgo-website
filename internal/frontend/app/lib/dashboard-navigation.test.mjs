import assert from "node:assert/strict";
import test from "node:test";

import { getDefaultDashboardPath, getUserDashboardMenu, getVisibleAdminDashboardMenu } from "./dashboard-navigation.ts";

test("default dashboard follows the authenticated system role", () => {
  assert.equal(getDefaultDashboardPath("user"), "/dashboard/users");
  assert.equal(getDefaultDashboardPath("admin"), "/dashboard/admin");
  assert.equal(getDefaultDashboardPath("super_admin"), "/dashboard/admin");
});

test("admin workbench navigation labels and OAuth depth are preserved", () => {
  const menu = getVisibleAdminDashboardMenu("super_admin");
  assert.equal(menu[0]?.label, "工作台");
  assert.equal(menu[1]?.label, "招新管理");
  assert.equal(menu.find((item) => item.key === "recruitment-statistics")?.label, "统计");
  assert.equal(menu.find((item) => item.key === "portal-content")?.label, "内容管理");
  const systemConfig = menu.find((item) => item.key === "system-config");
  assert.ok(systemConfig && "children" in systemConfig);
  assert.ok(systemConfig.children.some((child) => child.label === "第三方登录" && child.href === "/dashboard/admin/system-config/oauth"));
});

test("user navigation remains separate and super-admin tools stay restricted", () => {
  const user = { role: { name: "user" }, portal: { showRecruitmentEntry: true } };
  assert.equal(getUserDashboardMenu(user)[0]?.href, "/dashboard/users");
  assert.equal(getUserDashboardMenu(user).some((item) => item.label === "纳新报名"), true);
  const adminMenu = getVisibleAdminDashboardMenu("admin");
  assert.equal(adminMenu.some((item) => item.key === "system-config"), false);
  assert.equal(adminMenu.some((item) => item.key === "people" && "children" in item && item.children.some((child) => child.key === "user-groups")), false);
});
