import { TILE, overlapsRect, snapCamera, benchSeat, benchExit, facingScore, type Scenery, type Direction, type Position } from "./pixel-jijia-world.ts";
import { renderExplorer } from "./pixel-jijia-scene.ts";
import type { ExplorerAnimation } from "./pixel-jijia-explorer.ts";
import { COMMUNITY_ROOM_OBJECTS, type CommunityContribution } from "./pixel-jijia-community.ts";
import { ROOM_ART_SCALE, drawPublicRoomObject, drawStudyChair, drawRoomLight, drawRoomWindows,drawRoomAmbient, type RoomClimate, renderPublicRoomTerrain, publicRoomObjectAt } from "./pixel-jijia-room-art.ts";

type Rect = Position & { width: number; height: number };
export type RoomObject = Rect & {
  id: string;
  title: string;
  kind: "workbench" | "cabinet" | "machine" | "console" | "display" | "camera" | "server" | "reception" | "exit" | "desk" | "chair" | "shelf" | "lamp" | "plant";
  solid?: boolean;
  decorative?: boolean;
  href?: string;
  action?: string;
  host?: string;
  community?: CommunityContribution;
};
export type RoomScene = {
  id: string;
  title: string;
  width: number;
  height: number;
  entry: Position;
  theme: { floor: string; rug: string; wall: string; window: string };
  walls: Rect[];
  objects: RoomObject[];
};

export const MECHANICAL_ROOM: RoomScene = {
  id: "mechanical",
  title: "机械工坊 · 装配车间",
  width: 36,
  height: 24,
  entry: { x: 18, y: 19.4 },
  theme: { floor: "#999b90", rug: "#5a695e", wall: "#334d53", window: "#6faabb" },
  walls: [],
  objects: [
    { id: "assembly", kind: "workbench", x: 14, y: 13.5, width: 8, height: 4.5, solid: true,
      title: "装配工作台" },
    { id: "tool-storage", kind: "cabinet", x: 4.5, y: 11.6, width: 6, height: 2.4, solid: true,
      title: "工具储藏柜" },
    { id: "machine", kind: "machine", x: 11, y: 15.2, width: 2.5, height: 1.8, solid: true,
      title: "加工设备" },
    { id: "cad", kind: "console", x: 24, y: 11, width: 5, height: 3, solid: true,
      title: "设计工作站", href: "/about", action: "了解机械组" },
    { id: "review", kind: "workbench", x: 26, y: 17.8, width: 6, height: 3.2, solid: true,
      title: "评审台" },
    { id: "calibration", kind: "console", x: 30, y: 15, width: 3, height: 2, solid: true,
      title: "传动校准站" },
    { id: "exit", kind: "exit", x: 16, y: 21, width: 4, height: 2,
      title: "返回吉甲小镇" },
  ],
};

const COMMON_ROOM = { width: 36, height: 24, entry: { x: 18, y: 19.4 } };

export const STUDY_ROOM: RoomScene = {
 id: "study", title: "个人研究室", width: 36, height: 24,
 entry: { x: 18, y: 19.4 },
 theme: { floor: "#b8ac90", rug: "#617772", wall: "#3e585d", window: "#c1dfd8" },
 walls: [],
 objects: [{ id: "exit", kind: "exit", x: 16, y: 21, width: 4, height: 2,
   title: "返回吉甲小镇" }],
};

