import * as THREE from "three";

// Read the exact current bore without invoking any aiming function or changing joints.
export function readRobotSight(robot:THREE.Object3D,eye:THREE.Vector3,direction:THREE.Vector3){
  const muzzle=robot.getObjectByName("weapon-muzzle"),mount=robot.getObjectByName("driver-eye");
  const joint=muzzle??mount??robot;
  joint.getWorldPosition(eye);
  direction.set(0,0,-1).applyQuaternion(joint.getWorldQuaternion(new THREE.Quaternion())).normalize();
  return muzzle!==undefined;
}
export function followOffset(robot:THREE.Object3D){
  const dir=new THREE.Vector3(),eye=new THREE.Vector3();readRobotSight(robot,eye,dir);
  dir.y=0;if(dir.lengthSq()<1e-6)dir.set(0,0,-1);dir.normalize();
  const scale=THREE.MathUtils.clamp(robot.userData.eyeHeight??1,.7,1.3);
  return dir.multiplyScalar(-3.4*scale).add(new THREE.Vector3(0,2*scale,0));
}
// Do not inherit chassis yaw. The orbit offset is kept in world space, and
// only the target translation follows the robot after the initial selection.
export function translatedOrbit(camera:THREE.PerspectiveCamera,target:THREE.Vector3,next:THREE.Vector3,alpha:number){
  const delta=next.clone().sub(target).multiplyScalar(alpha);target.add(delta);camera.position.add(delta);
}
