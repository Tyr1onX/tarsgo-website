import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const navbar = await readFile(new URL("../components/navbar.tsx", import.meta.url), "utf8");
const themeControl = await readFile(new URL("../components/theme-control.tsx", import.meta.url), "utf8");
const dashboardLayout = await readFile(new URL("../routes/dashboard/layout.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app.css", import.meta.url), "utf8");

test("the same compact header serves every viewport without public or hidden navigation", () => {
  assert.doesNotMatch(navbar, /navLinks|microSpecialtyNavLinks|visibleNavLinks|menuOpen|mobileMenu|desktopNavLinks|closeMobileMenu|variant/);
  assert.doesNotMatch(navbar, /to="\/(?:about|robots|events-and-honors|programs|join)"/);
  assert.doesNotMatch(styles, /site-mobile-menu|navbar-mobile-|navbar-menu-toggle|motion-nav-link/);
  assert.match(navbar, /to="\/"[\s\S]*?aria-label="TARSGO 首页"/);
  assert.match(navbar, /className="navbar-auth-area"/);
  assert.match(navbar, /to="\/login"/);
});

test("account actions reuse existing permissions and retain keyboard navigation", () => {
  assert.match(navbar, /getDashboardSectionMenu\(visibleUser\)/);
  assert.match(navbar, /filter\(\(item\) => item.key !== "community"\)/);
  assert.match(navbar, /切换账号/);
  assert.match(navbar, /退出登录/);
  assert.match(navbar, /getAccountSwitchHref/);
  assert.match(navbar, /subscribeAccountSessionChange/);
  assert.match(navbar, /aria-expanded=\{userMenuOpen\}/);
  assert.match(navbar, /aria-haspopup="menu"/);
  assert.match(navbar, /profileButtonRef\.current\?\.focus\(\)/);
  assert.match(navbar, /event\.key !== "ArrowDown" && event\.key !== "ArrowUp" && event\.key !== "Home" && event\.key !== "End"/);
  assert.match(navbar, /items\[nextIndex\]\.focus\(\)/);
  assert.match(themeControl, /onClick=\{\(\) => setPreference\(nextTheme\)\}/);
  assert.match(navbar, /<ThemeControl \/>/);
  assert.match(dashboardLayout, /<ThemeControl \/>/);
  assert.equal((themeControl.match(/<button\b/g) ?? []).length, 1);
  assert.doesNotMatch(themeControl, /systemOnly|__menu-toggle|__option/);
  assert.doesNotMatch(styles, /\.theme-control__menu-toggle|\.theme-control__options|\.theme-control--navbar/);
  assert.match(styles, /\.navbar-account-action\s*\{[\s\S]*?min-height:\s*2\.75rem/);
  assert.match(styles, /\.navbar-user-menu\s*\{[\s\S]*?width: min\(18rem, calc\(100vw - 2rem\)\)/);
});

test("authentication loading, guest, and member states stay distinct and reserve identity space", () => {
  assert.match(navbar, /visibleUser === undefined \? \([\s\S]*?visibleUser \? \(/);
  assert.match(navbar, /visibleAuthError = visibleUser === undefined/);
  assert.match(navbar, /function retryIdentityCheck\(\)/);
  assert.match(navbar, /setObservedUser\(undefined\);\s*setGroupState\(null\);/);
  assert.match(navbar, /<NavbarAuthLoadingStatus \/>/);
  assert.match(navbar, /role="status"[\s\S]*?aria-busy="true"/);
  assert.match(navbar, /groupIdentityLoading/);
  assert.match(navbar, /cachedGroup \? \{ userId, status: "ready", state: cachedGroup \} : \{ userId, status: "loading" \}/);
  assert.doesNotMatch(navbar, /正在确认组别/);
  assert.match(navbar, /setUserMenuOpen\(false\)/);
  assert.match(styles, /\.navbar-auth-loading\s*\{[\s\S]*?min-height:\s*2\.75rem/);
  assert.match(styles, /\.navbar-identity-detail--compact\s*\{\s*min-height:\s*17px/);
  assert.match(styles, /\.navbar-user-menu\s*\{/);
  assert.match(styles, /\.navbar-user-menu\s+\[role="menuitem"\]:focus-visible/);
  assert.match(styles, /\.navbar-auth-loading__avatar\s*\{\s*animation:\s*none !important/);
});

function luminance(hex) {
  return hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

test("robot counts meet AA on their real theme surfaces", () => {
  const dark = styles.match(/:root\s*\{([\s\S]*?)\}/)[1];
  const light = styles.match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)\}/)[1];
  for (const [selector, surface] of [["robot-gallery__filter-count", "surface"]]) {
    const token = styles.match(new RegExp(`\\.${selector}\\s*\\{[^}]*color:\\s*var\\(--theme-([\\w-]+)\\)`))[1];
    for (const theme of [dark, light]) {
      const color = name => theme.match(new RegExp(`--theme-${name}:\\s*(#[a-f\\d]+)`, "i"))[1];
      const values = [luminance(color(token)), luminance(color(surface))].sort((a,b) => b-a);
      assert.ok((values[0]+0.05)/(values[1]+0.05) >= 4.5, `${selector} must meet AA`);
    }
  }
});
