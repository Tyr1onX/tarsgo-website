import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CAD_MODELS, DEFAULT_CAD_MODEL, retainCadSourceNodes } from "./rmul-3d-cad-assets.ts";

test("only source-backed 2027 CAD assets are selectable", () => {
  assert.deepEqual(Object.keys(CAD_MODELS), ["rmucField", "base", "outpost", "rune", "field", "energy"]);
  assert.equal(DEFAULT_CAD_MODEL, "rmucField");
  assert.equal(new Set(Object.values(CAD_MODELS).filter((m) => "url" in m).map((m) => m.url)).size, 4);
  assert.match(CAD_MODELS.rmucField.url, /^\/assets\/pixel-jijia\/rmuc-2027-arena-[0-9a-f]{8}\.glb\.gz$/);
  assert.deepEqual([CAD_MODELS.outpost.catalogName, CAD_MODELS.rune.catalogName],
    ["centre-platform", "centre-platform"]);
  assert.deepEqual(CAD_MODELS.outpost.sourceNodes, ["source_1800898_10", "source_2603236_11"]);
  assert.deepEqual(CAD_MODELS.rune.sourceNodes, ["source_1354629_1"]);
  assert.match(CAD_MODELS.field.source, /^RMUL2027_3V3_V1\.0\.0/);
  assert.match(CAD_MODELS.base.source, /^RMUC2027_V1\.0\.0/);
});

for (const [id, model] of Object.entries(CAD_MODELS)) {
  if (!("url" in model)) continue;
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


test("RMUC 2027 viewer uses exact upstream source components, not 2026 proxies", async () => {
  const { resolveCadModel, CAD_VIEWER_CATALOG } = await import("./rmul-3d-cad-assets.ts");
  assert.equal(
    CAD_VIEWER_CATALOG,
    "https://hxyulin.github.io/rm-map-tools/models/2027/catalog.json",
  );
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      models: ["full-map", "centre-platform"].map((name) => ({
        id: `rmuc2027-${name}`,
        file: `rmuc2027/${name}.glb.gz`,
        sha256: "a".repeat(64),
      })),
    }),
  });
  try {
    assert.deepEqual(await resolveCadModel("rmucField"), {
      url: CAD_MODELS.rmucField.url,
      sha256: CAD_MODELS.rmucField.sha256,
    });
    for (const [id, name] of [["outpost", "centre-platform"],
                              ["rune", "centre-platform"]]) {
      assert.deepEqual(await resolveCadModel(id), {
        url: `https://hxyulin.github.io/rm-map-tools/models/2027/rmuc2027/${name}.glb.gz`,
        sha256: "a".repeat(64),
      });
    }
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ models: [{ id: "rmuc2027-full-map", file: "../bad.glb.gz", sha256: "a".repeat(64) }] }),
    });
    await assert.rejects(resolveCadModel("outpost"), /Missing official/);
  } finally {
    globalThis.fetch = savedFetch;
  }
});


test("retain only a CAD source occurrence even when two placements share a mesh", () => {
  const assembly = { children: [] };
  const node = (name, sharedMesh) => {
    const value = {
      name, sharedMesh,
      removeFromParent() {
        assembly.children.splice(assembly.children.indexOf(value), 1);
      },
    };
    assembly.children.push(value);
    return value;
  };
  const first = node("source_2603236_11", "reused-outpost-mesh");
  node("source_2603236_12", "reused-outpost-mesh");
  const footing = node("source_1800898_10", "footing-mesh");
  node("source_1800898_9", "footing-mesh");

  retainCadSourceNodes(assembly, CAD_MODELS.outpost.sourceNodes);
  assert.deepEqual(assembly.children, [first, footing]);
  assert.equal(first.sharedMesh, "reused-outpost-mesh");
  assert.throws(() => retainCadSourceNodes(assembly, ["not-a-real-occurrence"]), /CAD source occurrence missing/);
  assert.deepEqual(assembly.children, [first, footing]);
});
