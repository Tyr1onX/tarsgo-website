import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
const root = readFileSync(new URL("../root.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../fonts.css", import.meta.url), "utf8");
test("site fonts are same-origin WOFF2 with fallback and bundled license provenance", () => {
  assert.doesNotMatch(root, /fonts\.googleapis|fonts\.gstatic/);
  const sources = [...css.matchAll(/url\("([^\"]+)"\)/g)].map((match) => match[1]);
  assert.equal(sources.length, 4);
  for (const source of sources) {
    const bytes = readFileSync(new URL(`../${source}`, import.meta.url));
    assert.equal(bytes.subarray(0, 4).toString(), "wOF2");
  }
  assert.equal([...css.matchAll(/font-display: swap/g)].length, sources.length);
  for (const font of ["inter", "geist-mono", "anton"]) assert.ok(existsSync(new URL(`../../../../public/fonts/${font}-LICENSE.txt`, import.meta.url)));
});
