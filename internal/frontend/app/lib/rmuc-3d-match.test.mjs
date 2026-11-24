import { CAD_MODELS } from "./rmul-3d-cad-assets.ts";
import assert from "node:assert/strict";
import {test} from "node:test";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {MeshoptDecoder} from "three/addons/libs/meshopt_decoder.module.js";
import {createMatch,startMatch,updateMatch,purchaseAmmo,purchaseHealth,remoteHealthCost,fireRound,damageTarget,reviveRobot,revivalStatus,ammoOffer,launcherStatus,installLauncher,activateRune,runeStatus,runeLights,robotLevel,powerLimit,sentryStatus,switchSentry,selectInfantryPerformance,selectSentryControl,markSentry,removeLauncher} from "./rmuc-3d-match.ts";
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
 const m=createMatch([...roster,{id:"s",team:"red",heavy:false,maxHp:200,sentry:true,sentryControl:"semi"},{id:"h",team:"red",heavy:true,maxHp:400}],1,1);
 startMatch(m);
 const r=m.robots[0],s=m.robots[2],h=m.robots[3];
 assert.equal(s.ammo,300);assert.equal(s.heatLimit,100);assert.equal(s.cooling,10);
 assert.equal(h.ammo,0);assert.equal(purchaseAmmo(m,"h"),false);assert.equal(fireRound(m,"h"),null);
 assert.equal(purchaseAmmo(m,"r"),true);assert.equal(purchaseAmmo(m,"r"),false);
 updateMatch(m,5.9);assert.equal(r.ammo,0);updateMatch(m,.1);assert.equal(r.ammo,100);
 for(let i=0;i<6&&!r.thermalLock;i++){assert.ok(fireRound(m,"r"));updateMatch(m,.18);}
 assert.equal(r.thermalLock,"cooling");assert.equal(fireRound(m,"r"),null);assert.equal(purchaseAmmo(m,"r"),false);
 updateMatch(m,1);assert.equal(r.thermalLock,"cooling");
 updateMatch(m,5);assert.equal(r.heat,0);assert.equal(r.thermalLock,false);assert.equal(purchaseAmmo(m,"r"),true);
 damageTarget(m,s,{type:"robot",id:"b"});assert.equal(purchaseAmmo(m,"b"),false);
});
test("small rune requires activation and five successive lit arms, expires and replenishes",()=>{
 const m=createMatch(roster,1,1);startMatch(m);const r=m.robots[0];
 const hit=(team,arm,ring=10)=>damageTarget(m,r,{type:"rune",team,arm,ring});
 hit("red",0);assert.equal(runeStatus(m,"red").groups,0);
 assert.equal(activateRune(m,"r"),true);assert.equal(activateRune(m,"r"),false);
 let lit=runeStatus(m,"red").lit[0];
 hit("blue",lit);assert.equal(runeStatus(m,"red").groups,0);
 hit("red",lit);assert.equal(runeStatus(m,"red").groups,1);
 updateMatch(m,2.5);assert.equal(runeStatus(m,"red").groups,0);
 const seen=new Set();
 for(let i=0;i<5;i++){lit=runeStatus(m,"red").lit[0];assert.ok(!seen.has(lit));seen.add(lit);hit("red",lit);}
 assert.equal(runeStatus(m,"red").buff,45);
 assert.equal(damageTarget(m,m.robots[1],{type:"robot",id:"r"}),15);
 updateMatch(m,45);assert.equal(runeStatus(m,"red").buff,0);
 assert.equal(activateRune(m,"r"),false);updateMatch(m,90-m.elapsed);
 assert.equal(activateRune(m,"r"),true);updateMatch(m,20);assert.equal(runeStatus(m,"red").active,false);
});
test("large rune pairs, ring-dependent buffs and reduced detection on later activations",()=>{
 const m=createMatch(roster,1,1);startMatch(m);updateMatch(m,180);const r=m.robots[0];
 const hit=(arm,ring=10)=>damageTarget(m,r,{type:"rune",team:"red",arm,ring});
 assert.equal(activateRune(m,"r"),true);
 for(let i=0;i<5;i++){const [first,second]=runeStatus(m,"red").lit;hit(first);hit(second);}
 const status=runeStatus(m,"red");assert.equal(status.buff,60);assert.equal(status.attack,3);assert.equal(status.defense,.5);assert.equal(status.cooling,5);
 assert.equal(damageTarget(m,r,{type:"robot",id:"b"}),60);
 updateMatch(m,75);assert.equal(activateRune(m,"r"),true);
 hit(runeStatus(m,"red").lit[0],3);assert.equal(runeStatus(m,"red").groups,0);
 for(let i=0;i<5;i++){hit(runeStatus(m,"red").lit[0],4);updateMatch(m,1);}
 assert.equal(runeStatus(m,"red").buff,30);assert.equal(runeStatus(m,"red").attack,1.5);assert.equal(runeStatus(m,"red").cooling,2);
 updateMatch(m,70);assert.equal(activateRune(m,"r"),true);
 hit(runeStatus(m,"red").lit[0],6);assert.equal(runeStatus(m,"red").groups,0);
 hit(runeStatus(m,"red").lit[0],7);assert.equal(runeStatus(m,"red").groups,1);
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
 const old=await load(gunzipSync(readFileSync(new URL("../../../../public"+CAD_MODELS.rmucField.url,import.meta.url))));
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
 for(const bank of ["a","b"])for(let i=0;i<5;i++)assert.ok(parts.getObjectByName("rune-arm-"+bank+"-"+i).userData.runeDetector);
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
 const m=createMatch([...roster,{id:"s",team:"red",heavy:false,sentry:true,sentryControl:"semi",maxHp:200}],1,1);startMatch(m);
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


test("42mm timed fallback, calibration shot, separate ammunition cap and real mesh damage",async()=>{
 const {resolveArenaShot}=await import("./rmuc-3d-shot.ts");
 const m=createMatch([...roster,{id:"h",team:"red",heavy:true,maxHp:400}],1,1);startMatch(m);
 const h=m.robots[2],b=m.robots[1],r=m.robots[0];
 assert.equal(damageTarget(m,b,{type:"robot",id:"h"}),10);
 updateMatch(m,180);assert.equal(damageTarget(m,b,{type:"robot",id:"h"}),20);
 updateMatch(m,119.9);assert.equal(launcherStatus(m,h).state,"locked");
 updateMatch(m,.1);assert.equal(h.launcher,"unlocked");
 assert.equal(installLauncher(m,"h"),false);
 assert.equal(purchaseAmmo(m,"h"),true);updateMatch(m,6);assert.equal(h.ammo,10);
 assert.equal(m.sides.red.purchased42,10);assert.equal(m.sides.red.purchased,0);
 const bench={x:12.7,y:.16,z:-5.4};const supply=new Map([["h",bench]]);
 updateMatch(m,.1,supply);assert.equal(installLauncher(m,"h",{x:11.5,y:.2,z:-5.65}),false);assert.equal(installLauncher(m,"h",bench),true);
 assert.equal(ammoOffer(m,h).count,1);
 assert.equal(purchaseAmmo(m,"h"),true);assert.equal(h.ammo,11);
 const model=new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2),new THREE.MeshBasicMaterial());
 model.position.set(2,.2,0);model.userData.target={type:"robot",id:"b"};model.updateMatrixWorld(true);
 const origin=new THREE.Vector3(0,.2,0),direction=new THREE.Vector3(1,0,0);
 const shot=()=>resolveArenaShot(m,"h",new THREE.Raycaster(),[model],origin,direction);
 const first=shot();assert.equal(first.damage,0);assert.equal(b.hp,200);
 assert.equal(h.launcher,"ready");assert.equal(h.maxHp,600);assert.equal(h.heat,0);assert.equal(h.ammo,10);
 assert.equal(h.heatLimit,300);assert.equal(h.cooling,100);
 updateMatch(m,.3);assert.equal(shot().damage,200);assert.equal(h.heat,100);assert.equal(b.hp,0);
 updateMatch(m,1);assert.equal(h.heat,0);
 assert.equal(createMatch([...roster,{id:"h",team:"red",heavy:true,maxHp:400}]).robots[2].launcher,"locked");
});
test("heavy timed unlock uses historical opposing base and control advantages",()=>{
 const m=createMatch([...roster,{id:"h",team:"red",heavy:true,maxHp:400}],1,1);startMatch(m);
 const h=m.robots[2];m.sides.red.base=8000;
 updateMatch(m,10);assert.equal(launcherStatus(m,h).unlockIn,250);
 m.sides.red.base=10000;updateMatch(m,249.9);assert.equal(h.launcher,"locked");
 updateMatch(m,.1);assert.equal(h.launcher,"unlocked");
});


