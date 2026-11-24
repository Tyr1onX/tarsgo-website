import * as THREE from "three";
import { type Target, type ArmorHit } from "./rmuc-3d-match.ts";

import { runeHit } from "./rmuc-3d-mechanisms.ts";

export const SHOT_RANGE=35;

type ShotSurface={root:THREE.Object3D;object:THREE.Mesh;bounds:THREE.Box3;order:number};
export type ShotIndex={roots:THREE.Object3D[];surfaces:ShotSurface[];unsupported:boolean};

// Build the conservative bounds once for a collision instant. Several
// projectiles can share these bounds; exact triangle hits remain authoritative.
export function prepareArenaShots(roots:THREE.Object3D[]):ShotIndex{
  const surfaces:ShotSurface[]=[];
  let unsupported=false;
  for(const root of roots)root.traverse(object=>{
    if(object.raycast===THREE.Object3D.prototype.raycast)return;
    if(!(object instanceof THREE.Mesh)||object.raycast!==THREE.Mesh.prototype.raycast||object.morphTargetInfluences){
      unsupported=true;return;
    }
    if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();
    const bounds=object.geometry.boundingBox!.clone().applyMatrix4(object.matrixWorld).expandByScalar(1e-7);
    surfaces.push({root,object,bounds,order:surfaces.length});
  });
  return {roots,surfaces,unsupported};
}

// Profiling short flight segments identified the 77,420-triangle CAD
// mesh_81 as the dominant exact-ray cost. Cull contiguous index blocks
// without changing any geometry, material, face index or triangle test.
// Three's native raycast honors drawRange; restore it synchronously.
type TriangleBlock={start:number;count:number;bounds:THREE.Box3};
const triangleBlocks=new WeakMap<THREE.BufferGeometry,TriangleBlock[]>();
function exactMeshHit(ray:THREE.Raycaster,mesh:THREE.Mesh){
  const geometry=mesh.geometry,index=geometry.index,range=geometry.drawRange;
  if(!index||index.count<60000||Array.isArray(mesh.material)||range.start!==0||range.count!==Infinity)
    return ray.intersectObject(mesh,false)[0];
  let blocks=triangleBlocks.get(geometry);
  if(!blocks){
    blocks=[];const point=new THREE.Vector3(),position=geometry.attributes.position;
    for(let start=0;start<index.count;start+=768){
      const count=Math.min(768,index.count-start),bounds=new THREE.Box3();
      for(let i=start;i<start+count;i++)bounds.expandByPoint(point.fromBufferAttribute(position,index.getX(i)));
      bounds.expandByScalar(1e-7);blocks.push({start,count,bounds});
    }
    triangleBlocks.set(geometry,blocks);
  }
  const inverse=new THREE.Matrix4().copy(mesh.matrixWorld).invert();
  const from=ray.ray.origin.clone().applyMatrix4(inverse),end=ray.ray.at(ray.far,new THREE.Vector3()).applyMatrix4(inverse);
  const direction=end.sub(from),length=direction.length();
  if(!length)return undefined;
  const local=new THREE.Ray(from,direction.multiplyScalar(1/length)),point=new THREE.Vector3();
  const candidates:{block:TriangleBlock;entry:number}[]=[];
  for(const block of blocks){
    const entry=block.bounds.containsPoint(from)?0:local.intersectBox(block.bounds,point)?.distanceTo(from);
    if(entry!==undefined&&entry<=length+1e-7)candidates.push({block,entry:entry/length*ray.far});
  }
  candidates.sort((a,b)=>a.entry-b.entry||a.block.start-b.block.start);
  let closest:THREE.Intersection|undefined;
  try{
    for(const {block,entry} of candidates){
      if(closest&&entry>closest.distance+1e-7)break;
      geometry.setDrawRange(block.start,block.count);
      const hit=ray.intersectObject(mesh,false)[0];
      if(hit&&(!closest||hit.distance<closest.distance||hit.distance===closest.distance&&(hit.faceIndex??0)<(closest.faceIndex??0)))closest=hit;
    }
  }finally{geometry.setDrawRange(0,Infinity);}
  return closest;
}

// A bounded flight segment and an AI sight ray use the same exact first hit.
// The index is valid only for the current rigid scene pose.
export function traceArenaShot(ray:THREE.Raycaster,roots:THREE.Object3D[],from:THREE.Vector3,direction:THREE.Vector3,
  range=SHOT_RANGE,index?:ShotIndex,exclude?:THREE.Object3D){
  ray.set(from,direction);ray.near=0;ray.far=range;
  const prepared=index??prepareArenaShots(roots);
  if(prepared.unsupported)return ray.intersectObjects(roots.filter(r=>r!==exclude),true)[0];
  const candidates:{surface:ShotSurface;entry:number}[]=[],point=new THREE.Vector3();
  for(const surface of prepared.surfaces){
    if(surface.root===exclude||!surface.object.layers.test(ray.layers))continue;
    const entry=surface.bounds.containsPoint(from)?0:ray.ray.intersectBox(surface.bounds,point)?.distanceTo(from);
    if(entry!==undefined&&entry<=range)candidates.push({surface,entry});
  }
  candidates.sort((a,b)=>a.entry-b.entry||a.surface.order-b.surface.order);
  let closest:THREE.Intersection|undefined,closestOrder=Infinity;
  for(const {surface,entry} of candidates){
    if(closest&&entry>closest.distance+1e-7)break;
    const hit=exactMeshHit(ray,surface.object);
    if(hit&&(!closest||hit.distance<closest.distance||hit.distance===closest.distance&&surface.order<closestOrder)){
      closest=hit;closestOrder=surface.order;
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
