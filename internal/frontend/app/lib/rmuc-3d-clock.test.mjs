import test from "node:test";
import assert from "node:assert/strict";
import {ArenaClock,MATCH_STEPS,SIM_STEP_MS} from "./rmuc-3d-clock.ts";
import {createMatch,startMatch,updateMatch,activateRune,selectDart,openDart,launchDart,dartStatus} from "./rmuc-3d-match.ts";
test("integer tick sequence unaffected by RAF cadence, long frame debt, or acceleration",()=>{
 const traces=[];
 for(const intervals of [[1000/60],[1000/30,5,50,250],[1000]]){
  const c=new ArenaClock(),trace=[];let now=0,i=0;c.deposit(now);
  while(c.tick<MATCH_STEPS){now+=intervals[i++%intervals.length];c.deposit(now);c.run(t=>{trace.push(t);return t<MATCH_STEPS},intervals[0]===1000?40:3);}
  traces.push(trace);assert.equal(c.tick,MATCH_STEPS);assert.equal(c.debt,0);
 }
 assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[0],traces[2]);
});
test("background time is not deposited and debt is capped per frame",()=>{
 const c=new ArenaClock();c.deposit(0);c.deposit(1000);assert.equal(c.run(()=>true),3);assert.equal(c.debt,925);
 c.pause();c.deposit(99000);assert.equal(c.debt,925);c.run(()=>true);assert.equal(c.tick,6);
});
test("seeded referee random streams are cloneable and unaffected by unrelated draws",()=>{
 const roster=[{id:"r",team:"red",heavy:false,maxHp:200},{id:"b",team:"blue",heavy:false,maxHp:200}];
 const a=createMatch(roster,undefined,undefined,[],{},42),b=structuredClone(a);
 for(const m of [a,b]){startMatch(m);updateMatch(m,30);selectDart(m,"red","randomMoving");openDart(m,"red");}
 activateRune(a,"blue");activateRune(a,"red");activateRune(b,"red");
 assert.deepEqual(a.sides.red.rune,b.sides.red.rune);
 assert.deepEqual(a.sides.red.dart,b.sides.red.dart);
 for(const m of [a,b]){updateMatch(m,7);assert.ok(dartStatus(m,"red").canFire);launchDart(m,"red");updateMatch(m,3);}
 assert.deepEqual(a.sides.red.dart,b.sides.red.dart);
});

test("new input does not drive historical catch-up ticks",()=>{
 const c=new ArenaClock();c.deposit(0);c.deposit(5000);
 const press=c.inputTick(5000),release=c.inputTick(5180);
 assert.equal(press,201);assert.equal(release,208);
 c.deposit(5200);
 let driven=0,history=0;
 while(c.debt>=SIM_STEP_MS)c.run(t=>{if(t<press)history++;if(t>=press&&t<release)driven++;return true;},8);
 assert.equal(history,200);assert.equal(driven,7);
 assert.equal(c.inputTick(5000),c.tick+1,"late input never rewinds executed ticks");
});
