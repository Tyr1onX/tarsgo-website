import test from "node:test";
import assert from "node:assert/strict";
import {Vector3} from "three";
import {clearDefeatedPath,DEFEATED_PUSH_SPEED,stepChassis} from "./rmuc-3d-navigation.ts";
import {createMatch,startMatch,updateMatch,driveSpeed,canSpinChassis,damageTarget,fireRound} from "./rmuc-3d-match.ts";
const o=(x,z=0)=>({position:new Vector3(x,0,z),radius:.3});
const flat={heightAt:()=>0};
test("R51 clearance moves only an obstructing defeated body, bounded per defeat",()=>{
 const bot=o(0),dead=o(.6),pushed=new Map(),goal=new Vector3(5,0,0);
 assert.equal(clearDefeatedPath(flat,bot,goal,.025,[dead],()=>false,pushed),0);
 assert.equal(clearDefeatedPath(flat,bot,goal,.025,[dead],x=>x===dead,pushed),DEFEATED_PUSH_SPEED*.025);
 assert.ok(Math.abs(dead.position.x-.60625)<1e-8);
 for(let i=0;i<200;i++)clearDefeatedPath(flat,bot,goal,.025,[dead],x=>x===dead,pushed);
 assert.ok(Math.abs(dead.position.x-1.2)<1e-8);assert.ok(Math.abs(bot.position.x-.6)<1e-8);
 assert.equal(clearDefeatedPath(flat,bot,goal,.025,[dead],()=>true,pushed),0);
});
test("R51 clearance cannot push through another robot, field edge or CAD step",()=>{
 const goal=new Vector3(20,0,0);
 for(const [bot,dead,others,terrain] of [[o(0),o(.6),[o(1.2)],flat],[o(13.1),o(13.7),[],flat],[o(0),o(.6),[],{heightAt:x=>x>.9?1:0}]]){
  const before=dead.position.clone(),pushed=new Map();
  assert.equal(clearDefeatedPath(terrain,bot,goal,.025,[dead,...others],x=>x===dead,pushed),0);
  assert.deepEqual(dead.position.toArray(),before.toArray());assert.equal(pushed.size,0);
 }
});
test("R51 does not move bodies outside the attempted path",()=>{
 const bot=o(0),dead=o(0,.6),pushed=new Map();
 assert.equal(clearDefeatedPath(flat,bot,new Vector3(5,0,0),.025,[dead],()=>true,pushed),0);
 assert.equal(dead.position.z,.6);
});

test("virtual spin uses fixed-step authoritative yaw and the existing footprint",()=>{
 const run=()=>{
  const bot=o(0),motion={speed:0,yaw:0};
  for(let i=0;i<40;i++)assert.equal(stepChassis(flat,bot,motion,null,0,.025,[],undefined,true),0);
  assert.ok(Math.abs(motion.yaw-Math.PI*2)<1e-9);
  assert.deepEqual(bot.position.toArray(),[0,0,0]);
  const blocked=o(1),goal=new Vector3(5,0,0);
  for(let i=0;i<120;i++)stepChassis(flat,bot,motion,goal,2,.025,[blocked],undefined,true);
  assert.ok(bot.position.x<=.4001);
  assert.ok(Math.abs(motion.yaw-Math.PI*8)<1e-9);
  const old=motion.yaw;
  stepChassis(flat,bot,motion,null,0,.025,[blocked],undefined,false);
  assert.equal(motion.yaw,old);
  return [bot.position.toArray(),motion];
 };
 assert.deepEqual(run(),run());
 const bot=o(13.6),m={speed:0,yaw:0};
 for(let i=0;i<100;i++)stepChassis(flat,bot,m,new Vector3(20,0,0),2,.025,[],undefined,true);
 assert.ok(bot.position.x<=13.7001);
});

test("virtual spin shares the infantry power/referee restrictions and grants no protection",()=>{
 const specs=[{id:"r",team:"red",heavy:false,maxHp:200},{id:"b",team:"blue",heavy:false,maxHp:200},{id:"h",team:"red",heavy:true,maxHp:400},{id:"s",team:"blue",heavy:false,sentry:true,maxHp:400}];
 const m=createMatch(specs,1,1),[r,b,h,s]=m.robots;
 assert.equal(canSpinChassis(m,r),false);startMatch(m);
 assert.equal(canSpinChassis(m,r),true);assert.equal(canSpinChassis(m,h),false);assert.equal(canSpinChassis(m,s),false);
 assert.equal(driveSpeed(m,r,0,true),0);assert.equal(r.powerDemand,1);
 b.ammo=10;const activeShot=fireRound(m,"b");assert.ok(activeShot);
 assert.equal(damageTarget(m,activeShot,{type:"robot",id:"r"}),20);
 assert.equal(r.hp,180);assert.equal(canSpinChassis(m,r),true);
 const walking=driveSpeed(m,r,1);assert.equal(driveSpeed(m,r,2,true),walking);assert.equal(r.powerDemand,2);
 for(let i=0;i<100&&r.powerLockUntil===0;i++){driveSpeed(m,r,1,true);updateMatch(m,.025);}
 assert.ok(r.powerLockUntil>m.elapsed);assert.equal(canSpinChassis(m,r),false);
 assert.equal(driveSpeed(m,r,1,true),0);assert.equal(r.powerDemand,0);
 b.ammo=10;const shot=fireRound(m,"b");assert.ok(shot);
 assert.equal(damageTarget(m,shot,{type:"robot",id:"r"}),20);
 r.hp=0;assert.equal(canSpinChassis(m,r),false);
 r.hp=20;r.revival={state:"revived",mode:"read",at:0,weak:true,immuneUntil:0};assert.equal(canSpinChassis(m,r),false);
});
