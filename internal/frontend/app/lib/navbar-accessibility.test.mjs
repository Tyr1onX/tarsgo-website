import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const navbar = await readFile(new URL("../components/navbar.tsx", import.meta.url), "utf8");
const themeControl = await readFile(new URL("../components/theme-control.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app.css", import.meta.url), "utf8");

test("desktop links and authentication controls share the wide-screen breakpoint", () => {
  assert.match(navbar, /className="hidden xl:flex items-center gap-5 2xl:gap-8"/);
  assert.match(navbar, /className="hidden w-\[174px\] shrink-0 items-center justify-end gap-3 xl:flex"/);
  assert.match(navbar, /className="navbar-menu-toggle xl:hidden"/);
  assert.match(navbar, /navbar-micro-specialty navbar-micro-specialty--wide/);
  assert.match(navbar, /matchMedia\("\(min-width: 1280px\)"\)/);
});

test("mobile navigation exposes its disclosure state and Escape closes with focus restored", () => {
  assert.match(navbar, /aria-label=\{menuOpen \? "关闭导航菜单" : "展开导航菜单"\}/);
  assert.match(navbar, /aria-expanded=\{menuOpen\}/);
  assert.match(navbar, /aria-controls="site-mobile-menu"/);
  assert.match(navbar, /id="site-mobile-menu"[\s\S]*?hidden=\{!menuOpen\}/);
  assert.match(navbar, /event\.key !== "Escape"/);
  assert.match(navbar, /mobileMenuButtonRef\.current\?\.focus\(\)/);
  assert.match(navbar, /focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-\[#D0AD69\]/);
  assert.match(navbar, /className="site-mobile-menu xl:hidden"/);
  assert.match(styles, /\.site-mobile-menu\s*\{[\s\S]*?width:\s*min\(22rem, calc\(100vw - 2rem\)\)[\s\S]*?overflow-y:\s*auto/);
  assert.match(styles, /@media \(min-width: 768px\)\s*\{[\s\S]*?\.navbar-micro-specialty--wide\s*\{\s*display:\s*inline-flex;[\s\S]*?\.navbar-micro-specialty--panel\s*\{\s*display:\s*none;/);
  assert.match(styles, /@media \(min-width: 1280px\)\s*\{[\s\S]*?\.navbar-menu-toggle\s*\{\s*display:\s*none;/);
});

test("mobile links close the menu and desktop resize moves focus to a visible navigation link", () => {
  assert.match(navbar, /function closeMobileMenu\(\)[\s\S]*?setMenuOpen\(false\)[\s\S]*?mobileMenuButtonRef\.current\?\.focus\(\)/);
  assert.match(navbar, /onClick=\{closeMobileMenu\}/);
  assert.match(navbar, /desktopNavLinksRef\.current\?\.querySelector<HTMLAnchorElement>\("a"\)\?\.focus\(\)/);
  assert.match(navbar, /desktopAuthAreaRef\.current\?\.contains\(activeElement\)/);
  assert.match(navbar, /if \(focusedDesktopControl\) \{\s*mobileMenuButtonRef\.current\?\.focus\(\)/);
});

test("the micro-specialty is a single emphasized entry and the compact panel can restore system theme", () => {
  const mainLinks = navbar.match(/const navLinks = \[([\s\S]*?)\];/)?.[1] ?? "";
  assert.doesNotMatch(mainLinks, /低空微专业/);
  assert.match(navbar, /navbar-micro-specialty navbar-micro-specialty--panel/);
  assert.match(navbar, /跟随系统主题/);
  assert.match(navbar, /setPreference\("system"\)/);
  assert.match(navbar, /className="navbar-mobile-account"/);
  assert.match(navbar, /className="navbar-mobile-account__name"/);
  assert.match(themeControl, /aria-label=\{`切换到\$\{nextTheme/);
  assert.match(themeControl, /onClick=\{\(\) => setPreference\(nextTheme\)\}/);
  assert.match(styles, /\.theme-control--navbar \.theme-control__toggle\s*\{[\s\S]*?width:\s*2\.75rem;[\s\S]*?height:\s*2\.75rem;/);
  assert.match(styles, /\.navbar-menu-toggle,\s*\.theme-control--navbar \.theme-control__toggle\s*\{[\s\S]*?width:\s*2\.75rem;[\s\S]*?height:\s*2\.75rem;/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.theme-control__toggle svg[\s\S]*?transition-duration:\s*0\.01ms !important;/);
});
