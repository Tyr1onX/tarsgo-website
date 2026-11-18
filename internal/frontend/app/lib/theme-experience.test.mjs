import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
const themeControl = read("../components/theme-control.tsx");
const glassScene = read("../components/glass-switch-scene.ts");
const provider = read("../components/theme-provider.tsx");
const styles = read("../app.css");
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
  assert.match(glassScene, /const half = mix\(\.22,\.19,a\)/);
  assert.match(glassScene, /const edgeSteps = 40/);
  assert.match(glassScene, /Math\.sin\(Math\.PI\*f\)\*1\.1/);
  assert.match(glassScene, /ctx\.translate\(-10, -10\)/);
  assert.match(glassScene, /knob = \{ y: 70, size: 140, radius: 46, left: 72, travel: 156 \}/);
  assert.match(glassScene, /Math\.min\(window\.devicePixelRatio \|\| 1, 3\)/);
});

test("retired light lab is fully removed from routes, footer and source", () => {
  assert.doesNotMatch(routes, /route\("lab",/);
  assert.doesNotMatch(footer, /to="\/lab"/);
  for (const file of ["../routes/lab.tsx", "../routes/lab.css", "../components/theme-lab-scene.ts"]) {
    assert.equal(existsSync(new URL(file, import.meta.url)), false, `unused ${file} must be deleted`);
  }
});

test("compact switch keeps a full-height hit target without a full-size canvas", () => {
  const wrapper = styles.match(/\.theme-glass-switch\s*\{([^}]*)\}/)?.[1] ?? "";
  const art = styles.match(/\.theme-glass-switch__canvas\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(wrapper, /width:\s*60px/);
  assert.match(wrapper, /height:\s*44px/);
  assert.match(art, /width:\s*72px/);
  assert.match(art, /height:\s*44px/);
  assert.match(art, /left:\s*-6px/);
});

test("drag painting is frame-coalesced, and canvas geometry is not queried per frame", () => {
  const dragging = themeControl.match(/const onMove = \(event: PointerEvent\) => \{([\s\S]*?)\n    \};/)?.[1] ?? "";
  assert.match(dragging, /requestPaint\(\)/);
  assert.doesNotMatch(dragging, /paint\(/);
  assert.match(themeControl, /requestAnimationFrame\(frame\)/);
  assert.match(themeControl, /scene\.resize\(\)/);
  assert.match(themeControl, /}, 750\)/);
  assert.match(glassScene, /const grains = paired\.map/);
  assert.match(glassScene, /const edgePoints = Array\.from/);
  const render = glassScene.slice(glassScene.indexOf("function render("));
  assert.doesNotMatch(render, /getBoundingClientRect/);
  assert.doesNotMatch(render, /hash\(/);
});

test("page transition no longer assigns effects to every descendant", () => {
  assert.match(styles, /html\[data-theme-transition\] :is\(/);
  assert.doesNotMatch(styles, /html\[data-theme-transition\] body \*/);
  assert.match(styles, /\.dashboard-shell__sidebar/);
  assert.match(styles, /\.site-navbar/);
});

test("transparent overscan preserves track size while leaving shadow clearance", () => {
  assert.match(glassScene, /ctx\.setTransform\(width \/ 420, 0, 0, height \/ 260/);
  assert.match(glassScene, /ctx\.translate\(-10, -10\)/);
  assert.match(glassScene, /ctx\.clearRect\(0, 0, width, height\)/);
  assert.doesNotMatch(styles, /\.theme-glass-switch__canvas\s*\{[^}]*background:/s);
  // The visible track remains essentially unchanged; only the transparent buffer grows.
  const previous = [(60 - 45) * 60 / 350, 6 + (58 - 43) * 32 / 190, 320 * 60 / 350, 164 * 32 / 190];
  const withBleed = [-6 + (60 - 10) * 72 / 420, (58 - 10) * 44 / 260, 320 * 72 / 420, 164 * 44 / 260];
  for (let i = 0; i < previous.length; i++) {
    assert.ok(Math.abs(previous[i] - withBleed[i]) < 0.5, `track geometry ${i} drifted`);
  }
});
