import { TILE, overlapsRect, snapCamera, type Direction, type Position } from "./pixel-jijia-world.ts";
import { renderExplorer } from "./pixel-jijia-scene.ts";
import type { ExplorerAnimation } from "./pixel-jijia-explorer.ts";
import { COMMUNITY_ROOM_OBJECTS, type CommunityContribution } from "./pixel-jijia-community.ts";
import { ROOM_ART_SCALE, drawPublicRoomObject, drawRoomLight, drawRoomWindows,drawRoomAmbient, type RoomClimate, renderPublicRoomTerrain, publicRoomObjectAt } from "./pixel-jijia-room-art.ts";

type Rect = Position & { width: number; height: number };
export type RoomObject = Rect & {
  id: string;
  title: string;
  description: string;
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
      title: "装配工作台", description: "机械组在这里完成零件定位、工具检查和整机装配。台面上还有未完成的轮组草图。" },
    { id: "tool-storage", kind: "cabinet", x: 4.5, y: 11.6, width: 6, height: 2.4, solid: true,
      title: "工具储藏柜", description: "扭矩扳手、游标卡尺和常用紧固件都按尺寸分类。每次使用后，工具要回到自己的位置。" },
    { id: "machine", kind: "machine", x: 11, y: 15.2, width: 2.5, height: 1.8, solid: true,
      title: "加工设备", description: "试制零件在这里完成加工。机器上的安全标识提醒每一个进入工坊的人保持专注。" },
    { id: "cad", kind: "console", x: 24, y: 11, width: 5, height: 3, solid: true,
      title: "设计工作站", description: "屏幕上是机械结构的三维装配模型。每一个尺寸，都需要与实际材料相吻合。", href: "/about", action: "了解机械组" },
    { id: "review", kind: "workbench", x: 26, y: 17.8, width: 6, height: 3.2, solid: true,
      title: "评审台", description: "从草图到样机，方案在这里被反复讨论、修改、重新验证。" },
    { id: "calibration", kind: "console", x: 30, y: 15, width: 3, height: 2, solid: true,
      title: "传动校准站", description: "轮组、减速器与编码器在这里比对精度；微小的误差决定整机的可靠性。" },
    { id: "exit", kind: "exit", x: 16, y: 21, width: 4, height: 2,
      title: "返回吉甲小镇", description: "推开工坊大门，回到室外的林荫道路。" },
  ],
};

const COMMON_ROOM = { width: 36, height: 24, entry: { x: 18, y: 19.4 } };