export const ROOMS: Record<string, RoomScene> = {
  study: STUDY_ROOM,
  mechanical: MECHANICAL_ROOM,
  honors: {
    ...COMMON_ROOM, id: "honors", title: "荣誉殿堂 · 赛事记忆",
    theme: { floor: "#b8a78b", rug: "#75564b", wall: "#5b4043", window: "#f5dca0" },
    walls: [],
    objects: [
      { id: "trophies", kind: "display", x: 14, y: 7, width: 8, height: 2.5, solid: true,
        title: "荣誉展柜" },
      { id: "history", kind: "display", x: 23, y: 17.4, width: 5, height: 2.6, solid: true,
        title: "吉甲历史长廊", href: "/events-and-honors", action: "查看赛事与荣誉" },
      { id: "screen", kind: "console", x: 8, y: 17, width: 5, height: 3, solid: true,
        title: "赛事影像台" },
      { id: "archive", kind: "cabinet", x: 2, y: 15.3, width: 3, height: 1.7, solid: true,
        title: "资料档案室" },
      { id: "team-photo", kind: "display", x: 6.2, y: 5, width: 3.5, height: 0.5,
        title: "历届队员合影" },
      { id: "exit", kind: "exit", x: 16, y: 21, width: 4, height: 2,
        title: "返回吉甲小镇" },
    ],
  },
  electrical: {
    ...COMMON_ROOM, id: "electrical", title: "电控实验室 · 信号与电路",
    entry: { x: 18, y: 21.7 },
    theme: { floor: "#a3adb0", rug: "#4a677a", wall: "#354e66", window: "#92dcf5" },
    walls: [],
    objects: [
      { id: "solder", kind: "workbench", x: 2, y: 15.5, width: 5, height: 4.5, solid: true,
        title: "电路焊接区" },
      { id: "oscilloscope", kind: "console", x: 14, y: 10, width: 8, height: 3, solid: true,
        title: "示波器与信号台", href: "/about", action: "了解电控组" },
      { id: "embedded", kind: "machine", x: 13.5, y: 16.3, width: 10, height: 4.2, solid: true,
        title: "嵌入式测试台" },
      { id: "components", kind: "cabinet", x: 28, y: 11.6, width: 5, height: 2.4, solid: true,
        title: "元件收纳柜" },
      { id: "signal-wall", kind: "display", x: 6.2, y: 5, width: 3.5, height: 0.5,
        title: "信号分析墙" },
      { id: "exit", kind: "exit", x: 16, y: 21, width: 4, height: 2,
        title: "返回吉甲小镇" },
    ],
  },
  vision: {
    ...COMMON_ROOM, id: "vision", title: "视觉观测站 · 感知与识别",
    entry: { x: 18, y: 22.1 },
    theme: { floor: "#a1aeaa", rug: "#476e6c", wall: "#365762", window: "#a3e6cf" },
    walls: [],
    objects: [
      { id: "camera", kind: "camera", x: 4, y: 19.6, width: 3, height: 2.4, solid: true,
        title: "视觉采集设备" },
      { id: "dataset", kind: "console", x: 10, y: 12, width: 16, height: 3, solid: true,
        title: "图像数据工作站", href: "/about", action: "了解视觉组" },
      { id: "observe", kind: "display", x: 14, y: 5, width: 8, height: 0.5,
        title: "观测窗" },
      { id: "compute", kind: "server", x: 29.25, y: 13.2, width: 3.5, height: 1.8, solid: true,
        title: "图像处理计算站" },
      { id: "lens-calibration", kind: "console", x: 15, y: 17.9, width: 6, height: 2.6, solid: true,
        title: "镜头标定台" },
      { id: "exit", kind: "exit", x: 16, y: 21, width: 4, height: 2,
        title: "返回吉甲小镇" },
    ],
  },
  guild: {
    ...COMMON_ROOM, id: "guild", title: "冒险者公会 · 招新大厅",
    theme: { floor: "#b4a38b", rug: "#8e6d4b", wall: "#59443c", window: "#f5d59a" },
    walls: [],
    objects: [
      { id: "welcome", kind: "reception", x: 11, y: 10.6, width: 13, height: 3.4, solid: true,
        title: "招新接待台", href: "/join", action: "加入吉甲大师" },
      { id: "board", kind: "display", x: 6.2, y: 5, width: 3.5, height: 0.5,
        title: "活动公告栏" },
      { id: "welcome-wall", kind: "display", x: 27, y: 18.8, width: 7, height: 2.2, solid: true,
        title: "成员故事墙" },
      { id: "journey-map", kind: "display", x: 26.2, y: 5, width: 3.5, height: 0.5,
        title: "新人旅程地图" },
      { id: "exit", kind: "exit", x: 16, y: 21, width: 4, height: 2,
        title: "返回吉甲小镇" },
    ],
  },
  ai: {
    ...COMMON_ROOM, id: "ai", title: "AI 研究所 · 自主决策",
    theme: { floor: "#a0a5bc", rug: "#565e8b", wall: "#414b70", window: "#accdf8" },
    walls: [],
    objects: [
      { id: "models", kind: "server", x: 28, y: 10.8, width: 6, height: 3.2, solid: true,
        title: "模型计算集群" },
      { id: "planning", kind: "console", x: 15, y: 14.8, width: 7, height: 3.7, solid: true,
        title: "自主决策工作站" },
      { id: "strategy", kind: "workbench", x: 2, y: 17.7, width: 9, height: 3.3, solid: true,
        title: "战术讨论台" },
      { id: "simulation", kind: "console", x: 26, y: 17.7, width: 8, height: 3.3, solid: true,
        title: "战术演练终端", href: "/pixel-jijia/battle", action: "进入战术演练" },
      { id: "field-log", kind: "display", x: 6.2, y: 5, width: 3.5, height: 0.5,
        title: "策略实验记录" },
      { id: "exit", kind: "exit", x: 16, y: 21, width: 4, height: 2,
        title: "返回吉甲小镇" },
    ],
  },
};

