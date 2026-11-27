import { CAD_MODELS } from "./rmul-3d-cad-assets.ts";
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
  const data = gunzipSync(await readFile(new URL("../../../../public"+CAD_MODELS.rmucField.url, import.meta.url)));
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
  assert.equal(nearestDriveable(player, robots)?.id, "blue-2027-infantry-04");
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
  const {findArenaPath,stepChassis}=await import("./rmuc-3d-navigation.ts");
  const floor={heightAt:(x,z)=>Math.abs(x)<.35&&Math.abs(z)<2?2:.2};
  const bot={position:new THREE.Vector3(-3,.2,0),radius:.3};
  const goal=new THREE.Vector3(3,.2,0);
  const search=findArenaPath(floor,bot.position,goal,bot.radius,.5);
  let step=search.next();while(!step.done)step=search.next();const path=step.value;
  assert.ok(path.length>0);
  assert.ok(path.some(p=>Math.abs(p.z)>2.3));
  const motion={speed:0,yaw:0};
  for(const p of path){let steps=0;while(bot.position.distanceTo(p)>.04&&steps++<500)stepChassis(floor,bot,motion,p,2.6,.025,[]);assert.ok(bot.position.distanceTo(p)<.05);}
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

test("recorded infantry recovery goal requires support for its actual footprint",()=>{
 // #702 seed 2062, red 04 at 124 seconds. The smaller generic zone
 // test footprint was valid, but the actual in-match footprint is not.
 const radius=.7085378400813248;
 const outpost=new THREE.Vector3(2.4,terrain.heightAt(2.4,-4),-4);
 const supply=new THREE.Vector3(11.5,terrain.heightAt(11.5,-5.65),-5.65);
 assert.ok(zonesAtPosition(outpost).includes("red-outpost"));
 assert.equal(supportedHeight(terrain,outpost.x,outpost.z,radius,outpost.y,.23),null);
 assert.ok(zonesAtPosition(supply).includes("red-supply"));
 assert.notEqual(supportedHeight(terrain,supply.x,supply.z,radius,supply.y,.23),null);
});

test("navigation reaches an exact off-grid goal rather than stopping short",async()=>{
 const {findArenaPath,stepChassis}=await import("./rmuc-3d-navigation.ts");
 const floor={heightAt:()=>.2},start=new THREE.Vector3(0,.2,0),goal=new THREE.Vector3(2.4,.2,0);
 const search=findArenaPath(floor,start,goal,.3,.4);
 let step=search.next();while(!step.done)step=search.next();
 assert.ok(step.value.at(-1).distanceTo(goal)<.015);
 const bot={position:start.clone(),radius:.4};
 const other={position:new THREE.Vector3(.8,.2,0),radius:.4};
 const motion={speed:0,yaw:-Math.PI/2};
 for(let i=0;i<80;i++)stepChassis(floor,bot,motion,goal,2.6,.025,[other]);
 assert.ok(bot.position.distanceTo(other.position)>=.8-1e-8);
 assert.ok(bot.position.x<.1);
 const detour=findArenaPath(floor,bot.position,goal,bot.radius,.4,[other]);let next=detour.next();while(!next.done)next=detour.next();
 for(const p of next.value){let n=0;while(bot.position.distanceTo(p)>.04&&n++<500)stepChassis(floor,bot,motion,p,2.6,.025,[other]);assert.ok(bot.position.distanceTo(p)<.05);}
 assert.ok(bot.position.distanceTo(goal)<.05);
});

