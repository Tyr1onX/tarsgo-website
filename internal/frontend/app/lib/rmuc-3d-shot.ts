import * as THREE from "three";
import { fireRound, damageTarget, type Match, type Target } from "./rmuc-3d-match.ts";

import { runeHit } from "./rmuc-3d-mechanisms.ts";

const RANGE = 35;

// The first actual surface blocks the shot even if it has no damage target.
export function traceArenaShot(ray: THREE.Raycaster, roots: THREE.Object3D[], from: THREE.Vector3, direction: THREE.Vector3) {
  ray.set(from,direction);
  ray.near=0;
  ray.far=RANGE;
  return ray.intersectObjects(roots,true)[0];
}

export function resolveArenaShot(match: Match, id: string, ray: THREE.Raycaster, roots: THREE.Object3D[], from: THREE.Vector3, direction: THREE.Vector3) {
  const calibration=match.robots.find(r=>r.id===id)?.launcher==="test";
  const shooter=fireRound(match,id);
  if(!shooter)return null;
  const hit=traceArenaShot(ray,roots,from,direction);
  let node: THREE.Object3D|null=hit?.object??null;
  while(node&&!node.userData.target&&!node.userData.runeDetector)node=node.parent;
  const target=(node?.userData.runeDetector&&hit?runeHit(node,hit.point,direction):node?.userData.target) as Target|undefined;
  const damage=target&&!calibration?damageTarget(match,shooter,target):0;
  return {shooter,hit,target,damage,to:hit?.point??from.clone().addScaledVector(direction,RANGE)};
}
