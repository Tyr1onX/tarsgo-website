import * as THREE from "three";
import { moveOnArena, type ArenaTerrain, type Occupant } from "./rmuc-3d-terrain.ts";

const GRID=.65;
const NEIGHBORS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

// Local training navigation: search on the real CAD support surface and
// verify every edge with the same footprint/step controller as the player.
export function* findArenaPath(terrain:Pick<ArenaTerrain,"heightAt">, start:THREE.Vector3, goal:THREE.Vector3, radius:number, reach=2.2) {
  type Node={p:THREE.Vector3; ix:number; iz:number; cost:number; score:number; parent:Node|null};
  const distance=(p:THREE.Vector3)=>Math.hypot(goal.x-p.x,goal.z-p.z);
  const first:Node={p:start.clone(),ix:0,iz:0,cost:0,score:distance(start),parent:null};
  const queue=[first], seen=new Map<string,number>([["0,0",0]]);
  let best=first;
  for(let expanded=0;queue.length&&expanded<420;expanded++){
    queue.sort((a,b)=>b.score-a.score);
    const node=queue.pop()!;
    if(node.cost>seen.get(node.ix+","+node.iz)!)continue;
    if(distance(node.p)<distance(best.p))best=node;
    if(distance(node.p)<=reach){best=node;break;}
    for(const [dx,dz] of NEIGHBORS){
      const ix=node.ix+dx,iz=node.iz+dz,key=ix+","+iz;
      const cost=node.cost+Math.hypot(dx,dz)*GRID;
      if((seen.get(key)??Infinity)<=cost)continue;
      const x=start.x+ix*GRID,z=start.z+iz*GRID,p=node.p.clone();
      yield;
      moveOnArena(terrain,p,x-p.x,z-p.z,radius,.23,[]);
      if(Math.hypot(p.x-x,p.z-z)>.015)continue;
      seen.set(key,cost);
      queue.push({p,ix,iz,cost,score:cost+distance(p),parent:node});
    }
  }
  const path:THREE.Vector3[]=[];
  for(let n:Node|null=best;n?.parent;n=n.parent)path.unshift(n.p);
  return path;
}

export function advanceBot(terrain:Pick<ArenaTerrain,"heightAt">, bot:Occupant, target:THREE.Vector3, occupants:readonly Occupant[], step=.65) {
  const delta=target.clone().sub(bot.position),distance=Math.hypot(delta.x,delta.z);
  if(distance<.03)return false;
  const length=Math.min(distance,step), before=bot.position.clone();
  moveOnArena(terrain,bot.position,delta.x/distance*length,delta.z/distance*length,bot.radius,.23,occupants);
  return bot.position.distanceTo(before)>.06;
}
