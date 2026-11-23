export const TILE = 16;
export const WORLD_WIDTH = 144;
export const WORLD_HEIGHT = 96;
export const WALK_SPEED = 7.0; // tiles / second, ~30% faster
export const RUN_SPEED = 10.5; // tiles / second, distinct sprint pace

export type Direction = "up" | "down" | "left" | "right";
export type Position = { x: number; y: number };
export type Place = Position & {
  id: string;
  title: string;
  caption: string;
  description: string;
  href: string;
  action: string;
  width: number;
  height: number;
  accent: string;
};

export const PLACES: Place[] = [
  { id: "mechanical", title: "机械工坊", caption: "MECHANICAL WORKSHOP", description: "结构设计、建模加工与整机装配。每一颗螺丝背后，都藏着把想法变成现实的功夫。", href: "/about", action: "认识机械组", x: 33, y: 26, width: 18, height: 11, accent: "#d4a552" },
  { id: "honors", title: "荣誉殿堂", caption: "HALL OF HONOR", description: "从初次出发，到一次次登上赛场。这里收藏吉甲一路走来的奖杯与故事。", href: "/events-and-honors", action: "查看赛事与荣誉", x: 62, y: 21, width: 20, height: 12, accent: "#e1c374" },
  { id: "electrical", title: "电控实验室", caption: "ELECTRICAL LAB", description: "电路、嵌入式与电机控制。那些看不见的信号，点亮了每一台机器人的生命力。", href: "/about", action: "认识电控组", x: 93, y: 26, width: 18, height: 11, accent: "#b8cce3" },
  { id: "vision", title: "视觉观测站", caption: "VISION STATION", description: "目标识别、视觉定位与自瞄算法，让机器人学会看见这个世界。", href: "/about", action: "认识视觉组", x: 33, y: 58, width: 18, height: 11, accent: "#98c8bd" },
  { id: "guild", title: "冒险者公会", caption: "JOIN THE TEAM", description: "寻找你的下一场冒险。机械、电控、视觉、AI 与运营，总有一种热爱能在这里发光。", href: "/join", action: "加入吉甲", x: 62, y: 65, width: 20, height: 11, accent: "#efc28d" },
  { id: "ai", title: "AI 研究所", caption: "AI RESEARCH", description: "从感知到决策，从规划到自主控制。下一代机器人的想象力，正在这里发生。", href: "/pixel-jijia/battle", action: "开始战术演练", x: 93, y: 58, width: 18, height: 11, accent: "#c3b6eb" },
];

// One scene specification controls terrain, illustration, and physical obstacles.
// Art direction: 16px terrain units, 3/4 overhead sprites, upper-left daylight,
// warm limestone + sage greens, decorative silhouettes clear of walking routes.
export type GroundArea = { kind: 0 | 1 | 2 | 3; x: number; y: number; width: number; height: number };
export const GROUND_AREAS: GroundArea[] = [
  // Outer walking loop + quieter branches, linked to all six existing buildings.
  { kind: 1, x: 16, y: 13, width: 112, height: 6 },
  { kind: 1, x: 16, y: 13, width: 6, height: 73 },
  { kind: 1, x: 122, y: 13, width: 6, height: 73 },
  { kind: 1, x: 16, y: 80, width: 112, height: 6 },
  { kind: 1, x: 52, y: 18, width: 6, height: 25 },
  { kind: 1, x: 86, y: 18, width: 6, height: 25 },
  { kind: 1, x: 52, y: 64, width: 6, height: 20 },
  { kind: 1, x: 86, y: 64, width: 6, height: 20 },
  { kind: 1, x: 18, y: 46, width: 108, height: 6 },
  // Small authored clearings make the outer walk worth taking.
  { kind: 2, x: 17, y: 8, width: 20, height: 11 },
  { kind: 2, x: 106, y: 8, width: 21, height: 11 },
  { kind: 2, x: 16, y: 77, width: 24, height: 11 },
  { kind: 2, x: 109, y: 73, width: 20, height: 14 },
  { kind: 2, x: 3, y: 54, width: 12, height: 15 },
  { kind: 3, x: 4, y: 55, width: 10, height: 13 },
  { kind: 2, x: 130, y: 25, width: 11, height: 14 },
  { kind: 3, x: 131, y: 26, width: 9, height: 12 },
  { kind: 1, x: 24, y: 45, width: 96, height: 7 },
  { kind: 1, x: 69, y: 33, width: 7, height: 46 },
  { kind: 1, x: 42, y: 36, width: 7, height: 31 },
  { kind: 1, x: 96, y: 36, width: 7, height: 31 },
  { kind: 1, x: 42, y: 63, width: 61, height: 6 },
  { kind: 1, x: 58, y: 33, width: 29, height: 7 },
  { kind: 2, x: 56, y: 39, width: 32, height: 23 },
  { kind: 0, x: 57, y: 40, width: 3, height: 3 },
  { kind: 0, x: 84, y: 40, width: 3, height: 3 },
  { kind: 0, x: 57, y: 58, width: 3, height: 3 },
  { kind: 0, x: 84, y: 58, width: 3, height: 3 },
  { kind: 2, x: 26, y: 44, width: 11, height: 9 },
  { kind: 3, x: 27, y: 45, width: 9, height: 7 },
  { kind: 2, x: 107, y: 44, width: 11, height: 9 },
  { kind: 3, x: 108, y: 45, width: 9, height: 7 },
];

