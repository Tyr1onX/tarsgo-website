import { worldItems, type WorldItem, type ItemRow } from "./pixel-jijia-items.ts";
import { groundAt, isWalkable, PLACES, TRAINING_FIELD, overlapsRect, TILE, type Position } from "./pixel-jijia-world.ts";
import { drawItem, type ItemSprite } from "./pixel-jijia-item-art.ts";

export type LoanObject=Position & {key:string;itemId:string;active?:boolean};
export type PlantRecord={id:string;seed:string;x:number;y:number;wateredAt:number;revision:number;pot?:boolean;potKey?:string};
export type HeldItem={item:WorldItem;row:ItemRow;owner:number;loan?:never;plant?:never}
 | {item:WorldItem;loan:LoanObject;row?:never;owner?:never;plant?:never}
 | {item:WorldItem;plant:PlantRecord;row?:never;owner?:never;loan?:never};
export type LifeObject={type:"loan";value:LoanObject;point:Position}|{type:"plant";value:PlantRecord;point:Position};
export const plantPoint=(p:PlantRecord):Position=>({x:p.x+.5,y:p.y+.5});
export const flowerFor=(seed:string)=>seed==="daisy-seed"?"daisy-flower":"cornflower-flower";
export function plantStage(p:PlantRecord,now=Date.now()){
 if(!p.wateredAt)return 0;
 const age=Math.max(0,now-p.wateredAt);
 return age>=24000?3:age>=12000?2:1;
}
export function freshLoans(scene:string):LoanObject[]{
 return [...worldItems.values()].flatMap(item=>(item.loans??[]).filter(p=>p.scene===scene).map((p,i)=>({key:item.id+":"+i,itemId:item.id,x:p.x,y:p.y})));
}
export function lifeObjects(loans:LoanObject[],plants:PlantRecord[],held:HeldItem|null):LifeObject[]{
 return [...loans.map(value=>({type:"loan" as const,value,point:value})),...plants.filter(p=>p.id!==held?.plant?.id).map(value=>({type:"plant" as const,value,point:plantPoint(value)}))];
}
export function outdoorPlacement(p:Position,radius=.45){
 if(!isWalkable(p.x,p.y,radius)||overlapsRect(p.x,p.y,radius+1,TRAINING_FIELD))return false;
 if(PLACES.some(b=>overlapsRect(p.x,p.y,radius+1,{x:b.x+b.width/2-2,y:b.y+b.height,width:4,height:4})))return false;
 return [-radius,radius].every(dx=>[-radius,radius].every(dy=>[0,4,5,7].includes(groundAt(p.x+dx,p.y+dy))));
}
export function studyPlacement(p:Position){
 const x=Math.floor(p.x),y=Math.floor(p.y);
 return x>=2&&x<34&&y>=7&&y<19&&!(x>=15&&x<=20&&y>=18);
}
export function closeLife(objects:LifeObject[],p:Position,valid:(p:Position)=>boolean,clicked?:Position){
 return objects.filter(o=>Math.hypot(o.point.x-p.x,o.point.y-p.y)<2.1&&valid(o.point)&&(!clicked||Math.hypot(o.point.x-clicked.x,o.point.y-clicked.y)<1.1))
 .sort((a,b)=>Math.hypot(a.point.x-(clicked??p).x,a.point.y-(clicked??p).y)-Math.hypot(b.point.x-(clicked??p).x,b.point.y-(clicked??p).y))[0]??null;
}
export function lifeBlocks(objects:LifeObject[],x:number,y:number){
 return objects.some(o=>(o.type==="plant"?o.value.pot!==false:!["picnic-mat","water-can"].includes(o.value.itemId))&&Math.hypot(x-o.point.x,y-o.point.y)<.6);
}
export function plantCarrySprite(p:PlantRecord):ItemSprite{
 const pot=worldItems.get("flowerpot")!,stage=plantStage(p);
 if(!stage)return pot;
 const rows=stage===1?["....g....","...gg....","....g...."]:stage===2?["....g....","..ggg....","....ggg..","....g....","....g...."]:["...fff...","..fffff..","...faf...","....g....","..ggg....","....ggg..","....g...."];
 return {...pot,pixels:[...rows,...pot.pixels],palette:{g:"#567b4d",f:p.seed==="daisy-seed"?"#f2ebd3":"#788fd0"}};
}
export function placementClear(p:Position,objects:LifeObject[],player:Position,valid:(p:Position)=>boolean,radius=.55){
 return valid(p)&&Math.hypot(p.x-player.x,p.y-player.y)>=.9&&Math.hypot(p.x-player.x,p.y-player.y)<=2.1&&objects.every(o=>Math.hypot(p.x-o.point.x,p.y-o.point.y)>radius);
}
export function drawLifeObject(ctx:CanvasRenderingContext2D,o:LifeObject,camera:Position,now:number){
 const x=Math.round(o.point.x*TILE-camera.x),y=Math.round(o.point.y*TILE-camera.y);
 ctx.fillStyle="#394b3a45";ctx.fillRect(x-7,y-1,14,3);
 if(o.type==="loan"){
  const item=worldItems.get(o.value.itemId);
  if(item){
   const scale=item.id==="picnic-mat"?1.5:1;
   if(item.id==="lantern"&&o.value.active){ctx.fillStyle="#eac27836";ctx.fillRect(x-11,y-17,22,22);}
   drawItem(ctx,item,x,y-Math.ceil(item.pixels.length*scale/2),scale);
   if(item.id==="toolbox"&&o.value.active){ctx.fillStyle="#39454a";ctx.fillRect(x-6,y-10,12,5);ctx.fillStyle="#b6c9c5";ctx.fillRect(x-5,y-9,2,4);ctx.fillRect(x-1,y-8,5,2);}
  }
  return;
 }
 const p=o.value,stage=plantStage(p,now);
 if(p.pot!==false){drawItem(ctx,worldItems.get("flowerpot")!,x,y-3);ctx.fillStyle="#594a37";ctx.fillRect(x-3,y-7,6,2);}
 else {ctx.fillStyle="#806044";ctx.fillRect(x-6,y-2,12,3);ctx.fillStyle="#a78659";ctx.fillRect(x-4,y-3,8,2);}
 const base=y-(p.pot!==false?7:2);
 if(!stage){ctx.fillStyle="#d3b684";ctx.fillRect(x-1,base-1,2,2);return;}
 if(now-p.wateredAt<850){
  ctx.fillStyle="#9bd3de";
  for(let i=0;i<4;i++){const d=Math.floor((now-p.wateredAt)/100);ctx.fillRect(x-4+i*3,base-12+i%2*3+d,1,2);}
 }
 const height=stage===1?4:stage===2?10:15;
 ctx.fillStyle="#3d684e";ctx.fillRect(x,base-height,2,height);
 ctx.fillStyle="#799960";ctx.fillRect(x-3,base-height+2,3,2);
 if(stage>=2){ctx.fillRect(x+2,base-height+5,4,2);ctx.fillRect(x-4,base-height+7,4,2);}
 if(stage===3){
  const flower=worldItems.get(flowerFor(p.seed))!;
  const c=p.seed==="daisy-seed"?"#f2ebd3":flower.color;
  ctx.fillStyle="#405c54";ctx.fillRect(x-4,base-height-4,10,7);
  ctx.fillStyle=c;ctx.fillRect(x-3,base-height-3,8,5);ctx.fillRect(x-1,base-height-5,4,9);
  ctx.fillStyle=p.seed==="daisy-seed"?"#dbac53":"#d4d0e9";ctx.fillRect(x,base-height-1,2,2);
 }
}
