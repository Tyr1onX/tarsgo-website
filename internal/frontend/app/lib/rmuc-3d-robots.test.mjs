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

import * as THREE from "three";
import { aimWeapon, aimWeaponAt, previewWeaponAt } from "./rmuc-3d-robots.ts";
import { lookDirection } from "./rmuc-3d-camera.ts";
test("each ground weapon's actual barrel axis, muzzle and virtual sight agree", () => {
  for(const kind of ["hero","infantry03","infantry04","sentry"]){
    const robot=createRobotPreview(kind);
    robot.position.set(3,.2,-2);
    robot.rotation.y=.8;
    const muzzle=robot.getObjectByName("weapon-muzzle");
    assert.ok(muzzle);
    for(const [yaw,pitch] of [[0,0],[1.3,.4],[-2,-.35]]){
      const ray=aimWeapon(robot,yaw,pitch);
      assert.ok(ray.origin.distanceTo(muzzle.getWorldPosition(new THREE.Vector3()))<1e-8);
      assert.ok(ray.direction.distanceTo(lookDirection({yaw,pitch}))<1e-8);
    }
    for(const point of [new THREE.Vector3(-4,1,3),new THREE.Vector3(8,2,5),new THREE.Vector3(1,3,-7)]){
      const ray=aimWeaponAt(robot,point);
      assert.ok(ray.direction.distanceTo(point.clone().sub(ray.origin).normalize())<1e-8);
    }
  }
});

test("AI preview aims through actual offset barrel without changing either visible joint",()=>{
 for(const kind of ["hero","infantry03","infantry04","sentry"]){
  const robot=createRobotPreview(kind);robot.scale.setScalar(kind==="hero"?.5:1);robot.position.set(3,.2,-2);robot.rotation.y=.8;
  aimWeapon(robot,-1.3,.22);
  const g=robot.getObjectByName("gimbal"),w=robot.getObjectByName("weapon-pitch"),yaw=g.rotation.y,pitch=w.rotation.x;
  const point=new THREE.Vector3(-4,1,3),preview=previewWeaponAt(robot,point);
  assert.equal(g.rotation.y,yaw);assert.equal(w.rotation.x,pitch);
  const actual=aimWeaponAt(robot,point);
  assert.ok(preview.origin.distanceTo(actual.origin)<1e-8);assert.ok(preview.direction.distanceTo(actual.direction)<1e-8);
 }
});

test("red and blue LEDs retain their existing detector meshes and independent alive state",async()=>{
 const {addRobotPreviews,setArmorLight}=await import("./rmuc-3d-robots.ts");
 const T=await import("three"),scene=new T.Scene(),field=new T.Group();
 globalThis.document={createElement:()=>({getContext:()=>null})};
 let exhibit;try{exhibit=addRobotPreviews(field,scene,{heightAt:()=>0});}finally{delete globalThis.document;}
 const active=exhibit.children.filter(r=>r.userData.area==="field");
 assert.equal(active.length,8);
 const used=new Set();
 for(const r of active){
   const lamps=[],detectors=[];
   r.traverse(o=>{if(o.userData.armorLed)lamps.push(o);if(o.userData.hitPlate)detectors.push(o);});
   assert.ok(lamps.length>0);assert.ok(lamps.every(o=>o.userData.hitPlate));
   const mat=lamps[0].material;assert.ok(lamps.every(o=>o.material===mat));assert.ok(!used.has(mat));used.add(mat);
   const rgb=mat.emissive;assert.ok(r.userData.team==="red"?rgb.r>rgb.b:rgb.b>rgb.r);
   setArmorLight(r,false);assert.equal(mat.emissiveIntensity,0);
   assert.ok(lamps.every(o=>detectors.includes(o)));
   assert.ok(active.filter(a=>a!==r).every(a=>{let lit=true;a.traverse(o=>{if(o.userData.armorLed)lit&&=o.material.emissiveIntensity===2.2;});return lit;}));
   setArmorLight(r,true);assert.equal(mat.emissiveIntensity,2.2);
 }
});

test("local LED halo follows source world transform and never enters robot collision tree",async()=>{
 const {createArmorGlow}=await import("./rmuc-3d-lighting.ts");
 const {addRobotPreviews,setArmorLight}=await import("./rmuc-3d-robots.ts");
 const T=await import("three"),scene=new T.Scene(),field=new T.Group();
 globalThis.document={createElement:()=>({getContext:()=>null})};
 let exhibit;try{exhibit=addRobotPreviews(field,scene,{heightAt:()=>0});}finally{delete globalThis.document;}
 const robots=exhibit.children.filter(r=>r.userData.area==="field");
 scene.updateMatrixWorld(true);const original=new T.Box3().setFromObject(robots[0]),glow=createArmorGlow(scene,robots);
 glow.update();scene.updateMatrixWorld(true);
 assert.equal(glow.group.parent,scene);assert.ok(glow.group.children.length>0&&glow.group.children.length<=32);
 assert.ok(original.equals(new T.Box3().setFromObject(robots[0])));
 const first=glow.group.children[0],before=first.getWorldPosition(new T.Vector3());
 robots[0].position.x+=1;robots[0].updateMatrixWorld(true);glow.update();scene.updateMatrixWorld(true);
 assert.ok(first.getWorldPosition(new T.Vector3()).sub(before).distanceTo(new T.Vector3(1,0,0))<1e-7);
 setArmorLight(robots[0],false);glow.update();assert.equal(first.visible,false);
 glow.dispose();assert.equal(glow.group.parent,null);
});