test("sentry can reach the opposing fortress from the previously blocked real CAD position",async()=>{
 const {findArenaPath}=await import("./rmuc-3d-navigation.ts");
 const model=createRobotPreview("sentry"),size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
 const radius=Math.hypot(size.x,size.z)/2;
 const start=new THREE.Vector3(-5.3418323739813784,.245009577062169,-2.080637695654538);
 const goal=new THREE.Vector3(7.43,terrain.heightAt(7.43,0),0);
 const path=findArenaPath(terrain,start,goal,radius,.4);let step=path.next();while(!step.done)step=path.next();
 assert.ok(step.value.at(-1).distanceTo(goal)<.015);
 const p=start.clone();
 for(const node of step.value){moveOnArena(terrain,p,node.x-p.x,node.z-p.z,radius,.23,[]);assert.ok(p.distanceTo(node)<.016);}
 assert.ok(zonesAtPosition(p).includes("red-fortress"));
});
test("path search can route around an occupied waypoint",async()=>{
 const {findArenaPath}=await import("./rmuc-3d-navigation.ts");
 const floor={heightAt:()=>.2},start=new THREE.Vector3(-2,.2,0),goal=new THREE.Vector3(2,.2,0);
 const other={position:new THREE.Vector3(0,.2,0),radius:.6},radius=.4;
 const path=findArenaPath(floor,start,goal,radius,.4,[other]);let step=path.next();while(!step.done)step=path.next();
 assert.ok(step.value.at(-1).distanceTo(goal)<.015);
 assert.ok(step.value.some(p=>Math.abs(p.z)>=.9));
 for(const node of step.value){moveOnArena(floor,start,node.x-start.x,node.z-start.z,radius,.23,[other]);assert.ok(start.distanceTo(node)<.016);}
});

import {createMatch,startMatch,updateMatch,terrainStatus,ammoOffer,purchaseAmmo,damageTarget,selectDart,openDart,launchDart} from "./rmuc-3d-match.ts";
const terrainMatch=()=>{const m=createMatch([{id:"r",team:"red",heavy:false,maxHp:200},{id:"b",team:"blue",heavy:false,maxHp:200}],1,1);startMatch(m);return m};
const stepAt=(m,x,z,dt=.1,y=terrain.heightAt(x,z),id="r")=>updateMatch(m,dt,new Map([[id,{x,y,z}]]));
test("real CAD movement climbs highpoint and crosses road/highland using existing controls",()=>{
 for(const [from,to,kind] of [[[9,4.65],[12.6,4.65],"highpoint"],[[5.7,-5.0],[5.7,-5.9],"road"],[[5.3,0],[3.23,0],"highland"]]){
  const m=terrainMatch(),r=m.robots[0],p=new THREE.Vector3(from[0],terrain.heightAt(...from),from[1]);
  stepAt(m,p.x,p.z);
  for(let i=0;i<100;i++){
   const dx=to[0]-p.x,dz=to[1]-p.z,d=Math.hypot(dx,dz);
   if(d<.02)break;
   const n=Math.min(.12,d);
   moveOnArena(terrain,p,dx*n/d,dz*n/d,.41,.23,[]);
   stepAt(m,p.x,p.z,.1,p.y);
  }
  assert.ok(Math.hypot(p.x-to[0],p.z-to[1])<.03,kind+" stopped at "+p.toArray());
  assert.ok(terrainStatus(m,r).first.includes(kind),kind+" crossing not granted");
  assert.equal(r.xp,300);
  if(kind==="highpoint"){assert.equal(ammoOffer(m,r).local,true);assert.ok(purchaseAmmo(m,r.id));assert.equal(damageTarget(m,m.robots[1],{type:"robot",id:"r"}),10);}
 }
});
test("crossing order, timeout, cooldown, first experience and tunnel combination",()=>{
 const m=terrainMatch(),r=m.robots[0];
 stepAt(m,5.7,-5.9);assert.equal(r.xp,0);
 stepAt(m,5.7,-5);stepAt(m,7,-4,3.1);stepAt(m,5.7,-5.9);assert.equal(r.xp,0);
 stepAt(m,5.7,-5);stepAt(m,5.7,-5.9);assert.equal(r.xp,300);assert.equal(terrainStatus(m,r).defense,.25);
 const until=r.terrain.effects.road.until;
 stepAt(m,5.7,-5);stepAt(m,5.7,-5.9);assert.equal(r.terrain.effects.road.until,until);
 stepAt(m,-1.5,-6,.1,.145);stepAt(m,-.95,-6,.1,.145);stepAt(m,-.5,-6,.1,.145);
 assert.equal(r.xp,600);assert.equal(terrainStatus(m,r).cooling,1.5);assert.equal(terrainStatus(m,r).defense,.5);
 stepAt(m,7,-4,6);assert.equal(terrainStatus(m,r).defense,0);assert.equal(terrainStatus(m,r).cooling,1.5);
 stepAt(m,5.3,0);stepAt(m,3.23,0);assert.equal(r.xp,900);assert.equal(terrainStatus(m,r).defense,.5);
});
test("enemy highpoint does not grant rewards; leaving own highpoint expires activation",()=>{
 const m=terrainMatch(),r=m.robots[0];
 stepAt(m,-12.6,-4.65);assert.equal(r.xp,0);assert.equal(ammoOffer(m,r).local,false);
 stepAt(m,12.6,4.65);assert.equal(r.xp,300);assert.equal(terrainStatus(m,r).highpoint,true);
 stepAt(m,9,4.65,2.1);assert.equal(terrainStatus(m,r).highpoint,false);
 stepAt(m,12.6,4.65);assert.equal(r.xp,300);
});
test("virtual dart disables an existing crossing buff and it resumes only before original expiry",()=>{
 const m=terrainMatch(),r=m.robots[0];updateMatch(m,30);
 assert.ok(selectDart(m,"blue","randomFixed"));assert.ok(openDart(m,"blue"));updateMatch(m,7);
 stepAt(m,5.3,0);stepAt(m,3.23,0);
 assert.equal(terrainStatus(m,r).defense,.25);assert.ok(launchDart(m,"blue"));updateMatch(m,2.5);
 assert.equal(terrainStatus(m,r).defense,0);updateMatch(m,10);assert.equal(terrainStatus(m,r).defense,.25);
 updateMatch(m,20);assert.equal(terrainStatus(m,r).defense,0);
});

