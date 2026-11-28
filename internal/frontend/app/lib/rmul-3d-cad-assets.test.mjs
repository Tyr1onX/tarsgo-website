import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CAD_MODELS } from "./rmul-3d-cad-assets.ts";

test("retained source-backed CAD assets have distinct local paths", () => {
  assert.deepEqual(Object.keys(CAD_MODELS), ["rmucField", "base", "field", "energy"]);
  assert.equal(new Set(Object.values(CAD_MODELS).map((m) => m.url)).size, 4);
  assert.match(CAD_MODELS.rmucField.url, /^\/assets\/pixel-jijia\/rmuc-2027-arena-[0-9a-f]{8}\.glb\.gz$/);
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
    if (id === "rmucField") {
      assert.equal(document.nodes.length, model.nodes);
      assert.ok(document.extensionsRequired.includes("EXT_meshopt_compression"));
      assert.ok(document.extensionsUsed.includes("KHR_mesh_quantization"));
      // The pinned source's positions and triangle index streams are unchanged.
      const bin = bytes.subarray(28 + bytes.readUInt32LE(12));
      const expected = new Map([
        [0,"6eae49ab0965bca861ae89d49483eda29052f44f56360b4e30e30ad9df1a02a4"],
        [2,"0ace80333c1aa393bbd3e5de13cf3c3c5b0e18e34cb003d0f2fb271bf90e9d48"],
        [3,"ce06ad9a7601f408cf7297dfc6f0541f5f279cf33302f739bfbf1910bc0cb0e7"],
      ]);
      for (const [index,hash] of expected) {
        const e = document.bufferViews[index].extensions.EXT_meshopt_compression;
        assert.equal(createHash("sha256").update(bin.subarray(e.byteOffset,e.byteOffset+e.byteLength)).digest("hex"),hash);
      }
      for (const p of document.meshes.flatMap(m=>m.primitives)) {
        assert.equal(document.accessors[p.attributes.POSITION].componentType,5126);
        assert.equal(document.accessors[p.attributes.NORMAL].componentType,5122);
      }
      const names = new Set(document.nodes.map((node) => node.name));
      for (const name of [
        "base_0_source_4774244_0", "base_1_source_4774244_0",
        "centre-platform_0_source_2603236_11",
        "centre-platform_0_source_2603236_12",
        "centre-platform_0_source_1354629_1",
        "red-ramp-dart-station_0_source_2643652_0",
        "blue-ramp-dart-station_0_source_3776088_0",
      ]) assert.ok(names.has(name), `Missing CAD assembly: ${name}`);
    }
  });
}
