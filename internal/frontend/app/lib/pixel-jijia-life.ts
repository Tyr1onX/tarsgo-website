import { GROUND_AREAS, SCENERY, TILE, groundAt, isWalkable, waterDepthAt, type Position } from "./pixel-jijia-world.ts";
import type { WeatherKind } from "./pixel-jijia-climate.ts";

export type Species = "sparrow" | "squirrel" | "fish";
export const SPECIES_LABEL: Record<Species,string> = { sparrow: "麻雀", squirrel: "松鼠", fish: "池鱼" };
export type Animal = { id: string; species: Species; home: Position; x: number; y: number; phase: number; behavior: "active" | "shelter" | "rest" | "alert"; facing: number };
const trees = SCENERY.filter(p => ["oak","lime_tree","cherry"].includes(p.sprite));
const ponds = GROUND_AREAS.filter(a=>a.recreation);
const treeHomes = [trees[0],trees[1],trees[4],trees[5],trees[8],trees[9]].filter(Boolean);
export function createWildlife(): Animal[] {
  const land = treeHomes.flatMap((tree,i)=> {
    const species: Species = i%2 ? "squirrel" : "sparrow";
    const home = [{x:tree.x+1.5,y:tree.y+1.2},{x:tree.x-1.5,y:tree.y+1.2},{x:tree.x,y:tree.y+1.8}].find(p=>isWalkable(p.x,p.y)&&groundAt(p.x,p.y)!==3)??{x:tree.x,y:tree.y+2};
    return [{id:species+"-"+i,species,home,x:home.x,y:home.y,phase:i*1.7,behavior:"active" as const,facing:1}];
  });
  return [...land,...ponds.flatMap((p,i)=>[0,1,2].map(j=> {
    const home={x:p.x+p.width/2,y:p.y+p.height/2};
    return {id:"fish-"+i+"-"+j,species:"fish" as const,home,x:home.x+j*.8,y:home.y,phase:j*2.1+i,behavior:"active" as const,facing:1};
  }))];
}

export function updateWildlife(animals: Animal[], player: Position, dt: number, hour: number, weather: WeatherKind|null, motion: boolean) {
  for (const a of animals) {
    const aquatic=a.species==="fish", bird=a.species==="sparrow";
    const shelter=!aquatic&&(weather==="rain"||weather==="storm"||weather==="snow");
    const rest=!aquatic&&(hour<6||hour>=19);
    const distance=Math.hypot(a.x-player.x,a.y-player.y);
    a.behavior=shelter?"shelter":rest?"rest":distance<1.7?"alert":"active";
    if (!motion) continue;
    a.phase+=dt*(aquatic?.48:bird?.65:.36);
    let target:Position;
    if (shelter||rest) {
      // Tree base/nearby ground is the sheltered end of the habitat.
      target=a.home;
    } else if(a.behavior==="alert") {
      const dx=a.x-player.x,dy=a.y-player.y, len=Math.max(.2,Math.hypot(dx,dy));
      target={x:a.x+dx/len*2,y:a.y+dy/len*2};
    } else {
      target={x:a.home.x+Math.sin(a.phase)*(aquatic?2.2:2.7),
        y:a.home.y+Math.cos(a.phase*.81)*(aquatic?2:2.1)+(aquatic?0:1.8)};
    }
    const dx=target.x-a.x,dy=target.y-a.y,len=Math.hypot(dx,dy);
    if(len<.03)continue;
    const step=Math.min(len,dt*(a.behavior==="alert"?(bird?5:3.2):aquatic?.85:1.65));
    const x=a.x+dx/len*step,y=a.y+dy/len*step;
    // Fish remain in their pond; land animals never cross buildings or water.
    const valid=(px:number,py:number)=>aquatic?waterDepthAt(px,py)>0:
      groundAt(px,py)!==3&&isWalkable(px,py);
    if (valid(x,a.y)) a.x=x;
    if (valid(a.x,y)) a.y=y;
    if(Math.abs(dx)>.03)a.facing=dx>0?1:-1;
  }
}
export function closestAnimal(animals: Animal[], position: Position): Animal|null {
  return animals.filter(a=>Math.hypot(a.x-position.x,a.y-position.y)<2.7)
    .sort((a,b)=>Math.hypot(a.x-position.x,a.y-position.y)-Math.hypot(b.x-position.x,b.y-position.y))[0]??null;
}
// A bank must be on dry ground and within reach of a recreational pond.
export function fishingTarget(position: Position): Position|null {
  if (groundAt(position.x,position.y)===3) return null;
  for(const p of ponds) {
    const x=Math.max(p.x+1.5,Math.min(p.x+p.width-1.5,position.x));
    const y=Math.max(p.y+1.5,Math.min(p.y+p.height-1.5,position.y));
    if(Math.hypot(x-position.x,y-position.y)<3.8 && waterDepthAt(x,y)) return {x,y};
  }
  return null;
}
export type FishingCast = { target: Position; started: number };
export const FISH_NAMES = ["鲫鱼","鲤鱼","小银鱼"] as const;
export function catchFish(cast: FishingCast): string {
  return FISH_NAMES[Math.floor(cast.started/1000+cast.target.x+cast.target.y)%FISH_NAMES.length];
}