test("rune lights follow completed small arms, activation and expiry",()=>{
 const m=createMatch(roster,1,1);startMatch(m);const r=m.robots[0];
 assert.deepEqual(runeLights(m,"red"),[]);
 activateRune(m,"r");
 for(let i=0;i<5;i++){
  const arm=runeStatus(m,"red").lit[0];
  damageTarget(m,r,{type:"rune",team:"red",arm,ring:10});
  assert.equal(new Set(runeLights(m,"red")).size,Math.min(5,i+2));
 }
 assert.equal(runeStatus(m,"red").buff,45);
 assert.deepEqual(runeLights(m,"red"),[0,1,2,3,4]);
 assert.deepEqual(runeLights(m,"blue"),[]);
 updateMatch(m,45);
 assert.deepEqual(runeLights(m,"red"),[]);
});
test("large rune long steps split rotation and cooling at attempt and bonus boundaries",()=>{
 const m=createMatch(roster,1,1);startMatch(m);updateMatch(m,180);activateRune(m,"r");
 const a=structuredClone(m),b=structuredClone(m);
 updateMatch(a,21);for(let i=0;i<210;i++)updateMatch(b,.1);
 assert.equal(runeStatus(a,"red").active,false);
 assert.equal(runeStatus(b,"red").active,false);
 assert.ok(Math.abs(a.pose.runeAngle-b.pose.runeAngle)<1e-6);
 const r=m.robots[0];
 for(let i=0;i<5;i++){const [first,second]=runeStatus(m,"red").lit;
  damageTarget(m,r,{type:"rune",team:"red",arm:first,ring:10});
  damageTarget(m,r,{type:"rune",team:"red",arm:second,ring:10});
 }
 updateMatch(m,59.9);r.heat=40;
 const c=structuredClone(m),d=structuredClone(m);
 updateMatch(c,.5);for(let i=0;i<5;i++)updateMatch(d,.1);
 assert.ok(Math.abs(c.robots[0].heat-d.robots[0].heat)<1e-6);
 assert.equal(runeStatus(c,"red").buff,0);
});

