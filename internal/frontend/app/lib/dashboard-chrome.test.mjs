import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("collapsed sidebar labels appear beside icons on hover and keyboard focus", async () => {
  const layout = await source("../routes/dashboard/layout.tsx");
  const styles = await source("../admin-design.css");
  assert.match(layout, /<DashboardTooltip label=\{collapsed \? tooltip : undefined\}>/);
  assert.match(layout, /badgeLabel \?\? `\$\{badgeCount\} 项待处理`/);
  assert.match(layout, /aria-label=\{isSidebarCollapsed \? "展开侧边栏" : "收起侧边栏"\}/);
  assert.doesNotMatch(layout, /DashboardTooltip label=\{isSidebarCollapsed \? "展开侧边栏" : "收起侧边栏"\}/);
  assert.match(layout, /aria-label=\{hasBadge \? `\$\{item\.label\}，/);
  assert.match(layout, /<DashboardTooltip label=\{isSidebarCollapsed && !userMenuOpen \? `\$\{currentUserName\} · 账号菜单` : undefined\}>/);
  assert.match(layout, /createPortal\([\s\S]*?role="tooltip"/);
  assert.match(layout, /onPointerEnter=\{show\}/);
  assert.match(layout, /onFocus=\{show\}/);
  assert.match(layout, /getBoundingClientRect\(\)/);
  assert.match(styles, /\.dashboard-navigation-tooltip \{[\s\S]*?position: fixed/);
  assert.match(styles, /prefers-reduced-motion: reduce[\s\S]*?\.dashboard-navigation-tooltip/);
});

test("the sidebar header keeps only its aligned toggle and the small logo lives in the top bar", async () => {
  const layout = await source("../routes/dashboard/layout.tsx");
  const styles = await source("../admin-design.css");
  const sidebarStart = layout.indexOf("<aside");
  const sidebarHeaderEnd = layout.indexOf("<nav className=\"dashboard-shell__sidebar-nav", sidebarStart);
  const sidebarHeader = layout.slice(sidebarStart, sidebarHeaderEnd);
  const topbarStart = layout.indexOf("<header className=\"dashboard-shell__topbar");
  const topbarEnd = layout.indexOf("</header>", topbarStart);
  const topbar = layout.slice(topbarStart, topbarEnd);

  assert.doesNotMatch(sidebarHeader, /<SiteLogo|to="\/"/);
  assert.match(sidebarHeader, /<button[\s\S]*?dashboard-shell__sidebar-toggle[\s\S]*?收起侧边栏/);
  assert.match(sidebarHeader, /isSidebarCollapsed \? "justify-center px-2" : "justify-start px-3"/);
  assert.match(sidebarHeader, /h-10 w-10/);
  assert.match(topbar, /<Link to="\/" aria-label="返回 TARSGO 官网"[\s\S]*?<SiteLogo/);
  assert.match(topbar, /dashboard-shell__topbar-logo/);
  assert.match(topbar, /<ThemeControl className="ml-auto" \/>/);
  assert.match(styles, /\.dashboard-shell__topbar-logo \{[\s\S]*?opacity: 0\.82/);
  assert.match(styles, /\.dashboard-shell__topbar-logo:focus-visible/);
  assert.doesNotMatch(layout, /title=\{title\}|title=\{isSidebarCollapsed \? currentUserName/);
});
