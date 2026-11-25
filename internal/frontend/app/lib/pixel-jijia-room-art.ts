import { TILE, type Position } from "./pixel-jijia-world.ts";
import type { RoomObject, RoomScene } from "./pixel-jijia-room.ts";
import { COMMUNITY_POSES } from "./pixel-jijia-community.ts";
import type { WeatherKind } from "./pixel-jijia-climate.ts";

export const ROOM_ART_SCALE = 2;
const ink = "#293b3e"; // shared muted campus outline
type Paint = (x: number, y: number, w: number, h: number, color: string) => void;

function shade(color: string, n: number) {
  return "#" + [1, 3, 5].map(i => Math.max(0, Math.min(255, parseInt(color.slice(i, i + 2), 16) + n)).toString(16).padStart(2, "0")).join("");
}
function painter(ctx: CanvasRenderingContext2D): Paint {
  return (x, y, w, h, color) => {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x * 2) / 2, Math.round(y * 2) / 2, Math.max(.5, Math.round(w * 2) / 2), Math.max(.5, Math.round(h * 2) / 2));
  };
}
function bitmap(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w * ROOM_ART_SCALE);
  canvas.height = Math.ceil(h * ROOM_ART_SCALE);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(ROOM_ART_SCALE, ROOM_ART_SCALE);
  return { canvas, p: painter(ctx) };
}
function panel(p: Paint, x: number, y: number, w: number, h: number, color: string) {
  p(x, y, w, h, ink);
  p(x + 1, y + 1, w - 2, h - 2, color);
  p(x + 1, y + 1, w - 2, 1, shade(color, 34));
  p(x + 1, y + 2, 1, h - 3, shade(color, 17));
  p(x + 2, y + h - 2, w - 3, 1, shade(color, -24));
  p(x + w - 2, y + 2, 1, h - 3, shade(color, -19));
}
function line(p: Paint, x: number, y: number, X: number, Y: number, c: string, size = 1) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(X - x), Math.abs(Y - y)) * 2));
  for (let i = 0; i <= n; i++) p(x + (X - x) * i / n, y + (Y - y) * i / n, size, size, c);
}
function oval(p: Paint, x: number, y: number, r: number, color: string, ratio = 1) {
  for (let d = -r; d <= r; d += .5) {
    const a = Math.sqrt(Math.max(0, r * r - d * d));
    p(x - a, y + d * ratio, a * 2 + .5, .5, color);
  }
}
function gear(p: Paint, x: number, y: number, r: number) {
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    p(x + Math.cos(a) * r - 1.5, y + Math.sin(a) * r * .7 - 1, 3, 2, "#73818a");
  }
  oval(p, x, y, r - 1, "#334651", .7); oval(p, x, y - .5, r - 2, "#c0c8c3", .7);
  oval(p, x, y, r * .42, "#667680", .7); oval(p, x, y, r * .24, "#2e414b", .7);
}
function book(p: Paint, x: number, y: number, w: number, h: number, color: string) {
  panel(p, x, y, w, h, color);
  p(x + 3, y + 2, w - 5, h - 4, "#dfd1ad");
  p(x + w / 2, y + 2, 1, h - 4, "#9c8768");
  for (let j = 4; j < h - 2; j += 3) {
    p(x + 4, y + j, w / 2 - 6, .5, "#a0967e");
    p(x + w / 2 + 2, y + j, w / 2 - 5, .5, "#a0967e");
  }
}
function trophy(p: Paint, x: number, y: number, s = 1) {
  const q = (a: number, b: number, w: number, h: number, c: string) => p(x + a * s, y + b * s, w * s, h * s, c);
  q(4, 0, 10, 3, "#f8d88c"); q(5, 3, 8, 8, "#bd8437"); q(6, 3, 2, 7, "#ffe2a0");
  q(1, 2, 3, 1, "#cb9a50"); q(0, 3, 2, 5, "#d6a652"); q(2, 7, 4, 2, "#edc472");
  q(14, 2, 3, 1, "#edc472"); q(16, 3, 2, 5, "#cb9848"); q(12, 7, 4, 2, "#edc472");
  q(8, 10, 2, 5, "#d6a450"); q(5, 15, 8, 2, "#f0c778"); q(2, 17, 14, 3, "#74513c");
}
const WINDOW_X = [42, 162, 358, 478];
function windowArt(p: Paint, x: number, y: number, w: number, light: string) {
  panel(p, x - 3, y - 3, w + 6, 45, "#9e8b71");
  panel(p, x, y, w, 37, "#283f4a");
  for (let i = 3; i < w - 3; i += 13) for (let j = 3; j < 32; j += 15) {
    const n = Math.min(10, w - i - 3);
    p(x + i, y + j, n, 12, shade(light, j === 3 ? 17 : -12));
    p(x + i + 1, y + j + 1, n - 2, 1, "#e5ead4");
    p(x + i + 1, y + j + 3, 1, 6, "#f2f3df");
    p(x + i + 3, y + j + 9, n - 4, 2, shade(light, -28));
  }
  panel(p, x - 5, y + 37, w + 10, 5, "#bdac8c");
}
function lamp(p: Paint, x: number, y: number) {
  panel(p, x - 6, y - 4, 12, 19, "#665443");
  panel(p, x - 4, y, 8, 12, "#c6904f");
  p(x - 2, y + 2, 4, 8, "#ffe4a5"); p(x - 1, y + 3, 2, 4, "#fff7ce");
}
function banner(p: Paint, x: number, y: number, w: number, color: string) {
  panel(p, x, y, w, 32, color);
  for (let i = 0; i < 10; i++) p(x + i, y + 31 + i * .5, w - 2 * i, .5, "#cba466");
  oval(p, x + w / 2, y + 14, 7, "#cfa861"); oval(p, x + w / 2, y + 14, 4.5, color);
  p(x + w / 2 - 1, y + 8, 2, 12, "#f3dc9b"); p(x + w / 2 - 4, y + 12, 8, 2, "#f3dc9b");
}
export function renderPublicRoomTerrain(room: RoomScene, campusTiles?: HTMLImageElement) {
  const w = room.width * TILE, h = room.height * TILE, {canvas, p} = bitmap(w, h);
  const wood = room.id === "guild" || room.id === "honors";
  const base = room.theme.floor, wall = room.theme.wall, trim = wood ? "#a88b6b" : "#8c9991";
  p(0, 0, w, h, "#28343b");
  const tw = wood ? 42 : room.id === "mechanical" ? 36 : 32, th = wood ? 12 : 24;
  for (let y = 80; y < h - 16; y += th) for (let x = 16 - (Math.round(y / th) % 2) * tw / 2; x < w - 16; x += tw) {
    const a = Math.max(16, x), b = Math.min(w - 16, x + tw) - a, c = Math.min(th, h - 16 - y);
    const n = ((Math.round(x * 7 + y * 11) % 13) + 13) % 13 - 6;
    p(a, y, b, c, shade(base, -21)); p(a + .5, y + .5, b - 1, c - 1, shade(base, n));
    p(a + 1, y + 1, b - 2, .5, shade(base, n + 21));
    if (wood) {
      for (let j = 0; j < 3; j++) {
        p(a + 3 + j * 4, y + 3 + j * 2.5, Math.min(b - 7 - j * 4, 14 + n), .5, shade(base, n - 13));
        p(a + 4 + j * 4, y + 3.5 + j * 2.5, Math.min(b - 8 - j * 4, 9 + n), .5, shade(base, n + 12));
      }
    }
    else {
      for (let j = 0; j < 5; j++) {
        const dx = (j * 11 + n * 3 + 30) % Math.max(3, b - 3);
        const dy = (j * 7 + n + 18) % Math.max(3, c - 3);
        p(a + dx + 1, y + dy + 1, 1, .5, shade(base, n - 9 + j * 4));
      }
      p(a + b - 4, y + c - 4, 1, 1, shade(base, n - 18));
    }
  }
  // Reuse the campus masonry texture in the labs, with a subdued indoor
  // finish rather than introducing a second unrelated texture library.
  if (campusTiles) {
    const ctx = canvas.getContext("2d")!;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = .28;
    for (let y = 80; y < h - TILE; y += TILE) for (let x = TILE; x < w - TILE; x += TILE) {
      const variant = (Math.floor(x / 64) + Math.floor(y / 64) * 2) % 3;
      ctx.drawImage(campusTiles,variant*128+(x%64)*2,(wood?6:2)*128+(y%64)*2,32,32,x,y,TILE,TILE);
    }
    ctx.restore();
  }
  panel(p, 0, 0, w, 80, wall);
  for (let x = 8; x < w - 8; x += 48) {
    p(x, 7, 1, 61, shade(wall, -17)); p(x + 1, 8, 1, 60, shade(wall, 18));
    p(x + 4, 60, 40, 2, shade(wall, -13));
  }
  for (const x of WINDOW_X) windowArt(p, x, 13, 56, room.theme.window);
  if(room.id!=="vision")banner(p,w/2-24,11,48,wood?"#783e49":"#344f72");
  // Each room's wall has a distinct emblem and decorative inlay.
  const cxWall = w / 2, cyWall = 25;
  if(room.id!=="vision")p(cxWall-13,cyWall-9,26,19,wood?"#783e49":"#344f72");
  if (room.id === "mechanical") {
    gear(p, cxWall, cyWall, 10);
  } else if (room.id === "honors") {
    trophy(p, cxWall - 9, cyWall - 10, 1);
  } else if (room.id === "guild") {
    book(p, cxWall - 12, cyWall - 8, 24, 16, "#a88756");
  } else if (room.id === "electrical") {
    for (let i = 0; i < 23; i++) line(p, cxWall - 11 + i, cyWall + Math.sin(i * .5) * 5, cxWall - 10 + i, cyWall + Math.sin((i + 1) * .5) * 5, "#b6e4ce", 1);
  } else if(room.id!=="vision"){
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4, x = cxWall + Math.cos(a) * 11, y = cyWall + Math.sin(a) * 7;
      line(p, cxWall, cyWall, x, y, "#88bdd2", .7); oval(p, x, y, 1.8, "#d1eff2");
    }
  }
  for (const x of [132, 446]) lamp(p, x, 35);
  panel(p, 0, 69, w, 11, trim);
  // Only the wall contact shadow is static; window lighting follows climate.
  const ctx = canvas.getContext("2d")!;
  ctx.save();
  for (let i = 0; i < 16; i++) {
    ctx.globalAlpha = .12 * (1 - i / 16);
    p(16, 80 + i, w - 32, 1, "#26343d");
  }
  ctx.restore();
  panel(p, 0, 79, 16, h - 79, trim); panel(p, w - 16, 79, 16, h - 79, trim);
  const exit = room.objects.find(o => o.kind === "exit")!, cx = w / 2, bottom = (exit.y - .55) * TILE;
  if (wood) {
    const x = cx - 39, y = 152, rh = bottom - y;
    panel(p, x, y, 78, rh, room.theme.rug); p(x + 4, y + 4, 70, rh - 8, shade(room.theme.rug, 15));
    for (let i = y + 8; i < bottom - 5; i += 10) { p(x + 8, i, 2, 5, "#d7b47d"); p(x + 68, i, 2, 5, "#d7b47d"); }
    oval(p, cx, y + rh * .64, 17, "#c6a36b", .8); oval(p, cx, y + rh * .64, 13, shade(room.theme.rug, 15), .8);
    for (let j = y + 9; j < bottom - 8; j += 6) {
      p(x + 15, j, 48, .5, shade(room.theme.rug, 21));
      p(x + 18, j + 1, 1, 1, "#c6a36b"); p(x + 59, j + 1, 1, 1, "#c6a36b");
    }
    for (let j = -12; j <= 12; j += 4) {
      line(p, cx - 9, y + rh * .64 + j, cx, y + rh * .64 + j - 3, "#d5b67b", .5);
      line(p, cx, y + rh * .64 + j - 3, cx + 9, y + rh * .64 + j, "#d5b67b", .5);
    }
  } else {
    for (let i = 21; i < w - 20; i += 22) { p(i, 87, 11, 1.5, "#c4b47a"); p(i, h - 24, 11, 1.5, "#c4b47a"); }
    for (const o of room.objects.filter(o => o.solid && (o.kind === "machine" || o.id === "assembly"))) {
      const x = o.x * TILE - 3, y = o.y * TILE - 3, a = o.width * TILE + 6, b = o.height * TILE + 6;
      for (let i = 0; i < a; i += 8) { p(x + i, y, 4, 1.5, "#d9b969"); p(x + i, y + b, 4, 1.5, "#d9b969"); }
      for (let i = 0; i < b; i += 8) { p(x, y + i, 1.5, 4, "#d9b969"); p(x + a, y + i, 1.5, 4, "#d9b969"); }
    }
  }
  panel(p, 0, h - 16, exit.x * TILE, 16, trim);
  panel(p, (exit.x + exit.width) * TILE, h - 16, w - (exit.x + exit.width) * TILE, 16, trim);
  for(const object of room.objects.filter(o=>o.solid)){
    const x=object.x*TILE,y=object.y*TILE,a=object.width*TILE,b=object.height*TILE;
    ctx.save();
    ctx.globalAlpha=.14;ctx.fillStyle="#26343d";ctx.beginPath();
    ctx.ellipse(x+a/2,y+b*.72,a*.47,Math.max(2,b*.32),0,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  const ex = exit.x * TILE, ew = exit.width * TILE;
  panel(p, ex, bottom, ew, h - bottom, shade(base, -12));
  for (let i = bottom + 4; i < h - 3; i += 6) p(ex + 3, i, ew - 6, 1, shade(base, -25));
  p(ex + 3, bottom + 3, ew - 6, 2, "#e9c990");
  p(ex + ew / 2 - 3, bottom + 12, 6, 1, shade(base, 22));
  line(p, ex + ew / 2 - 5, bottom + 15, ex + ew / 2, bottom + 19, shade(base, 22), 1);
  line(p, ex + ew / 2, bottom + 19, ex + ew / 2 + 5, bottom + 15, shade(base, 22), 1);
  return canvas;
}

// Each object is prepared from the independently masked art atlas. The
// existing per-object cache also supplies the exact alpha hit test.
type PreparedSprite={canvas:HTMLCanvasElement;frames:HTMLCanvasElement[];bounds:{x:number;y:number;w:number;h:number};marginX:number;marginY:number};
const sprites=new WeakMap<RoomObject,PreparedSprite>();
let studyChair: HTMLCanvasElement;
export function roomSpriteKey(o:RoomObject){return o.decorative?`decor-${o.kind}`:o.id;}
function spriteBox(o:RoomObject,spriteIndex:Record<string,number[]>){
  const source=spriteIndex[roomSpriteKey(o)];
  if(!source)throw new Error(`Missing room sprite: ${roomSpriteKey(o)}`);
  const [sx,sy,sw,sh]=source;
  const w=o.width*TILE,h=Math.round(w*sh/sw);
  return {sx,sy,sw,sh,x:o.x*TILE,y:(o.y+o.height)*TILE-h,w,h};
}
const ARM_STEPS=8,ARM_PAD=12;
function armFrames(atlas:HTMLImageElement,b:{sx:number;sy:number;sw:number;sh:number}){
  const {sx,sy,sw,sh}=b;
  return Array.from({length:ARM_STEPS+1},(_,i)=>{
    const c=document.createElement("canvas");c.width=sw+ARM_PAD*2;c.height=sh+ARM_PAD*2;
    const ctx=c.getContext("2d")!;ctx.imageSmoothingEnabled=false;
    if(!i){ctx.drawImage(atlas,sx,sy,sw,sh,ARM_PAD,ARM_PAD,sw,sh);return c;}
    // Original 51x115 art: fixed base (21,82), elbow (12,38).
    const lower=-.24*i/ARM_STEPS,upper=.20*i/ARM_STEPS;
    const baseX=21,baseY=82,elbowX=12,elbowY=38;
    ctx.drawImage(atlas,sx,sy+76,sw,sh-76,ARM_PAD,ARM_PAD+76,sw,sh-76);
    ctx.save();ctx.translate(ARM_PAD+baseX,ARM_PAD+baseY);ctx.rotate(lower);
    ctx.drawImage(atlas,sx,sy+34,sw,51,-baseX,34-baseY,sw,51);ctx.restore();
    const dx=elbowX-baseX,dy=elbowY-baseY;
    const ex=baseX+Math.cos(lower)*dx-Math.sin(lower)*dy,ey=baseY+Math.sin(lower)*dx+Math.cos(lower)*dy;
    ctx.save();ctx.translate(ARM_PAD+ex,ARM_PAD+ey);ctx.rotate(upper);
    ctx.drawImage(atlas,sx,sy,sw,44,-elbowX,-elbowY,sw,44);ctx.restore();
    return c;
  });
}
// Only the turret region differs between the two authored robot poses.
// Insert two native-pixel intermediate views, leaving the chassis and antenna untouched.
function robotYawFrame(atlas:HTMLImageElement,box:number[],turn:boolean,w:number,h:number){
  const [sx,sy,sw,sh]=box,c=document.createElement("canvas");c.width=sw;c.height=sh;
  const ctx=c.getContext("2d")!;ctx.imageSmoothingEnabled=false;
  ctx.drawImage(atlas,sx,sy,sw,sh,0,0,sw,sh);
  ctx.clearRect(22,2,37,22);
  ctx.drawImage(atlas,sx+22,sy+2,37,22,turn?25:24,2,32,22);
  const result=bitmap(w,h).canvas,paint=result.getContext("2d")!;
  paint.imageSmoothingEnabled=false;paint.drawImage(c,0,0,w,h);return result;
}
export function preparePublicRoomArt(atlas:HTMLImageElement,rooms:RoomScene[],spriteIndex:Record<string,number[]>, communityAtlas:HTMLImageElement, communityIndex:Record<string,number[]>){
  for(const room of rooms){
    if(room.id==="study")continue;
    for(const o of room.objects){
      if(o.kind==="exit")continue;
      const b=spriteBox(o,o.community ? communityIndex : spriteIndex);
      const {canvas,p}=bitmap(b.w,b.h);
      const ctx=canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(o.community ? communityAtlas : atlas,b.sx,b.sy,b.sw,b.sh,0,0,b.w,b.h);
      if (o.href) {
        const x=b.w-13,y=b.h-12;
        panel(p,x,y,10,9,"#234351");p(x+2,y+3,5,2,"#b4e8c4");p(x+6,y+2,2,4,"#b4e8c4");
      }
      const frames = (COMMUNITY_POSES[o.id] ?? []).slice(1).map(key => {
        const [sx,sy,sw,sh] = communityIndex[key];
        const frame = bitmap(b.w,b.h).canvas;
        const context = frame.getContext("2d")!;
        context.imageSmoothingEnabled=false;
        context.drawImage(communityAtlas,sx,sy,sw,sh,0,0,b.w,b.h);
        return frame;
      });
      let preparedFrames=[canvas,...frames],marginX=0,marginY=0;
      if(o.id==="machine"){
        preparedFrames=armFrames(atlas,b);
        marginX=ARM_PAD*b.w/b.sw;marginY=ARM_PAD*b.h/b.sh;
      }else if(o.id==="test-robot"){
        preparedFrames.push(robotYawFrame(communityAtlas,communityIndex[o.id],false,b.w,b.h),
          robotYawFrame(communityAtlas,communityIndex["pose-robot-turn"],true,b.w,b.h));
      }
      sprites.set(o,{canvas,frames:preparedFrames,bounds:b,marginX,marginY});
      if(o.kind==="chair")studyChair=canvas;
    }
  }
}
// The study uses the same stool silhouette, centered over its existing
// one-tile collision footprint (the image overhang is four pixels per side).
export function drawStudyChair(ctx:CanvasRenderingContext2D,o:RoomObject,camera:Position){
  const w=studyChair.width/ROOM_ART_SCALE,h=studyChair.height/ROOM_ART_SCALE;
  ctx.drawImage(studyChair,Math.round((o.x+o.width/2)*TILE-camera.x-w/2),
    Math.round((o.y+o.height)*TILE-camera.y-h),w,h);
}
function sprite(o:RoomObject){
  const image=sprites.get(o);
  if(!image)throw new Error(`Room sprite not prepared: ${roomSpriteKey(o)}`);
  return image;
}
// Work bursts have a start, work and return phase, with alternating idle gaps.
const EQUIPMENT_CYCLES:Record<string,readonly [number,number,number]>={
  machine:[6600,10500,3100],"test-robot":[5700,12500,1800],
  assembly:[6500,15000,4600],cad:[8200,6000,1300],
  oscilloscope:[9200,5000,800],"signal-wall":[8000,6500,2000],embedded:[6800,10000,4200],
  dataset:[8400,6300,1600],compute:[9200,7000,5400],"lens-calibration":[5600,10500,2300],
  models:[11500,8500,3600],planning:[7900,9300,5300],strategy:[9500,8500,3000],
  simulation:[8500,12000,6200],"hello-terminal":[7000,11000,900],"decor-server":[10000,7000,7200],
};
export function equipmentProgress(key:string,time:number,triggeredAt?:number,hour=12,manual?:boolean):number{
  const config=EQUIPMENT_CYCLES[key];if(!config)return manual===true?0:-1;
  const [duration,rest,offset]=config;
  if(manual!==undefined)return manual?((time-(triggeredAt??0))%duration+duration)%duration/duration:-1;
  const age=triggeredAt===undefined?Infinity:time-triggeredAt;
  // A late-night interaction still works; only the automatic work stops.
  // Servers keep running while the workshop and public exhibition rest.
  if((hour<5.5||hour>=23)&&key!=="compute"&&key!=="models"&&key!=="decor-server"){
    return age>=0&&age<duration?age/duration:-1;
  }
  const clock=age>=0&&Number.isFinite(age)?age:time+offset;
  const period=duration+rest,cycle=clock%(period*2+2700),phase=cycle<period?cycle:cycle-period;
  return phase<duration?phase/duration:-1;
}
export function equipmentPose(key:string,progress:number):number{
  if(progress<0||progress>=1)return 0;
  if(key==="machine")return Math.round(Math.sin(Math.PI*progress)**2*ARM_STEPS);
  if(key==="test-robot"){
    const sweep=progress<.5?progress*2:(1-progress)*2;
    return sweep<.17?2:sweep<.39?3:sweep<.64?4:1;
  }
  return 0;
}
export function hasEquipmentBehavior(key:string):boolean{return key in EQUIPMENT_CYCLES;}
const LIGHT_POINTS:Record<string,number[][]>={
  camera:[[.60,.35,2]],solder:[[.40,.18,2]],assembly:[[.48,.12,3]],cad:[[.42,.24,2]],review:[[.77,.16,2]],
  calibration:[[.55,.19,2]],oscilloscope:[[.42,.43,2]],embedded:[[.87,.20,2]],
  "signal-wall":[[.53,.5,3]],dataset:[[.22,.2,2],[.52,.22,2],[.86,.22,2]],
  compute:[[.58,.37,1.5]],"lens-calibration":[[.68,.23,2]],
  models:[[.23,.34,1.5],[.74,.68,2]],planning:[[.5,.20,3],[.50,.65,2]],
  strategy:[[.3,.22,2]],simulation:[[.31,.22,2],[.77,.22,2]],"decor-server":[[.58,.37,1.5]],
};
// Registered against the visible interiors of room-props-v3, not object hitboxes.
const SCREENS:Record<string,readonly number[][]>={
  cad:[[.10,.09,.80,.35]],
  oscilloscope:[[.18,.36,.58,.14]],"signal-wall":[[.07,.11,.86,.75]],
  dataset:[[.15,.09,.10,.21],[.34,.10,.12,.23],[.68,.10,.13,.23]],
  strategy:[[.15,.17,.24,.20],[.60,.17,.24,.20]],
  simulation:[[.18,.14,.25,.23]],"hello-terminal":[[.20,.22,.37,.32]],
};
function drawEquipmentDisplay(ctx:CanvasRenderingContext2D,key:string,x:number,y:number,w:number,h:number,progress:number){
  const screens=SCREENS[key];
  if(!screens||progress<0)return;
  const step=Math.floor(progress*48),p=painter(ctx);
  ctx.save();
  for(const [u,v,a,b] of screens){
    const left=x+u*w,top=y+v*h,sw=a*w,sh=b*h;
    ctx.save();ctx.beginPath();ctx.rect(left,top,sw,sh);ctx.clip();
    if(key==="oscilloscope"||key==="signal-wall"){
      // Moving waveform on the existing display, retaining its original art.
      ctx.globalAlpha=.67;
      const count=Math.min(32,Math.floor(sw/2)),scan=(progress*3)%1;
      for(let i=0;i<count;i++){
        const phase=i/count,age=(scan-phase+1)%1;
        ctx.globalAlpha=.14+.6*(1-age);
        const yy=top+sh*(.5+.22*Math.sin(i*.72+Math.floor(progress*3)*.8));
        p(left+i*sw/count,yy,Math.max(1,sw/count),1,"#a8e9d7");
      }
      ctx.globalAlpha=.48;p(left+scan*sw,top,1,sh,"#9cd5c9");
    }else if(key==="dataset"){
      // Acquire, track, then lose the target before the next capture.
      const scan=progress<.18||progress>.82;
      ctx.globalAlpha=.48;
      if(scan)p(left+sw*((progress*4)%1),top,1,sh,"#9bcbd3");
      else{
        const bx=left+sw*(.13+.12*Math.sin(step*.21+u*9)),by=top+sh*.23,bw=sw*.52,bh=sh*.51;
        p(bx,by,bw,1,"#8ce3cd");p(bx,by+bh,bw,1,"#8ce3cd");
        p(bx,by,1,bh,"#8ce3cd");p(bx+bw,by,1,bh,"#8ce3cd");
      }
    }else if(key==="simulation"){
      ctx.globalAlpha=.65;
      // A small simulated path follows its own fixed map, then clears.
      const points=[[.17,.75],[.37,.75],[.37,.35],[.70,.35],[.70,.18]];
      for(let i=1;i<points.length;i++){
        const [ax,ay]=points[i-1],[bx,by]=points[i],u=Math.min(1,Math.max(0,progress*4-i+1));
        if(u<=0)continue;
        line(p,left+ax*sw,top+ay*sh,left+(ax+(bx-ax)*u)*sw,top+(ay+(by-ay)*u)*sh,"#a8d4ca",.5);
        if(u<1)p(left+(ax+(bx-ax)*u)*sw-.5,top+(ay+(by-ay)*u)*sh-.5,1.5,1.5,"#ead4a4");
      }
    }else if(key==="hello-terminal"){
      ctx.globalAlpha=.62;
      const rows=Math.min(4,Math.floor(progress*6));
      for(let i=0;i<rows;i++)p(left+sw*.10,top+sh*(.15+i*.18),sw*(.25+(i%3)*.18),1,"#9ed4a0");
      if(step%4<2)p(left+sw*.13,top+sh*(.15+rows*.18),2,1,"#b7e3b2");
    }else{
      ctx.globalAlpha=.35;
      const row=(step+Math.round(u*19))%5;
      p(left+sw*.15,top+sh*(.16+row*.14),sw*.55,1,"#a4d9f4");
      p(left+sw*.15,top+sh*.84,sw*(.25+row*.10),1,"#80b5d7");
    }
    ctx.restore();
  }
  ctx.restore();
}
export function roomObjectVisualBounds(object:RoomObject):Position {
  const b=sprite(object).bounds;
  return {x:(b.x+b.w/2)/TILE,y:b.y/TILE};
}
export function drawPublicRoomObject(ctx:CanvasRenderingContext2D,o:RoomObject,camera:Position,elapsed:number,motion:boolean, triggeredAt:number|undefined,w:number,h:number,hour=12,manual?:boolean){
  const prepared=sprite(o),b=prepared.bounds;
  const x=Math.round(b.x-camera.x),y=Math.round(b.y-camera.y);
  // Cull sprite work before the animation and screen drawing.
  if(x+b.w+prepared.marginX<0||y+b.h+prepared.marginY<0||x-prepared.marginX>w||y-prepared.marginY>h)return;
  const key=roomSpriteKey(o),effective=equipmentProgress(key,elapsed,triggeredAt,hour,manual),progress=motion?effective:effective>=0?0:-1;
  const phase = motion ? Math.floor(elapsed / (520+(Math.round(o.x*17+o.y*23)%240)) + o.x+o.y*.7) % prepared.frames.length : 0;
  const age=triggeredAt===undefined ? Infinity : elapsed-triggeredAt;
  const active=age>=0&&age<1500;
  const action=o.community?.interaction;
  const laugh=action==="laugh" || action==="poster-laugh";
  const frame=key==="machine"||key==="test-robot"?equipmentPose(key,progress):
    active&&laugh&&motion?Math.min(prepared.frames.length-1,1+Math.floor(age/80)%Math.max(1,prepared.frames.length-1)):laugh?0:phase;
  ctx.drawImage(prepared.frames[frame],x-prepared.marginX,y-prepared.marginY,b.w+2*prepared.marginX,b.h+2*prepared.marginY);
  if(active){
    const t=age/1500;
    ctx.save();
    if(action==="smoke"||action==="burst"){
      for(let i=0;i<5;i++){
        ctx.globalAlpha=(1-t)*.8;
        ctx.fillStyle=action==="smoke"?"#a9aaa0":i%2?"#ffc05b":"#ff8b42";
        const dx=(i-2)*(2+10*t),dy=action==="smoke"?-t*23-i*3:-Math.sin(t*Math.PI)*18;
        ctx.fillRect(x+b.w/2+dx,y+b.h*.25+dy,3+i%2,3+i%2);
      }
    }else if(action==="glow"){ctx.globalAlpha=(1-t)*.6;ctx.fillStyle="#ffea8a";ctx.fillRect(x-1,y-1,b.w+2,b.h+2);}
    ctx.restore();
    const text=action==="cable"?"供电正常 · 无数据":action==="old-capacitor"?"Old Capacitor · 电压不足":action==="laugh"?"hohoho":undefined;
    if(text){
      ctx.save();ctx.font="bold 9px sans-serif";ctx.textAlign="center";
      const w=ctx.measureText(text).width+8;
      ctx.fillStyle="#213a37";ctx.fillRect(x+b.w/2-w/2,y-13,w,13);
      ctx.fillStyle="#ffdf92";ctx.fillText(text,x+b.w/2,y-4);ctx.restore();
    }
  }
  if(manual===false){
    ctx.fillStyle="#202b2d";
    for(const [u,v,a,c] of SCREENS[key]??[])ctx.fillRect(x+b.w*u,y+b.h*v,b.w*a,b.h*c);
  }
  if (!motion&&effective<0&&manual===undefined) return;
  drawEquipmentDisplay(ctx,key,x,y,b.w,b.h,progress);
  const points=LIGHT_POINTS[key];
  if(!points)return;
  const p=painter(ctx),t=motion?elapsed/1000:0;
  ctx.save();
  for(let i=0;i<points.length;i++){
    const [u,v,r]=points[i],xx=x+b.w*u,yy=y+b.h*v;
    ctx.globalAlpha=manual===false?0:progress<0?.10:.15+.26*Math.pow((Math.sin(t*1.3+i*2.3+o.x*.41)+1)/2,3);
    p(xx-r/2,yy-r/2,r,r,"#d4f4fa");
  }
  ctx.restore();
}
// Windows show the same outside conditions as the campus without indoor precipitation.
export function drawRoomWindows(ctx: CanvasRenderingContext2D, camera: Position, elapsed: number,
  motion: boolean, climate: { weather: WeatherKind | null; night: number; temperature?:number|null } | null) {
  if (!climate) return;
  const p = painter(ctx), weather = climate.weather;
  ctx.save();
  for (const x of WINDOW_X) for (let i = 3; i < 53; i += 13) for (let j = 3; j < 32; j += 15) {
    const left = x + i - camera.x, top = 13 + j - camera.y, w = Math.min(10, 53 - i);
    if (weather && weather !== "clear") {
      ctx.globalAlpha = weather === "fog" ? .52 : weather === "snow" ? .30 : .23;
      p(left, top, w, 12, weather === "fog" || weather === "snow" ? "#bacacb" : "#617985");
    }
    if (climate.night > 0) {
      ctx.globalAlpha = Math.min(.65, climate.night * 1.3);
      p(left, top, w, 12, "#172b43");
    }
    if((climate.temperature??0)<=-5){
      ctx.globalAlpha=Math.min(.52,(-(climate.temperature??0)-4)*.045);
      p(left,top,2,4,"#dae8e6");p(left+2,top,3,1,"#dae8e6");
      if((i+j+x)%3===0)p(left+w-2,top+10,2,2,"#dce9e7");
    }
    if (motion && (weather === "rain" || weather === "storm" || weather === "snow")) {
      const snow = weather === "snow", phase = (elapsed / (snow ? 230 : 85) + x + i * .9 + j * 1.7) % 10;
      ctx.globalAlpha = .38;
      p(left + 2 + ((i + j) % 4), top + phase, 1, snow ? 1 : Math.min(3, 12 - phase), "#d9e9ed");
    }
  }
  ctx.restore();
}

export type RoomClimate={weather:WeatherKind|null;night:number;sunX:number;sunY:number;sunHeight:number;temperature?:number|null;hour?:number;minute?:number};
export function drawRoomLight(ctx:CanvasRenderingContext2D,room:RoomScene,camera:Position,elapsed:number,
  climate:RoomClimate|null,motion:boolean) {
  const p=painter(ctx),t=motion?elapsed/1000:0;
  ctx.save();
  const strength=climate&&climate.sunHeight>0?(climate.weather==="clear"?.18:climate.weather==="cloudy"?.055:.025)*(1-climate.night):0;
  if(strength&&climate){
    ctx.beginPath();ctx.rect(16-camera.x,80-camera.y,room.width*TILE-32,room.height*TILE-96);ctx.clip();
    const length=Math.min(96,36/Math.max(.22,climate.sunHeight));
    const drift=-climate.sunX*length*.65;
    for(const x of WINDOW_X)for(let i=0;i<length;i++){
      const f=i/length;
      ctx.globalAlpha=strength*(1-f);
      for(let j=0;j<4;j++)p(x+3+j*13+drift*f-camera.x,80+i-camera.y,10+f*2,1,room.theme.window);
    }
  }
  ctx.restore();
  ctx.save();
  for (const x of [132, 446]) {
    ctx.globalAlpha=.18+Math.min(.20,(climate?.night??0)*.5);
    p(x - 1 - camera.x, 38 - camera.y, 2, 5, "#fff1bf");
  }
  if(motion&&strength>.08&&climate&&(room.id==="honors"||room.id==="guild")){
    const length=Math.min(96,36/Math.max(.22,climate.sunHeight)),drift=-climate.sunX*length*.65;
    for(let i=0;i<4;i++){
      const a=(t*(.04+i*.008)+i*.23)%1;
      ctx.globalAlpha=.18*Math.sin(a*Math.PI);
      p(WINDOW_X[i]+16+drift*a+Math.sin(t*.3+i)*3-camera.x,80+a*length-camera.y,1,.5,"#f4e6c9");
    }
  }
  ctx.restore();
}
export function drawRoomAmbient(ctx:CanvasRenderingContext2D,room:RoomScene,camera:Position,climate:RoomClimate|null){
  if(!climate)return;
  const night=climate.night,overcast=climate.weather&&climate.weather!=="clear"?.045:0;
  if(night<=.01&&!overcast)return;
  ctx.save();
  ctx.beginPath();ctx.rect(-camera.x,-camera.y,room.width*TILE,room.height*TILE);ctx.clip();
  ctx.fillStyle=`rgba(18,32,53,${night*.40+overcast})`;ctx.fillRect(-camera.x,-camera.y,room.width*TILE,room.height*TILE);
  if(night>.025)for(const x of [132,446]){
    const xx=x-camera.x,yy=40-camera.y,g=ctx.createRadialGradient(xx,yy,1,xx,yy,78);
    g.addColorStop(0,`rgba(255,220,151,${Math.min(.5,night*1.8)})`);g.addColorStop(1,"rgba(255,220,151,0)");
    ctx.fillStyle=g;ctx.fillRect(xx-78,yy-78,156,156);
  }
  ctx.restore();
}

// Click the visible alpha silhouette, not the background or an invisible
// rectangle. Frontmost solid props win; decorative props block the click.
export function publicRoomObjectAt(room: RoomScene, position: Position): RoomObject | null {
  const walls = room.objects.filter(o => !o.solid && !o.host && o.kind !== "exit");
  const floor = room.objects.filter(o => o.solid).sort((a,b) => a.y + a.height - b.y - b.height);
  const objects = [...walls, ...floor.flatMap(o => [o, ...room.objects.filter(child => child.host === o.id)])].reverse();
  for (const object of objects) {
    const prepared=sprite(object),bounds=prepared.bounds;
    const x=position.x*TILE-bounds.x,y=position.y*TILE-bounds.y;
    const image=prepared.canvas;
    if (x < 0 || y < 0 || x * ROOM_ART_SCALE >= image.width || y * ROOM_ART_SCALE >= image.height) continue;
    const alpha = image.getContext("2d")!.getImageData(Math.floor(x * ROOM_ART_SCALE), Math.floor(y * ROOM_ART_SCALE), 1, 1).data[3];
    if (alpha > 0) return object.decorative && object.kind !== "chair" ? null : object;
  }
  return null;
}