test("infantry experience grants official default attributes, preserves HP delta and honors assembly cap",()=>{
 const m=createMatch(roster,1,1);startMatch(m);
 const r=m.robots[0],b=m.robots[1];
 purchaseAmmo(m,"r");updateMatch(m,6);
 assert.ok(fireRound(m,"r"));assert.equal(r.xp,1);
 damageTarget(m,b,{type:"robot",id:"r"});
 for(let i=0;i<13;i++)damageTarget(m,r,{type:"outpost",team:"blue"});
 assert.equal(r.xp,521);assert.equal(robotLevel(r),1);
 damageTarget(m,r,{type:"outpost",team:"blue"});
 assert.equal(r.xp,561);assert.equal(robotLevel(r),2);
 assert.equal(r.maxHp,225);assert.equal(r.hp,205);assert.equal(r.heatLimit,48);assert.equal(r.cooling,14);
 // Known direct attacker, level-one target: 4 XP per damage plus 50 on death.
 for(let i=0;i<10;i++)damageTarget(m,r,{type:"robot",id:"b"});
 assert.equal(r.xp,1411);assert.equal(robotLevel(r),3);
 assert.equal(r.maxHp,250);
 for(let i=0;i<86;i++)damageTarget(m,r,{type:"outpost",team:"blue"});
 // Grant additional actual source damage through repeated enemy revivals.
 for(let i=0;i<6;i++){
   updateMatch(m,6);
   if(revivalStatus(m,b).canPay)reviveRobot(m,"b",true);
   updateMatch(m,3);
   for(let k=0;k<10;k++)damageTarget(m,r,{type:"robot",id:"b"});
 }
 assert.equal(r.xp,2200);assert.equal(robotLevel(r),5);assert.equal(r.maxHp,300);
 assert.equal(r.heatLimit,72);assert.equal(r.cooling,20);
 // Death does not reset XP, and exchange uses the actual current level.
 const before=r.xp;
 for(let i=0;i<20;i++)damageTarget(m,b,{type:"robot",id:"r"});
 assert.equal(r.hp,0);assert.equal(r.xp,before);assert.equal(revivalStatus(m,r).cost,Math.ceil(m.elapsed/60)*80+100);
});
test("sentry damage shares experience across live infantry; heavy 42mm does not",()=>{
 const m=createMatch([...roster,{id:"r2",team:"red",heavy:false,maxHp:200},{id:"s",team:"red",heavy:false,sentry:true,sentryControl:"semi",maxHp:200},{id:"h",team:"red",heavy:true,maxHp:400}],1,1);
 startMatch(m);const [r,b,r2,s,h]=m.robots;
 damageTarget(m,s,{type:"robot",id:"b"});
 assert.equal(r.xp,40);assert.equal(r2.xp,40);assert.equal(s.xp,0);
 for(let i=0;i<10;i++)damageTarget(m,b,{type:"robot",id:"r2"});
 assert.equal(r2.hp,0);
 damageTarget(m,s,{type:"outpost",team:"blue"});
 assert.equal(r.xp,80);assert.equal(r2.xp,40);
 damageTarget(m,h,{type:"robot",id:"b"});
 assert.equal(r.xp,80);assert.equal(h.xp,0);
});
test("small rune shares a 1200 XP bonus budget; large rune grants 750 XP to living infantry",()=>{
 const m=createMatch([...roster,{id:"r2",team:"red",heavy:false,maxHp:200}],1,1);
 startMatch(m);const [r,b,r2]=m.robots;
 activateRune(m,"r");
 for(let i=0;i<5;i++)damageTarget(m,r,{type:"rune",team:"red",arm:runeStatus(m,"red").lit[0],ring:10});
 for(let i=0;i<30;i++)damageTarget(m,i%2?r:r2,{type:"outpost",team:"blue"});
 assert.equal(r.xp+r2.xp,2400);assert.equal(m.sides.red.rune.xpBonusRemaining,0);
 updateMatch(m,180);
 const sum=r.xp+r2.xp;activateRune(m,"r");
 for(let i=0;i<5;i++){const [a,c]=runeStatus(m,"red").lit;damageTarget(m,r,{type:"rune",team:"red",arm:a,ring:10});damageTarget(m,r,{type:"rune",team:"red",arm:c,ring:10});}
 assert.equal(r.xp+r2.xp,sum+750);
});

