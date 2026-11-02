import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layout = await readFile(new URL("../routes/dashboard/layout.tsx", import.meta.url), "utf8");
const sidebarCss = await readFile(new URL("../admin-design.css", import.meta.url), "utf8");
const sectionNavigation = await readFile(new URL("../components/dashboard-section-navigation.tsx", import.meta.url), "utf8");

test("the four first-level entries use distinct, semantic SVG icons and navigate directly", () => {
  for (const icon of ["community", "transactions", "team", "management"]) {
    assert.match(layout, new RegExp(`case "${icon}":`));
  }
  assert.match(layout, /getDashboardSectionMenu\(currentUser\)/);
  assert.match(layout, /getDashboardSectionKey\(location\.pathname, location\.search, currentUser\.role\.name, location\.hash\)/);
  assert.match(layout, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(layout, /aria-label=\{hasBadge \? `\$\{item\.label\}/);
  assert.match(layout, /title=\{title\}/);
  assert.match(layout, /collapsed \? "sr-only"/);
  assert.doesNotMatch(layout, /if \("children" in item\)/);
});

test("selected and keyboard-focused navigation states remain visible in both themes", () => {
  assert.match(sidebarCss, /\.dashboard-nav-link--active::before[\s\S]*?background: var\(--admin-accent\)/);
  assert.match(sidebarCss, /\.dashboard-nav-link:focus-visible[\s\S]*?outline: 2px solid var\(--admin-accent\)/);
  assert.match(sidebarCss, /\.dashboard-section-nav__link\.is-active::after[\s\S]*?background: var\(--admin-accent\)/);
  assert.match(sidebarCss, /\.dashboard-section-nav__link:focus-visible[\s\S]*?outline: 2px solid var\(--admin-accent\)/);
  assert.match(sectionNavigation, /aria-current=\{isActive \? "page" : undefined\}/);
});

test("the contextual navigation is flat, scrollable on mobile, and badge-aware", () => {
  assert.match(sectionNavigation, /getMyTransactionsMenu\(currentUser, hasAssignmentGroup\)/);
  assert.match(sectionNavigation, /getVisibleAdminDashboardLinks\(currentUser, hasAssignmentGroup\)/);
  assert.match(sectionNavigation, /item\.key === "candidate-processing" \|\| item\.key === "admin-panel" \|\| item\.key === "recruitment-analytics"/);
  assert.match(sectionNavigation, /dashboard-nav-badge/);
  assert.match(sidebarCss, /\.dashboard-section-nav[\s\S]*?overflow-x: auto/);
  assert.match(sidebarCss, /@media \(min-width: 768px\)[\s\S]*?flex-wrap: wrap/);
});
