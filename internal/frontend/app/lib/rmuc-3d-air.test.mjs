import {test} from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {createAirSystem,airPadCenters} from "./rmuc-3d-air.ts";
const pads={red:new THREE.Vector3(1,2,-1),blue:new THREE.Vector3(-1,2,1)};
test("air system stores four vehicles, only launches during match step, hovers ten seconds, returns, resets",()=>{
  const s=createAirSystem(new THREE.Scene(),pads);
  assert.equal(s.sides.red.vehicles.length,4);
  assert.equal(s.view("red").length,1);
  assert.equal(s.view("all")[0].docked,4);
  for(let i=1;i<=160;i++)s.advance(i*.025,.025,()=>true);
  assert.equal(s.sides.red.vehicles[0].phase,"docked");
  for(let i=161;i<=400;i++)s.advance(i*.025,.025,()=>true);
  const v=s.sides.red.vehicles[0];assert.equal(v.phase,"hovering");
  assert.equal(s.view("red")[0].airborne.length,0);
  assert.equal(s.view("all")[0].airborne.length,1);
  assert.ok(Math.abs(v.position.y-v.home.y-.45)<1e-8);
  for(let i=401;i<=760;i++)s.advance(i*.025,.025,()=>true);
  assert.ok(v.hoverSince>=6.7&&v.hoverSince<=6.9);
  assert.equal(v.phase,"docked");
  assert.ok(v.position.equals(v.home));
  s.reset();assert.equal(s.view("all")[0].docked,4);assert.equal(v.hoverSince,0);
});
test("blocked clearance never launches and emergency stop prevents later sorties",()=>{
  const s=createAirSystem(new THREE.Scene(),pads);
  s.advance(5,.025,()=>false);assert.equal(s.view("all")[0].docked,4);
  for(let i=201;i<=260;i++)s.advance(i*.025,.025,()=>true);
  s.stop("red");assert.equal(s.sides.red.powered,false);
  for(let i=261;i<=3000;i++)s.advance(i*.025,.025,()=>true);
  assert.equal(s.sides.red.vehicles[0].phase,"stopped");
  assert.equal(s.sides.red.vehicles.slice(1).every(v=>v.phase==="docked"),true);
  s.finish();assert.equal(s.sides.blue.powered,false);assert.equal(s.view("all")[1].airborne.length,0);
  s.reset();assert.equal(s.sides.red.powered,true);
});
test("hangar pads use source occurrences instead of guessed world coordinates",()=>{
  const field=new THREE.Group();
  for(let i=4;i<=5;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(.589,.2,.589));m.name="centre-platform_0_source_1754789_"+i;m.position.set(i===4?1:-1,1.84,i===4?-1:1);field.add(m);}
  field.updateMatrixWorld(true);const p=airPadCenters(field);
  assert.equal(p.red.x,1);assert.equal(p.blue.x,-1);assert.ok(Math.abs(p.red.y-1.94)<1e-6);
});
