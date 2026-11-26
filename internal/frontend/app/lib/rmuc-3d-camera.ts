import * as THREE from "three";
import {flightIntent,type MoveVector,ZERO_MOVE} from "./rmuc-3d-input.ts";

export type TacticalView = "all" | "red" | "blue" | "top";

// Fit the selected half/full field to both screen dimensions, including tall
// facilities. World up stays +Y even when switching to the overhead camera.
export function frameArena(camera: THREE.PerspectiveCamera, view: TacticalView, bounds: THREE.Box3) {
  const region = bounds.clone();
  if (view === "red") region.min.x = Math.max(0, region.min.x);
  if (view === "blue") region.max.x = Math.min(0, region.max.x);
  const target = region.getCenter(new THREE.Vector3());
  const direction = view === "top" ? new THREE.Vector3(0,1,.0001) :
    new THREE.Vector3(view === "blue" ? -.46 : view === "all" && camera.aspect >= 1 ? .14 : .46,.79,.69);
  direction.normalize();
  camera.up.set(0,1,0);
  camera.position.copy(target).add(direction);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  const inverse = camera.quaternion.clone().invert();
  const halfV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const halfH = halfV * camera.aspect;
  let distance = 0;
  for (const x of [region.min.x,region.max.x]) for (const y of [region.min.y,region.max.y]) for (const z of [region.min.z,region.max.z]) {
    const corner = new THREE.Vector3(x,y,z).sub(target).applyQuaternion(inverse);
    distance = Math.max(distance, corner.z + Math.max(Math.abs(corner.x)/halfH,Math.abs(corner.y)/halfV)*1.12);
  }
  camera.position.copy(target).addScaledVector(direction,distance);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return target;
}

export type LookAngles = { yaw: number; pitch: number };

export function turnView(look: LookAngles, dx: number, dy: number): LookAngles {
  return { yaw: look.yaw - dx * .0035, pitch: THREE.MathUtils.clamp(look.pitch - dy * .0035, -1.4, 1.4) };
}

export function lookDirection(look: LookAngles, target = new THREE.Vector3()) {
  const { yaw, pitch } = look;
  return target.set(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
}

export function flightBounds(bounds:THREE.Box3){const result=bounds.clone();const size=result.getSize(new THREE.Vector3());result.expandByVector(new THREE.Vector3(5,0,5));result.min.y-=.5;result.max.y+=Math.max(12,Math.max(size.x,size.z));return result;}
export function flightStep(position:THREE.Vector3,look:LookAngles,keys:ReadonlySet<string>,speed:number,dt:number,bounds:THREE.Box3,touch:MoveVector=ZERO_MOVE){
 const {f,r,u,boost}=flightIntent(keys,touch);
 const norm=Math.hypot(f,r,u);if(!norm)return false;
 const d=lookDirection(look).multiplyScalar(f).add(new THREE.Vector3(Math.cos(look.yaw)*r,u,-Math.sin(look.yaw)*r));
 if(d.lengthSq()>0)d.normalize().multiplyScalar(Math.min(1,norm)*speed*(boost?3:1)*Math.min(.05,Math.max(0,dt)));
 position.add(d).clamp(bounds.min,bounds.max);return true;
}
