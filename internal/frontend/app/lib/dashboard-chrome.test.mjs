import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("compact sidebar labels appear beside icons on hover and keyboard focus", async () => {
  const layout = await source("../routes/dashboard/layout.tsx");
  const styles = await source("../admin-design.css");
  assert.match(layout, /<DashboardTooltip label=\{compact \? item\.label : undefined\}>/);
  assert.doesNotMatch(layout, /sidebarCollapsed|sidebarWidth|isResizingSidebar|展开侧边栏|收起侧边栏|cursor-col-resize/);
  assert.match(layout, /aria-label=\{item\.label\}/);
  assert.doesNotMatch(layout, /candidateTodoCount|leaveActionableCount|managementLabel|badgeLabel/);
  assert.match(layout, /<DashboardTooltip label=\{isDesktopViewport && !userMenuOpen \? `\$\{currentUserName\} · 账号管理` : undefined\}>/);
  assert.match(layout, /dashboard-shell__user-menu-role[\s\S]*?\{currentUserName \|\| getAuthUserRoleLabel\(currentUser\)\}[\s\S]*?\{currentUser\.email\}/);
  assert.doesNotMatch(layout, />我的主页<\/button>/);
  for (const action of ["切换账号", "添加账号", "管理账号", "退出当前账号"]) assert.match(layout, new RegExp(action));
  assert.match(layout, /createPortal\([\s\S]*?role="tooltip"/);
  assert.match(layout, /onPointerEnter=\{show\}/);
  assert.match(layout, /onFocus=\{show\}/);
  assert.match(layout, /getBoundingClientRect\(\)/);
  assert.match(styles, /\.dashboard-navigation-tooltip \{[\s\S]*?position: fixed/);
  assert.match(styles, /prefers-reduced-motion: reduce[\s\S]*?\.dashboard-navigation-tooltip/);
});

test("desktop sidebar has no header gap or resize control and mobile keeps its close button", async () => {
  const layout = await source("../routes/dashboard/layout.tsx");
  const styles = await source("../admin-design.css");
  const sidebarStart = layout.indexOf("<aside");
  const sidebarHeaderEnd = layout.indexOf("<nav className=\"dashboard-shell__sidebar-nav", sidebarStart);
  const sidebarHeader = layout.slice(sidebarStart, sidebarHeaderEnd);
  const topbarStart = layout.indexOf("<header className=\"dashboard-shell__topbar");
  const topbarEnd = layout.indexOf("</header>", topbarStart);
  const topbar = layout.slice(topbarStart, topbarEnd);

  assert.doesNotMatch(sidebarHeader, /<SiteLogo|to="\/"/);
  assert.doesNotMatch(sidebarHeader, /dashboard-shell__sidebar-toggle|cursor-col-resize|onMouseDown/);
  assert.match(sidebarHeader, /h-16 w-full shrink-0 items-center px-3 lg:hidden/);
  assert.match(sidebarHeader, /aria-label="关闭侧边栏"/);
  assert.match(layout, /className=\{`dashboard-shell__sidebar fixed[^`]*w-20[^`]*transition-transform/);
  assert.match(layout, /className="dashboard-shell__main-frame relative z-10 lg:pl-20"/);
  assert.match(topbar, /<Link to="\/" aria-label="返回 TARSGO 官网"[\s\S]*?<SiteLogo/);
  assert.match(topbar, /dashboard-shell__topbar-logo/);
  assert.match(topbar, /<ThemeControl className="ml-auto" \/>/);
  assert.match(styles, /\.dashboard-shell__topbar-logo \{[\s\S]*?opacity: 0\.82/);
  assert.match(styles, /\.dashboard-shell__topbar-logo:focus-visible/);
  assert.match(styles, /@media \(min-width: 1024px\)[\s\S]*?\.dashboard-shell__user-menu/);
  assert.doesNotMatch(layout, /title=\{title\}|title=\{isSidebarCollapsed \? currentUserName/);
});
