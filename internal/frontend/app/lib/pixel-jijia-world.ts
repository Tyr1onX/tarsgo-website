export const WORLD_WIDTH = 40;
export const WORLD_HEIGHT = 27;

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
  building: "blue" | "red" | "castle";
};

export const PLACES: Place[] = [
  { id: "mechanical", title: "机械工坊", caption: "MECHANICAL", description: "从结构设计到加工装配，把机器人的想法变成真实的机械结构。", href: "/about", action: "认识机械组", x: 4, y: 4, width: 4, height: 3, building: "blue" },
  { id: "electrical", title: "电控实验室", caption: "ELECTRICAL", description: "电路、嵌入式与电机控制，让每个部件协同运转。", href: "/about", action: "认识电控组", x: 32, y: 4, width: 4, height: 3, building: "red" },
  { id: "honors", title: "荣誉殿堂", caption: "HALL OF FAME", description: "每一次站上赛场、每一份沉甸甸的荣誉，都在这里留下了记录。", href: "/events-and-honors", action: "查看赛事与荣誉", x: 16, y: 3, width: 8, height: 3, building: "castle" },
  { id: "vision", title: "视觉观测站", caption: "VISION", description: "让机器人看见目标、识别环境，把画面转化为可靠的信息。", href: "/about", action: "认识视觉组", x: 5, y: 18, width: 4, height: 3, building: "red" },
  { id: "ai", title: "AI 研究所", caption: "ARTIFICIAL INTELLIGENCE", description: "在感知、决策与规划之间，探索机器人自主行动的可能。", href: "/about", action: "认识 AI 组", x: 31, y: 18, width: 4, height: 3, building: "blue" },
  { id: "guild", title: "冒险者公会", caption: "JOIN TARSGO", description: "五个组别，不同的专长。下一段冒险，可以从这里开始。", href: "/join", action: "加入吉甲", x: 18, y: 22, width: 4, height: 3, building: "red" },
];

export const TREES: Position[] = [
  { x: 1, y: 1 }, { x: 8, y: 1 }, { x: 12, y: 4 }, { x: 27, y: 3 }, { x: 37, y: 1 },
  { x: 1, y: 9 }, { x: 12, y: 9 }, { x: 27, y: 9 }, { x: 37, y: 10 },
  { x: 1, y: 17 }, { x: 13, y: 18 }, { x: 27, y: 18 }, { x: 37, y: 18 },
  { x: 2, y: 23 }, { x: 11, y: 24 }, { x: 28, y: 24 }, { x: 37, y: 24 },
];

export function isPath(x: number, y: number): boolean {
  return (y >= 12 && y <= 14 && x >= 3 && x <= 36)
    || (x >= 19 && x <= 20 && y >= 6 && y <= 24)
    || (x >= 6 && x <= 7 && y >= 7 && y <= 19)
    || (x >= 33 && x <= 34 && y >= 7 && y <= 19)
    || (y >= 23 && y <= 24 && x >= 7 && x <= 34)
    || (x >= 16 && x <= 23 && y >= 10 && y <= 17);
}

export function isWalkable(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= WORLD_WIDTH || y >= WORLD_HEIGHT) return false;
  if (PLACES.some((place) => x >= place.x && x < place.x + place.width && y >= place.y && y < place.y + place.height)) return false;
  if (TREES.some((tree) => x === tree.x && y >= tree.y && y <= tree.y + 1)) return false;
  if (x === 19 && y === 12) return false; // 广场中央的水井
  return true;
}

export function closestPlace({ x, y }: Position): Place | null {
  const matches = PLACES.map((place) => {
    const dx = Math.max(place.x - x, 0, x - (place.x + place.width - 1));
    const dy = Math.max(place.y - y, 0, y - (place.y + place.height - 1));
    return { place, distance: dx + dy };
  }).sort((a, b) => a.distance - b.distance);
  return matches[0]?.distance <= 2 ? matches[0].place : null;
}

export function cameraAt(position: Position, columns: number, rows: number): Position {
  return {
    x: Math.max(0, Math.min(WORLD_WIDTH - columns, position.x - Math.floor(columns / 2))),
    y: Math.max(0, Math.min(WORLD_HEIGHT - rows, position.y - Math.floor(rows / 2))),
  };
}
