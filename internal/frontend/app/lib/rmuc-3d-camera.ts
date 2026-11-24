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

// Keep the follow camera on the inner side of the visible arena barrier.
export function clampFollowCamera(from: THREE.Vector3, desired: THREE.Vector3, halfX: number, halfZ: number) {
  const delta = desired.clone().sub(from);
  let t = 1;
  for (const [axis, limit] of [["x",halfX],["z",halfZ]] as const) {
    if (delta[axis] > 0) t = Math.min(t,(limit-from[axis])/delta[axis]);
    else if (delta[axis] < 0) t = Math.min(t,(-limit-from[axis])/delta[axis]);
  }
  return desired.copy(from).addScaledVector(delta,THREE.MathUtils.clamp(t,0,1));
}
