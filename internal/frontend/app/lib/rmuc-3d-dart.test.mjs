import assert from "node:assert/strict";
import {test} from "node:test";
import {createMatch,startMatch,updateMatch,selectDart,openDart,launchDart,dartStatus,dartPose} from "./rmuc-3d-match.ts";
function game(){const m=createMatch([{id:"r",team:"red",maxHp:200,heavy:false},{id:"b",team:"blue",maxHp:200,heavy:false}],1,1);startMatch(m);return m;}
test("virtual dart opportunity, opening, flight, switch, cooldown, second opportunity and reset",()=>{
 const m=game();
 updateMatch(m,29.9);assert.equal(openDart(m,"red"),false);
 updateMatch(m,.1);assert.equal(openDart(m,"red"),true);assert.equal(launchDart(m,"red"),false);
 updateMatch(m,7);assert.equal(launchDart(m,"red"),true);assert.equal(launchDart(m,"red"),false);
 updateMatch(m,2.5);assert.equal(m.sides.blue.outpost,0);assert.equal(m.sides.blue.outpostZoneUntil,69.5);
 assert.equal(dartStatus(m,"blue").blind,10);assert.equal(selectDart(m,"red","fixed"),true);assert.equal(selectDart(m,"red","randomFixed"),false);
 updateMatch(m,2);assert.ok(launchDart(m,"red"));updateMatch(m,2.5);
 assert.equal(m.sides.blue.base,9800);assert.equal(m.robots[0].xp,200);
 updateMatch(m,89-m.elapsed);assert.equal(openDart(m,"red"),false);
 updateMatch(m,240-m.elapsed);assert.ok(selectDart(m,"red","terminalMoving"));assert.ok(openDart(m,"red"));updateMatch(m,7);
 assert.ok(launchDart(m,"red"));updateMatch(m,2.5);assert.equal(m.sides.blue.base,8550);assert.equal(m.robots[1].hp,100);assert.equal(m.sides.blue.cover,true);assert.equal(m.robots[0].xp,2200);
 updateMatch(m,2);assert.ok(launchDart(m,"red"));updateMatch(m,2.5);assert.equal(m.robots[1].hp,0);assert.equal(m.robots[1].revival.state,"dead");assert.equal(launchDart(m,"red"),false);assert.equal(dartStatus(m,"red").remaining,0);
 assert.equal(dartStatus(game(),"red").remaining,4);
});
test("virtual miss consumes a dart but does not grant damage or experience",()=>{
 const m=game();updateMatch(m,30);assert.ok(selectDart(m,"red","randomMoving"));assert.ok(openDart(m,"red"));updateMatch(m,7);assert.ok(launchDart(m,"red",false));updateMatch(m,2.5);assert.equal(m.sides.blue.base,10000);assert.equal(m.robots[0].xp,0);assert.equal(dartStatus(m,"red").remaining,3);assert.ok(Math.abs(dartPose(m,"blue").target)<=.28);
});

test("dart launch is not a hit; cover starts once and reports actual completion",()=>{
 const m=game(),events=[],damage=[];m.onEvent=e=>events.push(e);m.onDamage=e=>damage.push(e);
 updateMatch(m,240);assert.ok(selectDart(m,"red","terminalMoving"));assert.ok(openDart(m,"red"));updateMatch(m,7);
 assert.ok(launchDart(m,"red"));assert.equal(events.at(-1).type,"dart-launch");assert.equal(damage.length,0);
 updateMatch(m,2.5);
 const hit=events.find(e=>e.type==="dart-hit");assert.ok(hit);assert.equal(hit.damage,damage.reduce((n,e)=>n+e.amount,0));
 assert.equal(events.filter(e=>e.type==="cover-opening").length,1);
 // Current referee advances the cover in the same update interval as the dart settlement.
 updateMatch(m,1);
 assert.equal(m.pose.cover.blue,1);assert.equal(events.filter(e=>e.type==="cover-open").length,1);
 updateMatch(m,1);assert.equal(events.filter(e=>e.type==="cover-open").length,1);
});
