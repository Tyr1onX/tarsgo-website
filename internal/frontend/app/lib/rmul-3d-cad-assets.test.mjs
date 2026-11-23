import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CAD_MODELS } from "./rmul-3d-cad-assets.ts";

test("only source-backed 2027 CAD assets are selectable", () => {
  assert.deepEqual(Object.keys(CAD_MODELS), ["field", "energy", "base"]);
  assert.deepEqual(new Set(Object.values(CAD_MODELS).map((m) => m.url)).size, 3);
  assert.match(CAD_MODELS.field.source, /^RMUL2027_3V3_V1\.0\.0/);
  assert.match(CAD_MODELS.base.source, /^RMUC2027_V1\.0\.0/);
});

for (const [id, model] of Object.entries(CAD_MODELS)) {
  test(`${id}: official CAD-derived GLB hash, format and triangle count`, () => {
    const path = new URL(`../../../../public${model.url}`, import.meta.url);
    const packed = readFileSync(path);
    const bytes = gunzipSync(packed);
    assert.ok(packed.length < bytes.length);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), model.sha256);
    assert.equal(bytes.toString("ascii", 0, 4), "glTF");
    assert.equal(bytes.readUInt32LE(4), 2);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    assert.equal(bytes.toString("ascii", 16, 20), "JSON");
    const document = JSON.parse(bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)));
    assert.ok(document.meshes.length > 0);
    const triangleCount = document.meshes.flatMap((mesh) => mesh.primitives)
      .reduce((total, primitive) => total + document.accessors[primitive.indices].count / 3, 0);
    assert.equal(triangleCount, model.triangles);
  });
}
