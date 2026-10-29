import assert from "node:assert/strict";
import test from "node:test";

import { canAccessDashboardAdminPath, canAccessExpedition, getCoreDashboardMenu, getDefaultDashboardPath, getUserDashboardMenu, getVisibleAdminDashboardMenu, hasSkillGroupAccess, hasTechnicalGroupAccess, isDashboardMenuPathActive } from "./dashboard-navigation.ts";

test("every authenticated role opens the same personal workbench", () => {
  assert.equal(getDefaultDashboardPath("user"), "/dashboard");
  assert.equal(getDefaultDashboardPath("admin"), "/dashboard");
  assert.equal(getDefaultDashboardPath("super_admin"), "/dashboard");
});

test("every member has the weekly report entry in personal navigation", () => {
  assert.deepEqual(getCoreDashboardMenu().map(({ key, label, href }) => ({ key, label, href })), [
    { key: "personal-workspace", label: "个人工作台", href: "/dashboard" },
    { key: "weekly-reports", label: "工作周报", href: "/dashboard/weekly-reports" },
    { key: "personal-timetable", label: "我的课表", href: "/dashboard/timetable" },
  ]);
});

test("admin navigation groups recruitment and member tools while keeping email standalone", () => {
  const menu = getVisibleAdminDashboardMenu("super_admin");
  const [recruitment, training, members] = menu;

  assert.equal(recruitment?.label, "招新事务");
  assert.deepEqual(recruitment?.children.map(({ label }) => label), ["招新总览", "候选人处理", "招新管理", "招新数据分析"]);
  assert.equal(training?.label, "新人培养");
  assert.deepEqual(training?.children.map(({ label }) => label), ["作业管理", "提交记录", "答疑管理", "技能路线管理", "赛季协作"]);
  assert.equal(members?.label, "成员管理");
  assert.deepEqual(members?.children.map(({ label }) => label), ["账号与权限", "请假管理"]);
  assert.equal(menu.length, 4);
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

test("member navigation keeps personal growth available to all roles and restricts member tools", () => {
	assert.deepEqual(getUserDashboardMenu("user").map((item) => item.href), ["/dashboard/users/registrations", "/dashboard/leave", "/dashboard/growth"]);
  assert.equal(getUserDashboardMenu("user")[0]?.label, "我的招新");
	assert.deepEqual(getUserDashboardMenu("admin").map((item) => item.href), ["/dashboard/growth"]);
	assert.deepEqual(getUserDashboardMenu("super_admin").map((item) => item.href), ["/dashboard/growth", "/dashboard/expedition"]);
	assert.deepEqual(getUserDashboardMenu("user", false, true).map(({ key }) => key), ["users-registrations", "leave-workbench", "my-growth", "tars-base-expedition", "skill-tree"]);
  const adminMenu = getVisibleAdminDashboardMenu("admin");
  assert.deepEqual(adminMenu.map(({ key }) => key), ["recruitment-operations", "member-management"]);
  assert.deepEqual(adminMenu[0]?.children.map(({ key }) => key), ["admin-panel", "candidate-processing"]);
  assert.deepEqual(adminMenu[1]?.children.map(({ key }) => key), ["leave-management"]);
  assert.equal(getVisibleAdminDashboardMenu("user").length, 0);
});

test("members need a technical group while super-admins can manage all groups", () => {
  for (const name of ["机械组", "电控组", "视觉组", "AI组"]) {
    assert.equal(hasTechnicalGroupAccess([{ name }]), true, name);
  }
  assert.equal(hasTechnicalGroupAccess([{ name: "运营组" }]), false);
	assert.equal(hasSkillGroupAccess([{ name: "运营组" }]), true);
	assert.equal(hasSkillGroupAccess([{ name: "临时组" }]), false);
	assert.deepEqual(getUserDashboardMenu("user", true).slice(3).map(({ label }) => label), ["TARS BASE", "技能树", "提问答疑", "我的作业"]);
	assert.deepEqual(getUserDashboardMenu("admin", true).map(({ label }) => label), ["我的成长", "TARS BASE", "技能树", "提问答疑", "我的作业"]);
	assert.deepEqual(getUserDashboardMenu("super_admin", false).map(({ label }) => label), ["我的成长", "TARS BASE"]);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/training/assignments", false), false);
  assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/training/assignments", true), true);
  assert.equal(canAccessDashboardAdminPath("super_admin", "/dashboard/admin/training/assignments", false), true);
  assert.equal(canAccessDashboardAdminPath("user", "/dashboard/admin/training/submissions", true), false);
  const trainingMenu = getVisibleAdminDashboardMenu("admin", true).find(({ key }) => key === "newcomer-training");
	assert.deepEqual(trainingMenu?.children.map(({ label }) => label), ["作业管理", "提交记录", "答疑管理", "技能路线管理", "赛季协作"]);
  assert.equal(getVisibleAdminDashboardMenu("admin", false).some(({ key }) => key === "newcomer-training"), false);
	assert.deepEqual(getVisibleAdminDashboardMenu("admin", false, true).find(({ key }) => key === "newcomer-training")?.children.map(({ label }) => label), ["技能路线管理", "赛季协作"]);
	assert.deepEqual(getVisibleAdminDashboardMenu("super_admin", false).find(({ key }) => key === "newcomer-training")?.children.map(({ label }) => label), ["作业管理", "提交记录", "答疑管理", "技能路线管理", "赛季协作"]);
	assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/training/skills", false, true), true);
	assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/training/skills", false, false), false);
	assert.equal(canAccessDashboardAdminPath("super_admin", "/dashboard/admin/training/skills", false), true);
	assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/training/expedition", false, true), true);
	assert.equal(canAccessDashboardAdminPath("admin", "/dashboard/admin/training/expedition", false, false), false);
	assert.equal(canAccessDashboardAdminPath("super_admin", "/dashboard/admin/training/expedition", false), true);
});

test("TARS BASE requires one of the five supported groups, except for super admins", () => {
  assert.equal(canAccessExpedition("user", false), false);
  assert.equal(canAccessExpedition("admin", false), false);
  assert.equal(canAccessExpedition("user", true), true);
  assert.equal(canAccessExpedition("admin", true), true);
  assert.equal(canAccessExpedition("super_admin", false), true);
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
    "/dashboard/admin/training/assignments",
    "/dashboard/admin/training/submissions",
    "/dashboard/admin/training/questions",
    "/dashboard/admin/training/skills",
    "/dashboard/admin/training/expedition",
  ];

  for (const pathname of paths) {
    assert.equal(canAccessDashboardAdminPath("super_admin", pathname), true, pathname);
  }
});
