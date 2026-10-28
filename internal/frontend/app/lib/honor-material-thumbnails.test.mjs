import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { honorMaterials } from "./events-and-honors-data.ts";
import { honorMaterialThumbnails } from "./honor-material-thumbnails.ts";

const publicRoot = new URL("../../../../public/", import.meta.url);

test("every original honor material has a compact, content-fingerprinted WebP thumbnail", () => {
  assert.equal(honorMaterials.length, 44);
  assert.deepEqual(Object.keys(honorMaterialThumbnails).sort(), honorMaterials.map(m => m.id).sort());
  for (const material of honorMaterials) {
    const src = honorMaterialThumbnails[material.id];
    const thumbnail = readFileSync(new URL(src.slice(1), publicRoot));
    const original = readFileSync(new URL(material.src.slice(1), publicRoot));
    assert.equal(thumbnail.toString("ascii", 0, 4), "RIFF");
    assert.equal(thumbnail.toString("ascii", 8, 12), "WEBP");
    const hash = createHash("sha256").update(thumbnail).digest("hex").slice(0, 8);
    assert.ok(src.endsWith(`-${hash}.webp`), `${material.id}: immutable URL must match its bytes`);
    assert.ok(thumbnail.length <= original.length, `${material.id}: list resource must not grow`);
    assert.ok(thumbnail.length < 80_000, `${material.id}: thumbnail exceeds list budget`);
    assert.ok(!material.src.includes("Thumbnails"), "preview must retain the original scan");
  }
});
