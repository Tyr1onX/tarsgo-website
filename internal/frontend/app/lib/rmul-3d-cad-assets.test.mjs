import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CAD_MODELS } from "./rmul-3d-cad-assets.ts";

test("only source-backed 2027 CAD assets are selectable", () => {
  assert.deepEqual(Object.keys(CAD_MODELS), ["field", "energy", "base", "rmucField", "outpost", "rune"]);
  assert.deepEqual(new Set(Object.values(CAD_MODELS).filter((m) => "url" in m).map((m) => m.url)).size, 3);
  assert.deepEqual(
    [CAD_MODELS.rmucField.catalogName, CAD_MODELS.outpost.catalogName, CAD_MODELS.rune.catalogName],
    ["full-map", "product-2603236", "product-1354629"],
  );
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
      models: ["full-map", "product-2603236", "product-1354629"].map((name) => ({
        id: `rmuc2027-${name}`,
        file: `rmuc2027/${name}.glb.gz`,
        sha256: "a".repeat(64),
      })),
    }),
  });
  try {
    for (const [id, name] of [["rmucField", "full-map"],
                              ["outpost", "product-2603236"],
                              ["rune", "product-1354629"]]) {
      assert.deepEqual(await resolveCadModel(id), {
        url: `https://hxyulin.github.io/rm-map-tools/models/2027/rmuc2027/${name}.glb.gz`,
        sha256: "a".repeat(64),
      });
    }
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ models: [{ id: "rmuc2027-full-map", file: "../bad.glb.gz", sha256: "a".repeat(64) }] }),
    });
    await assert.rejects(resolveCadModel("rmucField"), /Missing official/);
  } finally {
    globalThis.fetch = savedFetch;
  }
});