// Each creature is a small independent pixel sprite, with a fixed two-tone
// silhouette, local markings and a few pose pixels. No separate animation loop.
const PALETTE = { ".":"", K:"#313c3d", B:"#97714c", b:"#c4a376", C:"#f1d5ae", W:"#e6e9d9", O:"#bf8b58", R:"#a76039", r:"#d18b55", F:"#7ea8a0", f:"#b6d3be" } as const;
const SPRITES: Record<Species,string[]> = {
  sparrow:["...KKK.......","..KbbBK......",".KbbbBK......",".KCCK.K......","..KCCKBBK....","..KBBBBBbKK..","...KBBbbBK.K.","....KKKKK....",".....O.O....."],
  squirrel:[".........KKK.","........KrrRK",".......KrrrRK","..K.K..KrrRK.","..KrK.KrRRK..",".KrrrKRRRK...","KrrKrKRRK....",".KrrrRRRK....","..KrCCrRK....","...KCCrK.....","...KRRRK.....","..KK..KK....."],
  fish:["............",".....KKK....","..K.KFFFKK..",".KfKfFFfFKK.","KFFfFFfFFK..",".KfKfFFfFKK.","..K.KFFFKK..",".....KKK....","............"],
};
export function drawAnimal(ctx: CanvasRenderingContext2D,a: Animal,camera:Position,motion:boolean) {
  const x=Math.round(a.x*TILE-camera.x),y=Math.round(a.y*TILE-camera.y);
  const fish=a.species==="fish",bird=a.species==="sparrow";
  const bob=motion&&a.behavior!=="rest"&&a.behavior!=="shelter"?Math.floor(a.phase*5)%2:0;
  const flight=bird&&(a.behavior==="alert"||(a.behavior==="shelter"&&Math.hypot(a.x-a.home.x,a.y-a.home.y)>.12));
  ctx.save();
  ctx.translate(x,y-(flight?14:fish?1:0));
  ctx.scale(a.facing,1);
  const sprite=SPRITES[a.species],size=fish?1:1.4;
  ctx.globalAlpha=fish?.65:1;
  for(let row=0;row<sprite.length;row++)for(let col=0;col<sprite[row].length;col++){
    const color=PALETTE[sprite[row][col] as keyof typeof PALETTE];if(!color)continue;
    ctx.fillStyle=color;ctx.fillRect(Math.round((col-6)*size),Math.round((row-sprite.length)*size)-bob,Math.ceil(size),Math.ceil(size));
  }
  if(flight){ctx.fillStyle="#ad9878";ctx.fillRect(-7,-10-bob*3,6,2);ctx.fillRect(-10,-12-bob*3,4,2);}
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
