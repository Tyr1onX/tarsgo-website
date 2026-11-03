import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layout = await readFile(new URL("../routes/dashboard/layout.tsx", import.meta.url), "utf8");
const navigationCss = await readFile(new URL("../admin-design.css", import.meta.url), "utf8");
const sectionNavigation = await readFile(new URL("../components/dashboard-section-navigation.tsx", import.meta.url), "utf8");

test("the full-width top bar controls one hidden-by-default sidebar", () => {
  for (const icon of ["community", "transactions", "user", "management"]) assert.match(layout, new RegExp(`case "${icon}":`));
  assert.match(layout, /getDashboardSectionMenu\(currentUser\)/);
  assert.match(layout, /getDashboardSectionKey\(location\.pathname, currentUser\.role\.name, currentUser\.id\)/);
  assert.match(layout, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(layout, /const \[sidebarOpen, setSidebarOpen\] = useState\(false\)/);
  assert.match(layout, /<DashboardSectionNavigation[\s\S]*?onNavigate=\{handleSidebarNavigate\}/);
  assert.match(layout, /dashboard-shell__topbar sticky top-0[\s\S]*?dashboard-shell__body/);
  assert.match(layout, /sidebarOpen \? "translate-x-0 lg:w-64 lg:visible" : "-translate-x-full lg:w-0 lg:invisible/);
  assert.match(layout, /onClick=\{toggleSidebar\}/);
  assert.doesNotMatch(layout, /isDesktopViewport|sidebarCollapsed|sidebarWidth|isResizingSidebar|cursor-col-resize|w-20 flex-col|lg:pl-20/);
  assert.match(navigationCss, /\.dashboard-shell__page-title[\s\S]*?text-overflow: ellipsis/);
  assert.match(navigationCss, /\.dashboard-shell__body[\s\S]*?display: flex/);
  assert.doesNotMatch(layout, /const DASHBOARD_SECTION_MENU[\s\S]*?key: "team"/);
});

test("nested navigation lives in the sidebar and replaces the flat top tabs", () => {
  const mainContent = layout.slice(layout.indexOf("<main className=\"p-4 sm:p-6 lg:p-8\">"));
  assert.doesNotMatch(mainContent, /<DashboardSectionNavigation/);
  assert.match(sectionNavigation, /getMyWorkbenchMenu\(currentUser, hasAssignmentGroup\)/);
  assert.match(sectionNavigation, /getVisibleAdminDashboardMenu\(currentUser, hasAssignmentGroup\)/);
  assert.match(sectionNavigation, /aria-expanded=\{isExpanded\}/);
  assert.match(sectionNavigation, /dashboard-subnav__heading-button/);
  assert.doesNotMatch(sectionNavigation, /candidateTodoCount|leaveActionableCount|dashboard-nav-badge/);
  assert.doesNotMatch(layout, /DashboardTooltip|compact/);
  assert.match(sectionNavigation, /group\.href && group\.children\.length === 0/);
  assert.match(sectionNavigation, /activeGroup\.children\.length > 0/);
  assert.doesNotMatch(layout, /managementLabel|报名待处理|请假待审批/);
  assert.doesNotMatch(sectionNavigation, /getVisibleAdminDashboardLinks|dashboard-section-nav/);
  assert.doesNotMatch(navigationCss, /\.dashboard-section-nav/);
});

test("the avatar menu is anchored, viewport-clamped, keyboard dismissible, and unique", () => {
  assert.match(layout, /createPortal\([\s\S]*?dashboard-user-menu[\s\S]*?document\.body/);
  assert.match(layout, /const resizeObserver = new ResizeObserver\(updatePosition\)/);
  assert.match(layout, /event\.key === "Escape"/);
  for (const label of ["我的主页", "帮助与工作手册", "切换账号", "添加账号", "管理账号", "退出当前账号"]) {
    assert.ok(layout.includes(label), `missing account menu action: ${label}`);
  }
  assert.equal((layout.match(/className="dashboard-shell__user-menu"/g) ?? []).length, 1);
  assert.doesNotMatch(layout, /dashboard-shell__profile-area/);
});

test("nested links keep readable active and keyboard focus states in both themes", () => {
  assert.match(navigationCss, /\.dashboard-nav-link--active::before[\s\S]*?background: var\(--admin-accent\)/);
  assert.match(navigationCss, /\.dashboard-nav-link:focus-visible[\s\S]*?outline: 2px solid var\(--admin-accent\)/);
  assert.match(navigationCss, /\.dashboard-subnav__link\.is-active[\s\S]*?color: var\(--admin-accent-text\)/);
  assert.match(navigationCss, /\.dashboard-subnav__link:focus-visible[\s\S]*?outline: 2px solid var\(--admin-accent\)/);
  assert.match(sectionNavigation, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(sectionNavigation, /onClick=\{onNavigate\}/);
});
