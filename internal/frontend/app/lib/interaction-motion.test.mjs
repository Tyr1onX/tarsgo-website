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

test("registration dialogs use shared interruptible transitions instead of restarting JS animations", async () => {
  const form = await source("../routes/admin/form-config.tsx");
  const styles = await source("../app.css");
  assert.doesNotMatch(form, /\.animate\(/);
  assert.match(form, /inert=\{drawerClosing\}/);
  assert.match(form, /inert=\{previewClosing\}/);
  assert.match(form, /useModalAccessibility\(drawerOpen && !drawerClosing/);
  assert.match(styles, /\.registration-drawer\[data-state="closed"\] \.registration-drawer__panel/);
});

test("static honor counts stay accurate and XP changes start from the displayed value", async () => {
  const honors = await source("../components/events-and-honors-archive.tsx");
  const growth = await source("../components/community-growth.tsx");
  assert.doesNotMatch(honors, /AnimatedCounter/);
  assert.match(growth, /const from = displayedRef.current/);
  assert.match(growth, /cancelAnimationFrame\(frame\)/);
  assert.match(growth, /className="sr-only"\>\{targetXp.toLocaleString/);
});

test("hidden notifications cannot be focused and keyboard focus pauses dismissal", async () => {
  const notify = await source("../components/notify.tsx");
  assert.match(notify, /inert=\{!open\}/);
  assert.match(notify, /onFocus=.*setPaused\(true\)/);
  assert.match(notify, /contains\(document.activeElement\)/);
});