test("intervening card cancels sequence; mobile dart clears active effects, reset clears first awards",()=>{
 const m=terrainMatch(),r=m.robots[0];updateMatch(m,30);
 assert.ok(selectDart(m,"blue","randomMoving"));assert.ok(openDart(m,"blue"));updateMatch(m,7);
 stepAt(m,5.7,-5);stepAt(m,12.6,4.65);stepAt(m,5.7,-5.9);assert.equal(r.xp,300);
 stepAt(m,5.3,0);stepAt(m,3.23,0);assert.equal(r.xp,600);
 assert.equal(terrainStatus(m,r).defense,.25);
 assert.ok(launchDart(m,"blue"));updateMatch(m,2.5);assert.equal(terrainStatus(m,r).defense,0);
 assert.deepEqual(terrainStatus(m,r).first,["highpoint","highland"]);
 for(let i=0;i<20&&r.hp>0;i++)damageTarget(m,m.robots[1],{type:"robot",id:r.id});
 assert.equal(r.hp,0);assert.deepEqual(terrainStatus(m,r).active,[]);
 assert.deepEqual(terrainStatus(terrainMatch(),terrainMatch().robots[0]).first,[]);
});
test("both CAD highpoint approaches support the existing infantry footprint",()=>{
 for(const radius of [.410,.595,.622,.709])for(const sign of [-1,1]){
  const p=new THREE.Vector3(9*sign,terrain.heightAt(9*sign,4.65*sign),4.65*sign);
  moveOnArena(terrain,p,3.6*sign,0,radius,.23,[]);
  assert.ok(Math.abs(p.x-12.6*sign)<.02,p.toArray());
 }
});

