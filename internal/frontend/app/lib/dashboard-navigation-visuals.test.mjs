import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layout = await readFile(new URL("../routes/dashboard/layout.tsx", import.meta.url), "utf8");
const navigationCss = await readFile(new URL("../admin-design.css", import.meta.url), "utf8");
const sectionNavigation = await readFile(new URL("../components/dashboard-section-navigation.tsx", import.meta.url), "utf8");

test("the primary rail shows community, workbench, and permission-gated management", () => {
  for (const icon of ["community", "transactions", "management"]) assert.match(layout, new RegExp(`case "${icon}":`));
  assert.match(layout, /getDashboardSectionMenu\(currentUser\)/);
  assert.match(layout, /getDashboardSectionKey\(location\.pathname, location\.search, currentUser\.role\.name, location\.hash\)/);
  assert.match(layout, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(layout, /collapsed \? "sr-only"/);
  assert.match(layout, /<DashboardSectionNavigation[\s\S]*?collapsed=\{isSidebarCollapsed\}/);
  assert.doesNotMatch(layout, /const DASHBOARD_SECTION_MENU[\s\S]*?key: "team"/);
});

test("nested navigation lives in the sidebar and replaces the flat top tabs", () => {
  const mainContent = layout.slice(layout.indexOf("<main className=\"p-4 sm:p-6 lg:p-8\">"));
  assert.doesNotMatch(mainContent, /<DashboardSectionNavigation/);
  assert.match(sectionNavigation, /getMyWorkbenchMenu\(currentUser, hasAssignmentGroup\)/);
  assert.match(sectionNavigation, /getVisibleAdminDashboardMenu\(currentUser, hasAssignmentGroup\)/);
  assert.match(sectionNavigation, /aria-expanded=\{isExpanded\}/);
  assert.match(sectionNavigation, /dashboard-subnav__heading-button/);
  assert.match(sectionNavigation, /item\.key === "candidate-processing" \? candidateTodoCount/);
  assert.match(sectionNavigation, /item\.key === "leave-workbench" && section === "management" \? leaveActionableCount/);
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
