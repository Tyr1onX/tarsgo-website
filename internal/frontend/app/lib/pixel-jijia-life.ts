import { drawItem, type ItemSprite } from "./pixel-jijia-item-art.ts";
import { PONDS, SCENERY, TILE, groundAt, isWalkable, pathIsWalkable, waterDepthAt, shelteredAt, worldHash, moveEntity, directionToward, type Direction, type Position } from "./pixel-jijia-world.ts";
import type { WeatherKind } from "./pixel-jijia-climate.ts";
import { animalFrame, ANIMAL_WIDTH, ANIMAL_HEIGHT, ANIMAL_FRAMES, type AnimalPose } from "./pixel-jijia-animal-art.ts";

export type Species = "sparrow" | "squirrel" | "fish" | "cat" | "dog";
export type PetVariant = "orange" | "tuxedo" | "small";
export type PetRecord = { species:"cat"|"dog"; variant:PetVariant; name:string; mode:"follow"|"home"; revision:number };
export type AnimalFood = { point:Position; sprite:ItemSprite; age:number; eating:number };
type AnimalBehavior = "active" | "shelter" | "rest" | "alert" | "observe" | "approach" | "eat" | "pet" | "sit" | "lie" | "sleep" | "wait";
export const SPECIES_LABEL: Record<Species,string> = { sparrow: "麻雀", squirrel: "松鼠", fish: "池鱼", cat:"猫咪", dog:"狗狗" };
export type Animal = { id: string; species: Species; home: Position; x: number; y: number; phase: number; speed: number; behaviorAge: number; behavior: AnimalBehavior; facing: number; lift: number; turnAge: number; fishKind?:number; perchHeight?:number; sites:Position[]; calm:number; variant?:PetVariant; direction?:Direction; familiar?:number; observed?:boolean; food?:AnimalFood; satiated?:number; petting?:number };
const ponds = PONDS;
const treeHomes = SCENERY.filter(p=>p.habitat);
// Each habitat has a small set of verified destinations. Select one for
// an entire feeding trip instead of chasing a continuously moving target.
function forageSites(home:Position,campus=false):Position[]{
  const sites:Position[]=[home];
  for(let i=0;i<12;i++){
    const angle=i*Math.PI/6,radius=i%2?3.4:2.2;
    const p={x:home.x+Math.cos(angle)*radius,y:home.y+Math.sin(angle)*radius};
    if((campus||[0,4,5,7].includes(groundAt(p.x,p.y)))&&pathIsWalkable(home,p,true))sites.push(p);
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

const distance=(a:Position,b:Position)=>Math.hypot(a.x-b.x,a.y-b.y);
export const PET_VARIANT_LABEL:Record<PetVariant,string>={orange:"橘猫",tuxedo:"黑白猫",small:"小型犬"};
function campusAnimal(id:string,species:"cat"|"dog",variant:PetVariant,home:Position):Animal {
  return {id,species,variant,home:{...home},...home,phase:0,speed:0,behaviorAge:0,behavior:"active",facing:1,direction:"down",lift:0,turnAge:10,sites:forageSites(home,true),calm:0};
}
export function createCampusPets():Animal[] {
  return [
    campusAnimal("cat-orange","cat","orange",{x:67.5,y:56.5}),
    campusAnimal("cat-tuxedo","cat","tuxedo",{x:85.5,y:54.5}),
    campusAnimal("dog-small","dog","small",{x:61.5,y:60.5}),
  ].filter(a=>pathIsWalkable(a,a,true));
}
export function animalLabel(a:Animal){return a.variant?PET_VARIANT_LABEL[a.variant]:SPECIES_LABEL[a.species];}
const isCampusPet=(a:Animal)=>a.species==="cat"||a.species==="dog";
function behavior(a:Animal,next:AnimalBehavior,dt:number){
  a.behaviorAge=a.behavior===next?a.behaviorAge+dt:0;a.behavior=next;
}
function animalMove(a:Animal,target:Position,dt:number,speed:number,valid:(x:number,y:number)=>boolean){
  const d=distance(a,target);
  const old={x:a.x,y:a.y};
  if(d>.015){
    const next=moveEntity(a,target.x-a.x,target.y-a.y,dt,Math.min(speed,d/Math.max(dt,.001))*Math.max(1,1/d),valid);
    a.x=next.x;a.y=next.y;
  }
  a.speed=distance(old,a)/Math.max(dt,.001);
  if(a.speed>.02){
    const dir=directionToward(old,a,a.direction??"down");
    if(dir!==a.direction)a.turnAge=0;
    a.direction=dir;
    if(dir==="left"||dir==="right")a.facing=dir==="left"?-1:1;
  }
}
export function dryAnimalWalkable(x:number,y:number){return isWalkable(x,y)&&groundAt(x,y)!==3;}
export function animalPath(from:Position,to:Position,valid:(x:number,y:number)=>boolean){
  const steps=Math.max(1,Math.ceil(distance(from,to)/.25));
  for(let i=0;i<=steps;i++)if(!valid(from.x+(to.x-from.x)*i/steps,from.y+(to.y-from.y)*i/steps))return false;
  return true;
}
// Food is placed in the world, not on the animal. The target must be
// reachable by that species and within its local habitat.
export function foodPosition(a:Animal,player:Position,roomWalkable?:(x:number,y:number)=>boolean):Position|null{
  if(a.food||a.petting||distance(a,player)>(a.species==="fish"?5:3.5))return null;
  if(a.species==="fish"){
    const target=fishingTarget(player);
    return target&&animalPath(a,target,(x,y)=>waterDepthAt(x,y)>0)?target:null;
  }
  const valid=roomWalkable??dryAnimalWalkable;
  const targets=[.4,.6,.8].map(f=>({x:player.x+(a.x-player.x)*f,y:player.y+(a.y-player.y)*f}));
  for(const [dx,dy] of [[.8,0],[-.8,0],[0,.8],[0,-.8]])targets.push({x:player.x+dx,y:player.y+dy});
  for(const target of targets){
    if(distance(target,player)<.45||!animalPath(a,target,valid))continue;
    if(a.id==="companion"||pathIsWalkable(a.home,target,true))return target;
  }
  return null;
}
export function placeAnimalFood(a:Animal,point:Position,sprite:ItemSprite){
  a.food={point,sprite,age:0,eating:0};a.petting=0;
}
function advanceFood(a:Animal,dt:number,ready:boolean,valid:(x:number,y:number)=>boolean):boolean{
  const food=a.food;
  if(!food)return false;
  food.age+=dt;
  if(food.age>45){a.food=undefined;return false;}
  if(!ready)return false;
  const delay=a.species==="sparrow"?1.3:a.species==="squirrel"?1.0:a.species==="fish"?.35:a.species==="cat"?.75:.4;
  a.lift=Math.max(0,a.lift-dt*60);
  a.phase+=dt*.6;a.speed=0;
  if(food.age<delay||a.lift>1){behavior(a,"observe",dt);return true;}
  if(distance(a,food.point)>.2){
    behavior(a,"approach",dt);
    animalMove(a,food.point,dt,a.species==="fish"?1.8:a.species==="dog"?3.4:a.species==="cat"?2.1:1.7,valid);
  }else{
    behavior(a,"eat",dt);
    food.eating+=dt;
    if(food.eating>(a.species==="fish"?1.1:a.species==="squirrel"?2.4:1.8)){
      a.food=undefined;a.familiar=a.species==="fish"?24:60;a.satiated=4;a.calm=5;
    }
  }
  return true;
}
export function observeAnimal(a:Animal){a.observed=true;}
export function petAnimal(a:Animal,player:Position):boolean{
  if(!isCampusPet(a)||distance(a,player)>2.7||a.food||(!a.observed&&a.id!=="companion")||
    (a.id!=="companion"&&!a.familiar&&a.calm<1.2))return false;
  a.direction=directionToward(a,player,a.direction??"down");
  if(a.direction==="left"||a.direction==="right")a.facing=a.direction==="left"?-1:1;
  a.petting=1.5;a.familiar=60;a.calm=5;return true;
}
export function updateWildlife(animals: Animal[], player: Position, dt: number, hour: number, weather: WeatherKind|null, motion: boolean, cast: FishingCast|null = null, playerMoving=true) {
  for (const a of animals) {
    const aquatic=a.species==="fish", bird=a.species==="sparrow", campus=isCampusPet(a);
    const shelter=!aquatic&&(weather==="rain"||weather==="storm"||weather==="snow");
    const rest=!aquatic&&(hour<(bird?5.5:6.5)||hour>=(bird?18.8:19.5));
    const separation=distance(a,player),radius=aquatic?1.1:bird?2.2:campus?1.5:1.7;
    // A quiet observer is not a perpetual threat. Movement resets the
    // habituation window; weather and night still take precedence.
    a.calm=playerMoving||distance(a.home,player)>7?0:Math.min(5,a.calm+dt);
    a.familiar=Math.max(0,(a.familiar??0)-dt);
    a.satiated=Math.max(0,(a.satiated??0)-dt);
    const alarm=separation<radius*(a.familiar ? .35 : 1)&&a.calm<(bird?2.8:campus?1.2:1.9);
    if(a.petting){
      a.petting=Math.max(0,a.petting-dt);a.speed=0;a.phase+=dt*.6;behavior(a,"pet",dt);continue;
    }
    a.turnAge+=dt;
    const bait = aquatic && cast?.fishId === a.id && cast.caughtAt===undefined ? cast.target : null;
    const foodValid=(x:number,y:number)=>aquatic?waterDepthAt(x,y)>0:
      distance(a.home,{x,y})<5&&pathIsWalkable(a.home,{x,y},true)&&dryAnimalWalkable(x,y);
    if(!bait&&advanceFood(a,dt,!shelter&&!rest&&!alarm,foodValid))continue;
    const nextBehavior=bait?"active":shelter?"shelter":rest?"rest":alarm?"alert":"active";
    behavior(a,nextBehavior,dt);
    a.speed=0;
    if (!motion && !bait && !a.food && !campus) continue;
    if(a.satiated&&!shelter&&!rest&&!alarm&&!bait){a.phase+=dt*.5;continue;}
    a.phase+=dt*(aquatic?.48:bird?.65:.36);
    const homeDistance=Math.hypot(a.x-a.home.x,a.y-a.home.y),cycle=a.phase%5.8;
    const wantedLift=aquatic||campus?0:bird?(shelter||rest)?homeDistance<.3?(a.perchHeight??23):14:nextBehavior==="alert"&&a.behaviorAge>.16?20:0:(shelter||rest)&&homeDistance<.18?(a.perchHeight??14):0;
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
    if(a.speed>.02){const dir=directionToward({x:oldX,y:oldY},a,a.direction??"down");if(dir!==a.direction)a.turnAge=0;a.direction=dir;}
    if(Math.abs(a.x-oldX)>.001){const facing=a.x>oldX?1:-1;if(facing!==a.facing)a.turnAge=0;a.facing=facing;}
  }
}

export function closestAnimal(animals: Animal[], position: Position,limit=2.7): Animal|null {
  return animals.filter(a=>Math.hypot(a.x-position.x,a.y-position.y)<limit)
    .sort((a,b)=>Math.hypot(a.x-position.x,a.y-position.y)-Math.hypot(b.x-position.x,b.y-position.y))[0]??null;
}
// A companion follows the player's recent valid route, not a second world
// simulation. Room changes are the only normal position reset.
export type Companion = Animal & {scene:string; trail:Position[]; idle:number; roam?:Position};
export function createCompanion(pet:PetRecord):Companion{
  return {...campusAnimal("companion",pet.species,pet.variant,{x:0,y:0}),scene:"",trail:[],idle:0,familiar:60,observed:true};
}
export function companionSpawn(player:Position,valid:(x:number,y:number)=>boolean):Position|null{
  for(const r of [1.5,2,2.5])for(let i=0;i<8;i++){
    const angle=i*Math.PI/4,point={x:player.x+Math.cos(angle)*r,y:player.y+Math.sin(angle)*r};
    if(valid(point.x,point.y)&&animalPath(player,point,valid))return point;
  }
  return null;
}
export function updateCompanion(a:Companion,player:Position,dt:number,scene:string,valid:(x:number,y:number)=>boolean,waiting:boolean,home:boolean,moving:boolean,allowRoam=true){
  if(a.scene!==scene){
    const spawn=companionSpawn(player,valid);
    if(!spawn)return false;
    a.scene=scene;a.x=spawn.x;a.y=spawn.y;a.home=spawn;a.trail=[];a.idle=0;a.roam=undefined;a.food=undefined;a.petting=0;
  }
  a.turnAge+=dt;a.phase+=dt*.65;a.speed=0;
  if(a.petting){a.petting=Math.max(0,a.petting-dt);behavior(a,"pet",dt);return true;}
  if(advanceFood(a,dt,true,valid))return true;
  if(waiting||home){
    a.trail=[];a.roam=undefined;a.idle+=dt;behavior(a,a.idle>14?"sleep":a.idle>5?"lie":"wait",dt);return true;
  }
  const last=a.trail.at(-1);
  if(valid(player.x,player.y)&&(!last||distance(last,player)>.65)){
    a.trail.push({...player});
    if(a.trail.length>48)a.trail.shift();
  }
  const d=distance(a,player);
  if(moving||!allowRoam||d>2.8)a.roam=undefined;
  if(!moving&&allowRoam&&d<1.8&&a.idle>1.5&&a.idle<1.5+dt){
    const theta=Math.atan2(a.y-player.y,a.x-player.x)+(a.species==="dog"?1.1:-1.1);
    const target={x:player.x+Math.cos(theta)*1.6,y:player.y+Math.sin(theta)*1.6};
    if(animalPath(a,target,valid))a.roam=target;
  }
  if(a.roam){
    a.idle+=dt;
    if(distance(a,a.roam)>.14&&a.idle<5){
      animalMove(a,a.roam,dt,1.4,valid);behavior(a,"active",dt);return true;
    }
    a.roam=undefined;
  }
  if(d<1.8||(!moving&&d<=2)){
    a.idle+=dt;
    while(a.trail.length>1&&distance(a,a.trail[0])<2)a.trail.shift();
    behavior(a,a.idle>16?"sleep":a.idle>7?"lie":a.idle>1.2?"sit":"observe",dt);
    return true;
  }
  // Follow reachable breadcrumbs around corners and never cross water/solids.
  let reachable=-1;
  for(let i=a.trail.length-1;i>=0;i--)if(distance(a.trail[i],player)>1.25&&animalPath(a,a.trail[i],valid)){reachable=i;break;}
  const direct=d>2&&valid(player.x,player.y)&&animalPath(a,player,valid);
  const target=direct?player:reachable>=0?a.trail[reachable]:undefined;
  if(target){
    if(reachable>0)a.trail.splice(0,reachable);
    animalMove(a,target,dt,d>5.5?11.6:d>3?7.6:3.2,valid);
    if(a.speed>.04){a.idle=0;behavior(a,"active",dt);return true;}
  }
  if(!moving&&d<4){
    a.idle+=dt;behavior(a,a.idle>16?"sleep":a.idle>8?"lie":"sit",dt);
  }else behavior(a,"wait",dt);
  return true;
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
export type FishingCast = { target: Position; started: number; fishId: string; pond:number; caughtAt?:number; sprite?:ItemSprite; owner?:number; token?:string; pending?:boolean };
export function beginFishing(animals: Animal[], target: Position, started: number): FishingCast | null {
  const pond = ponds.find(p => target.x>=p.x && target.x<p.x+p.width && target.y>=p.y && target.y<p.y+p.height);
  if (!pond || !waterDepthAt(target.x,target.y)) return null;
  const fish = animals.filter(a => a.species==="fish" && a.home.x>=pond.x && a.home.x<pond.x+pond.width &&
    a.home.y>=pond.y && a.home.y<pond.y+pond.height)
    .sort((a,b)=>Math.hypot(a.x-target.x,a.y-target.y)-Math.hypot(b.x-target.x,b.y-target.y))[0];
  return fish ? {target,started,fishId:fish.id,pond:ponds.indexOf(pond)} : null;
}
export function fishingReady(animals: Animal[], cast: FishingCast, time: number): boolean {
  const fish=animals.find(a=>a.id===cast.fishId);
  return Boolean(cast.caughtAt===undefined && fish && time-cast.started>=1800 && Math.hypot(fish.x-cast.target.x,fish.y-cast.target.y)<.18);
}
// The animation is selected from actual behavior and movement, not from
// a generic bobbing timer. The existing world clock is the only scheduler.
export function animalAnimation(a:Animal,motion:boolean):{pose:AnimalPose;frame:number;lift:number}{
  const atHome=Math.hypot(a.x-a.home.x,a.y-a.home.y)<.12;
  const moving=a.speed>.1,returning=a.behavior==="rest"||a.behavior==="shelter";
  const cycle=a.phase%5.8;
  let pose:AnimalPose,lift=a.lift,rate=4;
  if(isCampusPet(a)){
    pose=a.behavior==="eat"?"eat":a.behavior==="pet"?"pet":a.behavior==="observe"?"observe":
      a.behavior==="sleep"||returning&&atHome?"sleep":a.behavior==="lie"?"lie":
      a.behavior==="sit"||a.behavior==="wait"?"sit":moving?a.turnAge<.13?"turn":a.speed>3.6?"run":"walk":a.behavior==="alert"?"alert":"idle";
    rate=pose==="run"?14:pose==="walk"?9:pose==="eat"?7:4;
  }else if(a.behavior==="eat"){pose=a.species==="fish"?"surface":"forage";rate=8;}
  else if(a.behavior==="observe"){pose=a.species==="fish"?"swim":"alert";rate=4;}
  else if(a.species==="fish"){
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
    Math.floor(a.phase*rate/(a.species==="fish"?.48:a.species==="sparrow"?.65:isCampusPet(a)?.65:.36))%ANIMAL_FRAMES;
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
  if(aquatic&&pose==="surface"&&motion&&a.behavior!=="eat"){
    ctx.strokeStyle="rgba(208,237,218,.4)";ctx.lineWidth=.6;
    const age=(a.phase%5.8-4.85)/.5;
    ctx.globalAlpha=(1-age)*.42;ctx.beginPath();ctx.ellipse(x,y-7,3+age*9,1+age*3,0,0,Math.PI*2);ctx.stroke();
  }
  ctx.translate(x,y-lift);ctx.scale(a.direction==="up"||a.direction==="down"?isCampusPet(a)?1:a.facing:a.facing,1);
  ctx.imageSmoothingEnabled=false;
  ctx.globalAlpha=aquatic?(pose==="surface"?.94:.68):1;
  ctx.drawImage(animalFrame(a.species,pose,frame,a.variant==="tuxedo"?1:a.fishKind??0,a.direction??"right"),-ANIMAL_WIDTH*scale/2,-52*scale,
    ANIMAL_WIDTH*scale,ANIMAL_HEIGHT*scale);
  ctx.restore();
  if(a.food){
    const fx=Math.round(a.food.point.x*TILE-camera.x),fy=Math.round(a.food.point.y*TILE-camera.y);
    drawItem(ctx,a.food.sprite,fx,fy-2,.8);
  }
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
    if(cast.sprite)drawItem(ctx,cast.sprite,0,0,2);
    ctx.restore();
  }else{
    ctx.fillStyle="#f3e5d1";ctx.fillRect(x-1,y-3,3,5);ctx.fillStyle="#b96c51";ctx.fillRect(x-1,y-3,3,2);
    if(phase!=="cast"){ctx.strokeStyle=ready?"#e4f5dc":"rgba(218,240,223,.48)";ctx.beginPath();ctx.ellipse(x,y+2,ready?8:4,ready?3:2,0,0,Math.PI*2);ctx.stroke();}
  }
  ctx.restore();
}
