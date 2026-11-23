export const TILE = 16;
export const WORLD_WIDTH = 96;
export const WORLD_HEIGHT = 64;
export const WALK_SPEED = 5.4; // tiles / second

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
  { id: "mechanical", title: "机械工坊", caption: "MECHANICAL WORKSHOP", description: "结构设计、建模加工与整机装配。每一颗螺丝背后，都藏着把想法变成现实的功夫。", href: "/about", action: "认识机械组", x: 9, y: 10, width: 18, height: 11, accent: "#d4a552" },
  { id: "honors", title: "荣誉殿堂", caption: "HALL OF HONOR", description: "从初次出发，到一次次登上赛场。这里收藏吉甲一路走来的奖杯与故事。", href: "/events-and-honors", action: "查看赛事与荣誉", x: 38, y: 5, width: 20, height: 12, accent: "#e1c374" },
  { id: "electrical", title: "电控实验室", caption: "ELECTRICAL LAB", description: "电路、嵌入式与电机控制。那些看不见的信号，点亮了每一台机器人的生命力。", href: "/about", action: "认识电控组", x: 69, y: 10, width: 18, height: 11, accent: "#b8cce3" },
  { id: "vision", title: "视觉观测站", caption: "VISION STATION", description: "目标识别、视觉定位与自瞄算法，让机器人学会看见这个世界。", href: "/about", action: "认识视觉组", x: 9, y: 42, width: 18, height: 11, accent: "#98c8bd" },
  { id: "guild", title: "冒险者公会", caption: "JOIN THE TEAM", description: "寻找你的下一场冒险。机械、电控、视觉、AI 与运营，总有一种热爱能在这里发光。", href: "/join", action: "加入吉甲", x: 38, y: 49, width: 20, height: 11, accent: "#efc28d" },
  { id: "ai", title: "AI 研究所", caption: "AI RESEARCH", description: "从感知到决策，从规划到自主控制。下一代机器人的想象力，正在这里发生。", href: "/about", action: "认识 AI 组", x: 69, y: 42, width: 18, height: 11, accent: "#c3b6eb" },
];

// One scene specification controls terrain, illustration, and physical obstacles.
// Art direction: 16px terrain units, 3/4 overhead sprites, upper-left daylight,
// warm limestone + sage greens, decorative silhouettes clear of walking routes.
export type GroundArea = { kind: 0 | 1 | 2 | 3; x: number; y: number; width: number; height: number };
export const GROUND_AREAS: GroundArea[] = [
  { kind: 1, x: 0, y: 29, width: 96, height: 7 },
  { kind: 1, x: 45, y: 17, width: 7, height: 46 },
  { kind: 1, x: 18, y: 20, width: 7, height: 31 },
  { kind: 1, x: 72, y: 20, width: 7, height: 31 },
  { kind: 1, x: 18, y: 47, width: 61, height: 6 },
  { kind: 1, x: 34, y: 17, width: 29, height: 7 },
  { kind: 2, x: 32, y: 23, width: 32, height: 23 },
  { kind: 0, x: 33, y: 24, width: 3, height: 3 },
  { kind: 0, x: 60, y: 24, width: 3, height: 3 },
  { kind: 0, x: 33, y: 42, width: 3, height: 3 },
  { kind: 0, x: 60, y: 42, width: 3, height: 3 },
  { kind: 2, x: 2, y: 28, width: 11, height: 9 },
  { kind: 3, x: 3, y: 29, width: 9, height: 7 },
  { kind: 2, x: 83, y: 28, width: 11, height: 9 },
  { kind: 3, x: 84, y: 29, width: 9, height: 7 },
];

export type PropSprite =
  | "bench" | "lamp" | "sign" | "planter" | "oak" | "lime_tree"
  | "cherry" | "rocks" | "fence" | "hydrangea" | "statue" | "arch";
