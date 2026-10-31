import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appCss = readFileSync(new URL("../app.css", import.meta.url), "utf8");
const adminCss = readFileSync(new URL("../admin-design.css", import.meta.url), "utf8");
const homeRoute = readFileSync(new URL("../routes/home.tsx", import.meta.url), "utf8");

test("both themes provide semantic foreground and status tokens", () => {
  for (const token of ["--theme-accent-text", "--theme-success", "--theme-warning", "--theme-danger", "--theme-neutral"]) {
    assert.equal((appCss.match(new RegExp(token + "\\s*:", "g")) ?? []).length, 2, token + " should exist in dark and light themes");
  }
});

test("admin component colors resolve through the shared theme palette", () => {
  assert.match(adminCss, /--admin-surface:\s*var\(--theme-card\)/);
  assert.match(adminCss, /--admin-danger:\s*var\(--theme-danger\)/);
  assert.match(adminCss, /--admin-success:\s*var\(--theme-success\)/);
});

test("primary button keeps its foreground paired with its theme background", () => {
  assert.match(adminCss, /\.admin-design \.admin-button--primary\s*\{[^}]*background:\s*var\(--theme-accent-button\);[^}]*color:\s*var\(--admin-accent-on\);/s);
});

test("admin theme no longer overrides ordinary utility colors by class substring", () => {
  assert.doesNotMatch(adminCss, /\[class\*=/);
});

test("shared button hover shadow follows the selected theme accent", () => {
  assert.match(appCss, /\.motion-button:hover\s*\{[^}]*box-shadow:[^;]*var\(--theme-accent-contrast\)/s);
});

test("public image hero keeps its intentionally light text over the dark shade", () => {
  assert.match(homeRoute, /public-home-hero/);
  assert.match(homeRoute, /text-white/);
  assert.match(appCss, /\.public-home-hero-shade\s*\{[^}]*rgba\(10, 14, 14/s);
});