export type PropSprite =
  | "bench" | "lamp" | "sign" | "planter" | "oak" | "lime_tree"
  | "cherry" | "rocks" | "fence" | "hydrangea" | "statue" | "arch";
export type Scenery = Position & {
  sprite: PropSprite;
  width: number; // painted width, world pixels
  height: number; // painted height, world pixels
  solid?: number; // feet collision radius in world tiles; absent means passable
  story?: { title: string; caption: string; description: string; action?: string; result?: string }; // exploration text lives with its visible prop
};
export const SCENERY: Scenery[] = [
  // Central plaza fixtures remain aligned around x=72. Natural scenery is intentionally irregular.
  { sprite: "arch", x: 72, y: 39.8, width: 104, height: 92, story: { title: "春日门廊", caption: "PLAZA GATE", description: "每年春天，人们从这道门廊走进广场。布条挂在柱间，记录着一次又一次新的相遇。", action: "拨动风铃", result: "铃声沿着石板路传开。下一次经过这里时，或许已经有了新的同行者。" } },
  { sprite: "planter", x: 59, y: 42.1, width: 51, height: 40, solid: 0.72 },
  { sprite: "planter", x: 85, y: 42.1, width: 51, height: 40, solid: 0.72 },
  { sprite: "planter", x: 59, y: 59.7, width: 51, height: 40, solid: 0.72 },
  { sprite: "planter", x: 85, y: 59.7, width: 51, height: 40, solid: 0.72 },
  { sprite: "bench", x: 62, y: 49, width: 57, height: 38, solid: 0.8, story: { title: "机械师的休息处", caption: "WORKSHOP BREAK", description: "有人在这张石凳上画过齿轮草图，边缘还留下了淡淡的铅笔痕迹。", action: "坐一会儿", result: "耳边是喷泉声。你想起：最好的设计，有时始于一段短暂的发呆。" } },
  { sprite: "bench", x: 82, y: 49, width: 57, height: 38, solid: 0.8, story: { title: "广场留言凳", caption: "SMALL NOTES", description: "队员常在这里交流训练心得。凳面没有刻名字，只有被时光磨亮的石纹。" } },
  { sprite: "lamp", x: 57, y: 48, width: 30, height: 75, solid: 0.4, story: { title: "街角灯火", caption: "EVENING LIGHT", description: "晚训结束后，第一盏灯总是从广场边缘亮起。白天的它安静得像一支未点燃的火柴。" } },
  { sprite: "lamp", x: 87, y: 48, width: 30, height: 75, solid: 0.4 },
  { sprite: "lamp", x: 62, y: 61.3, width: 30, height: 75, solid: 0.4 },
  { sprite: "lamp", x: 82, y: 61.3, width: 30, height: 75, solid: 0.4 },
  { sprite: "statue", x: 82, y: 55, width: 49, height: 62, solid: 0.9, story: { title: "吉甲机械纪念碑", caption: "ROBOT MEMORIAL", description: "台座上的小机器人没有举起奖杯，它只是伸着手，像是在说：继续尝试。", action: "启动自检", result: "蓝色目镜亮了一下：电源正常、传感器正常、好奇心依旧在线。" } },
  { sprite: "sign", x: 68, y: 59, width: 40, height: 59, solid: 0.38, story: { title: "广场路标", caption: "WAYFINDER", description: "向北是荣誉殿堂，向东通往实验园区，向西是机械工坊。无论选择哪条路，都能回到喷泉。", action: "翻看路标背面", result: "背面有人用极小的字写着：别害怕走错方向，做机器人的人，总是在试错。" } },
  { sprite: "hydrangea", x: 64, y: 41.2, width: 45, height: 36 },
  { sprite: "hydrangea", x: 80, y: 41.2, width: 45, height: 36 },
  // Landscape framing extends beyond the hero square, using the same authored kit.
  { sprite: "oak", x: 53, y: 40, width: 86, height: 101, solid: 0.9 },
  { sprite: "cherry", x: 91, y: 40, width: 86, height: 102, solid: 0.9, story: { title: "樱树下的约定", caption: "BLOSSOM PROMISE", description: "每年花开时，总有人重新走过这里。机器会更换零件，但一些约定会慢慢长成树。", action: "接住一片花瓣", result: "花瓣停在掌心一瞬，又被风带走。你记住了它落下的方向。" } },
  { sprite: "oak", x: 53, y: 62, width: 86, height: 101, solid: 0.9 },
  { sprite: "lime_tree", x: 91, y: 62, width: 86, height: 101, solid: 0.9 },
  { sprite: "rocks", x: 51, y: 54, width: 58, height: 40, solid: 0.7, story: { title: "试验后的石头", caption: "FIELD TEST", description: "石头上的划痕来自一次定位实验。机器人读不懂风，却能一点点学会看清这里的边界。" } },
  { sprite: "rocks", x: 93, y: 54, width: 58, height: 40, solid: 0.7 },
  { sprite: "hydrangea", x: 52, y: 44, width: 42, height: 33 },
  { sprite: "hydrangea", x: 92, y: 44, width: 42, height: 33 },
  { sprite: "lime_tree", x: 29, y: 26, width: 82, height: 96, solid: 0.9 },
  { sprite: "oak", x: 54, y: 31, width: 82, height: 96, solid: 0.9 },
  { sprite: "lime_tree", x: 89, y: 30, width: 82, height: 96, solid: 0.9 },
  { sprite: "cherry", x: 115, y: 27, width: 82, height: 96, solid: 0.9 },
  { sprite: "cherry", x: 29, y: 66, width: 82, height: 96, solid: 0.9 },
  { sprite: "oak", x: 54, y: 76, width: 82, height: 96, solid: 0.9 },
  { sprite: "lime_tree", x: 90, y: 76, width: 82, height: 96, solid: 0.9 },
  { sprite: "oak", x: 115, y: 68, width: 82, height: 96, solid: 0.9 },
  { sprite: "planter", x: 42, y: 40, width: 46, height: 36 },
  { sprite: "planter", x: 102, y: 40, width: 46, height: 36 },
  { sprite: "fence", x: 37, y: 53, width: 64, height: 34, solid: 0.5 },
  { sprite: "fence", x: 107, y: 53, width: 64, height: 34, solid: 0.5 },
  // Four visible, readable discoveries. The same anchor drives art, collision, and interaction.
  { sprite: "sign", x: 24, y: 17, width: 40, height: 59, solid: 0.38, story: {
    title: "风铃小径", caption: "A QUIET PATH", description: "一条绕开主路的林荫小径。风吹过树梢时，路边的小牌子仿佛也在提醒：不是每段旅程都必须直奔终点。"
  } },
  { sprite: "statue", x: 115, y: 17, width: 49, height: 62, solid: 0.9, story: {
    title: "机器人试验场", caption: "FIELD NOTES", description: "测试场边留着一座小小的机器人纪念像。它没有写明胜负，只留下一句关于尝试的话：今天再让它往前走一步。"
  } },
  { sprite: "sign", x: 119, y: 77, width: 40, height: 59, solid: 0.38, story: {
    title: "数据树洞", caption: "HIDDEN SIGNAL", description: "这里有一张写给后来者的便条：世界再嘈杂，也总有一个信号值得认真接收。"
  } },
  { sprite: "bench", x: 29, y: 83, width: 57, height: 38, solid: 0.8, story: {
    title: "长椅上的片刻", caption: "REST STOP", description: "坐在这条支路旁，不必赶去下一座建筑。远处是科技园区，身边只有树叶与风，正好留一点时间给自己的想法。"
  } },
  // Outer-ring landmarks and natural transitions, using the existing twelve-piece kit.
  { sprite: "oak", x: 9, y: 15, width: 82, height: 96, solid: 0.9 },
  { sprite: "lime_tree", x: 7, y: 35, width: 82, height: 96, solid: 0.9 },
  { sprite: "cherry", x: 9, y: 75, width: 86, height: 102, solid: 0.9 },
  { sprite: "oak", x: 38, y: 8, width: 82, height: 96, solid: 0.9 },
  { sprite: "lime_tree", x: 56, y: 7, width: 82, height: 96, solid: 0.9 },
  { sprite: "cherry", x: 87, y: 8, width: 86, height: 102, solid: 0.9 },
  { sprite: "oak", x: 135, y: 17, width: 82, height: 96, solid: 0.9 },
  { sprite: "lime_tree", x: 136, y: 48, width: 82, height: 96, solid: 0.9 },
  { sprite: "cherry", x: 135, y: 79, width: 86, height: 102, solid: 0.9 },
  { sprite: "oak", x: 45, y: 91, width: 82, height: 96, solid: 0.9 },
  { sprite: "lime_tree", x: 74, y: 92, width: 82, height: 96, solid: 0.9 },
  { sprite: "cherry", x: 101, y: 91, width: 86, height: 102, solid: 0.9 },
  { sprite: "hydrangea", x: 28, y: 12, width: 45, height: 36 },
  { sprite: "planter", x: 34, y: 19, width: 51, height: 40, solid: 0.72 },
  { sprite: "hydrangea", x: 43, y: 18, width: 45, height: 36 },
  { sprite: "rocks", x: 13, y: 31, width: 58, height: 40, solid: 0.7 },
  { sprite: "hydrangea", x: 12, y: 45, width: 45, height: 36 },
  { sprite: "planter", x: 12, y: 65, width: 51, height: 40 },
  { sprite: "rocks", x: 29, y: 73, width: 58, height: 40, solid: 0.7, story: { title: "旧试验标记", caption: "OLD MARK", description: "这里曾用石块标记最早的自动巡航路线。草重新长了出来，路线却被记在了队员的笔记里。" } },
  { sprite: "hydrangea", x: 36, y: 88, width: 45, height: 36 },
  { sprite: "bench", x: 54, y: 84, width: 57, height: 38, solid: 0.8, story: { title: "南侧观景座", caption: "GARDEN VIEW", description: "沿环线走累了，就在这里坐一会儿。风把远处工坊的声音吹得很轻。" } },
  { sprite: "hydrangea", x: 67, y: 88, width: 45, height: 36 },
  { sprite: "rocks", x: 89, y: 89, width: 58, height: 40, solid: 0.7 },
  { sprite: "planter", x: 106, y: 82, width: 51, height: 40, story: { title: "水岸小花圃", caption: "RIVERSIDE GARDEN", description: "谁也说不清第一株花是谁种下的。后来经过的每个人，都会顺手替它拂去落叶。" } },
  { sprite: "hydrangea", x: 135, y: 69, width: 45, height: 36 },
  { sprite: "rocks", x: 135, y: 41, width: 58, height: 40, solid: 0.7 },
  { sprite: "lamp", x: 118, y: 20, width: 30, height: 75, solid: 0.4, story: { title: "实验区信标", caption: "SIGNAL BEACON", description: "每个晚归的队员都认得这盏路灯。它提醒着大家：回路要闭合，人也该回家。" } },
  { sprite: "hydrangea", x: 132, y: 12, width: 45, height: 36 },
  { sprite: "bench", x: 98, y: 17, width: 57, height: 38, solid: 0.8, story: { title: "观测记录点", caption: "OBSERVATION LOG", description: "站在北侧的林荫路上，正好可以看到实验室的天线和远处的树冠。" } },
  { sprite: "hydrangea", x: 79, y: 9, width: 45, height: 36 },
  { sprite: "fence", x: 108, y: 35, width: 64, height: 34, solid: 0.5 },
  { sprite: "hydrangea", x: 117, y: 59, width: 45, height: 36 },
];
export const FOUNTAIN = { x: 72, y: 48, radius: 2.5 } as const;
export const SPAWN: Position = { x: 72, y: 56 };