test("defending fortress grants exclusive reserve, priority consumption and damage-dependent cooling",()=>{
 const m=createMatch([...roster,{id:"r2",team:"red",heavy:false,maxHp:200}],1,1);
 startMatch(m);
 const [r,b,r2]=m.robots;
 const fort={x:7.43,y:.45,z:0};
 m.sides.red.outpostArea.controller="blue";
 const positions=new Map([["r2",fort]]);
 updateMatch(m,.1,positions);
 positions.set("r",fort);updateMatch(m,.1,positions);
 assert.equal(m.sides.red.fortressHolder,"r2");
 assert.equal(damageTarget(m,b,{type:"robot",id:"r2"}),10);
 assert.equal(damageTarget(m,b,{type:"robot",id:"r"}),20);
 assert.ok(fireRound(m,"r2"));assert.equal(r2.ammo,0);
 assert.equal(m.sides.red.fortressSpent,1);
 assert.equal(fireRound(m,"r"),null);
 m.sides.red.base=7600; // synthetic referee test, not a physical hit
 r2.heat=40;
 updateMatch(m,1,positions);
 assert.ok(Math.abs(r2.heat-0)<1e-7);
 positions.delete("r2");updateMatch(m,2,positions);
 assert.equal(m.sides.red.fortressHolder,"r");
 assert.ok(fireRound(m,"r"));
 assert.equal(m.sides.red.fortressSpent,2);
 m.sides.red.outpostArea.controller="red";
 updateMatch(m,.1,positions);
 assert.equal(m.sides.red.fortressHolder,null);
});

