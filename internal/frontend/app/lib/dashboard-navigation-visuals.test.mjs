import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layout = await readFile(new URL("../routes/dashboard/layout.tsx", import.meta.url), "utf8");
const adminCss = await readFile(new URL("../admin-design.css", import.meta.url), "utf8");

test("expanded parent groups do not receive the current-page selected treatment", () => {
  const parentItem = layout.slice(layout.indexOf('if ("children" in item)'), layout.indexOf("return (\n    <NavLink", layout.indexOf('if ("children" in item)')));
  const parentButton = parentItem.slice(parentItem.indexOf("<button"), parentItem.indexOf("</button>"));
  assert.match(parentButton, /dashboard-nav-link--expanded/);
  assert.doesNotMatch(parentButton, /dashboard-nav-link--active/);
  assert.match(parentItem, /aria-expanded=\{isExpanded\}/);
  assert.match(parentItem, /aria-hidden=\{!isExpanded\}/);
  assert.match(parentItem, /tabIndex=\{isExpanded \? 0 : -1\}/);
});

test("selected destinations use a soft marker while keyboard focus has its own visible ring", () => {
  assert.match(adminCss, /\.dashboard-nav-link--active::before[\s\S]*?background: var\(--admin-accent\)/);
  assert.match(adminCss, /\.dashboard-nav-link:focus-visible[\s\S]*?outline: 2px solid var\(--admin-accent\)/);
  assert.match(adminCss, /\.dashboard-nav-link--expanded[\s\S]*?background: color-mix\(in srgb, var\(--admin-text\) 4%, transparent\)/);
});
