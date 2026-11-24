import assert from "node:assert/strict";
import { test, before } from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { createArenaTerrain, insideField, moveOnArena, nearestDriveable, supportedHeight } from "./rmuc-3d-terrain.ts";
import { ROBOT_PLACEMENTS, createRobotPreview } from "./rmuc-3d-robots.ts";

let terrain, sourceField;
before(async () => {
  const data = gunzipSync(await readFile(new URL("../../../../public/assets/pixel-jijia/rmuc-2027-arena-3b2530d3.glb.gz", import.meta.url)));
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), "");
  const root = new THREE.Group();
  root.add(gltf.scene);
  root.rotation.x = -Math.PI / 2;
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  root.position.set(-center.x, -bounds.min.y, -center.z);
  sourceField=root;
  terrain = createArenaTerrain(root);
});

test("sampled support heights agree with original CAD rays",()=>{
 const surfaces=[];
 sourceField.traverse(mesh=>{if(mesh.isMesh)surfaces.push({mesh,bounds:new THREE.Box3().setFromObject(mesh)});});
 const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
 let seed=1234567;
 const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 for(let i=0;i<1500;i++){
  const x=Math.round((rng()*28-14)*10)*.1,z=Math.round((rng()*15-7.5)*10)*.1;
  ray.set(new THREE.Vector3(x,10,z),down);
  let top=-Infinity;
  for(const {mesh,bounds} of surfaces){
   if(x<bounds.min.x||x>bounds.max.x||z<bounds.min.z||z>bounds.max.z)continue;
   const hit=ray.intersectObject(mesh,false)[0];
   if(hit)top=Math.max(top,hit.point.y);
  }
  const actual=terrain.heightAt(x,z);
  assert.ok(actual===top||Math.abs(actual-top)<1e-6,`${x},${z}: ${actual} != ${top}`);
 }
 assert.equal(terrain.heightAt(20,0),-Infinity);
});

test("movement respects physical boundary, raised obstacles, support and other robots", () => {
  const flat = { heightAt: () => .2 };
  const edge = new THREE.Vector3(13.4, .2, 0);
  moveOnArena(flat, edge, 4, 0, .25, .34, []);
  assert.ok(insideField(edge.x, edge.z, .25));
  assert.ok(edge.x > 13.4 && edge.x <= 13.75);
  const wall = { heightAt: x => x >= 0 && x <= .25 ? 1.5 : .2 };
  const p = new THREE.Vector3(-1, .2, 0);
  moveOnArena(wall, p, 3, 0, .25, .34, []);
  assert.ok(p.x <= -.25, "must not tunnel through raised geometry");
  const other = { position: new THREE.Vector3(1, .2, 0), radius: .5 };
  p.set(0, .2, 0);
  moveOnArena(flat, p, 2, 0, .5, .23, [other]);
  assert.ok(p.x <= .0001);
  moveOnArena(flat, p, -.5, 0, .5, .23, [other]);
  assert.ok(p.x < -.45);
});

test("actual official field allows every driveable preview to move from its placement", () => {
  const robots = ROBOT_PLACEMENTS.filter(entry => entry.area === "field").map(entry => {
    const model = createRobotPreview(entry.kind);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    return { id: entry.instanceId, position: new THREE.Vector3(entry.x, terrain.heightAt(entry.x, entry.z) + (entry.kind === "air" ? 1.5 : 0), entry.z), radius: Math.hypot(size.x,size.z)/2, driveable: model.userData.driveable === true };
  });
  assert.equal(robots.filter(r => r.driveable).length, 8);
  for (const robot of robots.filter(r => r.driveable)) {
    const p = robot.position;
    assert.notEqual(supportedHeight(terrain, p.x, p.z, robot.radius, p.y, .23), null, robot.id + " has stable ground");
    const others = robots.filter(r => r !== robot && Math.abs(r.position.y - p.y) < 1.15);
    assert.ok(others.every(r => r.position.distanceTo(p) > r.radius + robot.radius), robot.id + " does not overlap another robot");
    const moved = [[0,.6],[0,-.6],[.6,0],[-.6,0]].some(([dx,dz]) => {
      const next = moveOnArena(terrain, p.clone(), dx,dz, robot.radius,.23,others);
      return next.distanceTo(p) > .25;
    });
    assert.ok(moved, robot.id + " can leave its initial position");
  }
  const player = new THREE.Vector3(-10, terrain.heightAt(-10,-1.25), -1.25);
  assert.notEqual(supportedHeight(terrain, player.x, player.z, .25, player.y, .34), null);
  assert.equal(nearestDriveable(player, robots)?.id, "2026-infantry-04");
  const original = player.clone();
  moveOnArena(terrain, player, 0,-.5,.25,.34,robots);
  assert.ok(player.distanceTo(original) > .2);
  assert.equal(nearestDriveable(new THREE.Vector3(13, .2, 0), robots), null);
});