test("10Hz chassis buffer, five-second cutoff and level-dependent limits",async()=>{
 const {driveSpeed,chassisStatus,powerLimit}=await import("./rmuc-3d-match.ts");
 const m=createMatch(roster,1,1);startMatch(m);
 const r=m.robots[0];
 assert.equal(powerLimit(m,r),45);
 assert.equal(driveSpeed(m,r,1),2.6);
 updateMatch(m,2);assert.equal(r.powerBuffer,60);
 assert.ok(driveSpeed(m,r,2)>2.6);
 updateMatch(m,1.3);assert.ok(Math.abs(r.powerBuffer-1.5)<1e-8);
 updateMatch(m,.1);assert.equal(r.powerBuffer,0);
 assert.equal(chassisStatus(m,r).locked,5);
 assert.equal(driveSpeed(m,r,2),0);
 updateMatch(m,4.9);assert.ok(chassisStatus(m,r).locked>0);
 updateMatch(m,.1);assert.equal(chassisStatus(m,r).locked,0);
 assert.equal(r.powerBuffer,60);
 assert.equal(driveSpeed(m,r,1),2.6);
 r.xp=2200;assert.equal(powerLimit(m,r),65);
 r.hp=0;r.revival={state:"dead",progressTicks:0,required:10};
 assert.ok(reviveRobot(m,r.id,true));
 assert.equal(powerLimit(m,r),130);
 updateMatch(m,3);assert.equal(powerLimit(m,r),130);
 updateMatch(m,1);assert.equal(powerLimit(m,r),65);
 assert.equal(createMatch(roster).robots[0].powerBuffer,60);
});

