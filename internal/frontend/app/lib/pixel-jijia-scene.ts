import {
  FOUNTAIN, groundAt, waterDepthAt, PLACES, SCENERY, TILE, WORLD_HEIGHT, WORLD_WIDTH, snapCamera,
  type Direction, type Place, type Position, type PropSprite, type Scenery,
} from "./pixel-jijia-world.ts";
import type { Season, ChangchunClimate, WeatherKind } from "./pixel-jijia-climate";
import { drawAnimal, drawFishing, type Animal, type FishingCast } from "./pixel-jijia-life.ts";

export type SpriteBox = [number, number, number, number];
export type SpriteIndex = Record<string, SpriteBox>;

const PROP_CELLS: Record<PropSprite, number> = {
  bench: 0, lamp: 1, sign: 2, planter: 3,
  oak: 4, lime_tree: 5, cherry: 6, rocks: 7,
  fence: 8, hydrangea: 9, statue: 10, arch: 11,
};
const PROP_CELL = 128;
const GROUND_PATCH = TILE * 8;
const GROUND_EDGE_Y = GROUND_PATCH * 4;
const point = (value: number) => Math.round(value * TILE);

function hash(x: number, y: number) {
  let n = Math.imul(x + 47, 374761393) ^ Math.imul(y + 103, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

function sprite(
  ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, sprites: SpriteIndex,
  name: string, x: number, y: number, width: number, height: number,
) {
  const box = sprites[name];
  if (!box) throw new Error(`像素素材缺失：${name}`);
  ctx.drawImage(atlas, ...box, Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

function ground(ctx: CanvasRenderingContext2D, tiles: HTMLImageElement, season: Season, startX:number,startY:number,endX:number,endY:number) {
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const kind = groundAt(x, y);
      const variant = hash(Math.floor(x / 8), Math.floor(y / 8)) % 3;
      const destX = point(x), destY = point(y);
      ctx.drawImage(
        tiles, variant * GROUND_PATCH + (x % 8) * TILE,
        kind * GROUND_PATCH + (y % 8) * TILE, TILE, TILE, destX, destY, TILE, TILE,
      );
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
        const depth = waterDepthAt(x+.5,y+.5);
        if (depth) {
          ctx.fillStyle = depth === 1 ? "rgba(189,221,188,.23)" : "rgba(25,73,112,.27)";
          ctx.fillRect(destX,destY,TILE,TILE);
        }
      }
      if (kind === 0) {
        if (season === "winter" && hash(x, y) % 7 < 4) {
          ctx.fillStyle = hash(x + 4, y) % 2 ? "#d3e3e4" : "#edf2e9";
          ctx.fillRect(destX + 1, destY + 1, TILE - 2, TILE - 2);
          ctx.fillStyle = "#a7c9bd";
          ctx.fillRect(destX + hash(x, y) % 9, destY + 12, 3, 2);
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
        neighbor !== kind && (kind !== 1 || neighbor === 0) && !(kind === 2 && neighbor === 3);
      for (const [side, nx, ny] of [[0, x, y - 1], [1, x, y + 1], [2, x - 1, y], [3, x + 1, y]]) {
        if (borders(groundAt(nx, ny))) {
          ctx.drawImage(tiles, ((kind - 1) * 4 + side) * TILE, GROUND_EDGE_Y, TILE, TILE, destX, destY, TILE, TILE);
        }
      }
    }
  }
}

function building(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, sprites: SpriteIndex, place: Place, camera: Position) {
  const box = sprites[place.id];
  if (!box) throw new Error(`建筑素材缺失：${place.id}`);
  const width = point(place.width);
  const height = Math.round(width * box[3] / box[2]);
  sprite(
    ctx, atlas, sprites, place.id, point(place.x) - camera.x,
    point(place.y + place.height) - height - camera.y, width, height,
  );
}

function decoration(ctx: CanvasRenderingContext2D, props: HTMLImageElement, object: Scenery, camera: Position) {
  const cell = PROP_CELLS[object.sprite];
  ctx.drawImage(
    props, (cell % 4) * PROP_CELL, Math.floor(cell / 4) * PROP_CELL,
    PROP_CELL, PROP_CELL,
    Math.round(point(object.x) - object.width / 2 - camera.x),
    Math.round(point(object.y) - object.height - camera.y),
    object.width, object.height,
  );
}

function fountain(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, sprites: SpriteIndex, camera: Position) {
  sprite(ctx, atlas, sprites, "fountain",
    point(FOUNTAIN.x) - 48 - camera.x, point(FOUNTAIN.y) - 50 - camera.y, 96, 96);
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
  { kind: "fountain" as const, x: FOUNTAIN.x, y: FOUNTAIN.y + 2.4 },
].sort((a, b) => a.y - b.y);

function drawNode(ctx: CanvasRenderingContext2D, node: SceneNode, atlas: HTMLImageElement,
  sprites: SpriteIndex, props: HTMLImageElement, camera: Position) {
  if (node.kind === "building") building(ctx, atlas, sprites, node.value, camera);
  else if (node.kind === "prop") decoration(ctx, props, node.value, camera);
  else fountain(ctx, atlas, sprites, camera);
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
export function renderWorldPreview(
  terrain: Terrain, atlas: HTMLImageElement,
  sprites: SpriteIndex, props: HTMLImageElement,
): HTMLCanvasElement {
  const preview = document.createElement("canvas");
  preview.width = 432;
  preview.height = 288;
  const ctx = preview.getContext("2d");
  if (!ctx) throw new Error("小地图画布不可用");
  ctx.imageSmoothingEnabled = true;
  ctx.scale(preview.width / (WORLD_WIDTH * TILE), preview.height / (WORLD_HEIGHT * TILE));
  drawTerrain(ctx,terrain,{x:0,y:0},WORLD_WIDTH*TILE,WORLD_HEIGHT*TILE);
  for (const node of NODES) drawNode(ctx, node, atlas, sprites, props, { x: 0, y: 0 });
  return preview;
}

export function renderNavigationMap(
  ctx: CanvasRenderingContext2D, preview: HTMLCanvasElement,
  player: Position, direction: Direction,
  camera: Position, viewWidth: number, viewHeight: number, expanded = false,
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
      if (!item.story) continue;
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
const isTree=(p:Scenery)=>["oak","lime_tree","cherry"].includes(p.sprite);
function drawSun(ctx:CanvasRenderingContext2D,atlas:HTMLImageElement,sprites:SpriteIndex,props:HTMLImageElement,camera:Position,c:OutdoorClimate,width:number,height:number){
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
    ctx.drawImage(mask,0,0);ctx.restore();
  }
  ctx.restore();
}
const puddles=Array.from({length:WORLD_HEIGHT},(_,y)=>y).flatMap(y=>Array.from({length:WORLD_WIDTH},(_,x)=>({x,y})))
  .filter(({x,y})=> (groundAt(x,y)===1||groundAt(x,y)===2)&&hash(x,y)%49===0);
function drawWetGround(ctx:CanvasRenderingContext2D,camera:Position,w:number,h:number,c:OutdoorClimate,time:number,motion:boolean){
  if(c.weather!=="rain"&&c.weather!=="storm")return;
  ctx.save();
  for(const p of puddles){
    const x=p.x*TILE+8-camera.x,y=p.y*TILE+9-camera.y;
    if(x<0||x>w||y<0||y>h)continue;
    ctx.fillStyle="rgba(40,70,80,.16)";ctx.fillRect(x-5,y-2,10,4);ctx.fillRect(x-3,y-3,6,6);
    ctx.fillStyle="rgba(201,227,227,.34)";ctx.fillRect(x-4,y-2,5,.5);
    if(motion){const radius=1+((time/300+hash(p.x,p.y)%9)%4);ctx.strokeStyle="rgba(208,230,230,.35)";ctx.beginPath();ctx.ellipse(x,y,radius,radius*.4,0,0,Math.PI*2);ctx.stroke();}
  }
  ctx.restore();
}
// Window panes are registered against the actual building atlas crop,
// so the light sits on glass rather than floating in front of a building.
const WINDOWS:Record<string,number[][]>={
  mechanical:[[.20,.61,.09,.09],[.60,.69,.11,.12]],
  honors:[[.43,.32,.14,.17]],
  electrical:[[.13,.54,.07,.12],[.77,.54,.08,.11]],
  vision:[[.13,.68,.075,.13],[.27,.69,.07,.13],[.65,.69,.07,.13],[.83,.69,.07,.13]],
  guild:[[.38,.33,.14,.11],[.73,.65,.18,.13]],
  ai:[[.16,.34,.11,.1],[.75,.38,.11,.1]],
};
function glow(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,color:string,alpha:number){
  const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,"rgba(255,216,145,0)");
  ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=g;ctx.fillRect(x-r,y-r,2*r,2*r);ctx.restore();
}
function drawAtmosphere(ctx:CanvasRenderingContext2D,camera:Position,sprites:SpriteIndex,c:OutdoorClimate,w:number,h:number){
  const shade=c.weather==="fog"?"rgba(192,207,208,.22)":c.weather==="storm"?"rgba(46,58,83,.20)":c.weather==="snow"?"rgba(214,230,235,.10)":c.weather&&c.weather!=="clear"?"rgba(76,96,108,.11)":null;
  if(shade){ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);}
  if(c.night){ctx.fillStyle=`rgba(13,29,55,${c.night})`;ctx.fillRect(0,0,w,h);}
  if(c.night>.035){
    const brightness=Math.min(.9,c.night*2.4);
    for(const p of SCENERY.filter(p=>p.sprite==="lamp")){
      const x=p.x*TILE-camera.x,y=p.y*TILE-p.height*.72-camera.y;
      if(x<-60||x>w+60||y<-60||y>h+60)continue;
      glow(ctx,x,y,35,"rgba(255,211,126,.7)",brightness);
      ctx.fillStyle=`rgba(255,231,165,${brightness})`;ctx.fillRect(Math.round(x-2),Math.round(y-2),4,5);
    }
    for(const p of PLACES){
      const x=p.x*TILE-camera.x,ww=p.width*TILE,hh=ww*sprites[p.id][3]/sprites[p.id][2],y=(p.y+p.height)*TILE-hh-camera.y;
      if(x+ww<0||x>w||y+hh<0||y>h)continue;
      for(const [u,v,a,b] of WINDOWS[p.id]??[]){
        const xx=x+u*ww,yy=y+v*hh;
        glow(ctx,xx+a*ww/2,yy+b*hh/2,Math.max(15,a*ww),"rgba(255,211,137,.36)",brightness);
        ctx.fillStyle=`rgba(255,220,146,${brightness*.35})`;ctx.fillRect(Math.round(xx),Math.round(yy),Math.round(a*ww),Math.round(b*hh));
      }
    }
  }
  if(c.weather==="clear"&&c.sunHeight>.08&&c.sunHeight<.82){
    // Canopy-filtered shafts projected along the current light direction.
    const dx=-c.sunX*125,dy=-c.sunY*125;
    for(const p of SCENERY.filter(isTree)){
      const x=p.x*TILE-camera.x,y=p.y*TILE-p.height*.62-camera.y;
      if(x<-180||x>w+180||y<-180||y>h+180)continue;
      for(let i=0;i<2;i++){
        const xx=x+(i-0.5)*18,yy=y+4*i;
        const g=ctx.createLinearGradient(xx,yy,xx+dx,yy+dy);
        g.addColorStop(0,"rgba(255,238,185,.03)");g.addColorStop(.24,"rgba(255,238,185,.13)");g.addColorStop(1,"rgba(255,238,185,0)");
        ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(xx-2,yy);ctx.lineTo(xx+2,yy);ctx.lineTo(xx+dx+11,yy+dy);ctx.lineTo(xx+dx-11,yy+dy);ctx.closePath();ctx.fill();
      }
    }
  }
}

export function renderScene(
  ctx: CanvasRenderingContext2D, terrain: Terrain,
  atlas: HTMLImageElement, sprites: SpriteIndex, props: HTMLImageElement,
  characterSheet: HTMLImageElement, player: Position, direction: Direction,
  walking: boolean, traveled: number, camera: Position, seated = false,
  climate:OutdoorClimate|null=null,animals:Animal[]=[],cast:FishingCast|null=null,time=0,motion=true,
) {
  const screenCamera = snapCamera(camera);
  const w=ctx.canvas.width/WORLD_ART_SCALE,h=ctx.canvas.height/WORLD_ART_SCALE;
  drawTerrain(ctx,terrain,screenCamera,w,h);
  if(climate){drawWetGround(ctx,screenCamera,w,h,climate,time,motion);drawSun(ctx,atlas,sprites,props,screenCamera,climate,w,h);}
  for(const a of animals.filter(a=>a.species==="fish"))drawAnimal(ctx,a,screenCamera,motion);
  const land=animals.filter(a=>a.species!=="fish").sort((a,b)=>a.y-b.y);
  let playerDrawn = false,index=0;
  const drawPlayer=()=>renderExplorer(ctx, characterSheet, player, direction, walking, traveled, screenCamera, seated, waterDepthAt(player.x,player.y));
  for (const node of NODES) {
    while(index<land.length&&land[index].y<node.y){
      const a=land[index++];if(!playerDrawn&&a.y>player.y){drawPlayer();playerDrawn=true;}drawAnimal(ctx,a,screenCamera,motion);
    }
    if (!playerDrawn && node.y > player.y) {drawPlayer();playerDrawn = true;}
    drawNode(ctx, node, atlas, sprites, props, screenCamera);
  }
  while(index<land.length){const a=land[index++];if(!playerDrawn&&a.y>player.y){drawPlayer();playerDrawn=true;}drawAnimal(ctx,a,screenCamera,motion);}
  if (!playerDrawn) drawPlayer();
  if(climate)drawAtmosphere(ctx,screenCamera,sprites,climate,w,h);
  if(cast)drawFishing(ctx,player,cast,screenCamera,time,motion);
}

const EXPLORER_ROWS: Record<Direction, number> = { down: 0, left: 1, right: 2, up: 3 };
const EXPLORER_FRAME_WIDTH = 40;
const EXPLORER_FRAME_HEIGHT = 54;

export function renderExplorer(
  ctx: CanvasRenderingContext2D, characterSheet: HTMLImageElement,
  player: Position, direction: Direction, walking: boolean, traveled: number, camera: Position,
  seated = false, water: 0 | 1 | 2 = 0,
) {
  const footX = Math.round(player.x * TILE - camera.x);
  const footY = Math.round(player.y * TILE - camera.y);
  const frame = walking ? Math.floor(traveled / 0.5) % 4 : 0;
  if (seated) {
    // Draw the idle torso behind the seat; the bench front hides the legs.
    ctx.drawImage(characterSheet, 0, EXPLORER_ROWS.down * EXPLORER_FRAME_HEIGHT,
      EXPLORER_FRAME_WIDTH, 42, footX - 20, footY - 45, 40, 42);
    return;
  }
  if (water) {
    const visible = water === 2 ? 26 : 43;
    const bob = walking ? Math.floor(traveled * 3) % 2 : 0;
    ctx.drawImage(characterSheet, frame * EXPLORER_FRAME_WIDTH, EXPLORER_ROWS[direction] * EXPLORER_FRAME_HEIGHT,
      EXPLORER_FRAME_WIDTH, visible, footX - 20, footY - visible + bob, 40, visible);
    ctx.save();
    ctx.strokeStyle = "rgba(211,239,230,.72)";
    ctx.lineWidth = 1;
    for (let i=0;i<2;i++) {
      ctx.beginPath(); ctx.ellipse(footX,footY+1,11+i*6+bob,3+i*2,0,0,Math.PI*2); ctx.stroke();
    }
    ctx.restore();
    return;
  }
  ctx.fillStyle = "rgba(44, 66, 48, 0.20)";
  ctx.beginPath();
  ctx.ellipse(footX, footY - 2, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(
    characterSheet,
    frame * EXPLORER_FRAME_WIDTH, EXPLORER_ROWS[direction] * EXPLORER_FRAME_HEIGHT,
    EXPLORER_FRAME_WIDTH, EXPLORER_FRAME_HEIGHT,
    footX - 20, footY - 54, 40, 54,
  );
}

export type PixelParticle = {
  x: number; y: number; vx: number; vy: number;
  age: number; ttl: number; color: string; size: number; height?: number;
};

// Particles live in the same world coordinates as every static prop.
export function renderParticles(ctx: CanvasRenderingContext2D, particles: PixelParticle[], camera: Position) {
  const offset = snapCamera(camera);
  ctx.save();
  for (const particle of particles) {
    ctx.globalAlpha = Math.max(0, 1 - particle.age / particle.ttl);
    ctx.fillStyle = particle.color;
    ctx.fillRect(Math.round(particle.x - offset.x), Math.round(particle.y - offset.y),
      particle.size, particle.height ?? particle.size);
  }
  ctx.restore();
}
