import assert from "node:assert/strict";
import {test} from "node:test";
import * as THREE from "three";
import {joystickVector,movementIntent} from "./rmuc-3d-input.ts";
import {flightBounds,flightStep} from "./rmuc-3d-camera.ts";
test("joystick has a radial dead zone and continuous direction and strength",()=>{
  assert.deepEqual(joystickVector(5,5,100),{f:0,r:0});
  const half=joystickVector(56,0,100);
  assert.ok(Math.abs(half.r-.5)<1e-9);
  for(let angle=0;angle<Math.PI*2;angle+=.2){
    const v=joystickVector(Math.cos(angle)*150,Math.sin(angle)*150,100);
    assert.ok(Math.abs(Math.hypot(v.f,v.r)-1)<1e-9);
    assert.ok(Math.abs(v.r-Math.cos(angle))<1e-9);
    assert.ok(Math.abs(v.f+Math.sin(angle))<1e-9);
  }
});
test("keyboard and joystick share bounded movement",()=>{
  const v=movementIntent(new Set(["KeyW","KeyD"]));
  assert.ok(Math.abs(Math.hypot(v.f,v.r)-1)<1e-9);
  assert.deepEqual(movementIntent(new Set(["KeyW"]),{f:-1,r:0}),{f:0,r:0});
});
test("free flight preserves partial movement and independent vertical motion",()=>{
  const bounds=flightBounds(new THREE.Box3(new THREE.Vector3(-14,0,-8),new THREE.Vector3(14,4,8)));
  const p=new THREE.Vector3(0,3,0),look={yaw:0,pitch:0};
  assert.ok(flightStep(p,look,new Set(),6,.05,bounds,{f:.5,r:0}));
  assert.ok(Math.abs(p.z+.15)<1e-9);
  assert.ok(flightStep(p,look,new Set(["Space"]),6,.05,bounds,{f:.5,r:0}));
  assert.ok(p.y>3&&p.z<-.15);
  const before=p.clone();assert.equal(flightStep(p,look,new Set(),6,.05,bounds),false);assert.deepEqual(p.toArray(),before.toArray());
});
