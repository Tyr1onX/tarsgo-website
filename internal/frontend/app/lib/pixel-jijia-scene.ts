import { drawItem } from "./pixel-jijia-item-art.ts";
import { drawLifeObject,type LifeObject } from "./pixel-jijia-nature.ts";
import { availableSources,worldItems,type ItemSource } from "./pixel-jijia-items.ts";
import {
  FOUNTAIN, TRAINING_FIELD, PONDS, groundAt, waterDepthAt, PLACES, SCENERY, TILE, WORLD_HEIGHT, WORLD_WIDTH, snapCamera, shelteredAt, puddleCell, worldHash as hash,
  type Direction, type Place, type Position, type PropSprite, type Scenery, type SurfaceMark,
} from "./pixel-jijia-world.ts";
import { explorerFrameBox, EXPLORER_FRAME_WIDTH, EXPLORER_FRAME_HEIGHT, type ExplorerAnimation } from "./pixel-jijia-explorer.ts";
import { nightLight, type Season, type ChangchunClimate, type WeatherKind, type SurfaceWeather } from "./pixel-jijia-climate.ts";
import { drawAnimal, drawFishing, fishingReady, type Animal, type FishingCast } from "./pixel-jijia-life.ts";

import { drawCampusRobot, drawTrainingHealth, drawTrainingEffects, type CampusRobot, type RobotAtlases, type TrainingSession } from "./pixel-jijia-robot.ts";

export type SpriteBox = [number, number, number, number];
export type SpriteIndex = Record<string, SpriteBox>;

const PROP_CELLS: Record<PropSprite, number> = {
  bench: 0, lamp: 1, sign: 2, planter: 3,
  oak: 4, lime_tree: 5, cherry: 6, rocks: 7,
  fence: 8, hydrangea: 9, statue: 10, arch: 11,
  "training-base-red":12,"training-base-blue":13,"training-outpost":14,"training-rune":15,"training-cover":16,pine:17,
};
const PROP_CELL = 128;
export const GROUND_PATCH=128,GROUND_TEXTURE_TILE=32,GROUND_ATLAS_HEIGHT=1376;
const GROUND_EDGE_Y=GROUND_PATCH*10,GROUND_CELLS=GROUND_PATCH/GROUND_TEXTURE_TILE;
const point = (value: number) => Math.round(value * TILE);

function sprite(
  ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, sprites: SpriteIndex,
  name: string, x: number, y: number, width: number, height: number,
) {
  const box = sprites[name];
  if (!box) throw new Error(`像素素材缺失：${name}`);
  ctx.drawImage(atlas, ...box, Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

const SIDES = [[0,-1],[0,1],[-1,0],[1,0]] as const;
const waterCells = PONDS.flatMap(pond => {
  const cells:{x:number;y:number;natural:boolean;depth:1|2;seed:number;edges:number[]}[]=[];
  for(let y=pond.y;y<pond.y+pond.height;y++)for(let x=pond.x;x<pond.x+pond.width;x++){
    const depth=waterDepthAt(x+.5,y+.5);
    if(!depth)continue;
    cells.push({x,y,natural:pond.shore==="natural",depth,seed:hash(x,y),
      edges:SIDES.flatMap(([dx,dy],i)=>groundAt(x+dx,y+dy)!==3?[i]:[])});
  }
  return cells;
});
const waterTiles=new Map(waterCells.map(cell=>[cell.y*WORLD_WIDTH+cell.x,cell]));

// Independent shore components follow real exposed edges. No texture is used
// to imply an obstacle that isn't present in the world grid.
function waterTile(ctx:CanvasRenderingContext2D,x:number,y:number,px:number,py:number){
  const cell=waterTiles.get(y*WORLD_WIDTH+x);
  if(!cell)return;
  for(const side of cell.edges){
    const horizontal=side<2,reverse=side===1||side===3;
    const band=(offset:number,width:number,color:string)=>{
      ctx.fillStyle=color;
      const d=reverse?TILE-offset-width:offset;
      if(horizontal)ctx.fillRect(px,py+d,TILE,width);
      else ctx.fillRect(px+d,py,width,TILE);
    };
    if(cell.natural){
      // Shore edges have a narrow uneven wet-sand band. The water cell
      // still has its actual depth; only the sub-tile visual edge softens.
      for(let u=0;u<TILE;u+=.5){
        const thickness=1+(hash(x*31+Math.floor(u*2),y*7+side)%4)*.5;
        const d=reverse?TILE-thickness:0;
        ctx.fillStyle="#b6b08b";
        if(horizontal)ctx.fillRect(px+u,py+d,.5,thickness);
        else ctx.fillRect(px+d,py+u,thickness,.5);
      }
      band(2.5,.5,"rgba(217,226,193,.48)");
      for(let k=0;k<5;k++){
        const u=(cell.seed>>>((k*5)%24))%30*.5;
        ctx.fillStyle=k%2?"#b4c1a0":"#687f6c";
        const v=reverse?TILE-2.5:1.5;
        if(horizontal)ctx.fillRect(px+u,py+v,1,.5);
        else ctx.fillRect(px+v,py+u,.5,1);
      }
    }else{
      // A submerged stone step instead of the old abrupt dark wall.
      band(0,1.5,"#899f9e");band(1.5,.5,"#cfdfd1");
      band(2,2,"rgba(169,195,181,.53)");
      band(4,.5,"rgba(210,236,214,.47)");
    }
  }
  if(cell.natural&&cell.depth===1&&cell.seed%13===0){
    const xx=px+6,yy=py+9;
    ctx.fillStyle="#3e785f";ctx.fillRect(xx,yy-1,6,3);ctx.fillRect(xx+1,yy-2,4,5);
    ctx.fillStyle="#709d70";ctx.fillRect(xx+1,yy-1,4,1);ctx.fillRect(xx+1,yy,2,1);
    ctx.fillStyle="#bfd0a3";ctx.fillRect(xx+2,yy-2,1,.5);
    if(cell.seed%3===0){ctx.fillStyle="#f4d6c2";ctx.fillRect(xx+2,yy-2,2,2);}
  }
}

// Soft material seams are sampled from the real adjacent texture. A narrow
// stepped transition is painted once into the static terrain cache.
function naturalMaterialEdge(ctx:CanvasRenderingContext2D,tiles:HTMLImageElement,
  x:number,y:number,side:number,neighbor:number){
  const px=x*TILE,py=y*TILE,variant=hash(Math.floor(x/GROUND_CELLS),Math.floor(y/GROUND_CELLS))%3;
  const sx=variant*GROUND_PATCH+(x%GROUND_CELLS)*GROUND_TEXTURE_TILE;
  const sy=neighbor*GROUND_PATCH+(y%GROUND_CELLS)*GROUND_TEXTURE_TILE;
  const horizontal=side<2,reverse=side===1||side===3;
  ctx.save();
  for(let u=0;u<TILE;u+=.5){
    const seed=hash(x*31+Math.floor(u*2),y*37+side*11);
    const width=2+(seed%7)*.5;
    for(let d=0;d<width;d+=.5){
      const k=reverse?TILE-.5-d:d;
      const a=horizontal?u:k,b=horizontal?k:u;
      ctx.globalAlpha=Math.min(1,(width-d)/2.5);
      ctx.drawImage(tiles,sx+a*2,sy+b*2,1,1,px+a,py+b,.5,.5);
    }
  }
  ctx.restore();
}

function ground(ctx: CanvasRenderingContext2D, tiles: HTMLImageElement, season: Season, startX:number,startY:number,endX:number,endY:number) {
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const kind = groundAt(x, y);
      const variant = hash(Math.floor(x/GROUND_CELLS),Math.floor(y/GROUND_CELLS))%3;
      const destX = point(x), destY = point(y);
      const cell=waterTiles.get(y*WORLD_WIDTH+x);
      const art=kind===3&&cell?.depth===1?(cell.natural?8:9):kind;
      ctx.drawImage(tiles,variant*GROUND_PATCH+(x%GROUND_CELLS)*GROUND_TEXTURE_TILE,
        art*GROUND_PATCH+(y%GROUND_CELLS)*GROUND_TEXTURE_TILE,GROUND_TEXTURE_TILE,GROUND_TEXTURE_TILE,destX,destY,TILE,TILE);
      // Fine half-pixel details on the native 32px surface grid, preserving
      // the existing authored texture and its large-scale joints.
      const seed=hash(x,y),px=destX+2+(seed%11),py=destY+2+((seed>>>8)%10);
      if(kind===0 && seed%3===0){
        ctx.fillStyle="rgba(43,91,48,.35)";ctx.fillRect(px,py,0.5,2);ctx.fillRect(px+1,py-0.5,0.5,2);
        ctx.fillStyle="rgba(208,223,144,.4)";ctx.fillRect(px+.5,py-.5,.5,1.5);ctx.fillRect(px+1.5,py-1,.5,1.5);
      }else if((kind===1||kind===2)&&seed%4===0){
        ctx.fillStyle="rgba(86,82,70,.17)";ctx.fillRect(px,py,1.5,.5);ctx.fillRect(px+1,py+.5,1,.5);
        ctx.fillStyle="rgba(255,249,222,.25)";ctx.fillRect(px,py+1,1,.5);
      }else if(kind===3 && seed%5===0){
        ctx.fillStyle="rgba(225,246,232,.25)";ctx.fillRect(px,py,2.5,.5);ctx.fillRect(px+3,py,.5,.5);
      }
      if (kind === 3) {
        waterTile(ctx,x,y,destX,destY);
        continue;
      }
      if (kind === 0) {
        if (season === "winter" && hash(x, y) % 7 < 4) {
          // Fine frost is irregular and follows grass texture instead of square
          // white floor patches. Active snowfall is rendered separately.
          for(let k=0;k<7;k++){
            const sx=destX+(hash(x+k*7,y)%29)*.5,sy=destY+(hash(x,y+k*11)%29)*.5;
            ctx.fillStyle=k%3===0?"rgba(224,238,227,.58)":"rgba(183,208,197,.39)";
            ctx.fillRect(sx,sy,1+(k%3)*.5,.5+(k%2)*.5);
          }
        } else if (season === "autumn" && hash(x, y) % 9 === 0) {
          ctx.fillStyle = "#ce9959";
          ctx.fillRect(destX + hash(x, y) % 11, destY + 7, 4, 3);
          ctx.fillStyle = "#ae754f";
          ctx.fillRect(destX + hash(x + 5, y) % 12, destY + 10, 3, 2);
        } else if (season === "spring" && hash(x, y) % 17 === 0) {
          ctx.fillStyle = "#f7b9cb";
          ctx.fillRect(destX + hash(x, y) % 11, destY + 5, 3, 3);
        }
        continue;
      }
      const borders = (neighbor: number) =>
        neighbor!==kind&&neighbor!==3&&(neighbor===0||kind>neighbor);
      for (const [side, nx, ny] of [[0, x, y - 1], [1, x, y + 1], [2, x - 1, y], [3, x + 1, y]]) {
        const neighbor=groundAt(nx,ny);
        if(borders(neighbor)){
          if(kind===4||kind===5||kind===7){
            naturalMaterialEdge(ctx,tiles,x,y,side,neighbor);
            continue;
          }
          const edge=(kind-1)*4+side;
          ctx.drawImage(tiles,(edge%12)*GROUND_TEXTURE_TILE,GROUND_EDGE_Y+Math.floor(edge/12)*GROUND_TEXTURE_TILE,GROUND_TEXTURE_TILE,GROUND_TEXTURE_TILE,destX,destY,TILE,TILE);
        }
      }
    }
  }
}

