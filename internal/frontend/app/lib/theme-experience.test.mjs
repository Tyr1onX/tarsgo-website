import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
const themeControl = read("../components/theme-control.tsx");
const provider = read("../components/theme-provider.tsx");
const scene = read("../components/theme-lab-scene.ts");
const lab = read("../routes/lab.tsx");
const styles = read("../app.css");
const labStyles = read("../routes/lab.css");
const routes = read("../routes.ts");
const footer = read("../components/public-footer.tsx");
const navbar = read("../components/navbar.tsx");
const dashboard = read("../routes/dashboard/layout.tsx");

test("both navigations use one lightweight theme control and the existing theme provider", () => {
  assert.match(navbar, /<ThemeControl \/>/);
  assert.match(dashboard, /<ThemeControl \/>/);
  assert.match(themeControl, /useTheme\(\)/);
  assert.match(themeControl, /setPreference\(dark \? "light" : "dark"\)/);
  assert.match(themeControl, /role="switch"/);
  assert.match(themeControl, /aria-checked=\{dark\}/);
  assert.doesNotMatch(themeControl, /canvas|requestAnimationFrame|paintThemeLab/);
  assert.match(provider, /jijia-theme-preference/);
  assert.match(provider, /addEventListener\("storage"/);
});

test("pixel glass switch retains day-left night-right and respects reduced motion", () => {
  assert.match(styles, /\.theme-light-switch\s*\{/);
  assert.match(styles, /\.theme-light-switch__thumb\s*\{[^}]*transform: translateX\(0\)/s);
  assert.match(styles, /:root\[data-theme="dark"\] \.theme-light-switch \.theme-light-switch__thumb\s*\{[^}]*transform: translateX\(36px\)/s);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.theme-light-switch__thumb,[\s\S]*?transition: none;/);
  assert.doesNotMatch(styles, /\.theme-lab-switch\s*\{/);
  assert.match(themeControl, /theme-light-switch__sun/);
  assert.match(themeControl, /theme-light-switch__moon/);
});

test("interactive lab is isolated, keyboard accessible and loaded by its own route", () => {
  assert.match(routes, /route\("lab", "routes\/lab\.tsx"\)/);
  assert.match(footer, /to="\/lab"/);
  assert.match(lab, /paintThemeLab\(/);
  assert.match(lab, /type="range"/);
  assert.match(lab, /aria-valuetext=\{clock\}/);
  assert.match(lab, /<Navbar \/>/);
  assert.match(lab, /<PublicFooter \/>/);
  assert.doesNotMatch(lab, /setPreference|localStorage|requestAnimationFrame/);
  assert.match(scene, /export function paintThemeLab\(/);
  assert.match(labStyles, /\.lab-scene\s*\{[^}]*image-rendering: pixelated/s);
});
