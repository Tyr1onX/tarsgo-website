import assert from "node:assert/strict";
import {test} from "node:test";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {MeshoptDecoder} from "three/addons/libs/meshopt_decoder.module.js";
import {createMatch,startMatch,updateMatch,purchaseAmmo,purchaseHealth,remoteHealthCost,fireRound,damageTarget,reviveRobot,revivalStatus,ammoOffer} from "./rmuc-3d-match.ts";
import {MECHANISM_ASSET,REPLACEMENTS,installMechanisms} from "./rmuc-3d-mechanisms.ts";
const roster=[{id:"r",team:"red",heavy:false,maxHp:200},{id:"b",team:"blue",heavy:false,maxHp:200}];
test("training controls ammo, friendly fire, damage, cooldown, and round reset",()=>{
 const m=createMatch(roster,1,1);
 assert.equal(fireRound(m,"r"),null);
 startMatch(m);assert.equal(purchaseAmmo(m,"r"),true);assert.equal(m.sides.red.coins,650);updateMatch(m,6);
 const r=fireRound(m,"r");assert.ok(r);assert.equal(r.ammo,99);assert.equal(fireRound(m,"r"),null);
 assert.equal(damageTarget(m,r,{type:"robot",id:"r"}),0);
 assert.equal(damageTarget(m,r,{type:"robot",id:"b"}),20);
 assert.equal(m.robots[1].hp,180);updateMatch(m,.18);assert.ok(fireRound(m,"r"));
 const reset=createMatch(roster);assert.equal(reset.robots[1].hp,200);assert.equal(reset.robots[0].ammo,0);
});
test("17mm referee heat, remote exchange and pre-assembly heavy restrictions",()=>{
 const m=createMatch([...roster,{id:"s",team:"red",heavy:false,maxHp:200,sentry:true},{id:"h",team:"red",heavy:true,maxHp:400}],1,1);
 startMatch(m);
 const r=m.robots[0],s=m.robots[2],h=m.robots[3];
 assert.equal(s.ammo,300);assert.equal(s.heatLimit,100);assert.equal(s.cooling,10);
 assert.equal(h.ammo,0);assert.equal(purchaseAmmo(m,"h"),false);assert.equal(fireRound(m,"h"),null);
 assert.equal(purchaseAmmo(m,"r"),true);assert.equal(purchaseAmmo(m,"r"),false);
 updateMatch(m,5.9);assert.equal(r.ammo,0);updateMatch(m,.1);assert.equal(r.ammo,100);
 for(let i=0;i<6&&!r.thermalLock;i++){assert.ok(fireRound(m,"r"));updateMatch(m,.18);}
 assert.equal(r.thermalLock,true);assert.equal(fireRound(m,"r"),null);assert.equal(purchaseAmmo(m,"r"),false);
 updateMatch(m,1);assert.equal(r.thermalLock,true);
 updateMatch(m,5);assert.equal(r.heat,0);assert.equal(r.thermalLock,false);assert.equal(purchaseAmmo(m,"r"),true);
 damageTarget(m,s,{type:"robot",id:"b"});assert.equal(purchaseAmmo(m,"b"),false);
});
test("distinct arm hits grant a timed training buff; repeated hits do not",()=>{
 const m=createMatch(roster);startMatch(m);
 const r=m.robots[0];for(let i=0;i<5;i++)damageTarget(m,r,{type:"rune",arm:0});
 assert.equal(m.sides.red.buff,0);
 for(let i=1;i<5;i++)damageTarget(m,r,{type:"rune",arm:i});
 assert.equal(m.sides.red.buff,30);
 assert.equal(damageTarget(m,m.robots[1],{type:"robot",id:"r"}),15);
 updateMatch(m,31);assert.equal(m.sides.red.buff,0);
});
test("formal territory: protected base, destroy and rebuild, fortress hold, and settlement",()=>{
 const m=createMatch(roster,1,1);startMatch(m);updateMatch(m,5);
 const r=m.robots[0],b=m.robots[1];
 assert.equal(damageTarget(m,r,{type:"base",team:"blue"}),0);
 const blueCentral={x:-3.23,y:.601,z:0},blueFort={x:-7.43,y:.451,z:0};
 const redOnCentral=new Map([["r",blueCentral]]);
 updateMatch(m,4.9,redOnCentral);
 assert.equal(m.sides.blue.outpostArea.full,true);
 assert.equal(m.sides.blue.outpostArea.progress,49);
 updateMatch(m,.1,redOnCentral);
 assert.deepEqual(m.sides.blue.outpostArea,{controller:"red",full:false,progress:0});
 for(let i=0;i<50;i++)damageTarget(m,r,{type:"outpost",team:"blue"});
 assert.equal(m.sides.blue.outpost,500);
 assert.equal(m.sides.blue.outpostOwner,"red");
 assert.deepEqual(m.sides.blue.outpostArea,{controller:"red",full:true,progress:0});
 assert.equal(damageTarget(m,r,{type:"outpost",team:"blue"}),0);
 assert.equal(damageTarget(m,b,{type:"outpost",team:"blue"}),20);
 updateMatch(m,170,redOnCentral);
 assert.equal(m.pose.outpostAngle.blue,0);
 const atFort=new Map([["r",blueFort]]);
 updateMatch(m,9.9,atFort);assert.equal(m.sides.blue.cover,false);
 updateMatch(m,.1,atFort);assert.equal(m.sides.blue.cover,true);
 assert.equal(damageTarget(m,r,{type:"base",team:"blue"}),20);
 updateMatch(m,420);assert.equal(m.phase,"finished");assert.equal(m.winner,"red");
 assert.equal(m.sides.red.coins,1600);assert.equal(m.elapsed,420);assert.equal(fireRound(m,"r"),null);
});
test("territory progress regresses, pauses under contest, and destroyed outposts cannot be restored by defending",()=>{
 const m=createMatch(roster,1,1);startMatch(m);
 const r=m.robots[0],b=m.robots[1];
 const central={x:-3.23,y:.601,z:0},outpost={x:-2.4,y:.495,z:4};
 const red=new Map([["r",central]]);
 const both=new Map([["r",central],["b",outpost]]);
 updateMatch(m,2,red);assert.equal(m.sides.blue.outpostArea.progress,20);
 updateMatch(m,1,both);assert.equal(m.sides.blue.outpostArea.progress,20);
 // Activation persists for two seconds after a robot leaves its zone.
 updateMatch(m,2.9,new Map());assert.equal(m.sides.blue.outpostArea.progress,10);
 updateMatch(m,1);assert.equal(m.sides.blue.outpostArea.progress,0);
 for(let i=0;i<50;i++)damageTarget(m,r,{type:"outpost",team:"blue"});
 assert.equal(m.sides.blue.outpost,0);
 assert.deepEqual(m.sides.blue.outpostArea,{controller:"blue",full:false,progress:0});
 const defense=new Map([["b",outpost]]);
 updateMatch(m,20,defense);assert.equal(m.sides.blue.outpost,0);
 assert.equal(m.sides.blue.outpostArea.full,false);
 updateMatch(m,6.9);assert.equal(m.sides.blue.outpost,500);
 assert.equal(m.sides.blue.outpostOwner,"red");assert.equal(m.sides.blue.outpostArea.full,true);
 assert.equal(m.sides.blue.stopped,true);
 // Reverse capture, repeated rebuild, and stationary state.
 updateMatch(m,5,defense);assert.equal(m.sides.blue.outpostArea.controller,"blue");
 for(let i=0;i<25;i++)damageTarget(m,b,{type:"outpost",team:"blue"});
 assert.equal(m.sides.blue.outpost,500);assert.equal(m.sides.blue.outpostOwner,"blue");
 assert.equal(m.sides.blue.outpostArea.full,true);assert.equal(m.pose.outpostAngle.blue,0);
});
test("base capture is independent from outpost and territory scoring includes temporary control",()=>{
 const m=createMatch(roster,1,1);startMatch(m);
 const base=new Map([["r",{x:-10.15,y:.3,z:0}]]);
 updateMatch(m,5,base);assert.equal(m.sides.blue.baseArea.controller,"red");assert.equal(m.sides.blue.baseArea.full,false);
 assert.equal(m.sides.blue.outpost,1000);
 updateMatch(m,10,base);assert.equal(m.sides.red.controlTicks,300);
 updateMatch(m,6.9);assert.equal(m.sides.blue.baseArea.controller,"blue");assert.equal(m.sides.blue.baseArea.full,true);
});
test("real source assemblies match static CAD bounds and rotate independently",async()=>{
 globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
 const load=async(bytes)=>(await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),"")).scene;
 const bytes=gunzipSync(readFileSync(new URL("../../../../public"+MECHANISM_ASSET.url,import.meta.url)));
 assert.equal(createHash("sha256").update(bytes).digest("hex"),MECHANISM_ASSET.sha256);
 const old=await load(gunzipSync(readFileSync(new URL("../../../../public/assets/pixel-jijia/rmuc-2027-arena-3b2530d3.glb.gz",import.meta.url))));
 const parts=await load(bytes);
 for(const [n,o] of Object.entries(REPLACEMENTS)){
  const a=new THREE.Box3().setFromObject(parts.getObjectByName(n),true),b=new THREE.Box3().setFromObject(old.getObjectByName(o),true);
  assert.ok(a.min.distanceTo(b.min)<.005,n);assert.ok(a.max.distanceTo(b.max)<.005,n);
 }
 const installed=installMechanisms(old,parts);
 for(const o of Object.values(REPLACEMENTS))assert.equal(old.getObjectByName(o),undefined);
 const p=installed.banks[0].position.clone();const q=installed.banks[0].quaternion.clone();
 const c=installed.covers[0].object.position.clone();
 const fixed=parts.getObjectByName("rune-assembly").quaternion.clone();
 installed.apply({runeAngle:1,outpostAngle:{red:1,blue:1},cover:{red:1,blue:0}});
 assert.ok(installed.banks[0].position.equals(p));assert.ok(installed.banks[0].quaternion.angleTo(q)>.9);
 assert.ok(installed.covers[0].object.position.distanceTo(c)>.15);
 assert.ok(parts.getObjectByName("rune-assembly").quaternion.equals(fixed));
 for(const bank of ["a","b"])for(let i=0;i<5;i++)assert.ok(parts.getObjectByName("rune-arm-"+bank+"-"+i).userData.target);
 installed.apply({runeAngle:0,outpostAngle:{red:0,blue:0},cover:{red:0,blue:0}});
 assert.ok(installed.covers[0].object.position.equals(c));
});
import {createRobotPreview} from "./rmuc-3d-robots.ts";
test("damageable armour is independently tagged and can be selected by a real mesh ray",()=>{
 const model=createRobotPreview("infantry04");
 model.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(new THREE.Vector3(3,.39,0),new THREE.Vector3(-1,0,0));
 const hit=ray.intersectObject(model,true)[0];
 assert.ok(hit?.object.userData.hitPlate);
 const top=new THREE.Raycaster(new THREE.Vector3(0,3,0),new THREE.Vector3(0,-1,0)).intersectObject(model,true)[0];
 assert.ok(top);assert.notEqual(top.object.userData.hitPlate,true);
});

