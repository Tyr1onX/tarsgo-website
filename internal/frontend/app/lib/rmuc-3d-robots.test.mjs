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
  const source = await readFile(new URL("./rmuc-3d-scene.ts", import.meta.url), "utf8");
  assert.match(source, /const assets=\[CAD_MODELS\.rmucField,MECHANISM_ASSET,CORE_ASSET,DART_ASSET\]/);
  assert.doesNotMatch(source, /resolveCadModel|retainCadSourceNodes/);
  assert.match(source, /addRobotPreviews\(map, scene, terrain\)/);
  assert.doesNotMatch(source, /\.show\(model\)|CAD_VIEWER_CATALOG/);
});

test("the arena provides exploration, driving and four calibration views without a model selector", async () => {
  const route = await readFile(new URL("../routes/pixel-jijia-arena.tsx", import.meta.url), "utf8");
  const scene = await readFile(new URL("./rmuc-3d-scene.ts", import.meta.url), "utf8");
  const controls = await readFile(new URL("./rmuc-3d-world-controls.ts", import.meta.url), "utf8");
  assert.match(scene, /\["first","all","third","top","red","blue"\]/);
  assert.match(scene, /fixed\("view"\)/);
  assert.doesNotMatch(controls,/remoteHousing|instrument|cameraFacing/);
  assert.match(route,/data-world-command/);
  assert.match(scene, /case "view":/);
  assert.match(scene, /function robotAtPointer/);
  assert.doesNotMatch(route, /rmul3d-models|selectModel|CAD_MODELS|rmul3d-hud-top|rmul3d-settings-panel/);
  assert.match(route, /experiment"\)==="1"/);
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
   assert.ok(active.filter(a=>a!==r).every(a=>{let lit=true;a.traverse(o=>{if(o.userData.armorLed)lit&&=o.material.emissiveIntensity===.9;});return lit;}));
   setArmorLight(r,true);assert.equal(mat.emissiveIntensity,.9);
 }
});

test("armor lens atlas has white center, translucent team rim and soft outer spill",async()=>{
 const {armorLensTexture}=await import("./rmuc-3d-lighting.ts");
 for(const team of ["red","blue"]){const t=armorLensTexture(team),{data,width,height}=t.image;
 const pixel=(x,y)=>Array.from(data.slice((y*width+x)*4,(y*width+x)*4+4));
 const core=pixel(64,32),rim=pixel(64,22),halo=pixel(64,13),outside=pixel(0,0);
 assert.ok(core.slice(0,3).every(v=>v>245)&&core[3]>240);
 assert.ok(team==="red"?rim[0]>rim[2]:rim[2]>rim[0]);
 assert.ok(core[3]>rim[3]&&rim[3]>halo[3]&&halo[3]>outside[3]);t.dispose();}
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
 assert.equal(glow.group.parent,scene);assert.equal(glow.group.children.length,32);
 let i=0;
 for(const robot of robots){
  const strips=[];robot.traverse(o=>{if(o.userData.armorLed)for(const box of o.userData.armorLedBounds)strips.push({source:o,box});});
  assert.equal(strips.length,4);
  const planes=glow.group.children.slice(i,i+4);i+=4;
  function check(){
   const center=robot.getWorldPosition(new T.Vector3());
   for(const [j,{source,box}] of strips.entries()){
    const point=source.localToWorld(box.getCenter(new T.Vector3())),size=box.getSize(new T.Vector3());
    const plane=planes[j],normal=new T.Vector3(0,0,1).transformDirection(plane.matrixWorld);
    const radial=point.clone().sub(center);radial.y=0;
    assert.ok(Math.min(size.x,size.z)<.04);
    assert.ok(normal.dot(radial.normalize())>.99);
    const offset=plane.getWorldPosition(new T.Vector3()).sub(point);
    assert.ok(offset.dot(normal)>0&&offset.length()<.03);
    assert.ok(offset.clone().cross(normal).length()<1e-7);
   }
  }
  check();const bounds=new T.Box3().setFromObject(robot);
  robot.position.x+=1;robot.rotation.y+=.7;robot.updateMatrixWorld(true);glow.update();scene.updateMatrixWorld(true);check();
  setArmorLight(robot,false);glow.update();assert.ok(planes.every(p=>!p.visible));
  setArmorLight(robot,true);glow.update();assert.ok(planes.every(p=>p.visible));
  robot.position.x-=1;robot.rotation.y-=.7;robot.updateMatrixWorld(true);glow.update();scene.updateMatrixWorld(true);
  const restored=new T.Box3().setFromObject(robot);
  assert.ok(bounds.min.distanceTo(restored.min)<1e-7&&bounds.max.distanceTo(restored.max)<1e-7);
 }
 assert.ok(original.min.distanceTo(new T.Box3().setFromObject(robots[0]).min)<1e-7);
 glow.dispose();assert.equal(glow.group.parent,null);
});


test("2027 identities derive from table 3-1 independently of legacy asset labels",async()=>{
 const {GROUND_ROSTER,SYSTEM_NUMBERS,systemIdentity,groundLabel,systemLabel}=await import("./rmuc-3d-identity.ts");
 assert.deepEqual(SYSTEM_NUMBERS,{air:6,dart:8,radar:9});
  assert.deepEqual(["air","dart","radar"].map(systemLabel),["06 空中系统","08 飞镖系统","09 雷达系统"]);
  assert.deepEqual(GROUND_ROSTER.filter(r=>r.team==="red").map(r=>groundLabel(r.id)),["01号 重装机器人","03号 步兵机器人","04号 步兵机器人","07号 哨兵机器人"]);
 assert.equal(systemIdentity("red","air").id,"red-2027-air-06");
 assert.deepEqual(ROBOT_PLACEMENTS.filter(r=>r.area==="field").map(r=>r.identity),GROUND_ROSTER);
 assert.ok(ROBOT_PLACEMENTS.filter(r=>r.area==="pit").every(r=>r.identity===null));
 for(const team of ["blue","red"]){
  assert.deepEqual(GROUND_ROSTER.filter(r=>r.team===team).map(r=>[r.number,r.kind]),[["01","heavy"],["03","infantry"],["04","infantry"],["07","sentry"]]);
 }
 const {addRobotPreviews}=await import("./rmuc-3d-robots.ts");
 const scene=new THREE.Scene(),field=new THREE.Group(),labels=[];
 globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},fillText(value){labels.push(value);}})})};
 let exhibit;try{exhibit=addRobotPreviews(field,scene,{heightAt:()=>0});}finally{delete globalThis.document;}
 assert.deepEqual(exhibit.children.filter(r=>r.userData.identity).map(r=>r.name),GROUND_ROSTER.map(r=>r.id));
 for(const [i,r] of exhibit.children.entries())if(r.userData.identity){
  assert.equal(labels[i],r.userData.identity.number);assert.equal(r.userData.assetId,r.userData.identity.assetId);
 }
});