export const STUDY_ROOM: RoomScene = {
 id: "study", title: "个人研究室", width: 36, height: 24,
 entry: { x: 18, y: 19.4 },
 theme: { floor: "#b8ac90", rug: "#617772", wall: "#3e585d", window: "#c1dfd8" },
 walls: [],
 objects: [{ id: "exit", kind: "exit", x: 16, y: 21, width: 4, height: 2,
   title: "返回吉甲小镇", description: "回到户外的道路。" }],
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
        title: "荣誉展柜", description: "每一个奖杯都属于曾经在训练场上反复试验的队员。荣誉有日期，但成长不会停止。" },
      { id: "history", kind: "display", x: 23, y: 17.4, width: 5, height: 2.6, solid: true,
        title: "吉甲历史长廊", description: "墙上排列着战队从创立到赛季出征的片段，记录技术和团队一起前进的轨迹。", href: "/events-and-honors", action: "查看赛事与荣誉" },
      { id: "screen", kind: "console", x: 8, y: 17, width: 5, height: 3, solid: true,
        title: "赛事影像台", description: "在这里可以回顾那些决定胜负的瞬间，以及镜头没有拍下的训练日常。" },
      { id: "archive", kind: "cabinet", x: 2, y: 15.3, width: 3, height: 1.7, solid: true,
        title: "资料档案室", description: "纸质资料、设计草案和赛事记录被按照年份仔细收存。" },
      { id: "team-photo", kind: "display", x: 6.2, y: 5, width: 3.5, height: 0.5,
        title: "历届队员合影", description: "从赛场到镜头，一代代队员留下共同经历，名字与奖杯不同，热爱相同。" },
      { id: "exit", kind: "exit", x: 16, y: 21, width: 4, height: 2,
        title: "返回吉甲小镇", description: "走出荣誉殿堂，回到校园道路。" },
    ],
  },
  electrical: {
    ...COMMON_ROOM, id: "electrical", title: "电控实验室 · 信号与电路",
    entry: { x: 18, y: 21.7 },
    theme: { floor: "#a3adb0", rug: "#4a677a", wall: "#354e66", window: "#92dcf5" },
    walls: [],
    objects: [
      { id: "solder", kind: "workbench", x: 2, y: 15.5, width: 5, height: 4.5, solid: true,
        title: "电路焊接区", description: "焊台、放大镜与电路板整齐排列。每个焊点都需要耐心和精确。" },
      { id: "oscilloscope", kind: "console", x: 14, y: 10, width: 8, height: 3, solid: true,
        title: "示波器与信号台", description: "蓝色屏幕上的波形让原本看不见的电信号有了形状。", href: "/about", action: "了解电控组" },
      { id: "embedded", kind: "machine", x: 13.5, y: 16.3, width: 10, height: 4.2, solid: true,
        title: "嵌入式测试台", description: "从开发板到电机控制器，每一次调试都会让机器人更可靠一些。" },
      { id: "components", kind: "cabinet", x: 28, y: 11.6, width: 5, height: 2.4, solid: true,
        title: "元件收纳柜", description: "电阻、电容和芯片都有自己的编号，方便下一次实验快速找到。" },
      { id: "signal-wall", kind: "display", x: 6.2, y: 5, width: 3.5, height: 0.5,
        title: "信号分析墙", description: "PWM、CAN 与闭环控制的波形与实验笔记，记录着每次调试的来龙去脉。" },
      { id: "exit", kind: "exit", x: 16, y: 21, width: 4, height: 2,
        title: "返回吉甲小镇", description: "离开实验室，回到户外。" },
    ],
  },
  vision: {
    ...COMMON_ROOM, id: "vision", title: "视觉观测站 · 感知与识别",
    entry: { x: 18, y: 22.1 },
    theme: { floor: "#a1aeaa", rug: "#476e6c", wall: "#365762", window: "#a3e6cf" },
    walls: [],
    objects: [
      { id: "camera", kind: "camera", x: 4, y: 19.6, width: 3, height: 2.4, solid: true,
        title: "视觉采集设备", description: "标定板和相机共同决定目标位置。细微的像素误差也会影响识别结果。" },
      { id: "dataset", kind: "console", x: 10, y: 12, width: 16, height: 3, solid: true,
        title: "图像数据工作站", description: "画面中的物体被逐帧分析，算法在真实环境中不断修正判断。", href: "/about", action: "了解视觉组" },
      { id: "observe", kind: "display", x: 14, y: 5, width: 8, height: 0.5,
        title: "观测窗", description: "这里用于观察机器人在试验区的移动和目标跟踪表现。" },
      { id: "compute", kind: "server", x: 29.25, y: 13.2, width: 3.5, height: 1.8, solid: true,
        title: "图像处理计算站", description: "计算资源支持实时图像处理与识别算法的测试。" },
      { id: "lens-calibration", kind: "console", x: 15, y: 17.9, width: 6, height: 2.6, solid: true,
        title: "镜头标定台", description: "棋盘格与镜头参数被一一校准，像素误差最终会反映在赛场的每次瞄准中。" },
      { id: "exit", kind: "exit", x: 16, y: 21, width: 4, height: 2,
        title: "返回吉甲小镇", description: "走出观测站，重新回到自然光线中。" },
    ],
  },
  guild: {
    ...COMMON_ROOM, id: "guild", title: "冒险者公会 · 招新大厅",
    theme: { floor: "#b4a38b", rug: "#8e6d4b", wall: "#59443c", window: "#f5d59a" },
    walls: [],
    objects: [
      { id: "welcome", kind: "reception", x: 11, y: 10.6, width: 13, height: 3.4, solid: true,
        title: "招新接待台", description: "每个来到吉甲的人，都可以从这里了解不同组别的工作和训练生活。", href: "/join", action: "加入吉甲大师" },
      { id: "board", kind: "display", x: 6.2, y: 5, width: 3.5, height: 0.5,
        title: "活动公告栏", description: "展示近期活动、开放实践日和团队见面安排。" },
      { id: "welcome-wall", kind: "display", x: 27, y: 18.8, width: 7, height: 2.2, solid: true,
        title: "成员故事墙", description: "从第一次参与训练到第一次走上赛场，团队由一段段共同经历组成。" },
      { id: "journey-map", kind: "display", x: 26.2, y: 5, width: 3.5, height: 0.5,
        title: "新人旅程地图", description: "从第一次认识吉甲到完成新人任务，路线不同，但每一步都有新的同伴。" },
      { id: "exit", kind: "exit", x: 16, y: 21, width: 4, height: 2,
        title: "返回吉甲小镇", description: "离开公会大厅，回到中央广场。" },
    ],
  },
  ai: {
    ...COMMON_ROOM, id: "ai", title: "AI 研究所 · 自主决策",
    theme: { floor: "#a0a5bc", rug: "#565e8b", wall: "#414b70", window: "#accdf8" },
    walls: [],
    objects: [
      { id: "models", kind: "server", x: 28, y: 10.8, width: 6, height: 3.2, solid: true,
        title: "模型计算集群", description: "感知、预测和规划模型在这里进行推理与验证。" },
      { id: "planning", kind: "console", x: 15, y: 14.8, width: 7, height: 3.7, solid: true,
        title: "自主决策工作站", description: "从环境理解到行为选择，系统需要在有限时间内做出可靠判断。" },
      { id: "strategy", kind: "workbench", x: 2, y: 17.7, width: 9, height: 3.3, solid: true,
        title: "战术讨论台", description: "策略从假设开始，经仿真、推演与实际对抗不断优化。" },
      { id: "simulation", kind: "console", x: 26, y: 17.7, width: 8, height: 3.3, solid: true,
        title: "战术演练终端", description: "当前像素世界的战术演练入口也属于 AI 研究所的一部分。", href: "/pixel-jijia/battle", action: "进入战术演练" },
      { id: "field-log", kind: "display", x: 6.2, y: 5, width: 3.5, height: 0.5,
        title: "策略实验记录", description: "真实赛场的测试推动感知、路径规划和自主决策持续迭代。" },
      { id: "exit", kind: "exit", x: 16, y: 21, width: 4, height: 2,
        title: "返回吉甲小镇", description: "从研究所走回小镇。" },
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
    id: `decor-${i}`, title: "", description: "", kind, x, y, width, height, solid: true, decorative: true,
  });
}