export function buildingBounds(place: Place, sprites: SpriteIndex) {
  const box = sprites[place.id];
  if (!box) throw new Error(`像素素材缺失：${place.id}`);
  const width = point(place.width);
  const height = Math.round(width * box[3] / box[2]);
  return { x: point(place.x), y: point(place.y + place.height) - height, width, height };
}
function building(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, sprites: SpriteIndex, place: Place, camera: Position) {
  const b = buildingBounds(place, sprites);
  sprite(ctx, atlas, sprites, place.id, b.x - camera.x, b.y - camera.y, b.width, b.height);
}

type PropAtlas=HTMLImageElement|HTMLCanvasElement;
const seasonalCache=new WeakMap<HTMLImageElement,Map<Season,PropAtlas>>();
function seasonalProps(props:HTMLImageElement,season:Season):PropAtlas{
  if(season==="spring")return props;
  let variants=seasonalCache.get(props);
  if(!variants){variants=new Map();seasonalCache.set(props,variants);}
  const cached=variants.get(season);if(cached)return cached;
  const canvas=document.createElement("canvas");canvas.width=props.naturalWidth;canvas.height=props.naturalHeight;
  const ctx=canvas.getContext("2d")!;
  ctx.drawImage(props,0,0);
  for(const name of ["oak","lime_tree","cherry","hydrangea","planter"] as const){
    if(season==="summer"&&name!=="cherry")continue;
    const cell=PROP_CELLS[name],x=(cell%4)*PROP_CELL,y=Math.floor(cell/4)*PROP_CELL;
    const data=ctx.getImageData(x,y,PROP_CELL,PROP_CELL);
    for(let py=0;py<PROP_CELL;py++)for(let px=0;px<PROP_CELL;px++){
      const i=(py*PROP_CELL+px)*4,[r,g,b,a]=data.data.subarray(i,i+4);
      if(a<32)continue;
      const foliage=g>r*1.04&&g>b*1.06;
      const blossom=name==="cherry"&&r>g*1.04&&b>g*.92&&py<96;
      if(!foliage&&!blossom)continue;
      const l=(r+g+b)/3;
      const target=season==="winter"?[l*.86+42,l*.94+43,l+46]:
        season==="autumn"?[l*1.32+16,l*.94+2,l*.55]:
        [l*.61,l*.95+12,l*.59];
      const amount=season==="winter"?.75:season==="autumn"?.76:.8;
      for(let k=0;k<3;k++)data.data[i+k]=data.data[i+k]*(1-amount)+target[k]*amount;
    }
    ctx.putImageData(data,x,y);
  }
  variants.set(season,canvas);return canvas;
}

function decoration(ctx: CanvasRenderingContext2D, props: PropAtlas, object: Scenery, camera: Position) {
  const cell = PROP_CELLS[object.sprite];
  ctx.drawImage(
    props, (cell % 4) * PROP_CELL, Math.floor(cell / 4) * PROP_CELL,
    PROP_CELL, PROP_CELL,
    Math.round(point(object.x) - object.width / 2 - camera.x),
    Math.round(point(object.y) - object.height - camera.y),
    object.width, object.height,
  );
}

function fountainBounds(){return {x:point(FOUNTAIN.x)-48,y:point(FOUNTAIN.y)-69,width:96,height:96};}
function fountain(ctx:CanvasRenderingContext2D,atlas:HTMLImageElement,sprites:SpriteIndex,camera:Position){
  const b=fountainBounds();sprite(ctx,atlas,sprites,"fountain",b.x-camera.x,b.y-camera.y,b.width,b.height);
}

// Sorting by ground contact rather than top-left image coordinates makes scenery
// and buildings share the same top-down depth rules.
type SceneNode =
  | { kind: "building"; y: number; x: number; value: Place }
  | { kind: "prop"; y: number; x: number; value: Scenery }
  | { kind: "fountain"; y: number; x: number };
