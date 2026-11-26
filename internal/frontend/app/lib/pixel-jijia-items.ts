import catalog from "../../../backend/handler/pixelassets/items.json";

export type WorldItem = typeof catalog[number];
export const worldItems = new Map(catalog.map(item=>[item.id,item]));
export const pondLabels = ["西南生态池","东北观赏池","西侧垂钓池","东侧寻宝池"];

export function guestCatch(pond:number):WorldItem {
  const pool=catalog.filter(item=>item.ponds.includes(pond));
  return pool[Math.floor(Math.random()*pool.length)];
}