// Collision follows visible ground contact: broad furniture has a footprint,
// small upright props use their existing radius, and arch pillars leave a passage.
export function sceneryBlocks(object: Scenery, x: number, y: number, radius = 0.3): boolean {
  if (object.sprite === "arch") {
    const postOffset = object.width / (2 * TILE) - 0.8;
    return [-1, 1].some(side =>
      Math.hypot(x - object.x - side * postOffset, y - object.y) < 0.6 + radius);
  }
  if (["bench", "fence", "planter", "rocks", "hydrangea"].includes(object.sprite)) {
    const halfWidth = object.width / (2 * TILE) * 0.78;
    const halfDepth = object.sprite === "fence" ? 0.38 : 0.52;
    return Math.abs(x - object.x) < halfWidth + radius &&
      Math.abs(y - object.y) < halfDepth + radius;
  }
  return Boolean(object.solid && Math.hypot(x - object.x, y - object.y) < object.solid + radius);
}

export function isWalkable(x: number, y: number): boolean {
  const radius = 0.3;
  if (x - radius < 1 || y - radius < 1 || x + radius > WORLD_WIDTH - 1 || y + radius > WORLD_HEIGHT - 1) return false;
  // Water is defined by the same ground areas used to paint the scene.
  if (GROUND_AREAS.some((area) =>
    area.kind === 3 &&
    x + radius > area.x && x - radius < area.x + area.width &&
    y + radius > area.y && y - radius < area.y + area.height
  )) return false;
  // Every building has a solid body; its painted roof can overlap a rear path.
  // The interaction is in front of the body, not in a non-solid wall strip.
  if (PLACES.some((p) => x + radius > p.x && x - radius < p.x + p.width &&
    y + radius > p.y && y - radius < p.y + p.height)) return false;
  if (SCENERY.some((p) => sceneryBlocks(p, x, y, radius))) return false;
  if (Math.hypot(x - FOUNTAIN.x, y - FOUNTAIN.y) < FOUNTAIN.radius + radius) return false;
  return true;
}