const NODES: SceneNode[] = [
  ...PLACES.map(p => ({ kind: "building" as const, y: p.y + p.height, x: p.x + p.width / 2, value: p })),
  ...SCENERY.map(p => ({ kind: "prop" as const, y: p.y, x: p.x, value: p })),
  { kind: "fountain" as const, x: FOUNTAIN.x, y: FOUNTAIN.y + FOUNTAIN.radiusY },
].sort((a, b) => a.y - b.y);

const snowCaps=new WeakMap<CanvasImageSource,Map<string,HTMLCanvasElement>>();
function snowCap(image:PropAtlas,box:SpriteBox,key:string){
  let cache=snowCaps.get(image);
  if(!cache){cache=new Map();snowCaps.set(image,cache);}
  const found=cache.get(key);if(found)return found;
  const canvas=document.createElement("canvas"),[sx,sy,w,h]=box;
  canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext("2d")!;
  ctx.drawImage(image,sx,sy,w,h,0,0,w,h);
  const data=ctx.getImageData(0,0,w,h),src=data.data.slice();
  data.data.fill(0);
  for(let x=0;x<w;x++){
    let top=-1;
    for(let y=0;y<h*.62;y++)if(src[(y*w+x)*4+3]>180){top=y;break;}
    if(top<0)continue;
    const depth=Math.max(2,Math.floor(h*(.055+(hash(x,top)%7)*.004)));
    for(let y=top;y<Math.min(h,top+depth);y++){
      const i=(y*w+x)*4;if(src[i+3]<128)continue;
      const shade=1-(y-top)/depth*.20;
      data.data[i]=Math.round(237*shade);data.data[i+1]=Math.round(245*shade);
      data.data[i+2]=Math.round(240*shade);data.data[i+3]=Math.round(225-(y-top)/depth*55);
    }
  }
  ctx.putImageData(data,0,0);cache.set(key,canvas);return canvas;
}
function drawBentProp(ctx:CanvasRenderingContext2D,image:CanvasImageSource,sx:number,sy:number,
  x:number,y:number,w:number,h:number,shift:number){
  if(!shift){ctx.drawImage(image,sx,sy,PROP_CELL,PROP_CELL,x,y,w,h);return;}
  // At most one world pixel of displacement between adjacent strips.
  const bands=Math.abs(shift)+1;
  for(let i=0;i<bands;i++){
    const top=Math.round(i*86/bands),bottom=i===bands-1?PROP_CELL:Math.round((i+1)*86/bands);
    const dy=Math.round(h*top/PROP_CELL),end=Math.round(h*bottom/PROP_CELL);
    ctx.drawImage(image,sx,sy+top,PROP_CELL,bottom-top,x+Math.sign(shift)*(bands-1-i),y+dy,w,end-dy);
  }
}
function propBend(node:{x:number;y:number;value:Scenery},time:number,wind:number):number{
  const tree=isTree(node.value);
  if(!time||(!tree&&node.value.sprite!=="hydrangea"&&node.value.sprite!=="planter"))return 0;
  return Math.round(wind*(tree?.13:.07)*(.65+.35*Math.sin(time/(1000+hash(node.x,node.y)%650)+node.x+node.y)));
}
function drawEaveDrips(ctx:CanvasRenderingContext2D,node:{x:number;y:number;value:Place},b:{x:number;y:number;width:number;height:number},
  camera:Position,time:number,wet:number){
  if(!time||wet<.22)return;
  const ground=point(node.y)-camera.y+5;
  ctx.save();ctx.fillStyle="#b7d8dc";ctx.strokeStyle="#cce4e3";ctx.lineWidth=.5;
  for(let i=0;i<2;i++){
    const x=b.x-camera.x+b.width*(i?.95:.05),phase=(time/(1450+hash(node.x+i,node.y)%450)+i*.43)%1;
    const strength=Math.min(.65,(wet-.22)*.9);
    if(phase<.75){
      const progress=phase/.75;
      ctx.globalAlpha=strength;ctx.fillRect(Math.round(x),Math.round(ground-(1-progress*progress)*b.height*.25),1,3);
    }else{
      const age=(phase-.75)*4;
      ctx.globalAlpha=strength*(1-age);
      ctx.beginPath();ctx.ellipse(x,ground,1+age*5,.5+age*2,0,0,Math.PI*2);ctx.stroke();
    }
  }
  ctx.restore();
}
export function flowerVisit(seed:number,time:number):number|null{
  const period=26000+seed%15000,phase=(time+seed%period)%period;
  return phase<6800?phase/6800:null;
}
function drawFlowerVisitor(ctx:CanvasRenderingContext2D,node:{x:number;y:number;value:Scenery},b:{x:number;y:number;width:number;height:number},camera:Position,time:number,wind:number){
  if(!time||Math.abs(wind)>12)return;
  const seed=hash(node.x,node.y);
  // At most a single visitor per selected bed, with long quiet gaps.
  if(seed%3!==0)return;
  const t=flowerVisit(seed,time);if(t===null)return;
  const travel=Math.max(0,Math.min(1,(t-.18)/.64));
  const x=Math.round(b.x-camera.x+b.width*(.24+travel*.52)+Math.sin(t*9)*2+wind*.12);
  const y=Math.round(b.y-camera.y+b.height*.27-Math.sin(travel*Math.PI)*10+Math.sin(t*13)*2);
  const wing=Math.floor(time/115)%2;
  ctx.fillStyle="#6b5d49";ctx.fillRect(x,y,1,3);
  ctx.fillStyle=seed%2?"#e4c98a":"#e0b4a0";
  ctx.fillRect(x-1-wing,y-1,1+wing,2);ctx.fillRect(x+1,y-1,1+wing,2);
  ctx.fillStyle="#f3e3b9";ctx.fillRect(x-1-wing,y,1,1);ctx.fillRect(x+1+wing,y,1,1);
}
function drawNode(ctx:CanvasRenderingContext2D,node:SceneNode,atlas:HTMLImageElement,
  sprites:SpriteIndex,props:PropAtlas,camera:Position,viewport?:{width:number;height:number},snow=0,time=0,age=Infinity,wind=0,night=0,wet=0,insects:"day"|"night"|null=null){
  const b=node.kind==="building"?buildingBounds(node.value,sprites):
    node.kind==="prop"?{x:point(node.x)-node.value.width/2,y:point(node.y)-node.value.height,width:node.value.width,height:node.value.height}:
    fountainBounds();
  if(viewport&&(b.x+b.width<camera.x||b.y+b.height<camera.y||b.x>camera.x+viewport.width||b.y>camera.y+viewport.height))return;
  let shift=0;
  if(node.kind==="building"){
    building(ctx,atlas,sprites,node.value,camera);
    drawWindowLight(ctx,node.value,b,camera,night);
    drawEaveDrips(ctx,node,b,camera,time,wet);
  }
  else if(node.kind==="prop"){
    const tree=isTree(node.value);
    // Only the canopy's upper rows sway. Trunk and physical footprint stay fixed.
    if(time&&(tree||node.value.sprite==="hydrangea"||node.value.sprite==="planter")){
      const cell=PROP_CELLS[node.value.sprite],sx=cell%4*PROP_CELL,sy=Math.floor(cell/4)*PROP_CELL;
      const x=Math.round(b.x-camera.x),y=Math.round(b.y-camera.y);
      shift=propBend(node,time,wind);
      drawBentProp(ctx,props,sx,sy,x,y,b.width,b.height,shift);
    }else decoration(ctx,props,node.value,camera);
    const x=Math.round(b.x-camera.x),y=Math.round(b.y-camera.y);
    if(node.value.sprite==="lamp"&&night>.035){
      const brightness=nightLight(night,(hash(node.x,node.y)%100)/100);
      const xx=point(node.x)-camera.x,yy=point(node.y)-node.value.height*.72-camera.y;
      ctx.fillStyle=`rgba(255,231,165,${brightness})`;ctx.fillRect(Math.round(xx-2),Math.round(yy-2),4,5);
      if(time&&insects==="night"){
        const seed=hash(node.x,node.y),phase=(time/(9200+seed%2800)+seed%97/97)%1;
        if(phase<.32){
          const t=phase/.32;
          ctx.save();ctx.globalAlpha=.55*Math.sin(t*Math.PI);ctx.fillStyle="#efe9a6";
          ctx.fillRect(Math.round(xx+Math.sin(t*6+seed%7)*13),Math.round(yy+8+Math.sin(t*9)*6),1.5,1.5);
          ctx.restore();
        }
      }
    }
    if(insects==="day"&&(node.value.sprite==="hydrangea"||node.value.sprite==="planter"))
      drawFlowerVisitor(ctx,node,b,camera,time,wind);
    const active=age>=0&&age<1500;
    if(node.value.sprite==="arch"){
      // The little brass chime hangs inside the existing arch, not in a new collision layer.
      const cx=x+Math.round(b.width*.52),cy=y+Math.round(b.height*.31);
      const swing=active&&time?Math.round(Math.sin(age/70)*3*(1-age/1500)):Math.round(wind*.09);
      ctx.fillStyle="#735338";ctx.fillRect(cx,cy-7,1,7);
      ctx.fillStyle="#d4ad63";ctx.fillRect(cx-5+swing,cy,11,2);
      for(let i=0;i<3;i++){
        ctx.fillStyle="#82603e";ctx.fillRect(cx-4+i*4+swing,cy+2,2,6+i*2);
        ctx.fillStyle="#ffe4a0";ctx.fillRect(cx-4+i*4+swing,cy+2,1,5+i*2);
      }
    }else if(active&&node.value.story?.action&&node.value.sprite==="statue"){
      ctx.save();ctx.globalAlpha=.5+.4*(time?Math.sin(age/75)**2:1);
      ctx.fillStyle="#9cecff";ctx.fillRect(x+Math.round(b.width*.39),y+Math.round(b.height*.24),4,2);ctx.restore();
    }else if(active&&node.value.story?.action&&node.value.sprite==="cherry"){
      ctx.save();ctx.globalAlpha=1-age/1500;ctx.fillStyle="#e4b4ba";
      for(let i=0;i<4;i++){const t=time?age/1500:0;ctx.fillRect(x+b.width*.35+i*6+Math.sin(t*5+i)*5,y+b.height*.4+t*35+i*3,2,2);}
      ctx.restore();
    }
  }else fountain(ctx,atlas,sprites,camera);
  if(snow>.02&&(node.kind==="building"||node.kind==="prop"&&isTree(node.value))){
    const box:SpriteBox=node.kind==="building"?sprites[node.value.id]:[
      PROP_CELLS[node.value.sprite]%4*PROP_CELL,Math.floor(PROP_CELLS[node.value.sprite]/4)*PROP_CELL,PROP_CELL,PROP_CELL];
    const key=node.kind==="building"?node.value.id:node.value.sprite;
    ctx.save();ctx.globalAlpha=snow*.88;
    const cap=snowCap(node.kind==="building"?atlas:props,box,key);
    const x=Math.round(b.x-camera.x),y=Math.round(b.y-camera.y);
    if(shift&&node.kind==="prop")drawBentProp(ctx,cap,0,0,x,y,b.width,b.height,shift);
    else ctx.drawImage(cap,x,y,b.width,b.height);
    ctx.restore();
  }
}