test("remote health waits six seconds, respects logistics and forfeits coins on death",()=>{
 const m=createMatch(roster,1,1);startMatch(m);
 const r=m.robots[0],b=m.robots[1];
 for(let i=0;i<8;i++)damageTarget(m,b,{type:"robot",id:"r"});
 assert.equal(r.hp,40);assert.equal(purchaseHealth(m,"r"),false);
 updateMatch(m,6);assert.equal(remoteHealthCost(m),52);
 m.sides.red.base=5000;assert.equal(purchaseHealth(m,"r"),true);
 assert.equal(m.sides.red.coins,748);assert.equal(purchaseHealth(m,"r"),false);
 updateMatch(m,5.9);assert.equal(r.hp,40);updateMatch(m,.1);assert.equal(r.hp,130);
 assert.equal(purchaseHealth(m,"r"),true);const coins=m.sides.red.coins;
 for(let i=0;i<7;i++)damageTarget(m,b,{type:"robot",id:"r"});
 assert.equal(r.hp,0);updateMatch(m,6);assert.equal(r.hp,0);assert.equal(m.sides.red.coins,coins);
});

test("outposts ramp consistently, return to rest at stop and never restart",()=>{
 for(const direction of [-1,1]){
  const a=createMatch(roster,1,direction),b=createMatch(roster,1,direction);startMatch(a);startMatch(b);
  updateMatch(a,7.25);for(let i=0;i<725;i++)updateMatch(b,.01);
  assert.ok(Math.abs(a.pose.outpostAngle.red-b.pose.outpostAngle.red)<1e-8);
  assert.equal(a.pose.outpostAngle.red,a.pose.outpostAngle.blue);
  for(let i=0;i<50;i++)damageTarget(a,a.robots[0],{type:"outpost",team:"blue"});
  const angle=a.pose.outpostAngle.blue;updateMatch(a,.1);
  assert.ok(Math.abs(a.pose.outpostAngle.blue-angle)<.3);
  updateMatch(a,3);assert.equal(a.pose.outpostAngle.blue,0);assert.equal(a.sides.blue.stopped,true);
  updateMatch(a,3);assert.equal(a.sides.blue.outpost,500);assert.equal(a.sides.blue.outpostOwner,"red");assert.equal(a.pose.outpostAngle.blue,0);
  updateMatch(a,170);assert.equal(a.sides.red.stopped,true);assert.equal(a.pose.outpostAngle.red,0);
  assert.equal(createMatch(roster).pose.outpostAngle.red,0);
 }
});

