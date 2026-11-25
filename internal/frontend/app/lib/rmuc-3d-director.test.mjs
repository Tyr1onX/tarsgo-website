import assert from "node:assert/strict";
import {test} from "node:test";
import {createDirector} from "./rmuc-3d-director.ts";
import {createMatch,startMatch} from "./rmuc-3d-match.ts";
const match=()=>{const m=createMatch([{id:"r",team:"red",maxHp:200,heavy:false},{id:"b",team:"blue",maxHp:200,heavy:false}],1,1,[],{},2061);startMatch(m);return m;};
test("director respects dwell and major events, stops until explicitly restarted, and does not write match",()=>{
 const m=match(),d=createDirector();d.start(0);
 d.event({type:"assembly-start",team:"red",at:1});m.elapsed=3;assert.equal(d.choose(m),null);
 m.elapsed=4;let state=JSON.stringify(m);assert.deepEqual(d.choose(m),{kind:"detail",team:"red",object:"core"});assert.equal(JSON.stringify(m),state);
 d.event({type:"cover-opening",team:"blue",location:"blue",at:5});
 m.elapsed=5;assert.equal(d.choose(m),null);m.elapsed=6;assert.deepEqual(d.choose(m),{kind:"detail",team:"blue",object:"base"});
 d.stop();d.event({type:"outpost-rebuilt",location:"red",at:8});m.elapsed=15;assert.equal(d.choose(m),null);assert.equal(d.enabled,false);
 d.start(m.elapsed);m.elapsed=20;assert.equal(d.choose(m),null);
});
test("assembly steps restore candidate coverage; active assembly is not interrupted and duplicate shots stay stable",()=>{
 const m=match(),d=createDirector();d.start(0);
 m.sides.red.tech.attempt={robot:"r",deadAt:null,slots:[{core:"red"}]};
 d.event({type:"assembly-step-complete",team:"red",core:"red",at:1});m.elapsed=4;
 assert.deepEqual(d.choose(m),{kind:"detail",team:"red",object:"core"});
 d.event({type:"cover-opening",location:"blue",at:5});m.elapsed=6;assert.equal(d.choose(m),null);
 m.elapsed=10;assert.equal(d.choose(m),null);
 m.sides.red.tech.attempt=null;assert.deepEqual(d.choose(m),{kind:"detail",team:"blue",object:"base"});
 d.start(20);d.damage({target:{type:"robot",id:"r"},at:21});m.elapsed=24;assert.deepEqual(d.choose(m),{kind:"follow",robot:"r"});
 d.damage({target:{type:"robot",id:"r"},at:31});m.elapsed=32;assert.equal(d.choose(m),null);
 m.elapsed=39;assert.deepEqual(d.choose(m),{kind:"all"});
});
test("sustained actual damage selects AI first person; stale events expire; dead robot does not become first person",()=>{
 const m=match(),d=createDirector();d.start(0);
 for(const at of [3,3.5,4])d.damage({target:{type:"robot",id:"r"},amount:20,at,source:"projectile"});
 m.elapsed=4;assert.deepEqual(d.choose(m),{kind:"ai-first",robot:"r"});
 m.elapsed=12;assert.deepEqual(d.choose(m),{kind:"all"});
 d.start(12);d.damage({target:{type:"robot",id:"r"},amount:20,at:12,source:"projectile"});m.elapsed=25;assert.equal(d.choose(m),null);
 d.start(25);for(const at of [28,28.5,29])d.damage({target:{type:"robot",id:"r"},amount:20,at,source:"projectile"});m.robots[0].hp=0;m.elapsed=29;assert.deepEqual(d.choose(m),{kind:"follow",robot:"r"});
});
