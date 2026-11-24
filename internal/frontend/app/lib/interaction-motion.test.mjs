import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("shared buttons press without animating disabled controls or reduced-motion users", async () => {
  const app = await source("../app.css");
  const admin = await source("../admin-design.css");
  assert.match(app, /\.motion-button:active:not\(:disabled\)/);
  assert.match(admin, /\.admin-design \.admin-button:active:not\(:disabled\)/);
  assert.match(app, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation-duration: 0\.01ms !important/);
});

test("dashboard menu icon follows the real expanded state", async () => {
  const layout = await source("../routes/dashboard/layout.tsx");
  const styles = await source("../admin-design.css");
  assert.match(layout, /aria-expanded=\{sidebarOpen\}/);
  assert.match(styles, /sidebar-toggle\[aria-expanded="true"\] svg path:first-child/);
  assert.match(styles, /sidebar-toggle\[aria-expanded="true"\] svg path:last-child/);
});

test("home image cards do not retain the text-only ripple", async () => {
  const card = await source("../components/home-visual-navigation.tsx");
  const styles = await source("../app.css");
  assert.doesNotMatch(card, /home-visual-card--ripple|home-ripple-x/);
  assert.doesNotMatch(styles, /home-card-ripple/);
});

test("community feedback only starts after confirmed activation", async () => {
  const thread = await source("../routes/dashboard/community-post.tsx");
  const styles = await source("../routes/dashboard/community.css");
  assert.match(thread, /if \(active && state\.active\) showConfirmedReaction\(button, kind\)/);
  assert.match(thread, /if \(active && result\.active\) showConfirmedReaction\(button, "like"\)/);
  assert.match(thread, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(styles, /community-reaction-sparks/);
  assert.match(styles, /community-bookmark-settle/);
});

test("salon drag feedback preserves the existing slider and drag state", async () => {
  const component = await source("../components/salon-schedule-picker.tsx");
  const styles = await source("../components/salon-schedule-picker.css");
  assert.match(component, /setPreview\(\{ handle: d\.handle, minute \}\)/);
  assert.match(component, /data-dragging=\{preview\?\.handle === handle/);
  assert.match(styles, /salon-time-handle\[data-dragging\] \.salon-handle-line/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