test("semi-automatic sentry stance starts mobile, switches with five-second cooldown and degrades after 180 seconds",()=>{
 const m=createMatch([...roster,{id:"s",team:"red",heavy:false,sentry:true,sentryControl:"semi",maxHp:200}],1,1),r=m.robots[2];
 assert.equal(sentryStatus(m,r).mode,"move");assert.equal(powerLimit(m,r),90);
 startMatch(m);assert.equal(damageTarget(m,m.robots[1],{type:"robot",id:"s"}),25);
 r.heat=100;updateMatch(m,1);assert.ok(Math.abs(r.heat-97)<1e-7);
 assert.equal(switchSentry(m,"s","attack"),true);assert.equal(powerLimit(m,r),30);
 assert.equal(switchSentry(m,"s","defense"),false);updateMatch(m,4.9);assert.equal(switchSentry(m,"s","defense"),false);
 updateMatch(m,.1);assert.equal(switchSentry(m,"s","defense"),true);assert.equal(damageTarget(m,m.robots[1],{type:"robot",id:"s"}),10);
 updateMatch(m,180);assert.equal(sentryStatus(m,r).degraded,false);
 updateMatch(m,.1);assert.equal(sentryStatus(m,r).degraded,true);assert.equal(damageTarget(m,m.robots[1],{type:"robot",id:"s"}),15);
});
test("sentry enhanced budgets are separate, cumulative and automatically expire",()=>{
 const m=createMatch([...roster,{id:"s",team:"red",heavy:false,sentry:true,sentryControl:"semi",maxHp:200}],1,1),r=m.robots[2];
 startMatch(m);updateMatch(m,170);
 assert.equal(switchSentry(m,"s","move",true),true);assert.equal(powerLimit(m,r),200);
 updateMatch(m,15);assert.equal(sentryStatus(m,r).enhanced,false);assert.equal(sentryStatus(m,r).degraded,true);assert.equal(powerLimit(m,r),72);
 assert.equal(switchSentry(m,"s","move",true),false);assert.equal(sentryStatus(m,r).remaining.attack,15);
 assert.equal(switchSentry(m,"s","attack",true),true);r.heat=90;assert.ok(fireRound(m,"s"));assert.equal(r.heat,0);
 updateMatch(m,5);assert.equal(switchSentry(m,"s","defense",true),true);assert.equal(sentryStatus(m,r).remaining.attack,10);
 m.sides.red.rune.defense=.5;
 assert.equal(damageTarget(m,m.robots[1],{type:"robot",id:"s"}),0);
 updateMatch(m,15);assert.equal(sentryStatus(m,r).enhanced,false);assert.equal(sentryStatus(m,r).remaining.defense,0);
 assert.equal(switchSentry(m,"s","attack",true),true);updateMatch(m,10);
 assert.equal(sentryStatus(m,r).enhanced,false);assert.equal(sentryStatus(m,r).remaining.attack,0);
 assert.ok(fireRound(m,"s"));assert.equal(r.heat,10);updateMatch(m,1);assert.equal(r.heat,0);
});

test("sentry death pauses stance budget, revival preserves it, new round resets it",()=>{
 const specs=[...roster,{id:"s",team:"red",heavy:false,sentry:true,sentryControl:"semi",maxHp:200}];
 const m=createMatch(specs,1,1),r=m.robots[2],b=m.robots[1];startMatch(m);
 assert.ok(switchSentry(m,"s","attack",true));updateMatch(m,5);
 for(let i=0;i<10&&r.hp>0;i++)damageTarget(m,b,{type:"robot",id:"s"});
 assert.equal(r.hp,0);assert.equal(sentryStatus(m,r).remaining.attack,10);
 assert.equal(switchSentry(m,"s","move"),false);
 updateMatch(m,20);assert.equal(sentryStatus(m,r).remaining.attack,10);
 assert.ok(reviveRobot(m,"s",true));updateMatch(m,3);
 assert.equal(sentryStatus(m,r).remaining.attack,7);
 assert.ok(fireRound(m,"s"));assert.equal(r.heat,0);
 updateMatch(m,7);assert.equal(sentryStatus(m,r).enhanced,false);
 const reset=createMatch(specs),fresh=reset.robots[2];
 assert.equal(sentryStatus(reset,fresh).mode,"move");assert.equal(powerLimit(reset,fresh),90);
 assert.deepEqual(sentryStatus(reset,fresh).remaining,{attack:15,defense:15,move:15});
});

