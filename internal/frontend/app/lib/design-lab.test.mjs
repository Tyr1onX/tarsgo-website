import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../routes/design-lab.tsx", import.meta.url), "utf8");
const logo = await readFile(new URL("../../../../public/assets/images/Logo/tarsgo-logo-v5.svg", import.meta.url), "utf8");

test("experimental modules preserve exact source logo geometry", () => {
  const paths = Array.from(page.matchAll(/d: "(M[^"]+)"/g), ([, d]) => d);
  assert.equal(paths.length, 3);
  for (const d of paths) assert.ok(logo.includes('d="' + d + '"'));
  assert.match(page, /fillRule="evenodd"/);
});

test("design lab distinguishes experiments from assets and downloads original SVGs only", () => {
  assert.match(page, /#D0AD69/);
  assert.match(page, /#FFBF00/);
  assert.match(page, /探索方案/);
  assert.match(page, /概念样张/);
  assert.match(page, /tarsgo-logo-v5-light.svg/);
  assert.match(page, /tarsgo-logo-v5.svg/);
  assert.match(page, /<Navbar \/>/);
  assert.match(page, /<PublicFooter \/>/);
  assert.equal((page.match(/ download>/g) ?? []).length, 1);
});
