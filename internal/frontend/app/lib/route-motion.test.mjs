import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = await readFile(new URL("../root.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app.css", import.meta.url), "utf8");
const home = await readFile(new URL("../routes/home.tsx", import.meta.url), "utf8");
const microSpecialty = await readFile(new URL("../routes/micro-specialty-low-altitude.tsx", import.meta.url), "utf8");

test("the route indicator reports pending navigation immediately without estimating progress", () => {
  assert.match(root, /\{isNavigating \?/);
  assert.match(root, /className="route-progress"/);
  assert.match(root, /route-progress__line/);
  assert.match(root, /role="status" aria-live="polite"/);
  assert.match(styles, /\.route-progress__line/);
  assert.doesNotMatch(styles, /route-progress-drift|route-progress-complete/);
  assert.doesNotMatch(root, /aria-valuenow|role="progressbar"/);
});

test("fast navigation completion cancels the indicator without replacing route scroll restoration", () => {
  assert.match(root, /useLayoutEffect/);
  assert.match(root, /location\.pathname/);
  assert.match(root, /startPublicPageTransition/);
  assert.match(root, /<ScrollRestoration \/>/);
  assert.match(root, /navigationPath \?\? location\.pathname/);
});

test("public page content transitions independently of the stable navigation bar", () => {
  const navbarIndex = home.indexOf("<Navbar currentUser={currentUser} authError={authError} />");
  const contentIndex = home.indexOf('<div className="public-route-content">');
  assert.ok(navbarIndex >= 0 && contentIndex > navbarIndex);
  assert.match(microSpecialty, /<Navbar \/>[\s\S]*?<main className="public-route-content">/);
});

test("the public page transition respects reduced motion", () => {
  assert.match(root, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
});