test("infantry pre-round performance selection follows tables 5-17/18 and locks on start",()=>{
 const m=createMatch([...roster,{id:"h",team:"red",heavy:true,maxHp:400},{id:"s",team:"red",heavy:false,sentry:true,sentryControl:"semi",maxHp:200}],1,1);
 const r=m.robots[0],b=m.robots[1];
 assert.equal(selectInfantryPerformance(m,"h",{chassis:"power",launcher:"burst"}),false);
 assert.equal(selectInfantryPerformance(m,"s",{chassis:"power",launcher:"burst"}),false);
 assert.equal(selectInfantryPerformance(m,"r",{chassis:"power",launcher:"burst"}),true);
 assert.deepEqual([r.hp,r.maxHp,powerLimit(m,r),r.heatLimit,r.cooling],[150,150,60,170,5]);
 assert.deepEqual([b.hp,powerLimit(m,b),b.heatLimit,b.cooling],[200,45,40,12]);
 startMatch(m);
 assert.equal(selectInfantryPerformance(m,"r",{chassis:"hp",launcher:"cooling"}),false);
 damageTarget(m,b,{type:"robot",id:"r"});
 for(let i=0;i<14;i++)damageTarget(m,r,{type:"outpost",team:"blue"});
 assert.equal(robotLevel(r),2);
 assert.deepEqual([r.hp,r.maxHp,powerLimit(m,r),r.heatLimit,r.cooling],[155,175,65,180,7]);
 updateMatch(m,6);assert.ok(purchaseAmmo(m,"r"));updateMatch(m,6);assert.ok(fireRound(m,"r"));updateMatch(m,1);
 assert.ok(Math.abs(r.heat-3)<1e-8); // 10 - 7 points per second
 assert.deepEqual(createMatch(roster).robots[0].performance,{chassis:"hp",launcher:"cooling"});
});

test("permanent thermal lock threshold survives cooling, death, revival and enhancement",()=>{
 const m=createMatch([...roster,{id:"s",team:"red",heavy:false,maxHp:200,sentry:true,sentryControl:"semi"}],1,1);
 startMatch(m);const s=m.robots[2],b=m.robots[1];
 // Isolated detector-boundary test: emulate accumulated heat from hardware
 // reports that arrive before a lock is processed. Normal training firing
 // is gated and cannot itself generate such delayed reports.
 s.heat=s.heatLimit+90;assert.ok(fireRound(m,"s"));assert.equal(s.thermalLock,"permanent");
 updateMatch(m,100);assert.equal(s.heat,0);assert.equal(s.thermalLock,"permanent");
 assert.ok(switchSentry(m,"s","attack",true));assert.equal(fireRound(m,"s"),null);
 for(let i=0;i<20;i++)damageTarget(m,b,{type:"robot",id:"s"});
 assert.equal(s.hp,0);assert.equal(s.thermalLock,"permanent");
 assert.ok(reviveRobot(m,"s",true));updateMatch(m,3);assert.equal(fireRound(m,"s"),null);
 assert.equal(createMatch(roster).robots[0].thermalLock,false);
});

test("capped infantry never pre-banks XP or consumes unused rune XP budget",()=>{
 const m=createMatch(roster,1,1);startMatch(m);
 const r=m.robots[0];r.xp=2199;
 m.sides.red.rune.activatedUntil=60;m.sides.red.rune.xpBonusRemaining=1200;
 damageTarget(m,r,{type:"outpost",team:"blue"});
 assert.equal(r.xp,2200);
 assert.equal(m.sides.red.rune.xpBonusRemaining,1200);
 damageTarget(m,r,{type:"outpost",team:"blue"});
 assert.equal(r.xp,2200);
 assert.equal(m.sides.red.rune.xpBonusRemaining,1200);
});

