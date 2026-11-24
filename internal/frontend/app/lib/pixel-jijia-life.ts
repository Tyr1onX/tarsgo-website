import { PONDS, SCENERY, TILE, groundAt, isWalkable, pathIsWalkable, waterDepthAt, shelteredAt, worldHash, type Position } from "./pixel-jijia-world.ts";
import type { WeatherKind } from "./pixel-jijia-climate.ts";
import { animalFrame, ANIMAL_WIDTH, ANIMAL_HEIGHT, ANIMAL_FRAMES, type AnimalPose } from "./pixel-jijia-animal-art.ts";

export type Species = "sparrow" | "squirrel" | "fish";
export const SPECIES_LABEL: Record<Species,string> = { sparrow: "麻雀", squirrel: "松鼠", fish: "池鱼" };
export type Animal = { id: string; species: Species; home: Position; x: number; y: number; phase: number; speed: number; behaviorAge: number; behavior: "active" | "shelter" | "rest" | "alert"; facing: number; lift: number; turnAge: number; fishKind?:number; perchHeight?:number; sites:Position[]; calm:number };
const ponds = PONDS;
const treeHomes = SCENERY.filter(p=>p.habitat);
// Each habitat has a small set of verified destinations. Select one for
// an entire feeding trip instead of chasing a continuously moving target.
function forageSites(home:Position):Position[]{
  const sites:Position[]=[home];
  for(let i=0;i<12;i++){
    const angle=i*Math.PI/6,radius=i%2?3.4:2.2;
    const p={x:home.x+Math.cos(angle)*radius,y:home.y+Math.sin(angle)*radius};
    if([0,4,5,7].includes(groundAt(p.x,p.y))&&pathIsWalkable(home,p,true))sites.push(p);
  }
  return sites;
}
export function createWildlife(): Animal[] {
  const land = treeHomes.flatMap((tree,i)=> {
    const species: Species = tree.habitat!;
    const home = [{x:tree.x+1.35,y:tree.y-1.1},{x:tree.x-1.35,y:tree.y-1.1},
      {x:tree.x+1.4,y:tree.y+.15},{x:tree.x-1.4,y:tree.y+.15},{x:tree.x,y:tree.y-1.65}]
      .find(p=>isWalkable(p.x,p.y)&&groundAt(p.x,p.y)!==3&&shelteredAt(p.x,p.y));
    if(!home)return [];
    return [{id:species+"-"+i,species,home,x:home.x,y:home.y,phase:i*1.7,speed:0,behaviorAge:0,behavior:"active" as const,facing:1,lift:0,turnAge:10,perchHeight:tree.height*(species==="sparrow"?.47:.20),sites:forageSites(home),calm:0}];
  });
  return [...land,...ponds.flatMap((p,i)=>{
    const home={x:p.x+p.width/2,y:p.y+p.height/2};
    const sites:Position[]=[];
    for(const u of [.25,.5,.75])for(const v of [.25,.5,.75]){
      const target={x:p.x+p.width*u,y:p.y+p.height*v};
      if(waterDepthAt(target.x,target.y)===2)sites.push(target);
    }
    return (p.shore==="natural"?[0,1,2]:[0,1]).map(j=>({
      id:"fish-"+i+"-"+j,species:"fish" as const,home,x:home.x+j*.8,y:home.y,phase:j*2.1+i,speed:0,behaviorAge:0,behavior:"active" as const,facing:1,lift:0,turnAge:10,fishKind:(i+j)%3,sites,calm:0
    }));
  })];
}

