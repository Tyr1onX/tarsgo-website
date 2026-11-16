import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const componentPath = fileURLToPath(
  new URL("../components/about-team-page.tsx", import.meta.url),
);
const assetDirectory = fileURLToPath(
  new URL("../../../../public/assets/images/", import.meta.url),
);

test("about page reuses six existing WebP photos", () => {
  const component = readFileSync(componentPath, "utf8");
  const paths = [...component.matchAll(/\/assets\/images\/([\w/-]+\.webp)/g)]
    .map((match) => match[1]);

  assert.equal(paths.length, 6);
  assert.equal(new Set(paths).size, 6);
  assert.ok(paths.every((path) => !path.startsWith("About/")));

  for (const path of paths) {
    const data = readFileSync(join(assetDirectory, path));
    assert.equal(data.toString("ascii", 0, 4), "RIFF", `${path} should be a WebP image`);
    assert.equal(data.toString("ascii", 8, 12), "WEBP", `${path} should be a WebP image`);
  }
});