for (const [roomId, objects] of Object.entries(COMMUNITY_ROOM_OBJECTS)) ROOMS[roomId].objects.push(...objects);

// Decorative furniture uses the same entity geometry as interactive equipment.
const ROOM_DECOR: Record<string, [RoomObject["kind"], number, number, number, number][]> = {
  mechanical: [["cabinet", 3, 18.5, 3, 1.5], ["chair", 26, 14.8, 1.5, 1.2]],
  honors: [["display", 28, 8.2, 5, 1.8], ["chair", 6, 18, 1.5, 1.2], ["plant", 2, 22, 2, 1], ["plant", 32, 22, 2, 1]],
  electrical: [["cabinet", 3, 9.5, 3, 1.5], ["chair", 25, 17, 1.5, 1.2]],
  vision: [["cabinet", 2, 8.5, 3, 1.5], ["chair", 25, 17, 1.5, 1.2]],
  guild: [["cabinet", 2, 10.5, 3, 1.5], ["chair", 6, 14.3, 1.5, 1.2], ["chair", 7, 21.5, 1.5, 1.2], ["plant", 2, 22, 2, 1], ["plant", 32, 22, 2, 1]],
  ai: [["server", 3, 11, 3, 2], ["chair", 11.5, 18, 1.5, 1.2]],
};
for (const room of Object.values(ROOMS)) {
  if (room.id === "study") continue;
  // Plants belong in public reception and exhibition spaces, not beside
  // electrical benches or precision machinery. Keep furnishing task-driven.
  const decor = ROOM_DECOR[room.id];
  for (const [i, [kind, x, y, width, height]] of decor.entries()) room.objects.push({
    id: kind === "chair" ? `chair-${x}-${y}` : `decor-${i}`, title: kind === "chair" ? "座椅" : "", kind, x, y, width, height, solid: true, decorative: true,
  });
}

export function roomObjectAt(room: RoomScene, position: Position): RoomObject | null {
  const exit=room.objects.find(o=>o.kind==="exit"&&position.x>=o.x&&position.x<=o.x+o.width&&position.y>=o.y-.55&&position.y<=o.y+o.height);
  if(exit)return exit;
  return room.id==="study"?room.objects.find(o=>o.kind==="chair"&&position.x>=o.x-.25&&position.x<=o.x+o.width+.25&&position.y>=o.y-1&&position.y<=o.y+o.height)??null:publicRoomObjectAt(room,position);
}

export function isRoomWalkable(room: RoomScene, x: number, y: number): boolean {
  const radius = 0.3;
  if (x - radius < 1 || x + radius > room.width - 1 ||
      y - radius < 5 || y + radius > room.height - 1) return false;
  if (room.walls.some(w => overlapsRect(x, y, radius, w))) return false;
  return !room.objects.some(o => o.solid && overlapsRect(x, y, radius, o));
}

