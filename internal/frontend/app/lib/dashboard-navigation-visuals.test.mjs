import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layout = await readFile(new URL("../routes/dashboard/layout.tsx", import.meta.url), "utf8");
const navigationCss = await readFile(new URL("../admin-design.css", import.meta.url), "utf8");
const sectionNavigation = await readFile(new URL("../components/dashboard-section-navigation.tsx", import.meta.url), "utf8");

test("the fixed primary rail shows community, workbench, profile, and permission-gated management", () => {
  for (const icon of ["community", "transactions", "user", "management"]) assert.match(layout, new RegExp(`case "${icon}":`));
  assert.match(layout, /getDashboardSectionMenu\(currentUser\)/);
  assert.match(layout, /getDashboardSectionKey\(location\.pathname, currentUser\.role\.name, currentUser\.id\)/);
  assert.match(layout, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(layout, /compact \? "sr-only"/);
  assert.match(layout, /<DashboardSectionNavigation[\s\S]*?compact=\{isDesktopViewport\}/);
  assert.match(layout, /className="dashboard-shell__main-frame relative z-10 lg:pl-20"/);
  assert.match(layout, /w-20 flex-col/);
  assert.doesNotMatch(layout, /sidebarCollapsed|sidebarWidth|isResizingSidebar|cursor-col-resize|sidebar-toggle/);
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
  assert.match(layout, /<DashboardTooltip label=\{compact \? item\.label : undefined\}/);
  assert.doesNotMatch(layout, /managementLabel|报名待处理|请假待审批/);
  assert.doesNotMatch(sectionNavigation, /getVisibleAdminDashboardLinks|dashboard-section-nav/);
  assert.doesNotMatch(navigationCss, /\.dashboard-section-nav/);
});

test("nested links keep readable active and keyboard focus states in both themes", () => {
  assert.match(navigationCss, /\.dashboard-nav-link--active::before[\s\S]*?background: var\(--admin-accent\)/);
  assert.match(navigationCss, /\.dashboard-nav-link:focus-visible[\s\S]*?outline: 2px solid var\(--admin-accent\)/);
  assert.match(navigationCss, /\.dashboard-subnav__link\.is-active[\s\S]*?color: var\(--admin-accent-text\)/);
  assert.match(navigationCss, /\.dashboard-subnav__link:focus-visible[\s\S]*?outline: 2px solid var\(--admin-accent\)/);
  assert.match(sectionNavigation, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(sectionNavigation, /onClick=\{onNavigate\}/);
});