export const WORLD_ART_SCALE=2;
export type Terrain = { canvas: HTMLCanvasElement; x:number;y:number;width:number;height:number }[];

// Cache a single detailed terrain layer in small chunks; no oversized full
// world canvas (important on mobile Safari). Draw only visible chunks.
export function renderTerrain(tiles: HTMLImageElement, season: Season = "summer"): Terrain {
  const chunks:Terrain=[];
  const chunkSize=48;
  for(let y=0;y<WORLD_HEIGHT;y+=chunkSize)for(let x=0;x<WORLD_WIDTH;x+=chunkSize){
    const width=Math.min(chunkSize,WORLD_WIDTH-x)*TILE,height=Math.min(chunkSize,WORLD_HEIGHT-y)*TILE;
    const canvas=document.createElement("canvas");
    canvas.width=width*WORLD_ART_SCALE;canvas.height=height*WORLD_ART_SCALE;
    const ctx=canvas.getContext("2d");
    if(!ctx)throw new Error("地图画布不可用");
    ctx.imageSmoothingEnabled=false;
    ctx.setTransform(WORLD_ART_SCALE,0,0,WORLD_ART_SCALE,-x*TILE*WORLD_ART_SCALE,-y*TILE*WORLD_ART_SCALE);
    ground(ctx,tiles,season,x,y,x+width/TILE,y+height/TILE);
    chunks.push({canvas,x:x*TILE,y:y*TILE,width,height});
  }
  return chunks;
}
function drawTerrain(ctx:CanvasRenderingContext2D,terrain:Terrain,camera:Position,width:number,height:number){
  for(const chunk of terrain){
    if(chunk.x+chunk.width<=camera.x||chunk.x>=camera.x+width||chunk.y+chunk.height<=camera.y||chunk.y>=camera.y+height)continue;
    ctx.drawImage(chunk.canvas,chunk.x-camera.x,chunk.y-camera.y,chunk.width,chunk.height);
  }
}