export function updateWildlife(animals: Animal[], player: Position, dt: number, hour: number, weather: WeatherKind|null, motion: boolean, cast: FishingCast|null = null, playerMoving=true) {
  for (const a of animals) {
    const aquatic=a.species==="fish", bird=a.species==="sparrow";
    const shelter=!aquatic&&(weather==="rain"||weather==="storm"||weather==="snow");
    const rest=!aquatic&&(hour<(bird?5.5:6.5)||hour>=(bird?18.8:19.5));
    const distance=Math.hypot(a.x-player.x,a.y-player.y),radius=aquatic?1.1:bird?2.2:1.7;
    // A quiet observer is not a perpetual threat. Movement resets the
    // habituation window; weather and night still take precedence.
    a.calm=playerMoving||Math.hypot(a.home.x-player.x,a.home.y-player.y)>7?0:Math.min(5,a.calm+dt);
    const alarm=distance<radius&&a.calm<(bird?2.8:1.9);
    a.turnAge+=dt;
    const bait = aquatic && cast?.fishId === a.id && cast.caughtAt===undefined ? cast.target : null;
    const behavior=bait?"active":shelter?"shelter":rest?"rest":alarm?"alert":"active";
    a.behaviorAge=behavior===a.behavior?a.behaviorAge+dt:0;
    a.behavior=behavior;
    a.speed=0;
    if (!motion && !bait) continue;
    a.phase+=dt*(aquatic?.48:bird?.65:.36);
    const homeDistance=Math.hypot(a.x-a.home.x,a.y-a.home.y),cycle=a.phase%5.8;
    const wantedLift=aquatic?0:bird?(shelter||rest)?homeDistance<.3?(a.perchHeight??23):14:behavior==="alert"&&a.behaviorAge>.16?20:0:(shelter||rest)&&homeDistance<.18?(a.perchHeight??14):0;
    a.lift+=Math.max(-dt*60,Math.min(dt*60,wantedLift-a.lift));
    let target:Position;
    if (bait) {
      target = bait;
    } else if (shelter||rest) {
      target=a.home;
    } else if(a.behavior==="alert") {
      if(!aquatic && a.behaviorAge<(bird?.16:.32))continue;
      const dx=a.x-player.x,dy=a.y-player.y, len=Math.max(.2,Math.hypot(dx,dy));
      target={x:a.x+dx/len*2,y:a.y+dy/len*2};
    } else {
      // Feeding, grooming and scanning happen at a destination, with a
      // different trip chosen next cycle. Fish pause near a new depth region.
      if(cycle>3.4)continue;
      const trip=Math.floor(a.phase/5.8),seed=worldHash(Math.round(a.home.x*10)+trip,Math.round(a.home.y*10)+(a.fishKind??0));
      target=a.sites[aquatic?seed%a.sites.length:1+seed%Math.max(1,a.sites.length-1)]??a.home;
      if(!aquatic&&cycle<1.5)target=a.home;
      // A blocked direct step can be retried along the known home-to-site route.
      else if(!aquatic&&!pathIsWalkable(a,target,true))target=a.home;
    }
    const dx=target.x-a.x,dy=target.y-a.y,len=Math.hypot(dx,dy);
    if(len<.03)continue;
    const step=Math.min(len,dt*(a.behavior==="alert"?(aquatic?2.3:bird?5:3.2):aquatic?(bait?1.9:1.15):1.65));
    const oldX=a.x,oldY=a.y;
    const x=a.x+dx/len*step,y=a.y+dy/len*step;
    const valid=(px:number,py:number)=>aquatic?waterDepthAt(px,py)>0:
      Math.hypot(px-a.home.x,py-a.home.y)<5&&pathIsWalkable(a.home,{x:px,y:py},true)&&pathIsWalkable({x:a.x,y:a.y},{x:px,y:py},true);
    if (valid(x,a.y)) a.x=x;
    if (valid(a.x,y)) a.y=y;
    a.speed=Math.hypot(a.x-oldX,a.y-oldY)/Math.max(dt,.001);
    if(Math.abs(a.x-oldX)>.001){const facing=a.x>oldX?1:-1;if(facing!==a.facing)a.turnAge=0;a.facing=facing;}
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
export type FishingCast = { target: Position; started: number; fishId: string; caughtAt?:number };
export const FISH_NAMES = ["鲫鱼","鲤鱼","小银鱼"] as const;
export function beginFishing(animals: Animal[], target: Position, started: number): FishingCast | null {
  const pond = ponds.find(p => target.x>=p.x && target.x<p.x+p.width && target.y>=p.y && target.y<p.y+p.height);
  if (!pond || !waterDepthAt(target.x,target.y)) return null;
  const fish = animals.filter(a => a.species==="fish" && a.home.x>=pond.x && a.home.x<pond.x+pond.width &&
    a.home.y>=pond.y && a.home.y<pond.y+pond.height)
    .sort((a,b)=>Math.hypot(a.x-target.x,a.y-target.y)-Math.hypot(b.x-target.x,b.y-target.y))[0];
  return fish ? {target,started,fishId:fish.id} : null;
}
export function fishingReady(animals: Animal[], cast: FishingCast, time: number): boolean {
  const fish=animals.find(a=>a.id===cast.fishId);
  return Boolean(cast.caughtAt===undefined && fish && time-cast.started>=1800 && Math.hypot(fish.x-cast.target.x,fish.y-cast.target.y)<.18);
}
export function catchFish(animals: Animal[], cast: FishingCast, time: number): string | null {
  if (!fishingReady(animals,cast,time)) return null;
  const fish=animals.find(a=>a.id===cast.fishId)!;
  return FISH_NAMES[fish.fishKind??0];
}

// The animation is selected from actual behavior and movement, not from
// a generic bobbing timer. The existing world clock is the only scheduler.
export function animalAnimation(a:Animal,motion:boolean):{pose:AnimalPose;frame:number;lift:number}{
  const atHome=Math.hypot(a.x-a.home.x,a.y-a.home.y)<.12;
  const moving=a.speed>.1,returning=a.behavior==="rest"||a.behavior==="shelter";
  const cycle=a.phase%5.8;
  let pose:AnimalPose,lift=a.lift,rate=4;
  if(a.species==="fish"){
    pose=a.behavior==="alert"?"dart":a.turnAge<.23?"turn":cycle>4.85&&cycle<5.35?"surface":"swim";
    rate=pose==="dart"?19:10;
  }else if(a.species==="sparrow"){
    if(returning&&atHome&&Math.abs(lift-(a.perchHeight??23))<1){pose=a.behavior==="rest"?"sleep":"perch";rate=2;}
    else if(a.behavior==="alert"&&a.behaviorAge<.16){pose="alert";rate=5;}
    else if(a.behavior==="alert"&&a.behaviorAge<.42){pose="takeoff";rate=17;}
    else if(returning||a.behavior==="alert"){pose="fly";rate=19;}
    else if(lift>1){pose="land";rate=12;}
    else if(moving){pose="hop";rate=11;}
    else if(cycle>4.65&&cycle<5.4){pose="groom";rate=8;}
    else{pose=cycle>3.4?"forage":"idle";rate=5;}
  }else{
    if(returning&&atHome&&Math.abs(lift-(a.perchHeight??14))<1){pose=a.behavior==="rest"?"sleep":"shelter";rate=3;}
    else if(lift>1||returning&&atHome){pose="climb";rate=12;}
    else if(a.behavior==="alert"&&!moving){pose="alert";rate=6;}
    else if(moving&&a.turnAge<.16){pose="turn";rate=15;}
    else if(moving&&a.behavior==="alert"){pose="run";rate=22;}
    else if(moving&&cycle>2.7&&cycle<3.1){pose="jump";rate=16;}
    else if(moving&&cycle>=3.1&&cycle<3.4){pose="land";rate=12;}
    else if(moving){pose="walk";rate=10;}
    else {pose=cycle>3.4&&cycle<5.4?"forage":"idle";rate=5;}
  }
  const phaseFrame=pose==="turn"?Math.min(7,Math.floor(a.turnAge*40)):pose==="takeoff"?Math.min(7,Math.floor(Math.max(0,a.behaviorAge-.16)*30)):
    Math.floor(a.phase*rate/(a.species==="fish"?.48:a.species==="sparrow"?.65:.36))%ANIMAL_FRAMES;
  return {pose,lift,frame:motion?phaseFrame:0};
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
  if(aquatic&&pose==="surface"&&motion){
    ctx.strokeStyle="rgba(208,237,218,.4)";ctx.lineWidth=.6;
    const age=(a.phase%5.8-4.85)/.5;
    ctx.globalAlpha=(1-age)*.42;ctx.beginPath();ctx.ellipse(x,y-7,3+age*9,1+age*3,0,0,Math.PI*2);ctx.stroke();
  }
  ctx.translate(x,y-lift);ctx.scale(a.facing,1);
  ctx.imageSmoothingEnabled=false;
  ctx.globalAlpha=aquatic?(pose==="surface"?.94:.68):1;
  ctx.drawImage(animalFrame(a.species,pose,frame,a.fishKind??0),-ANIMAL_WIDTH*scale/2,-52*scale,
    ANIMAL_WIDTH*scale,ANIMAL_HEIGHT*scale);
  ctx.restore();
}
export function fishingPose(cast:FishingCast|null,ready:boolean,time:number):"cast"|"wait"|"bite"|"reel"|"catch"|null{
  if(!cast)return null;
  if(cast.caughtAt!==undefined)return time-cast.caughtAt<360?"reel":"catch";
  return time-cast.started<360?"cast":ready?"bite":"wait";
}
export function drawFishing(ctx:CanvasRenderingContext2D,player:Position,cast:FishingCast,camera:Position,time:number,motion:boolean,ready:boolean) {
  const targetX=Math.round(cast.target.x*TILE-camera.x),targetY=Math.round(cast.target.y*TILE-camera.y);
  const px=Math.round(player.x*TILE-camera.x),py=Math.round(player.y*TILE-camera.y)-22;
  const dx=targetX-px,dy=targetY-py,len=Math.max(1,Math.hypot(dx,dy));
  const u=dx/len,v=dy/len;
  const phase=fishingPose(cast,ready,time);
  const flying=phase==="cast"?Math.min(1,(time-cast.started)/360):phase==="reel"?1-Math.min(1,(time-cast.caughtAt!)/360):phase==="catch"?0:1;
  const bob=motion&&ready?Math.sin(time/110)*2:0;
  const handX=px+u*7,handY=py+v*5;
  const rodX=handX+u*19,rodY=handY+v*14-10;
  const x=rodX+(targetX-rodX)*flying,y=rodY+(targetY-rodY)*flying-(phase==="cast"?Math.sin(flying*Math.PI)*18:0)+bob;
  ctx.save();ctx.lineWidth=2;ctx.strokeStyle="#79583d";ctx.beginPath();ctx.moveTo(handX,handY);ctx.quadraticCurveTo(handX+u*12,handY-12,rodX,rodY);ctx.stroke();
  ctx.lineWidth=.75;ctx.strokeStyle="#e7d9b1";ctx.beginPath();ctx.moveTo(rodX,rodY);ctx.lineTo(x,y);ctx.stroke();
  if(phase==="catch"||phase==="reel"){
    ctx.save();ctx.translate(x,y-4);ctx.imageSmoothingEnabled=false;
    ctx.drawImage(animalFrame("fish","swim",Math.floor(time/100)%ANIMAL_FRAMES),-11,-8,22,19);ctx.restore();
  }else{
    ctx.fillStyle="#f3e5d1";ctx.fillRect(x-1,y-3,3,5);ctx.fillStyle="#b96c51";ctx.fillRect(x-1,y-3,3,2);
    if(phase!=="cast"){ctx.strokeStyle=ready?"#e4f5dc":"rgba(218,240,223,.48)";ctx.beginPath();ctx.ellipse(x,y+2,ready?8:4,ready?3:2,0,0,Math.PI*2);ctx.stroke();}
  }
  ctx.restore();
}