export function movePlayer(
  position: Position, horizontal: number, vertical: number, dt: number, sprinting = false,
): Position {
  const len = Math.hypot(horizontal, vertical);
  if (!len || dt <= 0) return position;
  const distance = (sprinting ? RUN_SPEED : WALK_SPEED) * Math.min(dt, 0.05);
  // Short substeps keep thin obstacles solid at both walk and sprint speeds.
  const steps = Math.ceil(distance / 0.2);
  const dx = horizontal / len * distance / steps;
  const dy = vertical / len * distance / steps;
  let next = position;
  for (let i = 0; i < steps; i++) {
    const x = next.x + dx;
    const nextX = isWalkable(x, next.y) ? x : next.x;
    const y = next.y + dy;
    const nextY = isWalkable(nextX, y) ? y : next.y;
    next = { x: nextX, y: nextY };
  }
  return next;
}

export function closestPlace({ x, y }: Position): Place | null {
  let nearest: Place | null = null;
  let best = Infinity;
  for (const place of PLACES) {
    const dx = Math.max(place.x - x, 0, x - (place.x + place.width));
    const dy = Math.max(place.y - y, 0, y - (place.y + place.height));
    const distance = Math.hypot(dx, dy);
    if (distance < 3 && distance < best) {
      best = distance;
      nearest = place;
    }
  }
  return nearest;
}

