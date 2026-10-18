import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const componentPath = fileURLToPath(
  new URL("../components/about-team-page.tsx", import.meta.url),
);
const assetDirectory = fileURLToPath(
  new URL("../../../../public/assets/images/About/", import.meta.url),
);

test("about page photos use content-fingerprinted source assets", () => {
  const component = readFileSync(componentPath, "utf8");
  const filenames = [...component.matchAll(/\/assets\/images\/About\/([\w-]+\.webp)/g)]
    .map((match) => match[1]);

  assert.equal(filenames.length, 6, "the about page should reference its six original photos");

  for (const filename of filenames) {
    const fingerprint = basename(filename).match(/-([a-f0-9]{8})\.webp$/)?.[1];
    assert.ok(fingerprint, `${filename} should end in an eight-character content hash`);

    const data = readFileSync(join(assetDirectory, filename));
    assert.equal(data.toString("ascii", 0, 4), "RIFF", `${filename} should be a WebP image`);
    assert.equal(data.toString("ascii", 8, 12), "WEBP", `${filename} should be a WebP image`);
    assert.equal(
      createHash("sha256").update(data).digest("hex").slice(0, 8),
      fingerprint,
      `${filename} should match its content hash`,
    );
  }
});