test("supply and controlled outpost repair use combat state, logistics and maximum HP",()=>{
 const m=createMatch(roster,1,1);startMatch(m);
 const r=m.robots[0],b=m.robots[1];
 for(let i=0;i<5;i++)damageTarget(m,b,{type:"robot",id:"r"});
 const supply=new Map([["r",{x:11.5,y:.154,z:-5.65}]]);
 const post=new Map([["r",{x:2.4,y:.495,z:-4}]]);
 updateMatch(m,1,supply);assert.equal(r.hp,120);
 updateMatch(m,2);assert.equal(r.hp,158); // 1.9s activation hold
 updateMatch(m,1,post);assert.equal(r.hp,168);
 m.sides.red.base=5000;
 updateMatch(m,1,post);assert.equal(r.hp,176); // 50% outpost rate × .75
 updateMatch(m,233);for(let i=0;i<5;i++)damageTarget(m,b,{type:"robot",id:"r"});
 const before=r.hp;updateMatch(m,1,supply);assert.equal(r.hp,before+15);
 updateMatch(m,6);for(let i=0;i<2;i++)damageTarget(m,b,{type:"robot",id:"r"});
 updateMatch(m,6);const low=r.hp;
 updateMatch(m,1,supply);assert.equal(r.hp,Math.min(200,low+38));
});
test("non-remote exchange is immediate and sentry earns accumulated free supply",()=>{
 const m=createMatch([...roster,{id:"s",team:"red",heavy:false,sentry:true,maxHp:200}],1,1);startMatch(m);
 const r=m.robots[0],s=m.robots[2],b=m.robots[1];
 const supply={x:11.5,y:.154,z:-5.65};
 updateMatch(m,.1,new Map([["r",supply]]));
 damageTarget(m,b,{type:"robot",id:"r"});
 assert.deepEqual(ammoOffer(m,r),{count:10,cost:10,local:true,allowed:true});
 assert.equal(purchaseAmmo(m,"r"),true);assert.equal(r.ammo,10);assert.equal(m.sides.red.purchased,10);assert.equal(m.sides.red.coins,790);
 updateMatch(m,180);assert.equal(s.ammo,300);
 updateMatch(m,.1,new Map([["s",supply]]));assert.equal(s.ammo,600);assert.equal(m.sides.red.purchased,10);
 updateMatch(m,59,new Map([["s",supply]]));assert.equal(s.ammo,600);
 updateMatch(m,1,new Map([["s",supply]]));assert.equal(s.ammo,700);
});
test("revival uses death time and logistics, read recovery has weakness and immunity",()=>{
 const m=createMatch(roster,1,1);startMatch(m);updateMatch(m,20);
 const r=m.robots[0],b=m.robots[1];
 for(let i=0;i<10;i++)damageTarget(m,b,{type:"robot",id:"r"});
 assert.equal(r.hp,0);assert.equal(r.revival.required,12);assert.equal(reviveRobot(m,"r"),false);
 m.sides.red.base=5000;
 updateMatch(m,15.9);assert.equal(revivalStatus(m,r).canConfirm,false);
 updateMatch(m,.1);assert.equal(reviveRobot(m,"r"),true);assert.equal(r.hp,20);
 assert.equal(revivalStatus(m,r).weak,true);assert.equal(damageTarget(m,b,{type:"robot",id:"r"}),0);
 assert.equal(fireRound(m,"r"),null);
 updateMatch(m,1,new Map([["r",{x:10.15,y:.3,z:0}]]));
 assert.equal(revivalStatus(m,r).weak,false);assert.equal(revivalStatus(m,r).immune,true);
 updateMatch(m,8.9);assert.equal(revivalStatus(m,r).immune,true);
 updateMatch(m,.1);assert.equal(revivalStatus(m,r).immune,false);
 assert.equal(damageTarget(m,b,{type:"robot",id:"r"}),20);
});
test("paid revival restores full health, consumes coins, and lengthens subsequent read",()=>{
 const m=createMatch(roster,1,1);startMatch(m);updateMatch(m,30);
 const r=m.robots[0],b=m.robots[1];
 for(let i=0;i<10;i++)damageTarget(m,b,{type:"robot",id:"r"});
 assert.equal(revivalStatus(m,r).cost,100);assert.equal(reviveRobot(m,"r",true),true);
 assert.equal(m.sides.red.coins,700);assert.equal(r.hp,200);assert.equal(r.paidRevives,1);
 updateMatch(m,2.9);assert.equal(revivalStatus(m,r).weak,true);assert.equal(damageTarget(m,b,{type:"robot",id:"r"}),0);
 updateMatch(m,.1);assert.equal(revivalStatus(m,r).weak,false);
 for(let i=0;i<10;i++)damageTarget(m,b,{type:"robot",id:"r"});
 assert.equal(r.revival.required,33);
 m.sides.red.base=3000;
 updateMatch(m,12.6);assert.equal(revivalStatus(m,r).canConfirm,false);
 updateMatch(m,.1);assert.equal(reviveRobot(m,"r"),true);assert.equal(r.hp,20);
 assert.equal(createMatch(roster).robots[0].paidRevives,0);
});