test("automatic sentry default, pre-match selection, and commander fee versus autonomous requests",()=>{
 const specs=[...roster,{id:"s",team:"red",heavy:false,maxHp:200,sentry:true}];
 const m=createMatch(specs,1,1),r=m.robots[2],side=m.sides.red;
 assert.deepEqual([r.hp,r.maxHp,r.heatLimit,r.cooling,powerLimit(m,r),r.ammo],[400,400,260,30,150,300]);
 assert.ok(selectSentryControl(m,"s","semi"));
 assert.deepEqual([r.hp,r.maxHp,r.heatLimit,r.cooling,powerLimit(m,r)],[200,200,100,10,90]);
 assert.ok(selectSentryControl(m,"s","auto"));startMatch(m);
 assert.equal(selectSentryControl(m,"s","semi"),false);
 assert.equal(ammoOffer(m,r,true).cost,200);
 assert.ok(purchaseAmmo(m,"s",true));assert.equal(side.coins,600);
 assert.equal(purchaseAmmo(m,"s",true),false);assert.equal(side.coins,600);
 updateMatch(m,6);assert.equal(r.ammo,400);
 assert.ok(purchaseAmmo(m,"s"));assert.equal(side.coins,450);
 assert.ok(switchSentry(m,"s","attack",false,true));assert.equal(side.coins,400);
 assert.equal(switchSentry(m,"s","defense",false,true),false);assert.equal(side.coins,400);
 assert.ok(markSentry(m,"s","red-highpoint"));assert.equal(side.coins,350);assert.equal(r.commandTarget,"red-highpoint");
 damageTarget(m,m.robots[1],{type:"robot",id:"s"});updateMatch(m,6);
 const cost=remoteHealthCost(m);assert.ok(purchaseHealth(m,"s",true));assert.equal(side.coins,350-cost-50);
 side.coins=49;updateMatch(m,6);assert.equal(markSentry(m,"s","red-outpost"),false);assert.equal(switchSentry(m,"s","move",false,true),false);assert.equal(side.coins,49);
 assert.ok(switchSentry(m,"s","move"));assert.equal(side.coins,49);
 const fresh=createMatch(specs);assert.equal(fresh.robots[2].commandTarget,null);
});
test("automatic sentry commander revival fees apply atomically; semi commands remain free",()=>{
 const specs=[...roster,{id:"s",team:"red",heavy:false,maxHp:200,sentry:true}];
 for(const control of ["auto","semi"]){
   const m=createMatch(specs,1,1),r=m.robots[2],side=m.sides.red;
   selectSentryControl(m,"s",control);startMatch(m);
   const fee=control==="auto"?50:0;
   for(let i=0;i<20&&r.hp>0;i++)damageTarget(m,m.robots[1],{type:"robot",id:"s"});
   assert.equal(r.hp,0);updateMatch(m,15);
   assert.equal(revivalStatus(m,r,true).fee,fee);
   side.coins=fee;assert.ok(reviveRobot(m,"s",false,true));assert.equal(side.coins,0);
   updateMatch(m,31);
   for(let i=0;i<20&&r.hp>0;i++)damageTarget(m,m.robots[1],{type:"robot",id:"s"});
   assert.equal(r.hp,0);
   const cost=revivalStatus(m,r,true).cost;side.coins=cost-1;
   assert.equal(reviveRobot(m,"s",true,true),false);assert.equal(side.coins,cost-1);
   side.coins=cost;assert.ok(reviveRobot(m,"s",true,true));assert.equal(side.coins,0);
 }
});

test("workbench installation and removal require actual reach; calibration history is not reset by removal",()=>{
 const m=createMatch([...roster,{id:"h",team:"red",heavy:true,maxHp:400}],1,1),h=m.robots[2];startMatch(m);updateMatch(m,300);
 const bench={x:12.7,y:.16,z:-5.4},outside={x:11.5,y:.2,z:-5.65};
 assert.equal(installLauncher(m,"h",outside),false);assert.ok(installLauncher(m,"h",bench));
 assert.equal(removeLauncher(m,"h",outside),false);assert.ok(removeLauncher(m,"h",bench));assert.equal(h.launcher,"unlocked");
 assert.equal(fireRound(m,"h"),null);
 assert.ok(installLauncher(m,"h",bench));assert.ok(purchaseAmmo(m,"h"));updateMatch(m,6);assert.ok(fireRound(m,"h"));
 assert.ok(h.launcherCalibrated);assert.equal(h.maxHp,600);assert.ok(removeLauncher(m,"h",bench));
 assert.ok(h.launcherCalibrated);assert.equal(h.maxHp,600);assert.equal(fireRound(m,"h"),null);
 assert.ok(installLauncher(m,"h",bench));updateMatch(m,.3);assert.ok(fireRound(m,"h"));assert.equal(h.maxHp,600);
});
