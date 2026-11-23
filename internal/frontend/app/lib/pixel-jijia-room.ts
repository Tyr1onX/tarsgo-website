import { TILE, overlapsRect, snapCamera, type Direction, type Position } from "./pixel-jijia-world";
import { renderExplorer } from "./pixel-jijia-scene";

type Rect = Position & { width: number; height: number };
export type RoomObject = Rect & {
  id: string;
  title: string;
  description: string;
  kind: "workbench" | "cabinet" | "machine" | "console" | "exit";
  solid?: boolean;
};
export type RoomScene = {
  id: string;
  title: string;
  width: number;
  height: number;
  entry: Position;
  walls: Rect[];
  objects: RoomObject[];
};

export const MECHANICAL_ROOM: RoomScene = {
  id: "mechanical",
  title: "机械工坊 · 装配车间",
  width: 36,
  height: 24,
  entry: { x: 18, y: 21 },
  walls: [
    // A central doorway connects two genuinely traversable work areas.
    { x: 17, y: 5, width: 1, height: 6 },
    { x: 17, y: 15, width: 1, height: 5 },
  ],
  objects: [
    { id: "assembly", kind: "workbench", x: 5, y: 9, width: 7, height: 3, solid: true,
      title: "装配工作台", description: "机械组在这里完成零件定位、工具检查和整机装配。台面上还有未完成的轮组草图。" },
    { id: "tool-storage", kind: "cabinet", x: 4, y: 17, width: 5, height: 2, solid: true,
      title: "工具储藏柜", description: "扭矩扳手、游标卡尺和常用紧固件都按尺寸分类。每次使用后，工具要回到自己的位置。" },
    { id: "machine", kind: "machine", x: 11, y: 16, width: 5, height: 3, solid: true,
      title: "加工设备", description: "试制零件在这里完成加工。机器上的安全标识提醒每一个进入工坊的人保持专注。" },
    { id: "cad", kind: "console", x: 25, y: 8, width: 6, height: 3, solid: true,
      title: "设计工作站", description: "屏幕上是机械结构的三维装配模型。每一个尺寸，都需要与实际材料相吻合。" },
    { id: "review", kind: "workbench", x: 25, y: 16, width: 6, height: 2, solid: true,
      title: "评审台", description: "从草图到样机，方案在这里被反复讨论、修改、重新验证。" },
    { id: "exit", kind: "exit", x: 16, y: 21, width: 4, height: 2,
      title: "返回吉甲小镇", description: "推开工坊大门，回到室外的林荫道路。" },
  ],
};

export function isRoomWalkable(room: RoomScene, x: number, y: number): boolean {
  const radius = 0.3;
  if (x - radius < 1 || x + radius > room.width - 1 ||
      y - radius < 5 || y + radius > room.height - 1) return false;
  if (room.walls.some(w => overlapsRect(x, y, radius, w))) return false;
  return !room.objects.some(o => o.solid && overlapsRect(x, y, radius, o));
}

export function closestRoomObject(room: RoomScene, position: Position): RoomObject | null {
  let best = 2.1;
  let result: RoomObject | null = null;
  for (const object of room.objects) {
    const dx = Math.max(object.x - position.x, 0, position.x - object.x - object.width);
    const dy = Math.max(object.y - position.y, 0, position.y - object.y - object.height);
    const distance = Math.hypot(dx, dy);
    if (distance < best) { best = distance; result = object; }
  }
  return result;
}

