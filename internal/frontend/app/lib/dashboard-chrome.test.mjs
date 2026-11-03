import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("expanded sidebar keeps its labels visible and the account menu stays with the avatar", async () => {
  const layout = await source("../routes/dashboard/layout.tsx");
  const styles = await source("../admin-design.css");
  assert.doesNotMatch(layout, /DashboardTooltip|compact|sidebarCollapsed|sidebarWidth|isResizingSidebar|cursor-col-resize/);
  assert.match(layout, /aria-label=\{item\.label\}/);
  assert.match(layout, /<span className="min-w-0 flex-1 truncate">\{item\.label\}<\/span>/);
  assert.match(layout, /const \[sidebarOpen, setSidebarOpen\] = useState\(false\)/);
  assert.match(layout, /aria-label=\{sidebarOpen \? "收起侧边栏" : "展开侧边栏"\}/);
  assert.doesNotMatch(layout, /candidateTodoCount|leaveActionableCount|managementLabel|badgeLabel/);
  assert.match(layout, /dashboard-shell__avatar-button/);
  assert.match(layout, /dashboard-shell__user-menu-role[\s\S]*?\{currentUserName \|\| getAuthUserRoleLabel\(currentUser\)\}[\s\S]*?\{currentUser\.email\}/);
  for (const action of ["我的主页", "帮助与工作手册", "切换账号", "添加账号", "管理账号", "退出当前账号"]) assert.match(layout, new RegExp(action));
  assert.match(layout, /createPortal\([\s\S]*?dashboard-user-menu[\s\S]*?document\.body/);
  assert.match(layout, /getBoundingClientRect\(\)/);
  assert.match(styles, /\.dashboard-shell__user-menu \{[\s\S]*?position: fixed/);
  assert.match(styles, /prefers-reduced-motion: reduce[\s\S]*?\.dashboard-shell__avatar-button/);
});

test("the full-width header controls the sidebar without an internal close or resize control", async () => {
  const layout = await source("../routes/dashboard/layout.tsx");
  const styles = await source("../admin-design.css");
  const sidebarStart = layout.indexOf("<aside");
  const sidebarEnd = layout.indexOf("</aside>", sidebarStart);
  const sidebar = layout.slice(sidebarStart, sidebarEnd);
  const topbarStart = layout.indexOf("<header className=\"dashboard-shell__topbar");
  const topbarEnd = layout.indexOf("</header>", topbarStart);
  const topbar = layout.slice(topbarStart, topbarEnd);

  assert.match(layout, /<div className="dashboard-shell__body">[\s\S]*?<aside[\s\S]*?dashboard-shell__main-frame/);
  assert.match(sidebar, /<nav className="dashboard-shell__sidebar-nav/);
  assert.doesNotMatch(sidebar, /<SiteLogo|dashboard-shell__sidebar-toggle|aria-label="关闭侧边栏"|cursor-col-resize|onMouseDown/);
  assert.match(layout, /className=\{`dashboard-shell__sidebar fixed[^`]*lg:w-64[^`]*lg:w-0/);
  assert.match(topbar, /onClick=\{toggleSidebar\}/);
  assert.match(topbar, /aria-controls="dashboard-sidebar"/);
  assert.match(topbar, /aria-expanded=\{sidebarOpen\}/);
  assert.match(topbar, /<Link to="\/" aria-label="返回 TARSGO 官网"[\s\S]*?<SiteLogo/);
  assert.match(topbar, /dashboard-shell__topbar-logo/);
  assert.match(topbar, /<ThemeControl \/>/);
  assert.match(layout, /<header className="dashboard-shell__topbar sticky top-0/);
  assert.match(styles, /\.dashboard-shell__topbar-logo \{[\s\S]*?opacity: 0\.82/);
  assert.match(styles, /\.dashboard-shell__topbar-logo:focus-visible/);
  assert.match(styles, /\.dashboard-shell__page-title[\s\S]*?text-overflow: ellipsis/);
  assert.match(styles, /\.dashboard-shell__body \{[\s\S]*?display: flex/);
  assert.doesNotMatch(layout, /title=\{isSidebarCollapsed \? currentUserName/);
});