test("takeover chooses a nearby ground vehicle, not a static or airborne asset", () => {
  const player = new THREE.Vector3(0,.2,0);
  const staticAsset = { position: new THREE.Vector3(.3,.2,0), radius: .2, driveable: false };
  const ground = { position: new THREE.Vector3(1,.2,0), radius: .5, driveable: true };
  const above = { position: new THREE.Vector3(.4,2,0), radius: .3, driveable: true };
  assert.equal(nearestDriveable(player,[staticAsset,above,ground]),ground);
  assert.equal(nearestDriveable(player,[staticAsset,above]),null);
});

test("training navigation routes around a raised CAD-style obstacle rather than crossing it", async()=>{
  const {findArenaPath,advanceBot}=await import("./rmuc-3d-navigation.ts");
  const floor={heightAt:(x,z)=>Math.abs(x)<.35&&Math.abs(z)<2?2:.2};
  const bot={position:new THREE.Vector3(-3,.2,0),radius:.3};
  const goal=new THREE.Vector3(3,.2,0);
  const search=findArenaPath(floor,bot.position,goal,bot.radius,.5);
  let step=search.next();while(!step.done)step=search.next();const path=step.value;
  assert.ok(path.length>0);
  assert.ok(path.some(p=>Math.abs(p.z)>2.3));
  for(const p of path){while(bot.position.distanceTo(p)>.1)assert.ok(advanceBot(floor,bot,p,[]));}
  assert.ok(bot.position.distanceTo(goal)<.65);
});

import {ARENA_ZONES,zonesAtPosition} from "./rmuc-3d-zones.ts";
test("each estimated referee zone has a supported goal on actual CAD terrain",()=>{
 for(const zone of ARENA_ZONES){
  const [x,z]=zone.goal,y=terrain.heightAt(x,z);
  assert.ok(zonesAtPosition({x,y,z}).includes(zone.id),zone.id);
  assert.notEqual(supportedHeight(terrain,x,z,.45,y,.23),null,zone.id);
 }
 assert.deepEqual(zonesAtPosition({x:0,y:.3,z:0}),[]);
 assert.deepEqual(zonesAtPosition({x:3.23,y:.3,z:0}),[],"below central highland is not an activation");
});

test("navigation reaches an exact off-grid goal rather than stopping short",async()=>{
 const {findArenaPath,advanceBot}=await import("./rmuc-3d-navigation.ts");
 const floor={heightAt:()=>.2},start=new THREE.Vector3(0,.2,0),goal=new THREE.Vector3(2.4,.2,0);
 const search=findArenaPath(floor,start,goal,.3,.4);
 let step=search.next();while(!step.done)step=search.next();
 assert.ok(step.value.at(-1).distanceTo(goal)<.015);
 const bot={position:start.clone(),radius:.4};
 const other={position:new THREE.Vector3(.8,.2,0),radius:.4};
 assert.ok(advanceBot(floor,bot,goal,[other]));
 assert.ok(Math.abs(bot.position.z)>.15);
 assert.ok(bot.position.distanceTo(other.position)>=.8);
});
