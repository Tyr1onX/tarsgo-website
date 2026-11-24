import test from "node:test";
import assert from "node:assert/strict";
import {Vector3} from "three";
import {clearDefeatedPath,DEFEATED_PUSH_SPEED} from "./rmuc-3d-navigation.ts";
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
