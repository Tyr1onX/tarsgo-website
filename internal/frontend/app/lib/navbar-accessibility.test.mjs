import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const navbar = await readFile(new URL("../components/navbar.tsx", import.meta.url), "utf8");

test("desktop links and authentication controls share the wide-screen breakpoint", () => {
  assert.match(navbar, /className="hidden xl:flex items-center gap-8"/);
  assert.match(navbar, /className="hidden w-\[174px\] shrink-0 items-center justify-end gap-3 xl:flex"/);
  assert.match(navbar, /className="xl:hidden rounded-lg/);
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
});

test("mobile links close the menu and desktop resize moves focus to a visible navigation link", () => {
  assert.match(navbar, /function closeMobileMenu\(\)[\s\S]*?setMenuOpen\(false\)[\s\S]*?mobileMenuButtonRef\.current\?\.focus\(\)/);
  assert.match(navbar, /onClick=\{closeMobileMenu\}/);
  assert.match(navbar, /desktopNavLinksRef\.current\?\.querySelector<HTMLAnchorElement>\("a"\)\?\.focus\(\)/);
  assert.match(navbar, /desktopAuthAreaRef\.current\?\.contains\(activeElement\)/);
  assert.match(navbar, /if \(focusedDesktopControl\) \{\s*mobileMenuButtonRef\.current\?\.focus\(\)/);
});