// The minimap is rendered from the same terrain and authored scenery.
function drawTrainingGround(ctx:CanvasRenderingContext2D,camera:Position,w:number,h:number){
  const f=TRAINING_FIELD,x=f.x*TILE-camera.x,y=f.y*TILE-camera.y,fw=f.width*TILE,fh=f.height*TILE;
  if(x>w||x+fw<0||y>h||y+fh<0)return;
  ctx.save();
  ctx.fillStyle="rgba(50,70,65,.18)";ctx.fillRect(x,y,fw,fh);
  // The outer curb and open southern observation strip leave multiple entrances.
  ctx.fillStyle="#596d64";ctx.fillRect(x,y,fw,4);ctx.fillRect(x,y,4,fh);ctx.fillRect(x+fw-4,y,4,fh);
  ctx.fillStyle="#a5aa91";ctx.fillRect(x+4,y+4,fw-8,2);
  ctx.fillStyle="rgba(46,62,59,.30)";ctx.fillRect(x+4,y+fh-17,fw-8,13);
  for(const [px,color,edge] of [[x+5,"rgba(166,72,65,.34)","#b17761"],[x+fw-101,"rgba(53,101,157,.36)","#7698ba"]] as const){
    ctx.fillStyle=color;ctx.fillRect(px,y+6,96,fh-25);
    ctx.strokeStyle=edge;ctx.lineWidth=2;ctx.strokeRect(px+1,y+7,94,fh-27);
    for(let i=0;i<3;i++){
      ctx.strokeRect(px+12+i*25,y+fh-48,21,24);
      ctx.fillStyle=edge;ctx.fillRect(px+14+i*25,y+fh-46,3,3);
    }
    ctx.fillStyle="#e5dcc6";ctx.font="bold 10px sans-serif";ctx.textAlign="center";
    ctx.fillText(px===x+5?"RED":"BLUE",px+48,y+fh-54);
  }
  ctx.strokeStyle="rgba(235,227,197,.64)";ctx.lineWidth=1;
  ctx.setLineDash([6,5]);ctx.beginPath();ctx.moveTo(x+fw/2,y+7);ctx.lineTo(x+fw/2,y+fh-19);ctx.stroke();ctx.setLineDash([]);
  ctx.beginPath();ctx.ellipse(x+fw/2,y+fh*.65,29,17,0,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle="#d9d0b3";ctx.font="bold 8px sans-serif";ctx.textAlign="center";
  ctx.fillText("RM · TRAINING",x+fw/2,y+fh-22);
  for(let i=10;i<fw-10;i+=24){ctx.fillRect(x+i,y+fh-10,10,2);}
  ctx.restore();
}

export function renderWorldPreview(
  terrain: Terrain, atlas: HTMLImageElement,
  sprites: SpriteIndex, props: HTMLImageElement, season:Season="summer",
): HTMLCanvasElement {
  const preview = document.createElement("canvas");
  preview.width = 432;
  preview.height = 288;
  const ctx = preview.getContext("2d");
  if (!ctx) throw new Error("小地图画布不可用");
  ctx.imageSmoothingEnabled = true;
  ctx.scale(preview.width / (WORLD_WIDTH * TILE), preview.height / (WORLD_HEIGHT * TILE));
  drawTerrain(ctx,terrain,{x:0,y:0},WORLD_WIDTH*TILE,WORLD_HEIGHT*TILE);
  drawTrainingGround(ctx,{x:0,y:0},WORLD_WIDTH*TILE,WORLD_HEIGHT*TILE);
  const seasonal = seasonalProps(props,season);
  for (const node of NODES) drawNode(ctx, node, atlas, sprites, seasonal, { x: 0, y: 0 });
  return preview;
}

export function renderNavigationMap(
  ctx: CanvasRenderingContext2D, preview: HTMLCanvasElement,
  player: Position, direction: Direction,
  camera: Position, viewWidth: number, viewHeight: number, expanded = false, discoveries:readonly string[]=[],
) {
  const { width, height } = ctx.canvas;
  const scaleX = width / WORLD_WIDTH, scaleY = height / WORLD_HEIGHT;
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(preview, 0, 0, width, height);

  if (expanded) {
    for (const place of PLACES) {
      const x = (place.x + place.width / 2) * scaleX;
      const y = (place.y + place.height / 2) * scaleY;
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#153734";
      ctx.strokeText(place.title, x, y, place.width * scaleX);
      ctx.fillStyle = "#fff3c8";
      ctx.fillText(place.title, x, y, place.width * scaleX);
    }
    for (const item of SCENERY) {
      if (!item.story || !discoveries.includes(item.story.title)) continue;
      const x = Math.round(item.x * scaleX), y = Math.round(item.y * scaleY);
      ctx.fillStyle = "#ffe4a0";
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
  }

  ctx.strokeStyle = "rgba(255, 249, 210, .95)";
  ctx.lineWidth = expanded ? 2 : 3;
  ctx.strokeRect(camera.x / TILE * scaleX, camera.y / TILE * scaleY,
    viewWidth / TILE * scaleX, viewHeight / TILE * scaleY);

  const px = player.x * scaleX, py = player.y * scaleY;
  const heading = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[direction];
  const [dx, dy] = heading;
  ctx.fillStyle = "#fff5c6";
  ctx.strokeStyle = "#193836";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px + dx * 6, py + dy * 6);
  ctx.lineTo(px - dx * 4 - dy * 4, py - dy * 4 + dx * 4);
  ctx.lineTo(px - dx * 4 + dy * 4, py - dy * 4 - dx * 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

type OutdoorClimate=Omit<ChangchunClimate,"weather"|"temperature">&{weather:WeatherKind|null;temperature:number|null};
const shadowCache=new Map<string,HTMLCanvasElement>();
function silhouette(image:HTMLImageElement,box:SpriteBox,key:string){
  const cached=shadowCache.get(key);if(cached)return cached;
  const canvas=document.createElement("canvas");canvas.width=box[2];canvas.height=box[3];
  const ctx=canvas.getContext("2d")!;
  ctx.drawImage(image,...box,0,0,box[2],box[3]);
  ctx.globalCompositeOperation="source-in";ctx.fillStyle="#263d35";ctx.fillRect(0,0,canvas.width,canvas.height);
  shadowCache.set(key,canvas);return canvas;
}
const isTree=(p:Scenery)=>["oak","lime_tree","cherry","pine"].includes(p.sprite);
function drawSun(ctx:CanvasRenderingContext2D,atlas:HTMLImageElement,sprites:SpriteIndex,props:HTMLImageElement,camera:Position,c:OutdoorClimate,width:number,height:number,
  character:HTMLImageElement,player:Position,pose:ExplorerAnimation,time:number,wind:number){
  if(c.sunHeight<=.035||c.weather==="fog"||c.weather==="rain"||c.weather==="storm"||c.weather==="snow")return;
  const strength=c.weather==="clear"?.28:.075;
  const length=Math.min(1.25,.32/Math.max(.2,c.sunHeight));
  ctx.save();ctx.globalAlpha=strength*Math.min(1,c.sunHeight*5);
  for(const node of NODES){
    if(node.kind==="fountain")continue;
    const x=point(node.x)-camera.x,y=point(node.y)-camera.y;
    if(x<-300||x>width+300||y<-300||y>height+300)continue;
    const object=node.value,build=node.kind==="building";
    const w=build?point(object.width):object.width;
    const box:SpriteBox=build?sprites[(object as Place).id]:[(PROP_CELLS[(object as Scenery).sprite]%4)*PROP_CELL,Math.floor(PROP_CELLS[(object as Scenery).sprite]/4)*PROP_CELL,PROP_CELL,PROP_CELL];
    const h=build?w*box[3]/box[2]:(object as Scenery).height;
    const mask=silhouette(build?atlas:props,box,build?(object as Place).id:(object as Scenery).sprite);
    const dx=-c.sunX*h*length,dy=-c.sunY*h*length;
    ctx.save();ctx.transform(w/mask.width*.84,0,-dx/mask.height,-dy/mask.height,x-w*.42+dx,y+dy);
    if(node.kind==="prop"&&isTree(node.value)){
      const shift=Math.round(propBend(node,time,wind)*PROP_CELL/node.value.width);
      drawBentProp(ctx,mask,0,0,0,0,mask.width,mask.height,shift);
    }else ctx.drawImage(mask,0,0);
    ctx.restore();
  }
  if (!waterDepthAt(player.x, player.y)) {
    const box=explorerFrameBox(pose);
    const mask=silhouette(character,box,`explorer:${box[0]}:${box[1]}`);
    const h=pose.seated?35:EXPLORER_FRAME_HEIGHT;
    const dx = -c.sunX * h * length, dy = -c.sunY * h * length;
    ctx.save();
    ctx.transform(.84, 0, -dx / mask.height, -dy / mask.height,
      point(player.x)-camera.x-mask.width*.42+dx, point(player.y)-camera.y+dy);
    ctx.drawImage(mask, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}
// Floating leaves drift in the authored water footprint, not in an
// independent particle pool. A bounded path cannot cross the shore.
export function floatingLeaf(pond:{x:number;y:number;width:number;height:number},index:number,time:number,wind:number){
  const seed=hash(pond.x+index,pond.y),t=time/1000;
  const x=pond.x+pond.width*(.5+.23*Math.sin(t*.038+seed%29+index*2.1))+
    Math.max(-.35,Math.min(.35,wind*.015));
  const y=pond.y+pond.height*(.5+.23*Math.cos(t*.029+seed%17+index*1.7));
  return {x,y,turn:Math.floor(t*.6+seed%5)%4};
}
function drawWater(ctx:CanvasRenderingContext2D,camera:Position,w:number,h:number,marks:SurfaceMark[],
  time:number,motion:boolean,climate:OutdoorClimate|null,wind:number){
  const weather=climate?.weather??null;
  const visible=waterCells.filter(c=>c.x*TILE+TILE>=camera.x&&c.y*TILE+TILE>=camera.y&&
    c.x*TILE<camera.x+w&&c.y*TILE<camera.y+h);
  if(!visible.length)return;
  ctx.save();ctx.beginPath();
  for(const c of visible)ctx.rect(c.x*TILE-camera.x,c.y*TILE-camera.y,TILE,TILE);
  ctx.clip();
  const t=motion?time/1000:0,rain=weather==="rain"||weather==="storm";
  for(const c of visible){
    if(c.seed%3!==0)continue;
    const x=c.x*TILE-camera.x,y=c.y*TILE-camera.y;
    const phase=(t*.32+c.seed%100/100)%1;
    const dx=Math.floor((phase*13)*2)/2;
    const sunny=climate?.weather==="clear"?Math.max(0,climate.sunHeight):0;
    ctx.globalAlpha=.07+.1*Math.sin(phase*Math.PI)+sunny*.08;
    ctx.fillStyle=climate&&climate.night>.1?"#99c9d9":sunny>.2?"#dce8c4":c.depth===1?"#cde8cf":"#a4dcd9";
    const yy=y+2+(c.seed%9);
    ctx.fillRect(x+dx-2,yy,3,.5);
    ctx.fillRect(x+dx,yy-.5,3.5,.5);
    if(sunny>.035&&climate&&c.seed%7===0){
      // Specular bands lean toward the current solar azimuth, with the
      // same surface phase as the surrounding water.
      const length=3+5*(1-sunny),offset=climate.sunX*3,tilt=climate.sunY;
      ctx.globalAlpha=.19*sunny*Math.sin(phase*Math.PI);
      for(let i=0;i<3;i++)ctx.fillRect(Math.round(x+dx+offset-length/2+i*2),
        Math.round(yy+2+tilt*i*.7),Math.max(1,length/3),.5);
    }
    if(rain&&motion&&c.seed%4===0){
      const k=(t*1.2+c.seed%37/37)%1;
      ctx.globalAlpha=.32*(1-k);ctx.strokeStyle="#d3ece3";ctx.lineWidth=.5;
      ctx.beginPath();ctx.ellipse(x+8,y+9,1+5*k,.5+2.3*k,0,0,Math.PI*2);ctx.stroke();
    }
  }
  if(climate?.season==="autumn"&&(climate.temperature??0)>0){
    ctx.globalAlpha=.85;
    for(const pond of PONDS){
      if(pond.x*TILE>camera.x+w||(pond.x+pond.width)*TILE<camera.x||
         pond.y*TILE>camera.y+h||(pond.y+pond.height)*TILE<camera.y)continue;
      for(let i=0;i<(pond.shore==="natural"?3:1);i++){
        const leaf=floatingLeaf(pond,i,motion?time:0,motion?wind:0);
        if(!waterDepthAt(leaf.x,leaf.y))continue;
        const x=point(leaf.x)-camera.x,y=point(leaf.y)-camera.y;
        ctx.fillStyle="#b88b48";ctx.fillRect(x-2,y,4,1.5);
        ctx.fillStyle="#d4ae69";ctx.fillRect(x-1,y-1,2,1);
        ctx.fillStyle="#8d6940";ctx.fillRect(x+(leaf.turn<2?1:-2),y+.5,1,1.5);
      }
    }
  }
  for (const mark of marks) {
    if (mark.kind !== "water") continue;
    const phase = mark.age / mark.ttl;
    const x = mark.x * TILE - camera.x, y = mark.y * TILE - camera.y;
    ctx.save(); ctx.translate(x, y); ctx.rotate(mark.angle);
    ctx.globalAlpha = (1 - phase) * .52; ctx.strokeStyle = "#d9f3de"; ctx.lineWidth = .65;
    // Wake trails behind the movement direction, then expands and disappears.
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.ellipse(-3 - phase * 5, 0, 4 + phase * 8 + i * 2, 3 + phase * 3 + i * 1.5, 0, Math.PI * .56, Math.PI * 1.44);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}
const puddles=Array.from({length:WORLD_HEIGHT},(_,y)=>y).flatMap(y=>Array.from({length:WORLD_WIDTH},(_,x)=>({x,y})))
  .filter(({x,y})=>puddleCell(x,y));
function drawWetGround(ctx:CanvasRenderingContext2D,camera:Position,w:number,h:number,c:OutdoorClimate,time:number,motion:boolean,surface:SurfaceWeather,marks:SurfaceMark[]){
  if(surface.wet<.01&&surface.snow<.01)return;
  ctx.save();
  const rain=c.weather==="rain"||c.weather==="storm";
  for(const p of puddles){
    const x=p.x*TILE+8-camera.x,y=p.y*TILE+9-camera.y;
    if(x<0||x>w||y<0||y>h)continue;
    ctx.globalAlpha=surface.wet;
    ctx.fillStyle="rgba(40,70,80,.25)";ctx.fillRect(x-5,y-2,10,4);ctx.fillRect(x-3,y-3,6,6);
    ctx.fillStyle="rgba(201,227,227,.42)";ctx.fillRect(x-4,y-2,5,.5);
    if(rain&&motion){const radius=1+((time/300+hash(p.x,p.y)%9)%4);ctx.strokeStyle="rgba(208,230,230,.40)";ctx.beginPath();ctx.ellipse(x,y,radius,radius*.4,0,0,Math.PI*2);ctx.stroke();}
  }
  if(surface.snow>.01){
    ctx.globalAlpha=Math.min(.86,surface.snow*.86);
    const startX=Math.max(0,Math.floor(camera.x/TILE)),startY=Math.max(0,Math.floor(camera.y/TILE));
    const endX=Math.min(WORLD_WIDTH,Math.ceil((camera.x+w)/TILE)),endY=Math.min(WORLD_HEIGHT,Math.ceil((camera.y+h)/TILE));
    for(let y=startY;y<endY;y++)for(let x=startX;x<endX;x++){
      const kind=groundAt(x,y),seed=hash(x,y);
      if(kind===3||shelteredAt(x+.5,y+.5)||seed%9>surface.snow*(kind===0?8:3))continue;
      const px=x*TILE-camera.x,py=y*TILE-camera.y;
      // Pixel clusters accumulate in grass and along paving seams, leaving routes legible.
      ctx.fillStyle=kind===0?"#dce9df":"#d1dedb";
      for(let i=0;i<3;i++){
        const dx=(seed>>>((i*6)%24))%11,dy=kind===0?(seed>>>((i*4+6)%24))%11:0;
        ctx.fillRect(px+dx,py+dy,kind===0?3+i:4+i,1+(i%2));
        ctx.fillRect(px+dx+1,py+dy+1,2+i,1);
      }
    }
  }
  for (const mark of marks) {
    if(mark.kind==="puddle"&&surface.wet>.12){
      const phase=mark.age/mark.ttl,x=mark.x*TILE-camera.x,y=mark.y*TILE-camera.y;
      ctx.globalAlpha=surface.wet*(1-phase)*.65;ctx.strokeStyle="#e0efed";ctx.lineWidth=.5;
      ctx.beginPath();ctx.ellipse(x,y,1+phase*5,.5+phase*2,0,0,Math.PI*2);ctx.stroke();
      continue;
    }
    if (mark.kind !== "snow" || surface.snow < .12) continue;
    ctx.save();
    ctx.translate(mark.x*TILE-camera.x, mark.y*TILE-camera.y);
    ctx.rotate(mark.angle + Math.PI / 2);
    ctx.globalAlpha = Math.min(.42, surface.snow) * (1 - mark.age / mark.ttl);
    ctx.fillStyle = "#546969";
    ctx.fillRect(-3, -2, 2, 4); ctx.fillRect(1, 1, 2, 4);
    ctx.restore();
  }
  ctx.restore();
}

// Window panes are registered against the actual building atlas crop,
// so the light sits on glass rather than floating in front of a building.
const WINDOWS:Record<string,number[][]>={
  mechanical:[[.238,.47,.064,.035],[.718,.47,.064,.035],[.21,.63,.07,.091],[.756,.63,.07,.091]],
  honors:[[.19,.40,.046,.062],[.74,.40,.046,.062],[.15,.64,.052,.138],[.80,.64,.052,.138]],
  electrical:[[.13,.56,.14,.073],[.13,.75,.14,.083],[.42,.76,.14,.12]],
  vision:[[.13,.64,.055,.12],[.29,.70,.055,.14],[.69,.70,.055,.14],[.83,.64,.055,.12]],
  guild:[[.19,.35,.057,.075],[.75,.36,.055,.075],[.19,.54,.055,.10],[.75,.54,.055,.10]],
  ai:[[.11,.48,.14,.075],[.74,.48,.15,.075],[.13,.61,.072,.12],[.43,.84,.13,.088]],
};
function glow(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,color:string,alpha:number){
  const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,"rgba(255,216,145,0)");
  ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=g;ctx.fillRect(x-r,y-r,2*r,2*r);ctx.restore();
}
function drawCloudShadows(ctx:CanvasRenderingContext2D,camera:Position,c:OutdoorClimate,w:number,h:number,time:number){
  if(c.sunHeight<=.08||(c.weather!=="clear"&&c.weather!=="cloudy"))return;
  const strength=(c.weather==="cloudy"?.13:.065)*Math.min(1,c.sunHeight*3);
  // Broad, slow world-space patches; no screen-space particles or timers.
  const t=time/1000;
  for(let i=0;i<9;i++){
    const x=((i*379+450+180*Math.sin(t*.019+1.3-Math.PI/2))%(WORLD_WIDTH*TILE+500))-250-camera.x;
    const y=(i*247+120)%(WORLD_HEIGHT*TILE)-camera.y;
    if(x<-250||x>w+250||y<-150||y>h+150)continue;
    ctx.save();ctx.translate(x,y);ctx.scale(1,.55);
    const g=ctx.createRadialGradient(0,0,45,0,0,235);
    g.addColorStop(0,"rgba(37,56,78,"+strength+")");g.addColorStop(1,"rgba(37,56,78,0)");
    ctx.fillStyle=g;ctx.fillRect(-235,-235,470,470);ctx.restore();
  }
}
function drawWindowLight(ctx:CanvasRenderingContext2D,p:Place,b:{x:number;y:number;width:number;height:number},camera:Position,night:number){
  if(night<=.035)return;
  for(const [u,v,a,h] of WINDOWS[p.id]??[]){
    const brightness=nightLight(night,(hash(p.x+Math.round(u*100),p.y+Math.round(v*100))%100)/100);
    if(!brightness)continue;
    const x=b.x-camera.x+u*b.width,y=b.y-camera.y+v*b.height;
    ctx.fillStyle=`rgba(255,224,155,${brightness*.65})`;
    ctx.fillRect(Math.round(x),Math.round(y),Math.round(a*b.width),Math.round(h*b.height));
  }
}
function drawGroundLights(ctx:CanvasRenderingContext2D,camera:Position,night:number,w:number,h:number,wet:number){
  if(night<=.035)return;
  for(const p of SCENERY){
    if(p.sprite!=="lamp")continue;
    const x=p.x*TILE-camera.x,y=p.y*TILE-camera.y;
    if(x<-60||x>w+60||y<-60||y>h+60)continue;
    const brightness=nightLight(night,(hash(p.x,p.y)%100)/100);
    if(!brightness)continue;
    glow(ctx,x,y,35,"rgba(255,205,123,.38)",brightness);
    if(wet>.02){
      ctx.fillStyle=`rgba(255,217,145,${wet*brightness*.22})`;
      ctx.fillRect(Math.round(x-7),Math.round(y+4),14,1);
      ctx.fillRect(Math.round(x-4),Math.round(y+8),8,1);
    }
  }
}
export function morningDew(c:Pick<OutdoorClimate,"hour"|"minute"|"temperature"|"weather"|"sunHeight"|"sunX">):number{
  if((c.temperature??0)<=0||(c.weather!=="clear"&&c.weather!=="cloudy")||c.sunX<=0)return 0;
  const hour=c.hour+c.minute/60;
  if(hour<4||hour>=9)return 0;
  return Math.max(0,Math.min(1,(hour-4)*2,(9-hour)/2,1-c.sunHeight));
}
function drawDew(ctx:CanvasRenderingContext2D,camera:Position,c:OutdoorClimate,w:number,h:number){
  const dew=morningDew(c);if(dew<.02)return;
  ctx.save();ctx.globalAlpha=dew*.62;ctx.fillStyle="#d9e5c7";
  const sx=Math.max(0,Math.floor(camera.x/TILE)),sy=Math.max(0,Math.floor(camera.y/TILE));
  const ex=Math.min(WORLD_WIDTH,Math.ceil((camera.x+w)/TILE)),ey=Math.min(WORLD_HEIGHT,Math.ceil((camera.y+h)/TILE));
  for(let y=sy;y<ey;y++)for(let x=sx;x<ex;x++){
    const seed=hash(x,y);
    if(seed%19!==0||groundAt(x,y)!==0)continue;
    ctx.fillRect(x*TILE+seed%11-camera.x,y*TILE+3+(seed>>>5)%9-camera.y,1,.5);
  }
  ctx.restore();
}
function drawAtmosphere(ctx:CanvasRenderingContext2D,c:OutdoorClimate,w:number,h:number){
  const shade=c.weather==="fog"?"rgba(192,207,208,.22)":c.weather==="storm"?"rgba(46,58,83,.20)":c.weather==="snow"?"rgba(214,230,235,.10)":c.weather&&c.weather!=="clear"?"rgba(76,96,108,.11)":null;
  if(shade){ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);}
  if(c.weather==="clear"&&c.sunHeight>0&&c.sunHeight<.30){
    const color=c.sunX>0?"221,214,168":"242,174,100";
    ctx.fillStyle=`rgba(${color},${(.30-c.sunHeight)*.35})`;ctx.fillRect(0,0,w,h);
  }
  if(c.night){ctx.fillStyle=`rgba(13,29,55,${c.night})`;ctx.fillRect(0,0,w,h);}

}

export function renderScene(
  ctx: CanvasRenderingContext2D, terrain: Terrain,
  atlas: HTMLImageElement, sprites: SpriteIndex, props: HTMLImageElement,
  characterSheet: HTMLImageElement, player: Position, pose:ExplorerAnimation, camera: Position,
  climate:OutdoorClimate|null=null,animals:Animal[]=[],cast:FishingCast|null=null,time=0,motion=true,surface:SurfaceWeather={wet:0,snow:0},marks:SurfaceMark[]=[],seatDepth=player.y,effects?:ReadonlyMap<string,number>,wind=0,robots:readonly CampusRobot[]=[],robotAtlases?:RobotAtlases,controlledRobot:CampusRobot|null=null,training:TrainingSession|null=null,sources:readonly ItemSource[]=availableSources(climate?.season??"summer",new Map(),time),life:LifeObject[]=[],
) {
  const screenCamera = snapCamera(camera);
  const w=ctx.canvas.width/WORLD_ART_SCALE,h=ctx.canvas.height/WORLD_ART_SCALE;
  drawTerrain(ctx,terrain,screenCamera,w,h);
  drawTrainingGround(ctx,screenCamera,w,h);
  drawWater(ctx,screenCamera,w,h,marks,time,motion,climate,wind);
  if(climate){drawDew(ctx,screenCamera,climate,w,h);drawWetGround(ctx,screenCamera,w,h,climate,time,motion,surface,marks);drawSun(ctx,atlas,sprites,props,screenCamera,climate,w,h,characterSheet,player,pose,motion?time:0,wind);drawCloudShadows(ctx,screenCamera,climate,w,h,motion?time:0);drawGroundLights(ctx,screenCamera,climate.night,w,h,surface.wet);}
  for(const source of sources){
    const item=worldItems.get(source.id);
    const x=point(source.x)-screenCamera.x,y=point(source.y)-screenCamera.y;
    if(item&&x>-15&&x<w+15&&y>-15&&y<h+15){
      ctx.fillStyle="#5b59434a";ctx.fillRect(x-6,y-1,12,3);
      if(source.id.endsWith("-food")||source.id==="fish-pellets"){
        ctx.fillStyle="#a78b5d";ctx.fillRect(x-6,y-7,12,7);ctx.fillStyle="#e4cc94";ctx.fillRect(x-5,y-6,10,4);
      }
      drawItem(ctx,item,x,y-5,1.3);
    }
  }
  for(const a of animals.filter(a=>a.species==="fish"))drawAnimal(ctx,a,screenCamera,motion);
  const land:(Animal|CampusRobot|LifeObject)[]=[...animals.filter(a=>a.species!=="fish"),...life];
  if(robotAtlases)land.push(...robots);
  if(training&&robotAtlases)land.push(training.opponent);
  const depth=(a:Animal|CampusRobot|LifeObject)=>"point" in a?a.point.y:a.y+("species" in a?0:.65);
  land.sort((a,b)=>depth(a)-depth(b));
  const drawLand=(a:Animal|CampusRobot|LifeObject)=>{
    if("point" in a){drawLifeObject(ctx,a,screenCamera,Date.now());return;}
    if("species" in a)drawAnimal(ctx,a,screenCamera,motion);
    else if(robotAtlases){
      ctx.save();
      const participant=training&&(a===controlledRobot||a===training.opponent);
      const hp=participant?(a===controlledRobot?training.hp:training.opponentHp):100;
      const flash=participant?(a===controlledRobot?training.hitFlash:training.opponentFlash):0;
      if(hp===0)ctx.globalAlpha=.55;
      else if(flash>0&&motion)ctx.globalAlpha=.55+.45*Math.min(1,flash/.18);
      drawCampusRobot(ctx,a,robotAtlases,screenCamera,w,h,motion,a===controlledRobot);
      ctx.restore();
      if(participant)drawTrainingHealth(ctx,a,hp,screenCamera,a!==controlledRobot);
    }
  };
  const seasonal=seasonalProps(props,climate?.season??"summer");
  const insects=motion&&climate&&(climate.temperature??0)>12&&
    (climate.weather==="clear"||climate.weather==="cloudy")?
    climate.night>.2?"night":climate.hour>=7&&climate.hour<18&&climate.season!=="winter"&&(climate.temperature??0)>15?"day":null:null;
  let playerDrawn = false,index=0;
  const drawPlayer=()=>{
    renderExplorer(ctx, characterSheet, player, pose, screenCamera);
    if(motion&&climate?.temperature!=null&&climate.temperature<=0&&!pose.water&&pose.direction!=="up"&&(pose.action==="idle"||pose.action==="walk")){
      const phase=(time%3600)/3600;
      if(phase<.25){
        const t=phase*4,dir=pose.direction==="left"?-1:pose.direction==="right"?1:0;
        const x=point(player.x)-screenCamera.x+dir*(5+t*9)+wind*t*.16,y=point(player.y)-screenCamera.y-28-t*5;
        ctx.save();ctx.globalAlpha=(1-t)*.42;ctx.fillStyle="#e3ece8";
        ctx.fillRect(Math.round(x),Math.round(y),2,2);ctx.fillRect(Math.round(x+dir*3),Math.round(y-2),2,1);
        ctx.restore();
      }
    }
  };
  for (const node of NODES) {
    while(index<land.length&&depth(land[index])<node.y){
      const a=land[index++];if(!playerDrawn&&depth(a)>seatDepth){drawPlayer();playerDrawn=true;}drawLand(a);
    }
    if (!playerDrawn && node.y > seatDepth) {drawPlayer();playerDrawn = true;}
    drawNode(ctx, node, atlas, sprites, seasonal, screenCamera, { width:w, height:h },surface.snow,motion?time:0,node.kind==="prop"&&node.value.story?time-(effects?.get(node.value.story.title)??-Infinity):Infinity,wind,climate?.night??0,(climate?.temperature??0)>0?surface.wet:0,
      insects);
  }
  while(index<land.length){const a=land[index++];if(!playerDrawn&&depth(a)>seatDepth){drawPlayer();playerDrawn=true;}drawLand(a);}
  if (!playerDrawn) drawPlayer();
  if(training)drawTrainingEffects(ctx,training,screenCamera,motion);
  if(climate)drawAtmosphere(ctx,climate,w,h);
  if(cast)drawFishing(ctx,player,cast,screenCamera,time,motion,fishingReady(animals,cast,time));
}

export function renderExplorer(
  ctx:CanvasRenderingContext2D,characterSheet:HTMLImageElement,
  player:Position,pose:ExplorerAnimation,camera:Position,
) {
  const footX=Math.round(player.x*TILE-camera.x),footY=Math.round(player.y*TILE-camera.y);
  const [sx,sy,w,h]=explorerFrameBox(pose);
  const swimming=pose.water===2||pose.action==="enter"||pose.action==="exit";
  const top=footY-h+(swimming?8:0);
  if(!pose.water && !pose.seated){
    ctx.fillStyle="rgba(44,66,48,.20)";ctx.beginPath();
    ctx.ellipse(footX,footY-2,pose.seated?10:12,4,0,0,Math.PI*2);ctx.fill();
  }
  if(pose.water){
    // These are independently authored water poses, not the standing sprite.
    // The existing water surface only tints the part below its physical plane.
    const surface=swimming?38:46;
    ctx.drawImage(characterSheet,sx,sy,w,surface,footX-w/2,top,w,surface);
    ctx.save();ctx.globalAlpha=.72;
    ctx.drawImage(characterSheet,sx,sy+surface,w,h-surface,footX-w/2,top+surface,w,h-surface);
    ctx.restore();
  }else ctx.drawImage(characterSheet,sx,sy,w,h,footX-w/2,top,w,h);
  if(pose.held&&!swimming)drawItem(ctx,pose.held,footX+(pose.direction==="left"?-8:8),footY-24,2);
}

export type PixelParticle = {
  x: number; y: number; vx: number; vy: number;
  age: number; ttl: number; color: string; size: number; height?: number; rain?:boolean; wind?:number;
};

// Particles live in the same world coordinates as every static prop.
export function renderParticles(ctx: CanvasRenderingContext2D, particles: PixelParticle[], camera: Position) {
  const offset = snapCamera(camera);
  ctx.save();
  for (const particle of particles) {
    if(particle.rain&&shelteredAt(particle.x/TILE,particle.y/TILE))continue;
    ctx.globalAlpha = Math.max(0, 1 - particle.age / particle.ttl);
    ctx.fillStyle = particle.color;
    ctx.fillRect(Math.round(particle.x - offset.x), Math.round(particle.y - offset.y),
      particle.size, particle.height ?? particle.size);
  }
  ctx.restore();
}