test("actual workbench pad, two-sided approach and one transferable launcher mesh",async()=>{
 const {launcherBench,withinLauncherBench}=await import("./rmuc-3d-zones.ts");
 const {bindLauncherModule,aimWeapon}=await import("./rmuc-3d-robots.ts");
 for(const team of ["red","blue"]){
   const {pad,approach}=launcherBench(team),[x,z]=approach,sign=team==="red"?1:-1;
   assert.ok(Math.abs(terrain.heightAt(pad.x,pad.z)-pad.y)<.002);
   const p=new THREE.Vector3(12*sign,terrain.heightAt(12*sign,z),z);
   moveOnArena(terrain,p,x-p.x,0,.41,.23,[]);
   assert.ok(Math.abs(p.x-x)<.02);assert.ok(withinLauncherBench(team,p));
   assert.equal(withinLauncherBench(team,{x:11.5*sign,y:.2,z:-5.65*sign}),false);
   const scene=new THREE.Group(),bench=new THREE.Group(),robot=createRobotPreview("hero");robot.scale.setScalar(.5);scene.add(bench,robot);
   const weapon=robot.getObjectByName("weapon-pitch"),mount=weapon.parent;
   const binding=bindLauncherModule(robot,bench,pad);
   binding.update(false);assert.equal(weapon.parent,bench);assert.equal(aimWeapon(robot,0,0),null);
   const bounds=new THREE.Box3().setFromObject(weapon,true);assert.ok(Math.abs(bounds.min.y-pad.y)<1e-7);
   assert.ok(Math.abs(bounds.getCenter(new THREE.Vector3()).x-pad.x)<1e-7);
   binding.update(true);assert.equal(weapon.parent,mount);assert.ok(aimWeapon(robot,0,0));
   binding.update(false);assert.equal(weapon.parent,bench);assert.equal(bench.children.length,1);
 }
});

test("continuous chassis acceleration, braking, turning, collision and frame-rate distance agree",async()=>{
 const {stepChassis,angleDelta}=await import("./rmuc-3d-navigation.ts");
 const flat={heightAt:()=>.2},goal=new THREE.Vector3(10,.2,0);
 const run=hz=>{
   const bot={position:new THREE.Vector3(0,.2,0),radius:.3},motion={speed:0,yaw:-Math.PI/2};
   for(let i=0;i<2*hz;i++){let remaining=1/hz;while(remaining>1e-9){const dt=Math.min(.025,remaining);stepChassis(flat,bot,motion,goal,2.6,dt,[]);remaining-=dt;}}
   return bot.position.x;
 };
 const distances=[30,60,120].map(run);
 assert.ok(Math.max(...distances)-Math.min(...distances)<.03,JSON.stringify(distances));
 const bot={position:new THREE.Vector3(0,.2,0),radius:.3},motion={speed:0,yaw:0};
 const target=new THREE.Vector3(1,.2,0);let maxStep=0;
 for(let i=0;i<150;i++){const yaw=motion.yaw;maxStep=Math.max(maxStep,stepChassis(flat,bot,motion,target,2.6,.025,[],.01));assert.ok(Math.abs(angleDelta(yaw,motion.yaw))<=Math.PI*3*.025+1e-8);}
 assert.ok(bot.position.distanceTo(target)<=.011);assert.ok(maxStep<=2.6*.025+1e-8);assert.equal(motion.speed,0);
 const before=bot.position.clone();stepChassis(flat,bot,motion,goal,0,.025,[]);assert.ok(bot.position.equals(before));assert.equal(motion.speed,0);
});

test("R51 bounded displacement on the actual CAD support surface",async()=>{
 const {clearDefeatedPath}=await import("./rmuc-3d-navigation.ts");
 const radius=.25;
 // Actual initial lane near blue infantry, use the same support controller.
 let fixture;
 for(let x=-11;x<-6&&!fixture;x+=.1)for(let z=-5;z<-1&&!fixture;z+=.1){
  const a={position:new THREE.Vector3(x,terrain.heightAt(x,z),z),radius};
  const b={position:new THREE.Vector3(x+.5,terrain.heightAt(x+.5,z),z),radius};
  if([a,b].every(o=>supportedHeight(terrain,o.position.x,o.position.z,radius,o.position.y,.23)!==null)){
   const p=new Map(),start=b.position.clone();const delta=clearDefeatedPath(terrain,a,new THREE.Vector3(x+2,0,z),.025,[b],o=>o===b,p);
   if(delta>0)fixture={a,b,p,start};
  }
 }
 assert.ok(fixture);
 const {a,b,p,start}=fixture;const goal=a.position.clone().add(new THREE.Vector3(2,0,0));
 for(let i=0;i<200;i++)clearDefeatedPath(terrain,a,goal,.025,[b],o=>o===b,p);
 assert.ok(b.position.x>start.x);assert.ok(b.position.x-start.x<=.5+1e-8);
 assert.notEqual(supportedHeight(terrain,b.position.x,b.position.z,b.radius,b.position.y,.23),null);
 assert.ok(Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z)>=.5-1e-8);
});
