import * as THREE from "three";
import { fireRound, damageTarget, type Match, type Target, type ArmorHit } from "./rmuc-3d-match.ts";

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

const armorFrames=new WeakMap<THREE.Object3D,ArmorFrame[]>();
type ArmorFrame={node:THREE.Object3D;origin:THREE.Vector3;right:THREE.Vector3;up:THREE.Vector3;width:number;height:number};
// Bind the actual rendered detector geometry once in its moving local frame.
// A projected face rectangle is a training approximation for CAD edges.
export function bindArmorFrame(node:THREE.Object3D,body:THREE.Object3D){
  node.updateWorldMatrix(true,true);
  const center=new THREE.Box3().setFromObject(node,true).getCenter(new THREE.Vector3());
  const outward=center.clone().sub(body.getWorldPosition(new THREE.Vector3()));outward.y=0;outward.normalize();
  if(node instanceof THREE.Mesh&&node.userData.armorSurface){
    node.geometry.computeBoundingBox();
    const size=node.geometry.boundingBox!.getSize(new THREE.Vector3());
    const normal=new THREE.Vector3(size.x<size.z?1:0,0,size.x<size.z?0:1).transformDirection(node.matrixWorld);
    if(normal.dot(outward)<0)normal.negate();
    outward.copy(normal);
  }
  const right=new THREE.Vector3(0,1,0).cross(outward).normalize(),up=outward.clone().cross(right).normalize();
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const point=new THREE.Vector3();
  node.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;
    const p=o.geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      point.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld).sub(center);
      const x=point.dot(right),y=point.dot(up);
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    }
  });
  const base=center.addScaledVector(right,minX).addScaledVector(up,minY);
  const origin=node.worldToLocal(base.clone());
  const frame:ArmorFrame={node,origin,right:node.worldToLocal(base.clone().add(right)).sub(origin),up:node.worldToLocal(base.clone().add(up)).sub(origin),width:maxX-minX,height:maxY-minY};
  armorFrames.set(node,[frame]);
  return frame;
}
export function aliasArmorFrames(overlay:THREE.Object3D,plates:readonly THREE.Object3D[]){
  const frames=plates.flatMap(plate=>armorFrames.get(plate)??[]);if(frames.length)armorFrames.set(overlay,frames);
}
export function armorHit(hit:THREE.Intersection|undefined):ArmorHit|undefined{
  if(!hit)return;
  let o:THREE.Object3D|null=hit.object;
  while(o&&!armorFrames.has(o))o=o.parent;
  const frames=o?armorFrames.get(o):undefined;
  const f=frames?.reduce((best,frame)=>frame.node.getWorldPosition(new THREE.Vector3()).distanceToSquared(hit.point)<best.node.getWorldPosition(new THREE.Vector3()).distanceToSquared(hit.point)?frame:best);
  if(!f||!f.width||!f.height)return;
  const p=f.node.worldToLocal(hit.point.clone()).sub(f.origin);
  const clamp=(n:number,max:number)=>Math.min(max,Math.max(0,n));
  return {x:clamp(p.dot(f.right)/f.right.lengthSq(),f.width),y:clamp(p.dot(f.up)/f.up.lengthSq(),f.height),area:f.width*f.height};
}

export function resolveArenaShot(match: Match, id: string, ray: THREE.Raycaster, roots: THREE.Object3D[], from: THREE.Vector3, direction: THREE.Vector3) {
  const calibration=match.robots.find(r=>r.id===id)?.launcher==="test";
  const shooter=fireRound(match,id);
  if(!shooter)return null;
  const hit=traceArenaShot(ray,roots,from,direction);
  const target=arenaHitTarget(hit,direction);
  const damage=target&&!calibration?damageTarget(match,shooter,target,armorHit(hit)):0;
  return {shooter,hit,target,damage,to:hit?.point??from.clone().addScaledVector(direction,RANGE)};
}
