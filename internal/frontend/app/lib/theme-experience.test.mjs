import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
const themeControl = read("../components/theme-control.tsx");
const glassScene = read("../components/glass-switch-scene.ts");
const provider = read("../components/theme-provider.tsx");
const labScene = read("../components/theme-lab-scene.ts");
const lab = read("../routes/lab.tsx");
const styles = read("../app.css");
const labStyles = read("../routes/lab.css");
const routes = read("../routes.ts");
const footer = read("../components/public-footer.tsx");
const navbar = read("../components/navbar.tsx");
const dashboard = read("../routes/dashboard/layout.tsx");

test("both navigations use the original single theme provider", () => {
  assert.match(navbar, /<ThemeControl \/>/);
  assert.match(dashboard, /<ThemeControl \/>/);
  assert.match(themeControl, /useTheme\(\)/);
  assert.match(themeControl, /setPreference\(to \? "light" : "dark"\)/);
  assert.match(themeControl, /role="switch"/);
  assert.match(themeControl, /aria-label="浅色模式"/);
  assert.match(themeControl, /aria-checked=\{resolvedTheme === "light"\}/);
  assert.match(themeControl, /document\.documentElement\.dataset\.theme === "light"/);
  assert.match(provider, /jijia-theme-preference/);
  assert.match(provider, /addEventListener\("storage"/);
});

test("glass light switch restores the source's detailed renderer and continuous drag", () => {
  assert.match(styles, /\.theme-glass-switch\s*\{/);
  assert.match(styles, /\.theme-glass-switch__canvas\s*\{/);
  assert.doesNotMatch(styles, /\.theme-light-switch\s*\{/);
  assert.match(themeControl, /createGlassSwitchScene\(canvas\)/);
  assert.match(themeControl, /addEventListener\("pointermove", onMove/);
  assert.match(themeControl, /addEventListener\("pointercancel", onCancel/);
  assert.match(themeControl, /addEventListener\("keydown", onKeyDown/);
  assert.match(themeControl, /Math\.exp\(-omega \* dt\)/);
  assert.match(themeControl, /prefers-reduced-motion: reduce/);
  assert.match(themeControl, /document\.hidden/);
  assert.match(glassScene, /function toLab\(/);
  assert.match(glassScene, /function fromLab\(/);
  assert.match(glassScene, /function perimeter\(/);
  assert.match(glassScene, /const half = mix\(\.22,\.19,a\), steps = 90/);
  assert.match(glassScene, /Math\.sin\(Math\.PI\*f\)\*1\.1/);
  assert.match(glassScene, /ctx\.translate\(-45, -43\)/);
  assert.match(glassScene, /knob = \{ y: 70, size: 140, radius: 46, left: 72, travel: 156 \}/);
  assert.match(glassScene, /Math\.min\(window\.devicePixelRatio \|\| 1, 3\)/);
});

test("independent campus lab keeps its original scene without a second theme state", () => {
  assert.match(routes, /route\("lab", "routes\/lab\.tsx"\)/);
  assert.match(footer, /to="\/lab"/);
  assert.match(lab, /paintThemeLab\(/);
  assert.match(lab, /type="range"/);
  assert.match(lab, /aria-valuetext=\{clock\}/);
  assert.match(lab, /<Navbar \/>/);
  assert.match(lab, /<PublicFooter \/>/);
  assert.doesNotMatch(lab, /setPreference|localStorage|requestAnimationFrame/);
  assert.match(labScene, /export function paintThemeLab\(/);
  assert.match(labStyles, /\.lab-scene\s*\{[^}]*image-rendering: pixelated/s);
});