// Benches are physical seats even when they have no story text.
export function closestBench(position: Position): Scenery | null {
  let nearest: Scenery | null = null;
  let distance = 2.5;
  for (const object of SCENERY) {
    if (object.sprite !== "bench") continue;
    const next = Math.hypot(position.x - object.x, position.y - object.y);
    if (next < distance) {
      nearest = object;
      distance = next;
    }
  }
  return nearest;
}

export function benchExit(bench: Scenery): Position | null {
  if (bench.sprite !== "bench") return null;
  const radius = bench.width / (2 * TILE) + 0.9;
  const candidates = [
    { x: bench.x, y: bench.y + 1.25 },
    { x: bench.x - radius, y: bench.y },
    { x: bench.x + radius, y: bench.y },
    { x: bench.x, y: bench.y - 1.4 },
  ];
  return candidates.find(p => isWalkable(p.x, p.y)) ?? null;
}

export function benchSeat(bench: Scenery): Position {
  return { x: bench.x, y: bench.y - 0.6 };
}

export function closestStory({ x, y }: Position): Scenery | null {
  let nearest: Scenery | null = null;
  let distance = 2.8;
  for (const scenery of SCENERY) {
    if (!scenery.story) continue;
    const next = Math.hypot(x - scenery.x, y - scenery.y);
    if (next < distance) {
      nearest = scenery;
      distance = next;
    }
  }
  return nearest;
}

// Fit the map to the viewport without exposing off-world canvas; retain fine 1% zoom steps.
export function clampZoom(zoom: number, viewportWidth: number, viewportHeight: number): number {
  const fit = Math.ceil(Math.max(1, viewportWidth / (WORLD_WIDTH * TILE), viewportHeight / (WORLD_HEIGHT * TILE)) * 100) / 100;
  return Math.max(fit, Math.min(3.2, Math.round(zoom * 100) / 100));
}

// All scene layers must use the same whole-pixel camera offset per frame.
export function snapCamera(camera: Position): Position {
  return { x: Math.round(camera.x), y: Math.round(camera.y) };
}

export function cameraAt(position: Position, viewWidth: number, viewHeight: number): Position {
  return {
    x: Math.max(0, Math.min(WORLD_WIDTH * TILE - viewWidth, position.x * TILE - viewWidth / 2)),
    y: Math.max(0, Math.min(WORLD_HEIGHT * TILE - viewHeight, position.y * TILE - viewHeight * 0.7)),
  };
}
