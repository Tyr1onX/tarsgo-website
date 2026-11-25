import assert from "node:assert/strict";
import {test} from "node:test";
import * as T from "three";
import {readRobotSight,followOffset,translatedOrbit} from "./rmuc-3d-spectator.ts";
import {createRobotPreview,aimWeapon} from "./rmuc-3d-robots.ts";

test("read-only virtual sight matches actual current bore without changing robot or joints",()=>{
 for(const kind of ["hero","infantry03","infantry04","sentry"]){
  const robot=createRobotPreview(kind);robot.position.set(1,2,3);robot.rotation.y=.7;robot.scale.setScalar(.8);
  const expected=aimWeapon(robot,1.1,.13);
  const snapshot=()=>[robot,...robot.children,robot.getObjectByName("gimbal"),robot.getObjectByName("weapon-pitch")].map(o=>[o.position.toArray(),o.quaternion.toArray(),o.scale.toArray()]);
  const before=snapshot(),eye=new T.Vector3(),direction=new T.Vector3();
  assert.equal(readRobotSight(robot,eye,direction),true);
  assert.ok(eye.distanceTo(expected.origin)<1e-10);assert.ok(direction.distanceTo(expected.direction)<1e-10);
  assert.deepEqual(snapshot(),before);
 }
});
test("world-space follow offset remains independent of subsequent chassis rotation",()=>{
 const robot=createRobotPreview("infantry03"),camera=new T.PerspectiveCamera(),target=new T.Vector3();
 camera.position.copy(followOffset(robot));const offset=camera.position.clone();
 robot.rotation.y+=Math.PI;robot.position.set(2,0,3);
 translatedOrbit(camera,target,robot.position,1);
 assert.ok(camera.position.clone().sub(target).distanceTo(offset)<1e-10);
 assert.deepEqual(target.toArray(),[2,0,3]);
});
