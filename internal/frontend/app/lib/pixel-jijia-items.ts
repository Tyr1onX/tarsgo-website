import catalog from "../../../backend/handler/pixelassets/items.json" with { type:"json" };
import { groundAt, isWalkable, pathIsWalkable, type Position } from "./pixel-jijia-world.ts";
import type { Season } from "./pixel-jijia-climate.ts";

type GatherPoint=Position & {season?:string};
export type WorldItem = {id:string;name:string;kind:string;color:string;ponds:number[];pixels:string[];feeds?:string[];gather?:number;sources?:GatherPoint[];loans?:Array<Position & {scene:string}>};
export type ItemRow = {id:string;quantity:number;revision:number;available?:number;displayed?:number};
export const worldItems = new Map<string,WorldItem>(catalog.map(item=>[item.id,item]));
export type ItemSource=GatherPoint & {id:string;key:string};
export const ITEM_SOURCES:readonly ItemSource[] = [...worldItems.values()].flatMap(item=>
  (item.sources??[]).map((p,i)=>({...p,id:item.id,key:item.id+":"+i})));
export function availableSources(season:Season,taken:ReadonlyMap<string,number>,now:number){
  return ITEM_SOURCES.filter(p=>(!p.season||p.season===season)&&(taken.get(p.key)??0)<=now);
}
export function closestItemSource(player:Position,season:Season,taken:ReadonlyMap<string,number>,now:number){
  if(groundAt(player.x,player.y)===3)return null;
  return availableSources(season,taken,now).filter(p=>Math.hypot(player.x-p.x,player.y-p.y)<1.6&&isWalkable(p.x,p.y)&&pathIsWalkable(player,p,true))
    .sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))[0]??null;
}
export const pondLabels = ["西南生态池","东北观赏池","西侧垂钓池","东侧寻宝池"];

export function guestCatch(pond:number):WorldItem {
  const pool=[...worldItems.values()].filter(item=>item.ponds.includes(pond));
  return pool[Math.floor(Math.random()*pool.length)];
}
