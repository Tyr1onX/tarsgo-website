import assert from "node:assert/strict";
import {test} from "node:test";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {MeshoptDecoder} from "three/addons/libs/meshopt_decoder.module.js";
import {createMatch,startMatch,updateMatch,purchaseAmmo,fireRound,damageTarget} from "./rmuc-3d-match.ts";
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
test("outpost stop, protected base, ten second siege, time and tie breaks",()=>{
 const m=createMatch(roster,1,1);startMatch(m);updateMatch(m,5);
 assert.ok(m.pose.outpostAngle.red>0);
 const r=m.robots[0];assert.equal(damageTarget(m,r,{type:"base",team:"blue"}),0);
 for(let i=0;i<50;i++)damageTarget(m,r,{type:"outpost",team:"blue"});
 assert.equal(m.sides.blue.outpost,0);
 const angle=m.pose.outpostAngle.blue;updateMatch(m,175);
 assert.equal(m.pose.outpostAngle.blue,angle);assert.equal(m.sides.blue.cover,false);
 updateMatch(m,9,{red:false,blue:true});assert.equal(m.sides.blue.cover,false);
 updateMatch(m,1,{red:false,blue:true});assert.equal(m.sides.blue.cover,true);
 assert.equal(damageTarget(m,r,{type:"base",team:"blue"}),20);
 updateMatch(m,230);assert.equal(m.phase,"finished");assert.equal(m.winner,"red");
 assert.equal(m.sides.red.coins,1600);assert.equal(m.elapsed,420);
 assert.equal(fireRound(m,"r"),null);
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
