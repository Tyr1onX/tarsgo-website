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
    queue.sort((a,b)=>b.score-a.score);
    const node=queue.pop()!;
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
export type ChassisMotion = { speed:number; yaw:number };
export const angleDelta=(from:number,to:number)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
export function turnTowards(from:number,to:number,limit:number){
  const d=angleDelta(from,to);
  return from+Math.max(-limit,Math.min(limit,d));
}
export function stepChassis(terrain:Pick<ArenaTerrain,"heightAt">,bot:Occupant,motion:ChassisMotion,
  target:THREE.Vector3|null,speed:number,dt:number,occupants:readonly Occupant[],stopDistance?:number){
  if(dt<=0)return 0;
  if(speed<=0){motion.speed=0;return 0;}
  const dx=target?target.x-bot.position.x:0,dz=target?target.z-bot.position.z:0;
  const distance=Math.hypot(dx,dz);
  if(target&&distance>Math.max(.001,stopDistance??0)){
    const desired=Math.atan2(-dx,-dz);
    motion.yaw=turnTowards(motion.yaw,desired,Math.PI*3*dt);
    const remaining=distance-(stopDistance??0);
    const limit=Math.min(speed,stopDistance===undefined?speed:Math.sqrt(2*12*remaining))*Math.max(0,Math.cos(angleDelta(motion.yaw,desired)));
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
