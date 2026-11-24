import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { installMechanisms, MECHANISM_ASSET, REPLACEMENTS, TEAMS } from "./rmuc-3d-mechanisms.ts";

// Node geometry tests do not render textures. Keep the actual mesh decoder.
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
async function load(url, hash) {
  const bytes = gunzipSync(await readFile(new URL("../../../../public" + url, import.meta.url)));
  if (hash) assert.equal(createHash("sha256").update(bytes).digest("hex"), hash);
  return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ""
  )).scene;
}
function meshes(root) {
  const result = [];
  root.traverse(o => { if (o.isMesh) result.push(o); });
  return result;
}
function target(o) {
  while (o && !o.userData.target) o = o.parent;
  return o?.userData.target;
}
function triangles(root, skip) {
  const result = new Set();
  const p = new THREE.Vector3();
  for (const mesh of meshes(root)) {
    if (skip?.has(mesh)) continue;
    const pos = mesh.geometry.attributes.position;
    const idx = mesh.geometry.index;
    for (let i = 0; i < (idx?.count ?? pos.count); i += 3) {
      const points = [i, i+1, i+2].map(j => {
        p.fromBufferAttribute(pos, idx ? idx.getX(j) : j).applyMatrix4(mesh.matrixWorld);
        return p.toArray().map(x => Math.round(x * 1e5)).join(",");
      });
      if (new Set(points).size === 3) result.add(points.sort().join("|"));
    }
  }
  return result;
}
test("actual CAD outposts replace original assemblies; carrier and hit geometry rotate together", async () => {
  const [field, parts] = await Promise.all([
    load("/assets/pixel-jijia/rmuc-2027-arena-3b2530d3.glb.gz"),
    load(MECHANISM_ASSET.url, MECHANISM_ASSET.sha256)
  ]);
  const root = new THREE.Group();
  root.add(field);
  root.rotation.x = -Math.PI / 2;
  root.updateMatrixWorld(true);
  const installed = installMechanisms(field, parts);
  const pose = { runeAngle: 0, outpostAngle: { red: 0, blue: 0 }, cover: {red: 0, blue: 0} };
  installed.apply(pose);
  for (const team of TEAMS) {
    const get = suffix => parts.getObjectByName(team + "-outpost-" + suffix);
    const assembly = get("assembly"), rotor = get("rotor"), carrier = get("carrier"), fixed = get("fixed-upper");
    assert.ok(assembly && rotor && carrier && fixed);
    assert.equal(field.getObjectByName(REPLACEMENTS[team + "-outpost-assembly"]), undefined);
    const moving = new Set(meshes(rotor));
    assert.ok(meshes(carrier).every(m => moving.has(m)));
    assert.ok(meshes(fixed).every(m => !moving.has(m)));
    const stat = triangles(assembly, moving), spin = triangles(rotor);
    const overlap = [...spin].filter(key => stat.has(key));
    console.log(team, "fixed triangles", stat.size, "moving triangles", spin.size, "coincident", overlap.length);
    assert.equal(overlap.length, 0, "fixed/moving coincident triangles");
    const fixedMesh = meshes(fixed)[0], carrierMesh = meshes(carrier)[0];
    const fixedRest = fixedMesh.matrixWorld.clone(), carrierRest = carrierMesh.matrixWorld.clone();
    const samples = [];
    for (let i=0; i<3; i++) {
      const module = get("module-" + i);
      assert.ok(module);
      assert.deepEqual(target(meshes(module)[0]), {type:"outpost", team});
      // Use a real surface triangle and cast a ray from its normal.
      const mesh = meshes(module)[0], g = mesh.geometry, pos = g.attributes.position;
      const v = j => new THREE.Vector3().fromBufferAttribute(pos, g.index ? g.index.getX(j) : j);
      let a, b, c, normal;
      for (let j=0; j<(g.index?.count ?? pos.count); j+=3) {
        a=v(j); b=v(j+1); c=v(j+2);
        normal=b.clone().sub(a).cross(c.clone().sub(a));
        if (normal.lengthSq()>1e-15) break;
      }
      const point=a.clone().add(b).add(c).divideScalar(3);
      samples.push({module, mesh, point, normal: normal.normalize(), rest: mesh.localToWorld(point.clone())});
    }
    for (const angle of [.7, 1.6, 0]) {
      pose.outpostAngle[team]=angle; installed.apply(pose);
      assert.ok(fixedMesh.matrixWorld.equals(fixedRest));
      assert.equal(carrierMesh.matrixWorld.equals(carrierRest), angle===0);
      assert.equal(target(carrierMesh), undefined);
      for (const {module,mesh,point,normal,rest} of samples) {
        const world=mesh.localToWorld(point.clone());
        if (angle!==0) assert.ok(world.distanceTo(rest)>.001);
        else assert.ok(world.distanceTo(rest)<1e-8);
        const n=normal.clone().transformDirection(mesh.matrixWorld);
        const ray=new THREE.Raycaster(world.clone().addScaledVector(n,.0001),n.negate(),0,.0002);
        const hit=ray.intersectObject(module,true)[0];
        assert.ok(hit && hit.point.distanceTo(world)<.0002);
        assert.deepEqual(target(hit.object),{type:"outpost",team});
      }
    }
  }
});
