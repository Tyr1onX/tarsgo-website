import catalog from "../../../backend/handler/pixelassets/items.json" with { type:"json" };
import type { Position } from "./pixel-jijia-world.ts";

export type WorldItem = {id:string;name:string;kind:string;color:string;ponds:number[];pixels:string[];feeds?:string[]};
export type ItemRow = {id:string;quantity:number;revision:number};
export const worldItems = new Map<string,WorldItem>(catalog.map(item=>[item.id,item]));
// Existing campus terrain hosts the food; none is a fishing catch.
export const FOOD_SOURCES:readonly (Position & {id:string})[] = [
  {id:"wild-seeds",x:52.5,y:40.5},{id:"pine-nut",x:91.5,y:41.5},
  {id:"fish-pellets",x:39.5,y:47.5},{id:"cat-food",x:68.5,y:57.5},{id:"dog-food",x:75.5,y:57.5},
];
export function closestFoodSource(player:Position){
  return FOOD_SOURCES.filter(p=>Math.hypot(player.x-p.x,player.y-p.y)<1.6)
    .sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))[0]??null;
}
export const pondLabels = ["西南生态池","东北观赏池","西侧垂钓池","东侧寻宝池"];

export function guestCatch(pond:number):WorldItem {
  const pool=[...worldItems.values()].filter(item=>item.ponds.includes(pond));
  return pool[Math.floor(Math.random()*pool.length)];
}
