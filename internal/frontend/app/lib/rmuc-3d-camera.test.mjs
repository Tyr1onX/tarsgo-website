import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { frameArena, clampFollowCamera } from "./rmuc-3d-camera.ts";
import { ROBOT_PREVIEWS, createRobotPreview } from "./rmuc-3d-robots.ts";

test("all four tactical presets frame the requested field on desktop and portrait screens", () => {
  const box = new THREE.Box3(new THREE.Vector3(-14,0,-8),new THREE.Vector3(14,3.8,8));
  for (const aspect of [16/9,1,390/844]) for (const view of ["all","red","blue","top"]) {
    const camera = new THREE.PerspectiveCamera(48,aspect,.025,160);
    const target = frameArena(camera,view,box);
    assert.deepEqual(camera.up.toArray(),[0,1,0]);
    if (view==="red") assert.ok(target.x>0);
    if (view==="blue") assert.ok(target.x<0);
    for(const x of [view==="red"?0:-14,view==="blue"?0:14])
      for(const y of [0,3.8]) for(const z of [-8,8]) {
        const p = new THREE.Vector3(x,y,z).project(camera);
        assert.ok(Math.abs(p.x)<=1 && Math.abs(p.y)<=1 && p.z<=1 && p.z>=-1,view+" "+aspect+" "+p.toArray());
      }
  }
});

test("follow camera cannot leave the inner physical field", () => {
  const start=new THREE.Vector3(13,.9,7);
  const result=clampFollowCamera(start,new THREE.Vector3(17,2,11),13.88,7.38);
  assert.ok(result.x<=13.88 && result.z<=7.38+1e-8);
  assert.ok(result.distanceTo(start)>0);
  assert.deepEqual(clampFollowCamera(start,new THREE.Vector3(10,2,6),13.88,7.38).toArray(),[10,2,6]);
});

test("every driveable model has a camera mount attached to its rotating gimbal", () => {
  for(const entry of ROBOT_PREVIEWS) {
    const model=createRobotPreview(entry.kind);
    if(!model.userData.driveable) continue;
    const gimbal=model.getObjectByName("gimbal");
    const eye=gimbal.getObjectByName("driver-eye");
    assert.ok(eye,entry.id);
    const before=eye.getWorldPosition(new THREE.Vector3());
    gimbal.rotation.y=Math.PI/2;
    const after=eye.getWorldPosition(new THREE.Vector3());
    assert.ok(before.distanceTo(after)>.05,entry.id);
    assert.ok(Math.abs(before.y-after.y)<1e-6,entry.id);
  }
});
