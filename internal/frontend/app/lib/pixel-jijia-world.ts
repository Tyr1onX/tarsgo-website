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

export const TREES: Position[] = [
  { x: 2, y: 5 }, { x: 6, y: 27 }, { x: 4, y: 37 }, { x: 2, y: 56 }, { x: 30, y: 5 },
  { x: 32, y: 20 }, { x: 32, y: 57 }, { x: 61, y: 5 },
  { x: 64, y: 21 }, { x: 62, y: 57 }, { x: 92, y: 8 },
  { x: 92, y: 44 }, { x: 90, y: 57 },
  { x: 16, y: 26 }, { x: 83, y: 27 },
];

const ROCKS: Position[] = [{ x: 15, y: 37 }, { x: 76, y: 37 }];
export const SPAWN: Position = { x: 48, y: 21.5 };

export function isWalkable(x: number, y: number): boolean {
  const radius = 0.3;
  if (x - radius < 1 || y - radius < 1 || x + radius > WORLD_WIDTH - 1 || y + radius > WORLD_HEIGHT - 1) return false;
  if (PLACES.some((p) => x + radius > p.x && x - radius < p.x + p.width && y + radius > p.y + 0.9 && y - radius < p.y + p.height - 0.7)) return false;
  if (TREES.some((p) => Math.hypot(x - p.x, y - p.y) < 0.8)) return false;
  if (ROCKS.some((p) => Math.hypot(x - p.x, y - p.y) < 0.8)) return false;
  if (Math.hypot(x - 48, y - 31.5) < 2.3) return false;
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
