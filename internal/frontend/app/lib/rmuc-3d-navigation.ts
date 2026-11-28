import * as THREE from "three";
import { moveOnArena, type ArenaTerrain, type Occupant } from "./rmuc-3d-terrain.ts";

const GRID=.35;
const NEIGHBORS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

// Local training navigation: search on the real CAD support surface and
// verify every edge with the same footprint/step controller as the player.
export function* findArenaPath(terrain:Pick<ArenaTerrain,"heightAt">, start:THREE.Vector3, goal:THREE.Vector3, radius:number, reach=2.2, occupants:readonly Occupant[] = []) {
  type Node={p:THREE.Vector3; ix:number; iz:number; cost:number; score:number; parent:Node|null};
  const distance=(p:THREE.Vector3)=>Math.hypot(goal.x-p.x,goal.z-p.z);
  const first:Node={p:start.clone(),ix:0,iz:0,cost:0,score:distance(start),parent:null};
  const queue=[first], seen=new Map<string,number>([["0,0",0]]);
  let best=first;
  for(let expanded=0;queue.length&&expanded<3500;expanded++){
    // Select the minimum directly. Scan from the end to retain the old
    // stable-sort/pop tie order (the most recently enqueued equal score).
    let next=queue.length-1;
    for(let i=next-1;i>=0;i--)if(queue[i].score<queue[next].score)next=i;
    const node=queue.splice(next,1)[0];
    if(node.cost>seen.get(node.ix+","+node.iz)!)continue;
    if(distance(node.p)<distance(best.p))best=node;
    if(distance(node.p)<=Math.max(reach,GRID)){
      const p=node.p.clone();
      yield;
      moveOnArena(terrain,p,goal.x-p.x,goal.z-p.z,radius,.23,occupants);
      if(distance(p)<.015){best={...node,p,parent:node};break;}
    }
    for(const [dx,dz] of NEIGHBORS){
      const ix=node.ix+dx,iz=node.iz+dz,key=ix+","+iz;
      const cost=node.cost+Math.hypot(dx,dz)*GRID;
      if((seen.get(key)??Infinity)<=cost)continue;
      const x=start.x+ix*GRID,z=start.z+iz*GRID,p=node.p.clone();
      yield;
      moveOnArena(terrain,p,x-p.x,z-p.z,radius,.23,occupants);
      if(Math.hypot(p.x-x,p.z-z)>.015)continue;
      seen.set(key,cost);
      queue.push({p,ix,iz,cost,score:cost+distance(p),parent:node});
    }
  }
  const path:THREE.Vector3[]=[];
  for(let n:Node|null=best;n?.parent;n=n.parent)path.unshift(n.p);
  return path;
}

// Training chassis dynamics, independent of strategic decision cadence.
// Position is the same authoritative position consumed by collision and referee.
export type ChassisMotion = { speed:number; yaw:number; spin?:boolean };
export const angleDelta=(from:number,to:number)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
export function turnTowards(from:number,to:number,limit:number){
  const d=angleDelta(from,to);
  return from+Math.max(-limit,Math.min(limit,d));
}
export function stepChassis(terrain:Pick<ArenaTerrain,"heightAt">,bot:Occupant,motion:ChassisMotion,
  target:THREE.Vector3|null,speed:number,dt:number,occupants:readonly Occupant[],stopDistance?:number,spin=false){
  if(dt<=0)return 0;
  // The same conservative circular footprint covers every chassis heading.
  // Spin changes the authoritative yaw even without translation.
  if(spin)motion.yaw+=Math.PI*2*dt;
  if(speed<=0){motion.speed=0;return 0;}
  const dx=target?target.x-bot.position.x:0,dz=target?target.z-bot.position.z:0;
  const distance=Math.hypot(dx,dz);
  if(target&&distance>Math.max(.001,stopDistance??0)){
    const desired=Math.atan2(-dx,-dz);
    if(!spin)motion.yaw=turnTowards(motion.yaw,desired,Math.PI*3*dt);
    const remaining=distance-(stopDistance??0);
    const limit=Math.min(speed,stopDistance===undefined?speed:Math.sqrt(2*12*remaining))*(spin?1:Math.max(0,Math.cos(angleDelta(motion.yaw,desired))));
    const oldSpeed=motion.speed;
    motion.speed=limit>oldSpeed?Math.min(limit,oldSpeed+8*dt):Math.max(limit,oldSpeed-12*dt);
    const length=Math.min(remaining,(oldSpeed+motion.speed)*.5*dt,limit*dt);
    if(length<=0)return 0;
    const x=bot.position.x,z=bot.position.z;
    moveOnArena(terrain,bot.position,dx/distance*length,dz/distance*length,bot.radius,.23,occupants);
    const traveled=Math.hypot(bot.position.x-x,bot.position.z-z);
    if(traveled<length*.1)motion.speed=0;
    return traveled;
  }
  // No remaining legal target: stop at the authoritative goal, no visual drift.
  motion.speed=0;
  return 0;
}

// R51 permits slowly clearing a defeated robot blocking a key path.
// This training clearance is capped at one footprint diameter per defeat;
// no rigid-body impulses, chain pushing, or clearance through CAD support.
export const DEFEATED_PUSH_SPEED=.25;
export function clearDefeatedPath<T extends Occupant>(terrain:Pick<ArenaTerrain,"heightAt">,bot:T,target:THREE.Vector3,
  dt:number,occupants:readonly T[],isDefeated:(o:T)=>boolean,pushed:Map<T,number>){
  const dx=target.x-bot.position.x,dz=target.z-bot.position.z,length=Math.hypot(dx,dz);
  if(length<.04||dt<=0)return 0;
  const ux=dx/length,uz=dz/length;
  const corpse=occupants.find(o=>{
    if(!isDefeated(o)||Math.abs(o.position.y-bot.position.y)>=1.15)return false;
    const x=o.position.x-bot.position.x,z=o.position.z-bot.position.z,limit=bot.radius+o.radius;
    return x*ux+z*uz>0&&Math.hypot(x,z)<=limit+.08&&Math.hypot(x-ux*.08,z-uz*.08)<limit;
  });
  if(!corpse)return 0;
  const amount=Math.min(DEFEATED_PUSH_SPEED*dt,2*corpse.radius-(pushed.get(corpse)??0),length);
  if(amount<=1e-8)return 0;
  const shiftX=ux*amount,shiftZ=uz*amount;
  const old=corpse.position,next=old.clone(),from=bot.position,nextBot=from.clone();
  const blockers=occupants.filter(o=>o!==corpse);
  moveOnArena(terrain,next,shiftX,shiftZ,corpse.radius,.23,[bot,...blockers.filter(o=>Math.abs(o.position.y-old.y)<1.15)]);
  if(Math.hypot(next.x-old.x-shiftX,next.z-old.z-shiftZ)>1e-6)return 0;
  // Both bodies translate by exactly the same vector, so their mutual
  // separation cannot decrease. Check the remaining obstacles individually.
  moveOnArena(terrain,nextBot,shiftX,shiftZ,bot.radius,.23,blockers.filter(o=>Math.abs(o.position.y-from.y)<1.15));
  if(Math.hypot(nextBot.x-from.x-shiftX,nextBot.z-from.z-shiftZ)>1e-6)return 0;
  old.copy(next);from.copy(nextBot);pushed.set(corpse,(pushed.get(corpse)??0)+amount);
  return amount;
}