// Use the exit object's real footprint to trigger a seamless return outdoors.
export function roomExitAt(room: RoomScene, position: Position, vertical: number): boolean {
  if (vertical <= 0) return false;
  const exit = room.objects.find(object => object.kind === "exit");
  return Boolean(exit && position.x >= exit.x + 0.65 &&
    position.x <= exit.x + exit.width - 0.65 &&
    position.y >= exit.y + exit.height - 0.8 && position.y <= exit.y + exit.height - 0.3);
}

export function roomInteractionDistance(room: RoomScene, object: RoomObject, position: Position): number {
  if(object.kind==="exit"){
    const dx=Math.max(object.x+.65-position.x,0,position.x-(object.x+object.width-.65));
    return Math.hypot(dx,object.y+object.height-.6-position.y);
  }
  if(object.kind==="chair"){
    if(Math.hypot(object.x+object.width/2-position.x,object.y+object.height/2-position.y)>4)return Infinity;
    const exit=chairExit(room,object,position);
    return exit?Math.hypot(exit.x-position.x,exit.y-position.y):Infinity;
  }
  if(object.community?.interaction==="meeting"){
    const chair=meetingChair(room,position);
    return chair?roomInteractionDistance(room,chair,position):Infinity;
  }
  if (object.host) {
    const host = room.objects.find(item => item.id === object.host)!;
    // The physical workbench stays the only collision body; approach its
    // accessible front at the object's own horizontal position.
    const x = Math.max(host.x + .15, Math.min(host.x + host.width - .15, object.x + object.width / 2));
    return Math.hypot(x - position.x, host.y + host.height - position.y);
  }
  const dx = Math.max(object.x - position.x, 0, position.x - object.x - object.width);
  const dy = Math.max(object.y - position.y, 0, position.y - object.y - object.height);
  return Math.hypot(dx, dy);
}

export function chairExit(room: RoomScene, object: RoomObject, from?:Position): Position | null {
  if (object.kind !== "chair") return null;
  const x=object.x+object.width/2,y=object.y+object.height;
  const candidates=[{x,y:y+.55},{x:object.x-.55,y:y-.4},{x:object.x+object.width+.55,y:y-.4}];
  return candidates.filter(p=>{
    if(!isRoomWalkable(room,p.x,p.y))return false;
    if(!from)return true;
    const distance=Math.hypot(p.x-from.x,p.y-from.y),steps=Math.max(1,Math.ceil(distance/.2));
    for(let i=0;i<=steps;i++)if(!isRoomWalkable(room,from.x+(p.x-from.x)*i/steps,from.y+(p.y-from.y)*i/steps))return false;
    return true;
  }).sort((a,b)=>from?Math.hypot(a.x-from.x,a.y-from.y)-Math.hypot(b.x-from.x,b.y-from.y):0)[0]??null;
}
export type SeatObject=Scenery|RoomObject;
export function seatDepth(object:SeatObject){return "sprite" in object?object.y:object.y+object.height;}
export function seatPlacement(room:RoomScene|null,object:SeatObject,from:Position) {
  if("sprite" in object){
    if(room||object.sprite!=="bench"||Math.hypot(from.x-object.x,from.y-object.y)>=2.5)return null;
    const exit=benchExit(object,from);
    return exit?{anchor:benchSeat(object),exit}:null;
  }
  if(!room||object.kind!=="chair"||Math.hypot(object.x+object.width/2-from.x,object.y+object.height/2-from.y)>4)return null;
  const exit=chairExit(room,object,from);
  if(!exit||Math.hypot(exit.x-from.x,exit.y-from.y)>=2.1)return null;
  return {anchor:{x:object.x+object.width/2,y:object.y+object.height-.5},exit};
}
export function meetingSeat(room:RoomScene,object:RoomObject):boolean {
  if(object.kind!=="chair")return false;
  const table=room.objects.find(o=>o.community?.interaction==="meeting");
  return !!table&&Math.hypot(Math.max(table.x-object.x-object.width,object.x-table.x-table.width,0),Math.max(table.y-object.y-object.height,object.y-table.y-table.height,0))<1.6;
}
export function meetingChair(room:RoomScene,position:Position):RoomObject|null {
  return room.objects.filter(o=>meetingSeat(room,o)&&seatPlacement(room,o,position))
    .sort((a,b)=>Math.hypot(a.x+a.width/2-position.x,a.y+a.height/2-position.y)-Math.hypot(b.x+b.width/2-position.x,b.y+b.height/2-position.y))[0]??null;
}
export function roomInteractable(room: RoomScene, object: RoomObject) {
  return object.kind==="chair"?!!chairExit(room,object):!object.decorative&&!!(object.community||object.href||object.kind==="exit");
}

