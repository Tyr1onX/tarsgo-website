import * as THREE from "three";

export type TacticalView = "all" | "red" | "blue" | "top";

// Fit the selected half/full field to both screen dimensions, including tall
// facilities. World up stays +Y even when switching to the overhead camera.
export function frameArena(camera: THREE.PerspectiveCamera, view: TacticalView, bounds: THREE.Box3) {
  const region = bounds.clone();
  if (view === "red") region.min.x = Math.max(0, region.min.x);
  if (view === "blue") region.max.x = Math.min(0, region.max.x);
  const target = region.getCenter(new THREE.Vector3());
  const direction = view === "top" ? new THREE.Vector3(0,1,.0001) :
    new THREE.Vector3(view === "blue" ? -.46 : .46,.79,.69);
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