export type Scenery = Position & {
  sprite: PropSprite;
  width: number; // painted width, world pixels
  height: number; // painted height, world pixels
  solid?: number; // feet collision radius in world tiles; absent means passable
};
export const SCENERY: Scenery[] = [
  // The plaza is designed as one coherent composition, not scattered random props.
  { sprite: "arch", x: 48, y: 23.8, width: 104, height: 92 },
  { sprite: "planter", x: 35, y: 26.1, width: 51, height: 40, solid: 0.72 },
  { sprite: "planter", x: 61, y: 26.1, width: 51, height: 40, solid: 0.72 },
  { sprite: "planter", x: 35, y: 43.7, width: 51, height: 40, solid: 0.72 },
  { sprite: "planter", x: 61, y: 43.7, width: 51, height: 40, solid: 0.72 },
  { sprite: "bench", x: 38, y: 33, width: 57, height: 38, solid: 0.8 },
  { sprite: "bench", x: 58.5, y: 33, width: 57, height: 38, solid: 0.8 },
  { sprite: "lamp", x: 33, y: 32, width: 30, height: 75, solid: 0.4 },
  { sprite: "lamp", x: 63, y: 32, width: 30, height: 75, solid: 0.4 },
  { sprite: "lamp", x: 38, y: 45.3, width: 30, height: 75, solid: 0.4 },
  { sprite: "lamp", x: 58, y: 45.3, width: 30, height: 75, solid: 0.4 },
  { sprite: "statue", x: 57.5, y: 39, width: 49, height: 62, solid: 0.9 },
  { sprite: "sign", x: 44.2, y: 43, width: 40, height: 59, solid: 0.38 },
  { sprite: "hydrangea", x: 40, y: 25.2, width: 45, height: 36 },
  { sprite: "hydrangea", x: 56, y: 25.2, width: 45, height: 36 },
  // Landscape framing extends beyond the hero square, using the same authored kit.
  { sprite: "oak", x: 29, y: 24, width: 86, height: 101, solid: 0.9 },
  { sprite: "cherry", x: 67, y: 24, width: 86, height: 102, solid: 0.9 },
  { sprite: "oak", x: 29, y: 46, width: 86, height: 101, solid: 0.9 },
  { sprite: "lime_tree", x: 67, y: 46, width: 86, height: 101, solid: 0.9 },
  { sprite: "rocks", x: 27, y: 38, width: 58, height: 40, solid: 0.7 },
  { sprite: "rocks", x: 69, y: 38, width: 58, height: 40, solid: 0.7 },
  { sprite: "hydrangea", x: 28, y: 28, width: 42, height: 33 },
  { sprite: "hydrangea", x: 68, y: 28, width: 42, height: 33 },
  { sprite: "lime_tree", x: 5, y: 10, width: 82, height: 96, solid: 0.9 },
  { sprite: "oak", x: 30, y: 15, width: 82, height: 96, solid: 0.9 },
  { sprite: "lime_tree", x: 65, y: 14, width: 82, height: 96, solid: 0.9 },
  { sprite: "cherry", x: 91, y: 11, width: 82, height: 96, solid: 0.9 },
  { sprite: "cherry", x: 5, y: 50, width: 82, height: 96, solid: 0.9 },
  { sprite: "oak", x: 30, y: 60, width: 82, height: 96, solid: 0.9 },
  { sprite: "lime_tree", x: 66, y: 60, width: 82, height: 96, solid: 0.9 },
  { sprite: "oak", x: 91, y: 52, width: 82, height: 96, solid: 0.9 },
  { sprite: "planter", x: 18, y: 24, width: 46, height: 36 },
  { sprite: "planter", x: 78, y: 24, width: 46, height: 36 },
  { sprite: "fence", x: 13, y: 37, width: 64, height: 34, solid: 0.5 },
  { sprite: "fence", x: 83, y: 37, width: 64, height: 34, solid: 0.5 },
];
export const FOUNTAIN = { x: 48, y: 32, radius: 2.5 } as const;
export const SPAWN: Position = { x: 48, y: 40 };

export function isWalkable(x: number, y: number): boolean {
  const radius = 0.3;
  if (x - radius < 1 || y - radius < 1 || x + radius > WORLD_WIDTH - 1 || y + radius > WORLD_HEIGHT - 1) return false;
  if (PLACES.some((p) => x + radius > p.x && x - radius < p.x + p.width && y + radius > p.y + 0.9 && y - radius < p.y + p.height - 0.7)) return false;
  if (SCENERY.some((p) => p.solid && Math.hypot(x - p.x, y - p.y) < p.solid + radius)) return false;
  if (Math.hypot(x - FOUNTAIN.x, y - FOUNTAIN.y) < FOUNTAIN.radius + radius) return false;
  return true;
}

export function movePlayer(position: Position, horizontal: number, vertical: number, dt: number): Position {
  const len = Math.hypot(horizontal, vertical);
  if (!len || dt <= 0) return position;
  const step = WALK_SPEED * Math.min(dt, 0.05) / len;
  const x = position.x + horizontal * step;
  const y = position.y + vertical * step;
  // Slide along solid building edges rather than teleporting across tile boundaries.
  const nextX = isWalkable(x, position.y) ? x : position.x;
  const nextY = isWalkable(nextX, y) ? y : position.y;
  return { x: nextX, y: nextY };
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

export function cameraAt(position: Position, viewWidth: number, viewHeight: number): Position {
  return {
    x: Math.max(0, Math.min(WORLD_WIDTH * TILE - viewWidth, position.x * TILE - viewWidth / 2)),
    y: Math.max(0, Math.min(WORLD_HEIGHT * TILE - viewHeight, position.y * TILE - viewHeight * 0.7)),
  };
}