export function closestRoomObject(room: RoomScene, position: Position, facing?: Direction, previous?: RoomObject | null): RoomObject | null {
  let best = Infinity;
  let result: RoomObject | null = null;
  for (const object of room.objects) {
    if (!roomInteractable(room, object) || meetingSeat(room,object)) continue;
    const distance = roomInteractionDistance(room, object, position);
    if (distance >= 2.1) continue;
    // Close to a tabletop object, select it before its larger host.
    const score=distance-(object.host&&distance<1.5?.7:0)-facingScore(position,{x:object.x+object.width/2,y:object.y+object.height/2},facing)-(previous?.id===object.id?.12:0)-(object.community?.interaction==="meeting"?.5:0);
    if (score < best) { best = score; result = object; }
  }
  return result;
}

export function renderRoomTerrain(room: RoomScene, campusTiles?: HTMLImageElement): HTMLCanvasElement {
  if (room.id !== "study") return renderPublicRoomTerrain(room, campusTiles);
  const canvas = document.createElement("canvas");
  canvas.width = room.width * TILE;
  canvas.height = room.height * TILE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("室内画布不可用");
  ctx.fillStyle = room.theme.wall;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 5; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      ctx.fillStyle = (x * 7 + y * 11) % 9 === 0 ? "#b9b6ab" : room.theme.floor;
      ctx.fillRect(x * TILE, y * TILE, TILE - 1, TILE - 1);
      ctx.fillStyle = "#adb1a3";
      ctx.fillRect(x * TILE + 2, y * TILE + 2, 2, 2);
    }
  }
  // Distinct workshop and review-room floor treatment, with no floor collider mismatch.
  ctx.fillStyle = room.theme.rug;
  ctx.fillRect(20 * TILE, 5 * TILE, 14 * TILE, 14 * TILE);
  for (let y = 6; y < 19; y++) for (let x = 20; x < 34; x++) {
    ctx.fillStyle = room.theme.rug;
    ctx.globalAlpha = (x + y) % 2 ? 0.75 : 0.9;
    ctx.fillRect(x * TILE, y * TILE, 15, 15);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = room.theme.wall;
  ctx.fillRect(0, 0, canvas.width, 5 * TILE);
  ctx.fillStyle = "#5e7677";
  ctx.fillRect(0, 4 * TILE - 5, canvas.width, 5);
  for (const x of [3, 13, 23, 31]) {
    ctx.fillStyle = "#182c3b";
    ctx.fillRect(x * TILE, TILE, 3 * TILE, 2 * TILE);
    ctx.fillStyle = room.theme.window;
    ctx.fillRect(x * TILE + 4, TILE + 4, 3 * TILE - 8, 2 * TILE - 8);
    ctx.fillStyle = "#d0d1b2";
    ctx.fillRect(x * TILE + 13, TILE + 4, 4, 2 * TILE - 8);
  }
  // Walls and their doorway are drawn from the same rectangles used by collision.
  for (const wall of room.walls) {
    const x = wall.x * TILE, y = wall.y * TILE, w = wall.width * TILE, h = wall.height * TILE;
    ctx.fillStyle = "#223f49";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#d0b77d";
    ctx.fillRect(x, y, 3, h);
    ctx.fillStyle = "#597c7c";
    ctx.fillRect(x + 5, y, w - 7, h);
  }
  // Visual doorway and crossing logic share the same exit footprint.
  const exit = room.objects.find(object => object.kind === "exit");
  if (exit) {
    const x = exit.x * TILE, y = (exit.y - 0.55) * TILE;
    ctx.fillStyle = "#ca9c65";
    ctx.fillRect(x, y, exit.width * TILE, 7);
    ctx.fillStyle = "#edce94";
    ctx.fillRect(x + TILE, y, (exit.width - 2) * TILE, 4);
  }
  return canvas;
}