export function renderRoomTerrain(room: RoomScene): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = room.width * TILE;
  canvas.height = room.height * TILE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("室内画布不可用");
  ctx.fillStyle = "#24333a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 5; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      ctx.fillStyle = (x * 7 + y * 11) % 9 === 0 ? "#89928a" : "#999b90";
      ctx.fillRect(x * TILE, y * TILE, TILE - 1, TILE - 1);
      ctx.fillStyle = "#adb1a3";
      ctx.fillRect(x * TILE + 2, y * TILE + 2, 2, 2);
    }
  }
  // Distinct workshop and review-room floor treatment, with no floor collider mismatch.
  ctx.fillStyle = "#5a695e";
  ctx.fillRect(20 * TILE, 5 * TILE, 14 * TILE, 14 * TILE);
  for (let y = 6; y < 19; y++) for (let x = 20; x < 34; x++) {
    ctx.fillStyle = (x + y) % 2 ? "#68776c" : "#718076";
    ctx.fillRect(x * TILE, y * TILE, 15, 15);
  }
  ctx.fillStyle = "#334d53";
  ctx.fillRect(0, 0, canvas.width, 5 * TILE);
  ctx.fillStyle = "#5e7677";
  ctx.fillRect(0, 4 * TILE - 5, canvas.width, 5);
  for (const x of [3, 13, 23, 31]) {
    ctx.fillStyle = "#182c3b";
    ctx.fillRect(x * TILE, TILE, 3 * TILE, 2 * TILE);
    ctx.fillStyle = "#6faabb";
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
  // Clear doorway and exit threshold communicate where the player may walk.
  ctx.fillStyle = "#ca9c65";
  ctx.fillRect(16 * TILE, 22 * TILE, 4 * TILE, 5);
  ctx.fillStyle = "#edce94";
  ctx.fillRect(17 * TILE, 22 * TILE, 2 * TILE, 3);
  return canvas;
}

function drawRoomObject(ctx: CanvasRenderingContext2D, object: RoomObject, camera: Position) {
  const x = Math.round(object.x * TILE - camera.x);
  const y = Math.round(object.y * TILE - camera.y);
  const w = object.width * TILE, h = object.height * TILE;
  if (object.kind === "exit") return;
  ctx.fillStyle = "#334346";
  ctx.fillRect(x + 2, y + 5, w, h);
  if (object.kind === "cabinet") {
    ctx.fillStyle = "#526f77";
    ctx.fillRect(x, y - 26, w, h + 26);
    ctx.fillStyle = "#e5c58a";
    for (let i = 1; i < object.width; i++) ctx.fillRect(x + i * TILE, y - 25, 2, h + 23);
    ctx.fillStyle = "#b9d5d4";
    ctx.fillRect(x + 6, y - 16, w - 12, 5);
  } else if (object.kind === "console") {
    ctx.fillStyle = "#665d53";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#243c4d";
    ctx.fillRect(x + 9, y - 34, w - 18, 34);
    ctx.fillStyle = "#71c9de";
    ctx.fillRect(x + 14, y - 29, w - 28, 24);
    ctx.fillStyle = "#e0cc8c";
    ctx.fillRect(x + 4, y, w - 8, 5);
  } else if (object.kind === "machine") {
    ctx.fillStyle = "#566f77";
    ctx.fillRect(x, y - 25, w, h + 25);
    ctx.fillStyle = "#c3a56e";
    ctx.fillRect(x + 8, y - 18, w - 16, 5);
    ctx.fillStyle = "#6daec2";
    ctx.fillRect(x + 11, y - 8, 17, 11);
    ctx.fillRect(x + w - 28, y - 8, 17, 11);
  } else {
    ctx.fillStyle = "#755a43";
    ctx.fillRect(x, y - 8, w, h + 8);
    ctx.fillStyle = "#c39a6a";
    ctx.fillRect(x - 2, y - 12, w + 4, 12);
    for (let i = 0; i < object.width; i += 2) {
      ctx.fillStyle = "#e3bd7e";
      ctx.fillRect(x + i * TILE + 6, y - 9, 6, 2);
    }
  }
}

export function renderRoomScene(
  ctx: CanvasRenderingContext2D, terrain: HTMLCanvasElement, room: RoomScene,
  character: HTMLImageElement, player: Position, direction: Direction,
  walking: boolean, traveled: number, camera: Position,
) {
  const screenCamera = snapCamera(camera);
  ctx.fillStyle = "#172d35";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(terrain, -screenCamera.x, -screenCamera.y);
  let playerDrawn = false;
  const props = [...room.objects].filter(o => o.kind !== "exit")
    .sort((a, b) => a.y + a.height - b.y - b.height);
  for (const object of props) {
    if (!playerDrawn && player.y < object.y + object.height) {
      renderExplorer(ctx, character, player, direction, walking, traveled, screenCamera);
      playerDrawn = true;
    }
    drawRoomObject(ctx, object, screenCamera);
  }
  if (!playerDrawn) renderExplorer(ctx, character, player, direction, walking, traveled, screenCamera);
}
