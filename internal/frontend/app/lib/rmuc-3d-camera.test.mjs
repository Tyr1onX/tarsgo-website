import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { frameArena, lookDirection, turnView } from "./rmuc-3d-camera.ts";
import { ROBOT_PREVIEWS, createRobotPreview } from "./rmuc-3d-robots.ts";
import { createStadium, STADIUM_WIDTH, STADIUM_DEPTH } from "./rmuc-3d-stadium.ts";

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

test("look turns horizontally and vertically without moving the observer", () => {
  const initial = { yaw: 0, pitch: 0 };
  assert.deepEqual(lookDirection(initial).toArray(), [-0,0,-1]);
  const right = turnView(initial, Math.PI / .007, 0);
  assert.ok(lookDirection(right).distanceTo(new THREE.Vector3(1,0,0)) < 1e-9);
  assert.ok(lookDirection(turnView(initial, 0, -180)).y > .5);
  assert.equal(turnView(initial, 0, 1e5).pitch, -1.4);
  assert.deepEqual(initial, { yaw: 0, pitch: 0 });
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

test("stadium adds high and spacious red-blue stands with bounded instance draw calls", () => {
  const stadium = createStadium();
  stadium.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(stadium);
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.x >= STADIUM_WIDTH && size.z >= STADIUM_DEPTH && size.y >= 15);
  const instances = stadium.children.filter(child => child.isInstancedMesh);
  assert.ok(instances.length <= 10);
  assert.ok(instances.some(mesh => mesh.material.color.getHex() === 0x63323b));
  assert.ok(instances.some(mesh => mesh.material.color.getHex() === 0x304a73));
  const textures = new Set(instances.map(mesh=>mesh.material.map).filter(Boolean));
  assert.equal(textures.size,2);
  assert.ok([...textures].every(texture=>texture.image.width===128 && texture.image.height===128));
});