export function roomObjectAt(room: RoomScene, position: Position): RoomObject | null {
  return room.id === "study" ? closestRoomObject(room, position) : publicRoomObjectAt(room, position);
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
    position.y >= exit.y - 0.55 && position.y <= exit.y + exit.height - 0.4);
}

export function roomInteractionDistance(room: RoomScene, object: RoomObject, position: Position): number {
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

export function closestRoomObject(room: RoomScene, position: Position): RoomObject | null {
  let best = 2.1;
  let result: RoomObject | null = null;
  for (const object of room.objects) {
    if (object.decorative) continue;
    const distance = roomInteractionDistance(room, object, position);
    // Close to a tabletop object, select it before its larger host.
    const score = object.host && distance < 1.5 ? distance - 1.5 : distance;
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
  ctx.fillStyle = "#334346";
  ctx.fillRect(x + 2, y + 5, w, h);
  if (["desk", "chair", "shelf", "lamp", "plant"].includes(object.kind)) {
    const shades: Record<string, [string, string]> = {
      desk: ["#8b6545", "#ddab78"], chair: ["#667a6b", "#b0c49f"],
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
  climate: RoomClimate | null = null,
) {
  const screenCamera = snapCamera(camera);
  const width = room.width * TILE, height = room.height * TILE;
  ctx.fillStyle = "#172d35";
  const scale = room.id === "study" ? 1 : ROOM_ART_SCALE;
  ctx.fillRect(0, 0, ctx.canvas.width / scale, ctx.canvas.height / scale);
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
        drawPublicRoomObject(ctx, object, screenCamera, elapsed, motionAllowed);
    }
  }
  let playerDrawn = false;
  const props = room.objects.filter(o => o.kind !== "exit" && (room.id === "study" || o.solid))
    .sort((a, b) => a.y + a.height - b.y - b.height);
  for (const object of props) {
    if (!playerDrawn && player.y < object.y + object.height) {
      renderExplorer(ctx, character, player, pose, screenCamera);
      playerDrawn = true;
    }
    if (room.id === "study") drawRoomObject(ctx, object, screenCamera);
    else {
      drawPublicRoomObject(ctx, object, screenCamera, elapsed, motionAllowed);
      for (const child of room.objects) if (child.host === object.id)
        drawPublicRoomObject(ctx, child, screenCamera, elapsed, motionAllowed);
    }
  }
  if (!playerDrawn) renderExplorer(ctx, character, player, pose, screenCamera);
  if(room.id!=="study")drawRoomAmbient(ctx,room,screenCamera,climate);
}
