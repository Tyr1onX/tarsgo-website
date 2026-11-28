import {TILE,type Position} from "./pixel-jijia-world.ts";
import {drawItem} from "./pixel-jijia-item-art.ts";
import {worldItems} from "./pixel-jijia-items.ts";
import {ROBOT_MODELS} from "./pixel-jijia-robot.ts";
import type {RoomObject} from "./pixel-jijia-room.ts";
import type {StudyDisplay} from "./pixel-jijia-study.ts";

export function drawStudyCollection(ctx:CanvasRenderingContext2D,o:RoomObject,camera:Position,items:StudyDisplay[],time:number,motion:boolean,atlas?:HTMLImageElement){
 const kind=o.kind;
 if(!["desk","shelf","cabinet","pedestal","table-display","pet-bed","aquarium-small","aquarium-large"].includes(kind))return false;
 const x=Math.round(o.x*TILE-camera.x),y=Math.round((o.y+o.height)*TILE-camera.y),w=o.width*TILE;
 const fill=(color:string,a:number,b:number,c:number,d:number)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(a),Math.round(b),Math.round(c),Math.round(d));};
 fill("#53615a",x+2,y-4,w,6);
 if(kind==="pet-bed"){
  fill("#685044",x,y-13,w,13);fill("#d5a16e",x+2,y-14,w-4,9);
  fill("#aa655d",x+4,y-12,w-8,8);fill("#e5b197",x+5,y-12,w-10,5);
  fill("#8f6551",x,y-4,w,4);return true;
 }
 const tank=kind.startsWith("aquarium-");
 if(tank){
  const height=kind==="aquarium-large"?30:20,top=y-height-8;
  fill("#504b43",x+2,y-9,w-4,9);fill("#9b7952",x+3,y-8,w-6,3);
  fill("#344e57",x,top,w,height);fill("#8abbb9",x+2,top+2,w-4,height-4);
  fill("#5b9ca6",x+3,top+5,w-6,height-9);fill("#dbc197",x+3,y-13,w-6,3);
  ctx.save();ctx.beginPath();ctx.rect(x+3,top+3,w-6,height-7);ctx.clip();
  for(const d of items){
   const item=worldItems.get(d.id);if(!item)continue;
   if(item.id==="weed"){drawItem(ctx,item,x+6+d.slot*5,y-15);continue;}
   const seed=[...item.id].reduce((n,c)=>n+c.charCodeAt(0),0)+d.slot*31;
   const t=(motion?time/1000:0)+seed*.17,period=5+seed%5,cycle=t%period/period;
   const travel=cycle<.1?0:cycle<.5?(cycle-.1)/.4:cycle<.6?1:1-(cycle-.6)/.4;
   const progress=travel*travel*(3-2*travel),low=["loach","catfish","gudgeon"].includes(item.id);
   const xx=x+8+progress*(w-16),yy=top+7+(height-15)*(low?.8:.35+.28*Math.sin(t*.8+seed));
   ctx.save();ctx.translate(Math.round(xx),Math.round(yy));ctx.scale(cycle<.5?1:-1,1);drawItem(ctx,item,0,0);ctx.restore();
  }
  ctx.restore();fill("#c2e4de",x+3,top+3,w-6,1);fill("#c2e4de",x+3,top+4,1,height-9);
  fill("#50737a",x,top,w,2);fill("#405b61",x,y-10,w,2);return true;
 }
 const tall=kind==="cabinet"||kind==="shelf";
 const top=y-(tall?29:kind==="desk"?20:13);
 fill("#624e3d",x+1,top,w-2,y-top);fill("#b28a5a",x,top-3,w,5);
 fill("#ddbc80",x+2,top-3,w-4,2);
 if(tall){fill("#403f38",x+3,top+4,w-6,y-top-9);fill("#b58b5d",x+2,y-5,w-4,3);}
 else if(kind==="desk"){
  fill("#b18a5b",x,top-4,w,8);fill("#e0bd80",x+2,top-5,w-4,2);
  fill("#654e3d",x+2,top+4,5,y-top-4);fill("#654e3d",x+w-7,top+4,5,y-top-4);
  fill("#8c6b4d",x+7,top+4,w-14,4);fill("#493f35",x+7,top+8,w-14,y-top-8);
 }else{
  fill("#967450",x+3,top+3,w-6,4);fill("#57483a",x+2,y-5,w-4,5);
  if(kind==="pedestal")fill("#c5b07e",x+4,top+7,w-8,2);
 }
 const count=kind==="desk"||kind==="cabinet"?3:kind==="shelf"?2:1;
 for(const d of items){
  const item=worldItems.get(d.id);if(!item)continue;
  const xx=x+(d.slot+.5)*w/count,yy=tall?y-11:top-5;
  if(item.id==="robot-model"&&atlas){
   const model=ROBOT_MODELS.guodong,aw=model.width*model.nativeScale,ah=model.height*model.nativeScale;
   ctx.drawImage(atlas,2*aw,0,aw,ah,xx-9,yy-10,18,16);
   ctx.drawImage(atlas,0,ah*model.wheelFrames,aw,ah,xx-9,yy-10,18,16);
  }else drawItem(ctx,item,xx,yy);
 }
 if(kind==="cabinet"){fill("#b9d3c9",x+3,top+4,1,y-top-10);fill("#b9d3c9",x+3,top+4,w-6,1);}
 return true;
}
