import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const navbar = await readFile(new URL("../components/navbar.tsx", import.meta.url), "utf8");
const themeControl = await readFile(new URL("../components/theme-control.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app.css", import.meta.url), "utf8");

test("desktop links and authentication controls share the wide-screen breakpoint", () => {
  assert.match(navbar, /className="hidden xl:flex items-center gap-5 2xl:gap-8"/);
  assert.match(navbar, /className="hidden w-\[220px\] shrink-0 items-center justify-end gap-3 xl:flex"/);
  assert.match(navbar, /navbar-menu-toggle xl:hidden/);
  assert.doesNotMatch(navbar, /navbar-micro-specialty/);
  assert.match(navbar, /SiteLogo/);
  assert.match(navbar, /matchMedia\("\(min-width: 1280px\)"\)/);
});

test("mobile navigation exposes its disclosure state and Escape closes with focus restored", () => {
  assert.match(navbar, /aria-label=\{visibleUser[\s\S]*?展开导航菜单/);
  assert.match(navbar, /aria-expanded=\{menuOpen\}/);
  assert.match(navbar, /aria-controls="site-mobile-menu"/);
  assert.match(navbar, /id="site-mobile-menu"[\s\S]*?hidden=\{!menuOpen\}/);
  assert.match(navbar, /event\.key !== "Escape"/);
  assert.match(navbar, /mobileMenuButtonRef\.current\?\.focus\(\)/);
  assert.match(navbar, /focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-\[#D0AD69\]/);
  assert.match(navbar, /className="site-mobile-menu xl:hidden"/);
  assert.match(styles, /\.site-mobile-menu\s*\{[\s\S]*?width:\s*min\(22rem, calc\(100vw - 2rem\)\)[\s\S]*?overflow-y:\s*auto/);
  assert.match(styles, /@media \(min-width: 1280px\)\s*\{[\s\S]*?\.navbar-menu-toggle\s*\{\s*display:\s*none;/);
  const mobileMenuCloseEffect = navbar.match(/useEffect\(\(\) => \{\s*if \(!menuOpen\) return;([\s\S]*?)\}, \[menuOpen\]\);/)?.[1] ?? "";
  assert.match(mobileMenuCloseEffect, /document\.addEventListener\("pointerdown", closeOnOutsidePointer\)/);
  assert.match(mobileMenuCloseEffect, /mobileMenuRef\.current\?\.contains\(target\) \|\| mobileMenuButtonRef\.current\?\.contains\(target\)/);
  assert.doesNotMatch(mobileMenuCloseEffect, /mousedown|touchstart/);
});

test("mobile links close the menu and desktop resize moves focus to a visible navigation link", () => {
  assert.match(navbar, /function closeMobileMenu\(\)[\s\S]*?setMenuOpen\(false\)[\s\S]*?mobileMenuButtonRef\.current\?\.focus\(\)/);
  assert.match(navbar, /onClick=\{closeMobileMenu\}/);
  assert.match(navbar, /desktopNavLinksRef\.current\?\.querySelector<HTMLAnchorElement>\("a"\)\?\.focus\(\)/);
  assert.match(navbar, /desktopAuthAreaRef\.current\?\.contains\(activeElement\)/);
  assert.match(navbar, /if \(focusedDesktopControl\) \{\s*mobileMenuButtonRef\.current\?\.focus\(\)/);
});

test("the header uses a role-aware identity menu and keeps account switching keyboard accessible", () => {
  const mainLinks = navbar.match(/const navLinks = \[([\s\S]*?)\];/)?.[1] ?? "";
  assert.doesNotMatch(mainLinks, /低空微专业/);
  assert.doesNotMatch(navbar, /navbar-micro-specialty|to=.*micro-specialties/);
  assert.match(navbar, /NavbarIdentityDetail user=\{visibleUser\} identity=\{groupIdentity\}/);
  assert.match(navbar, /resolveGroupIdentity/);
  assert.match(navbar, /管理工作台/);
  assert.match(navbar, /个人工作台/);
  assert.match(navbar, /切换或添加账号/);
  assert.match(navbar, /getAccountSwitchHref/);
  assert.match(navbar, /subscribeAccountSessionChange/);
  assert.match(navbar, /profileButtonRef\.current\?\.focus\(\)/);
  assert.match(navbar, /event\.key !== "ArrowDown" && event\.key !== "ArrowUp" && event\.key !== "Home" && event\.key !== "End"/);
  assert.match(navbar, /items\[nextIndex\]\.focus\(\)/);
  assert.match(navbar, /跟随系统主题/);
  assert.match(navbar, /setPreference\("system"\)/);
  assert.match(navbar, /className="navbar-mobile-account"/);
  assert.match(navbar, /className="navbar-mobile-account__name"/);
  assert.match(themeControl, /aria-label=\{`切换到\$\{nextTheme/);
  assert.match(themeControl, /onClick=\{\(\) => setPreference\(nextTheme\)\}/);
  assert.match(styles, /\.theme-control--navbar \.theme-control__toggle\s*\{[\s\S]*?width:\s*2\.75rem;[\s\S]*?height:\s*2\.75rem;/);
  assert.match(styles, /\.navbar-menu-toggle,\s*\.theme-control--navbar \.theme-control__toggle\s*\{[\s\S]*?width:\s*2\.75rem;[\s\S]*?height:\s*2\.75rem;/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.theme-control__toggle svg[\s\S]*?transition-duration:\s*0\.01ms !important;/);
  assert.match(styles, /\.navbar-group-badge\s*\{[\s\S]*?border-radius:\s*999px/);
  assert.match(styles, /\.navbar-mobile-account__actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3/);
});

test("authentication loading, guest, and member states stay distinct and reserve identity space", () => {
  assert.match(navbar, /visibleUser === undefined \? \([\s\S]*?visibleUser \? \(/);
  assert.match(navbar, /visibleAuthError = visibleUser === undefined/);
  assert.match(navbar, /function retryIdentityCheck\(\)/);
  assert.match(navbar, /setObservedUser\(undefined\);\s*setGroupState\(null\);/);
  assert.match(navbar, /<NavbarAuthLoadingStatus \/>/);
  assert.match(navbar, /role="status"[\s\S]*?aria-busy="true"/);
  assert.match(navbar, /groupIdentityLoading/);
  assert.match(navbar, /setGroupState\(\{ userId, status: "loading" \}\)/);
  assert.doesNotMatch(navbar, /正在确认组别/);
  assert.match(navbar, /setUserMenuOpen\(false\)/);
  assert.match(styles, /\.navbar-auth-loading\s*\{[\s\S]*?min-height:\s*2\.75rem/);
  assert.match(styles, /\.navbar-identity-detail--compact\s*\{\s*min-height:\s*17px/);
  assert.match(styles, /\.navbar-user-menu\s*\{/);
  assert.match(styles, /\.navbar-user-menu\s+\[role="menuitem"\]:focus-visible/);
  assert.match(styles, /\.navbar-menu-group-mark\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(styles, /\.navbar-auth-loading__avatar,[\s\S]*?animation:\s*none !important/);
});
