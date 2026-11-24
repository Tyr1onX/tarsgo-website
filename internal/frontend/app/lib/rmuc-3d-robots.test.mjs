import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { robotSeasons } from "../data/robot-seasons.ts";
import { ROBOT_PREVIEWS, ROBOT_PLACEMENTS, createRobotPreview } from "./rmuc-3d-robots.ts";

test("all ten primary and backup 2026 robot photographs have a 3D appearance preview", () => {
  const originals = robotSeasons.find((item) => item.season === 2026)?.robots ?? [];
  assert.equal(originals.length, 10);
  assert.deepEqual(new Set(ROBOT_PREVIEWS.map((robot) => robot.id)), new Set(originals.map((robot) => robot.id)));
  for (const entry of ROBOT_PREVIEWS) {
    assert.ok(entry.x < 0 && Math.abs(entry.z) < 7.5);
    assert.equal(entry.area === "field", Math.abs(entry.x) < 14);
    const model = createRobotPreview(entry.kind);
    let meshes = 0, triangles = 0;
    model.traverse((object) => {
      if (object.type !== "Mesh") return;
      meshes++;
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    });
    assert.ok(triangles >= 250, `Missing modeled structure for ${entry.id}`);
    assert.ok(meshes <= 30, `Excessive draw calls for ${entry.id}`);
    if (model.userData.driveable) {
      assert.ok(model.getObjectByName("gimbal"));
      const wheels = [];
      model.traverse(object => { if (object.name.startsWith("wheel-")) wheels.push(object); });
      assert.equal(wheels.length, 4);
    }
  }
});

test("ground lineup contains four vehicles per side and reserves remain off-field", () => {
  assert.equal(ROBOT_PLACEMENTS.length,14);
  assert.equal(new Set(ROBOT_PLACEMENTS.map(r=>r.instanceId)).size,14);
  for (const team of ["blue","red"]) {
    const lineup=ROBOT_PLACEMENTS.filter(r=>r.team===team && r.area==="field");
    assert.deepEqual(lineup.map(r=>r.kind).sort(), ["hero","infantry03","infantry04","sentry"]);
    assert.ok(lineup.every(r=> Math.abs(r.x)<14 && Math.abs(r.z)<7.5));
  }
  for(const entry of ROBOT_PLACEMENTS.filter(r=>r.area==="pit")) {
    assert.ok(entry.x < -14);
    assert.ok(entry.x >= -23.3 && entry.x <= -17.2 && entry.z >= -6.7 && entry.z <= 1.7);
  }
});

test("previews use actual team photography and do not replace 2027 official field CAD", async () => {
  const references = robotSeasons.find((item) => item.season === 2026)?.robots ?? [];
  for (const entry of references) {
    assert.match(entry.image.thumbnail, /^\/assets\/images\/Robot\/2026\/.*\.webp$/);
    const photoPath = new URL(`../../../../public${entry.image.thumbnail}`, import.meta.url);
    const photo = await readFile(photoPath);
    assert.ok(photo.byteLength > 1000, `Reference photograph not found: ${entry.id}`);
  }
  const source = await readFile(new URL("./rmul-3d-scene.ts", import.meta.url), "utf8");
  assert.match(source, /resolveCadModel\("rmucField"\)/);
  assert.match(source, /addRobotPreviews\(map, scene, terrain\)/);
  assert.doesNotMatch(source, /\.show\(model\)|CAD_VIEWER_CATALOG/);
});

test("the arena provides exploration, driving and four calibration views without a model selector", async () => {
  const route = await readFile(new URL("../routes/pixel-jijia-arena.tsx", import.meta.url), "utf8");
  for (const id of ["first", "third", "all", "red", "blue", "top"])
    assert.match(route, new RegExp(`id: "${id}"`));
  assert.doesNotMatch(route, /rmul3d-models|selectModel|CAD_MODELS/);
  assert.match(route, /\/robots/);
});
