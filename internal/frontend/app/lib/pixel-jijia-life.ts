import { PONDS, SCENERY, TILE, groundAt, isWalkable, pathIsWalkable, waterDepthAt, type Position } from "./pixel-jijia-world.ts";
import type { WeatherKind } from "./pixel-jijia-climate.ts";
import { animalFrame, ANIMAL_WIDTH, ANIMAL_HEIGHT, ANIMAL_FRAMES, type AnimalPose } from "./pixel-jijia-animal-art.ts";

export type Species = "sparrow" | "squirrel" | "fish";
export const SPECIES_LABEL: Record<Species,string> = { sparrow: "麻雀", squirrel: "松鼠", fish: "池鱼" };
export type Animal = { id: string; species: Species; home: Position; x: number; y: number; phase: number; speed: number; behaviorAge: number; behavior: "active" | "shelter" | "rest" | "alert"; facing: number };
const ponds = PONDS;
const treeHomes = SCENERY.filter(p=>p.habitat);
export function createWildlife(): Animal[] {
  const land = treeHomes.flatMap((tree,i)=> {
    const species: Species = tree.habitat!;
    const home = [{x:tree.x+1.5,y:tree.y+.9},{x:tree.x-1.5,y:tree.y+.9},
      {x:tree.x,y:tree.y+1.8},{x:tree.x+2,y:tree.y+1.2},{x:tree.x-2,y:tree.y+1.2}]
      .find(p=>isWalkable(p.x,p.y)&&groundAt(p.x,p.y)!==3);
    if(!home)return [];
    return [{id:species+"-"+i,species,home,x:home.x,y:home.y,phase:i*1.7,speed:0,behaviorAge:0,behavior:"active" as const,facing:1}];
  });
  return [...land,...ponds.flatMap((p,i)=>(p.shore==="natural"?[0,1,2]:[0,1]).map(j=> {
    const home={x:p.x+p.width/2,y:p.y+p.height/2};
    return {id:"fish-"+i+"-"+j,species:"fish" as const,home,x:home.x+j*.8,y:home.y,phase:j*2.1+i,speed:0,behaviorAge:0,behavior:"active" as const,facing:1};
  }))];
}

