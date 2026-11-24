import * as THREE from "three";
import { fireRound, damageTarget, type Match, type Target } from "./rmuc-3d-match.ts";

import { runeHit } from "./rmuc-3d-mechanisms.ts";

const RANGE = 35;

// The first actual surface blocks the shot even if it has no damage target.
export function traceArenaShot(ray: THREE.Raycaster, roots: THREE.Object3D[], from: THREE.Vector3, direction: THREE.Vector3) {
  ray.set(from,direction);
  ray.near=0;
  ray.far=RANGE;
  // The arena consists of rigid triangle meshes. Order candidates by a
  // conservative world-space bounds entry, then skip surfaces beyond the
  // nearest exact triangle hit. Bounds never decide damage or visibility.
  const candidates:{object:THREE.Mesh;entry:number;order:number}[]=[];
  const box=new THREE.Box3(),point=new THREE.Vector3();
  let order=0,unsupported=false;
  for(const root of roots)root.traverse(object=>{
    if(!object.layers.test(ray.layers))return;
    if(object.raycast===THREE.Object3D.prototype.raycast)return;
    if(!(object instanceof THREE.Mesh)||object.raycast!==THREE.Mesh.prototype.raycast||object.morphTargetInfluences){
      unsupported=true;return;
    }
    if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();
    box.copy(object.geometry.boundingBox!).applyMatrix4(object.matrixWorld).expandByScalar(1e-7);
    const entry=box.containsPoint(from)?0:ray.ray.intersectBox(box,point)?.distanceTo(from);
    if(entry!==undefined&&entry<=RANGE)candidates.push({object,entry,order:order++});
  });
  if(unsupported)return ray.intersectObjects(roots,true)[0];
  candidates.sort((a,b)=>a.entry-b.entry);
  let closest:THREE.Intersection|undefined,closestOrder=Infinity;
  for(const candidate of candidates){
    if(closest&&candidate.entry>closest.distance+1e-7)break;
    const hit=ray.intersectObject(candidate.object,false)[0];
    if(hit&&(!closest||hit.distance<closest.distance||hit.distance===closest.distance&&candidate.order<closestOrder)){
      closest=hit;closestOrder=candidate.order;
    }
  }
  return closest;
}

export function arenaHitTarget(hit: THREE.Intersection|undefined,direction: THREE.Vector3): Target|undefined {
  let node: THREE.Object3D|null=hit?.object??null;
  while(node&&!node.userData.target&&!node.userData.runeDetector)node=node.parent;
  return (node?.userData.runeDetector&&hit?runeHit(node,hit.point,direction):node?.userData.target) as Target|undefined;
}

export function resolveArenaShot(match: Match, id: string, ray: THREE.Raycaster, roots: THREE.Object3D[], from: THREE.Vector3, direction: THREE.Vector3) {
  const calibration=match.robots.find(r=>r.id===id)?.launcher==="test";
  const shooter=fireRound(match,id);
  if(!shooter)return null;
  const hit=traceArenaShot(ray,roots,from,direction);
  const target=arenaHitTarget(hit,direction);
  const damage=target&&!calibration?damageTarget(match,shooter,target):0;
  return {shooter,hit,target,damage,to:hit?.point??from.clone().addScaledVector(direction,RANGE)};
}