function drawRoomObject(ctx: CanvasRenderingContext2D, object: RoomObject, camera: Position) {
  const x = Math.round(object.x * TILE - camera.x);
  const y = Math.round(object.y * TILE - camera.y);
  const w = object.width * TILE, h = object.height * TILE;
  if (object.kind === "exit") return;
  if (object.kind === "chair") { drawStudyChair(ctx, object, camera); return; }
  ctx.fillStyle = "#334346";
  ctx.fillRect(x + 2, y + 5, w, h);
  if (["desk", "shelf", "lamp", "plant"].includes(object.kind)) {
    const shades: Record<string, [string, string]> = {
      desk: ["#8b6545", "#ddab78"],
      shelf: ["#735846", "#d2b076"], lamp: ["#556d77", "#ffdf8b"],
      plant: ["#6b5846", "#8aba75"],
    };
    const [base, detail] = shades[object.kind];
    ctx.fillStyle = base;
    ctx.fillRect(x, y - 9, w, h + 8);
    ctx.fillStyle = detail;
    ctx.fillRect(x + 3, y - 12, w - 6, 7);
    if (object.kind === "plant") {
      ctx.fillStyle = "#79a66b";
      ctx.fillRect(x + 5, y - 20, w - 10, 15);
    }
    return;
  }
}

export function renderRoomScene(
  ctx: CanvasRenderingContext2D, terrain: HTMLCanvasElement | HTMLImageElement, room: RoomScene,
  character: HTMLImageElement, player: Position, pose:ExplorerAnimation, camera: Position,
  elapsed: number, motionAllowed: boolean,
  climate: RoomClimate | null = null, seatDepth=player.y, effects?: ReadonlyMap<string,number>,
) {
  const screenCamera = snapCamera(camera);
  const width = room.width * TILE, height = room.height * TILE;
  ctx.fillStyle = "#172d35";
  const scale = room.id === "study" ? 1 : ROOM_ART_SCALE;
  const viewWidth=ctx.canvas.width/scale,viewHeight=ctx.canvas.height/scale;
  ctx.fillRect(0, 0, viewWidth, viewHeight);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(terrain, -screenCamera.x, -screenCamera.y, width, height);

  // The background contains only terrain. Each object is independently drawn
  // at its footprint; sorting by feet lets its actual transparent silhouette
  // occlude the explorer instead of copying opaque pieces of a room image.
  if (room.id !== "study") {
    drawRoomWindows(ctx, screenCamera, elapsed, motionAllowed, climate);
    drawRoomLight(ctx,room,screenCamera,elapsed,climate,motionAllowed);
    for (const object of room.objects) {
      if (!object.solid && !object.host && object.kind !== "exit")
        drawPublicRoomObject(ctx, object, screenCamera, elapsed, motionAllowed, effects?.get(object.id),viewWidth,viewHeight);
    }
  }
  let playerDrawn = false;
  const props = room.objects.filter(o => o.kind !== "exit" && (room.id === "study" || o.solid))
    .sort((a, b) => a.y + a.height - b.y - b.height);
  for (const object of props) {
    if (!playerDrawn && seatDepth < object.y + object.height) {
      renderExplorer(ctx, character, player, pose, screenCamera);
      playerDrawn = true;
    }
    if (room.id === "study") drawRoomObject(ctx, object, screenCamera);
    else {
      drawPublicRoomObject(ctx, object, screenCamera, elapsed, motionAllowed, effects?.get(object.id),viewWidth,viewHeight);
      for (const child of room.objects) if (child.host === object.id)
        drawPublicRoomObject(ctx, child, screenCamera, elapsed, motionAllowed, effects?.get(child.id),viewWidth,viewHeight);
    }
  }
  if (!playerDrawn) renderExplorer(ctx, character, player, pose, screenCamera);
  if(room.id!=="study")drawRoomAmbient(ctx,room,screenCamera,climate);
}