export function updateWildlife(animals: Animal[], player: Position, dt: number, hour: number, weather: WeatherKind|null, motion: boolean) {
  for (const a of animals) {
    const aquatic=a.species==="fish", bird=a.species==="sparrow";
    const shelter=!aquatic&&(weather==="rain"||weather==="storm"||weather==="snow");
    const rest=!aquatic&&(hour<6||hour>=19);
    const distance=Math.hypot(a.x-player.x,a.y-player.y);
    const behavior=shelter?"shelter":rest?"rest":distance<1.7?"alert":"active";
    a.behaviorAge=behavior===a.behavior?a.behaviorAge+dt:0;
    a.behavior=behavior;
    a.speed=0;
    if (!motion) continue;
    a.phase+=dt*(aquatic?.48:bird?.65:.36);
    let target:Position;
    if (shelter||rest) {
      // Tree base/nearby ground is the sheltered end of the habitat.
      target=a.home;
    } else if(a.behavior==="alert") {
      // A brief look-up precedes a dash or take-off, rather than instant motion.
      if(!aquatic && a.behaviorAge<(bird?.16:.32))continue;
      const dx=a.x-player.x,dy=a.y-player.y, len=Math.max(.2,Math.hypot(dx,dy));
      target={x:a.x+dx/len*2,y:a.y+dy/len*2};
    } else {
      // Alternate travel and stillness; ground animals do not slide continuously.
      if(!aquatic && a.phase%4.8>3.4)continue;
      target={x:a.home.x+Math.sin(a.phase)*(aquatic?2.2:2.7),
        y:a.home.y+Math.cos(a.phase*.81)*(aquatic?2:2.1)+(aquatic?0:1.8)};
    }
    const dx=target.x-a.x,dy=target.y-a.y,len=Math.hypot(dx,dy);
    if(len<.03)continue;
    const step=Math.min(len,dt*(a.behavior==="alert"?(aquatic?2.3:bird?5:3.2):aquatic?.85:1.65));
    const oldX=a.x,oldY=a.y;
    const x=a.x+dx/len*step,y=a.y+dy/len*step;
    // Fish remain in their pond; land animals never cross buildings or water.
    const valid=(px:number,py:number)=>aquatic?waterDepthAt(px,py)>0:
      Math.hypot(px-a.home.x,py-a.home.y)<5&&pathIsWalkable(a.home,{x:px,y:py},true);
    if (valid(x,a.y)) a.x=x;
    if (valid(a.x,y)) a.y=y;
    a.speed=Math.hypot(a.x-oldX,a.y-oldY)/Math.max(dt,.001);
    if(Math.abs(a.x-oldX)>.001)a.facing=a.x>oldX?1:-1;
  }
}
export function closestAnimal(animals: Animal[], position: Position): Animal|null {
  return animals.filter(a=>Math.hypot(a.x-position.x,a.y-position.y)<2.7)
    .sort((a,b)=>Math.hypot(a.x-position.x,a.y-position.y)-Math.hypot(b.x-position.x,b.y-position.y))[0]??null;
}
// A bank must be on dry ground and within reach of a recreational pond.
export function fishingTarget(position: Position): Position|null {
  if (groundAt(position.x,position.y)===3) return null;
  const candidates: {point:Position;distance:number}[]=[];
  for (const pond of ponds) {
    if (position.x < pond.x-4 || position.x > pond.x+pond.width+4 ||
        position.y < pond.y-4 || position.y > pond.y+pond.height+4) continue;
    for(let y=Math.max(pond.y,Math.floor(position.y-4));y<Math.min(pond.y+pond.height,position.y+4);y++) {
      for(let x=Math.max(pond.x,Math.floor(position.x-4));x<Math.min(pond.x+pond.width,position.x+4);x++) {
        const point={x:x+.5,y:y+.5},distance=Math.hypot(point.x-position.x,point.y-position.y);
        if(distance<3.8&&waterDepthAt(point.x,point.y)===2)candidates.push({point,distance});
      }
    }
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  for(const {point} of candidates){
    if(pathIsWalkable(position,point))return point;
  }
  return null;
}
export type FishingCast = { target: Position; started: number };
export const FISH_NAMES = ["鲫鱼","鲤鱼","小银鱼"] as const;
export function catchFish(cast: FishingCast): string {
  return FISH_NAMES[Math.floor(cast.started/1000+cast.target.x+cast.target.y)%FISH_NAMES.length];
}

// The animation is selected from actual behavior and movement, not from
// a generic bobbing timer. The existing world clock is the only scheduler.
export function animalAnimation(a:Animal,motion:boolean):{pose:AnimalPose;frame:number;lift:number}{
  const atHome=Math.hypot(a.x-a.home.x,a.y-a.home.y)<.12;
  const moving=a.speed>.1,returning=a.behavior==="rest"||a.behavior==="shelter";
  let pose:AnimalPose,lift=0,rate=4;
  if(a.species==="fish"){
    pose=a.behavior==="alert"?"dart":"swim";rate=pose==="dart"?19:10;
  }else if(a.species==="sparrow"){
    if(returning&&atHome){pose=a.behavior==="rest"?"sleep":"perch";lift=23;rate=2;}
    else if(a.behavior==="alert"&&!moving&&a.behaviorAge<.16){pose="idle";rate=5;}
    else if(a.behavior==="alert"||returning){pose="fly";lift=14;rate=19;}
    else if(moving){pose="hop";rate=11;}
    else{pose=a.phase%4.8>3.4?"forage":"idle";rate=5;}
  }else{
    if(returning&&atHome){pose=a.behavior==="rest"?"sleep":"shelter";rate=3;}
    else if(moving){pose="run";rate=a.behavior==="alert"?22:13;}
    else if(a.behavior==="alert"){pose="alert";rate=6;}
    else {pose=a.phase%4.8>3.4?"forage":"idle";rate=5;}
  }
  return {pose,lift,frame:motion?Math.floor(a.phase*rate/(a.species==="fish"?.48:a.species==="sparrow"?.65:.36))%ANIMAL_FRAMES:0};
}
export function drawAnimal(ctx: CanvasRenderingContext2D,a: Animal,camera:Position,motion:boolean) {
  const x=Math.round(a.x*TILE-camera.x),y=Math.round(a.y*TILE-camera.y);
  const {a:scaleX,d:scaleY}=ctx.getTransform();
  const viewWidth=ctx.canvas.width/scaleX,viewHeight=ctx.canvas.height/scaleY;
  if(x<-40||x>viewWidth+40||y<-40||y>viewHeight+40)return;
  const {pose,frame,lift}=animalAnimation(a,motion),aquatic=a.species==="fish";
  // Original pixel density: 64 native pixels rendered into 32 world pixels.
  // All species share the same native density; their art defines their size.
  const scale=.5;
  ctx.save();
  if(!aquatic&&lift<15){
    ctx.fillStyle="rgba(39,53,40,.18)";ctx.beginPath();
    ctx.ellipse(x,y, a.species==="squirrel"?7:5,2,0,0,Math.PI*2);ctx.fill();
  }
  ctx.translate(x,y-lift);ctx.scale(a.facing,1);
  ctx.imageSmoothingEnabled=false;
  ctx.globalAlpha=aquatic?.70:1;
  ctx.drawImage(animalFrame(a.species,pose,frame),-ANIMAL_WIDTH*scale/2,-52*scale,
    ANIMAL_WIDTH*scale,ANIMAL_HEIGHT*scale);
  ctx.restore();
}
export function drawFishing(ctx:CanvasRenderingContext2D, player:Position, cast:FishingCast, camera:Position, time:number,motion:boolean) {
  const x=Math.round(cast.target.x*TILE-camera.x),y=Math.round(cast.target.y*TILE-camera.y);
  const px=Math.round(player.x*TILE-camera.x),py=Math.round(player.y*TILE-camera.y)-18;
  const ready=time-cast.started>=1800, bob=motion&&ready?Math.sin(time/110)*2:0;
  ctx.save();ctx.lineWidth=1;ctx.strokeStyle="#e7d9b1";ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+(x-px)*.55,py-10);ctx.lineTo(x,y+bob);ctx.stroke();
  ctx.fillStyle="#f3e5d1";ctx.fillRect(x-1,y+bob-3,3,5);ctx.fillStyle="#b96c51";ctx.fillRect(x-1,y+bob-3,3,2);
  ctx.strokeStyle=ready?"#e4f5dc":"rgba(218,240,223,.48)";ctx.beginPath();ctx.ellipse(x,y+2,ready?8:4,ready?3:2,0,0,Math.PI*2);ctx.stroke();ctx.restore();
}
