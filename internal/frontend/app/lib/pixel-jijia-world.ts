import type { SurfaceWeather } from "./pixel-jijia-climate.ts";

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
export type GroundKind = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7; // grass, brick, stone, water, soil, flower bed, wood, sand
export type GroundArea = { kind: GroundKind; x: number; y: number; width: number; height: number; shore?: "natural" };
export const TRAINING_FIELD = { x:102,y:1,width:38,height:11 } as const;
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
  { kind: 2, ...TRAINING_FIELD },
  // Small authored clearings make the outer walk worth taking.
  { kind: 2, x: 20, y: 8, width: 13, height: 6 },
  { kind: 2, x: 109, y: 8, width: 13, height: 6 },
  { kind: 2, x: 23, y: 80, width: 13, height: 8 },
  { kind: 2, x: 114, y: 73, width: 10, height: 8 },
  { kind: 7, x: 3, y: 54, width: 12, height: 15, shore: "natural" },
  { kind: 6, x: 14, y: 59, width: 4, height: 4 },
  { kind: 3, x: 4, y: 55, width: 10, height: 13, shore: "natural" },
  { kind: 7, x: 130, y: 25, width: 11, height: 14, shore: "natural" },
  { kind: 6, x: 127, y: 30, width: 4, height: 4 },
  { kind: 3, x: 131, y: 26, width: 9, height: 12, shore: "natural" },
  { kind: 1, x: 24, y: 45, width: 96, height: 7 },
  { kind: 1, x: 69, y: 33, width: 7, height: 46 },
  { kind: 1, x: 42, y: 36, width: 7, height: 31 },
  { kind: 1, x: 96, y: 36, width: 7, height: 31 },
  { kind: 1, x: 42, y: 63, width: 61, height: 6 },
  { kind: 1, x: 58, y: 33, width: 29, height: 7 },
  { kind: 2, x: 56, y: 39, width: 32, height: 23 },
  { kind: 2, x: 26, y: 44, width: 11, height: 9 },
  { kind: 3, x: 27, y: 45, width: 9, height: 7 },
  { kind: 2, x: 107, y: 44, width: 11, height: 9 },
  { kind: 3, x: 108, y: 45, width: 9, height: 7 },
  // Planted beds belong to real vegetation; the rest of the lawns remain open.
  { kind: 5, x: 59, y: 30, width: 3, height: 4, shore: "natural" },
  { kind: 5, x: 82, y: 30, width: 3, height: 4, shore: "natural" },
  { kind: 4, x: 7, y: 73, width: 4, height: 4, shore: "natural" },
  { kind: 4, x: 133, y: 15, width: 4, height: 4, shore: "natural" },
];

// The authored area is the only source of terrain. The natural pond's
// stepped corners are cells of grass, not a visual mask over invisible water.
export const PONDS = GROUND_AREAS.filter(area => area.kind === 3);
const materials = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
for (const area of GROUND_AREAS) {
  for (let y = area.y; y < area.y + area.height; y++) {
    for (let x = area.x; x < area.x + area.width; x++) {
      if (area.shore === "natural") {
        const edgeX = Math.min(x - area.x, area.x + area.width - 1 - x);
        const edgeY = Math.min(y - area.y, area.y + area.height - 1 - y);
        if (edgeX + edgeY < Math.min(2,Math.floor(Math.min(area.width,area.height)/3))) continue;
      }
      materials[y * WORLD_WIDTH + x] = area.kind;
    }
  }
}
export function groundAt(x: number, y: number): GroundArea["kind"] {
  const cx = Math.floor(x), cy = Math.floor(y);
  return (cx >= 0 && cx < WORLD_WIDTH && cy >= 0 && cy < WORLD_HEIGHT
    ? materials[cy * WORLD_WIDTH + cx] : 0) as GroundArea["kind"];
}

// All four visible water bodies share depth and traversal semantics.
// The separate fountain is a physical fixture, not a terrain exception.
export function waterDepthAt(x: number, y: number): 0 | 1 | 2 {
  if (groundAt(x, y) !== 3) return 0;
  return groundAt(x-1,y)!==3 || groundAt(x+1,y)!==3 || groundAt(x,y-1)!==3 || groundAt(x,y+1)!==3 ? 1 : 2;
}

export type PropSprite =
  | "bench" | "lamp" | "sign" | "planter" | "oak" | "lime_tree"
  | "cherry" | "rocks" | "fence" | "hydrangea" | "statue" | "arch"
  | "training-base-red" | "training-base-blue" | "training-outpost" | "training-rune" | "training-cover";
export type Scenery = Position & {
  sprite: PropSprite;
  width: number; // painted width, world pixels
  height: number; // painted height, world pixels
  habitat?: "sparrow" | "squirrel"; // wildlife belongs to a visible shelter
  story?: { title: string; caption: string; description: string; action?: string; result?: string }; // exploration text lives with its visible prop
};
export const SCENERY: Scenery[] = [
  // Central plaza fixtures remain aligned around x=72. Natural scenery is intentionally irregular.
  { sprite: "arch", x: 72, y: 39.8, width: 104, height: 92, story: { title: "春日门廊", caption: "PLAZA GATE", description: "每年春天，人们从这道门廊走进广场。布条挂在柱间，记录着一次又一次新的相遇。", action: "拨动风铃", result: "铃声沿着石板路传开。下一次经过这里时，或许已经有了新的同行者。" } },
  { sprite: "planter", x: 59, y: 42.1, width: 51, height: 40 },
  { sprite: "planter", x: 85, y: 42.1, width: 51, height: 40 },
  { sprite: "planter", x: 59, y: 59.7, width: 51, height: 40 },
  { sprite: "planter", x: 85, y: 59.7, width: 51, height: 40 },
  { sprite: "bench", x: 62, y: 49, width: 57, height: 38, story: { title: "机械师的休息处", caption: "WORKSHOP BREAK", description: "有人在这张石凳上画过齿轮草图，边缘还留下了淡淡的铅笔痕迹。", action: "坐一会儿", result: "耳边是喷泉声。你想起：最好的设计，有时始于一段短暂的发呆。" } },
  { sprite: "bench", x: 82, y: 49, width: 57, height: 38, story: { title: "广场留言凳", caption: "SMALL NOTES", description: "队员常在这里交流训练心得。凳面没有刻名字，只有被时光磨亮的石纹。" } },
  { sprite: "lamp", x: 57, y: 48, width: 30, height: 75, story: { title: "街角灯火", caption: "EVENING LIGHT", description: "晚训结束后，第一盏灯总是从广场边缘亮起。白天的它安静得像一支未点燃的火柴。" } },
  { sprite: "lamp", x: 87, y: 48, width: 30, height: 75 },
  { sprite: "lamp", x: 62, y: 61.3, width: 30, height: 75 },
  { sprite: "lamp", x: 82, y: 61.3, width: 30, height: 75 },
  { sprite: "statue", x: 82, y: 55, width: 49, height: 62, story: { title: "吉甲机械纪念碑", caption: "ROBOT MEMORIAL", description: "台座上的小机器人没有举起奖杯，它只是伸着手，像是在说：继续尝试。", action: "启动自检", result: "蓝色目镜亮了一下：电源正常、传感器正常、好奇心依旧在线。" } },
  { sprite: "sign", x: 68, y: 59, width: 40, height: 59, story: { title: "广场路标", caption: "WAYFINDER", description: "向北是荣誉殿堂，向东通往实验园区，向西是机械工坊。无论选择哪条路，都能回到喷泉。", action: "翻看路标背面", result: "背面有人用极小的字写着：别害怕走错方向，做机器人的人，总是在试错。" } },
  { sprite: "hydrangea", x: 60.5, y: 32, width: 45, height: 36 },
  { sprite: "hydrangea", x: 83.5, y: 32, width: 45, height: 36 },
  // Landscape framing extends beyond the hero square, using the same authored kit.
  { sprite: "oak", x: 50.5, y: 39.5, habitat: "sparrow", width: 86, height: 101 },
  { sprite: "cherry", x: 93.5, y: 39.5, habitat: "squirrel", width: 86, height: 102, story: { title: "樱树下的约定", caption: "BLOSSOM PROMISE", description: "每年花开时，总有人重新走过这里。机器会更换零件，但一些约定会慢慢长成树。", action: "接住一片花瓣", result: "花瓣停在掌心一瞬，又被风带走。你记住了它落下的方向。" } },
  { sprite: "oak", x: 53, y: 62, width: 86, height: 101 },
  { sprite: "lime_tree", x: 91, y: 62, width: 86, height: 101 },
  { sprite: "rocks", x: 51, y: 54, width: 58, height: 40, story: { title: "试验后的石头", caption: "FIELD TEST", description: "石头上的划痕来自一次定位实验。机器人读不懂风，却能一点点学会看清这里的边界。" } },
  { sprite: "rocks", x: 93, y: 54, width: 58, height: 40 },
  { sprite: "hydrangea", x: 52, y: 44, width: 42, height: 33 },
  { sprite: "hydrangea", x: 92, y: 44, width: 42, height: 33 },
  { sprite: "lime_tree", x: 29, y: 26, habitat: "sparrow", width: 82, height: 96 },
  { sprite: "oak", x: 59, y: 30, habitat: "squirrel", width: 82, height: 96 },
  { sprite: "lime_tree", x: 84, y: 28, width: 82, height: 96 },
  { sprite: "cherry", x: 115, y: 27, width: 82, height: 96 },
  { sprite: "cherry", x: 29, y: 66, habitat: "sparrow", width: 82, height: 96 },
  { sprite: "oak", x: 49, y: 76, habitat: "squirrel", width: 82, height: 96 },
  { sprite: "lime_tree", x: 95, y: 76, width: 82, height: 96 },
  { sprite: "oak", x: 115, y: 68, width: 82, height: 96 },
  { sprite: "planter", x: 39, y: 40, width: 46, height: 36 },
  { sprite: "planter", x: 105, y: 40, width: 46, height: 36 },
  { sprite: "fence", x: 31, y: 53, width: 64, height: 34, story: { title: "西庭亲水台", caption: "WATER GARDEN", description: "这里的石阶延伸进水中。实验结束后，可以沿着浅水边缘慢慢走，或在岸边抛下一根钓线。" } },
  { sprite: "fence", x: 113, y: 53, width: 64, height: 34, story: { title: "东庭水光", caption: "WATER REFLECTIONS", description: "观测站附近的池水映着天空。日光、云层和雨滴都在这里留下短暂的轨迹。" } },
  // Open practice court: CAD-derived fixtures share the regular scenery footprints.
  { sprite: "training-base-red", x:106.5,y:4.6,width:48,height:58 },
  { sprite: "training-base-blue", x:135.5,y:4.6,width:48,height:58 },
  { sprite: "training-outpost", x:120,y:5.8,width:28,height:55 },
  { sprite: "training-rune", x:128,y:4.5,width:48,height:58 },
  { sprite: "training-cover", x:113.8,y:5.0,width:46,height:29 },
  { sprite: "training-cover", x:132.4,y:6.0,width:46,height:29 },
  // Four visible, readable discoveries. The same anchor drives art, collision, and interaction.
  { sprite: "sign", x: 24, y: 11, width: 40, height: 59, story: {
    title: "风铃小径", caption: "A QUIET PATH", description: "一条绕开主路的林荫小径。风吹过树梢时，路边的小牌子仿佛也在提醒：不是每段旅程都必须直奔终点。"
  } },
  { sprite: "statue", x: 115, y: 12.7, width: 49, height: 62, story: {
    title: "机器人试验场", caption: "FIELD NOTES", description: "测试场边留着一座小小的机器人纪念像。它没有写明胜负，只留下一句关于尝试的话：今天再让它往前走一步。北侧是开放式微缩训练场，可接管过洞步兵进行虚拟训练；这里也通往完整三维战场。"
  } },
  { sprite: "sign", x: 119, y: 74, width: 40, height: 59, story: {
    title: "数据树洞", caption: "HIDDEN SIGNAL", description: "这里有一张写给后来者的便条：世界再嘈杂，也总有一个信号值得认真接收。"
  } },
  { sprite: "bench", x: 29, y: 87, width: 57, height: 38, story: {
    title: "长椅上的片刻", caption: "REST STOP", description: "坐在这条支路旁，不必赶去下一座建筑。远处是科技园区，身边只有树叶与风，正好留一点时间给自己的想法。"
  } },
  // Outer-ring landmarks and natural transitions, using the existing twelve-piece kit.
  { sprite: "oak", x: 9, y: 15, width: 82, height: 96 },
  { sprite: "lime_tree", x: 7, y: 35, width: 82, height: 96 },
  { sprite: "cherry", x: 9, y: 75, habitat: "squirrel", width: 86, height: 102 },
  { sprite: "oak", x: 38, y: 8, width: 82, height: 96 },
  { sprite: "lime_tree", x: 56, y: 7, width: 82, height: 96 },
  { sprite: "cherry", x: 87, y: 8, width: 86, height: 102 },
  { sprite: "oak", x: 135, y: 17, habitat: "sparrow", width: 82, height: 96 },
  { sprite: "lime_tree", x: 136, y: 48, width: 82, height: 96 },
  { sprite: "cherry", x: 135, y: 79, width: 86, height: 102 },
  { sprite: "oak", x: 45, y: 91, width: 82, height: 96 },
  { sprite: "lime_tree", x: 74, y: 92, width: 82, height: 96 },
  { sprite: "cherry", x: 101, y: 91, width: 86, height: 102 },
  { sprite: "hydrangea", x: 27.5, y: 7, width: 45, height: 36 },
  { sprite: "planter", x: 30, y: 10, width: 51, height: 40 },
  { sprite: "hydrangea", x: 43, y: 10, width: 45, height: 36 },
  { sprite: "rocks", x: 13, y: 31, width: 58, height: 40 },
  { sprite: "hydrangea", x: 12, y: 45, width: 45, height: 36 },
  { sprite: "planter", x: 12.5, y: 69.5, width: 51, height: 40 },
  { sprite: "rocks", x: 29, y: 73, width: 58, height: 40, story: { title: "旧试验标记", caption: "OLD MARK", description: "这里曾用石块标记最早的自动巡航路线。草重新长了出来，路线却被记在了队员的笔记里。" } },
  { sprite: "hydrangea", x: 36.5, y: 89, width: 45, height: 36 },
  { sprite: "bench", x: 54, y: 88, width: 57, height: 38, story: { title: "南侧观景座", caption: "GARDEN VIEW", description: "沿环线走累了，就在这里坐一会儿。风把远处工坊的声音吹得很轻。" } },
  { sprite: "hydrangea", x: 67, y: 88, width: 45, height: 36 },
  { sprite: "rocks", x: 89, y: 89, width: 58, height: 40 },
  { sprite: "planter", x: 106, y: 78, width: 51, height: 40, story: { title: "水岸小花圃", caption: "RIVERSIDE GARDEN", description: "谁也说不清第一株花是谁种下的。后来经过的每个人，都会顺手替它拂去落叶。" } },
  { sprite: "hydrangea", x: 135, y: 69, width: 45, height: 36 },
  { sprite: "rocks", x: 135, y: 41, width: 58, height: 40 },
  { sprite: "lamp", x: 118, y: 22, width: 30, height: 75, story: { title: "实验区信标", caption: "SIGNAL BEACON", description: "每个晚归的队员都认得这盏路灯。它提醒着大家：回路要闭合，人也该回家。" } },
  { sprite: "hydrangea", x: 140, y: 13.5, width: 45, height: 36 },
  { sprite: "bench", x: 98, y: 11, width: 57, height: 38, story: { title: "观测记录点", caption: "OBSERVATION LOG", description: "站在北侧的林荫路上，正好可以看到实验室的天线和远处的树冠。" } },
  { sprite: "hydrangea", x: 79, y: 9, width: 45, height: 36 },
  { sprite: "fence", x: 114, y: 35, width: 64, height: 34 },
  { sprite: "hydrangea", x: 117, y: 59, width: 45, height: 36 },
];
// Physical contact belongs to the sprite kind, not an optional radius on
// individual instances. Wide fixtures, round trunks and gate posts share
// the same footprints for placement validation and walking.
type Footprint = { x: number; y: number; width: number; height: number }
  | { x: number; y: number; radius: number };
const GROUND_RULES: Record<PropSprite, { natural: boolean; shape: "broad" | "round" | "arch"; depth: number }> = {
  bench: { natural: false, shape: "broad", depth: .52 },
  fence: { natural: false, shape: "broad", depth: .38 },
  planter: { natural: false, shape: "broad", depth: .52 },
  rocks: { natural: true, shape: "broad", depth: .52 },
  hydrangea: { natural: true, shape: "broad", depth: .52 },
  oak: { natural: true, shape: "round", depth: .9 },
  lime_tree: { natural: true, shape: "round", depth: .9 },
  cherry: { natural: true, shape: "round", depth: .9 },
  lamp: { natural: false, shape: "round", depth: .4 },
  sign: { natural: false, shape: "round", depth: .38 },
  statue: { natural: false, shape: "round", depth: .9 },
  arch: { natural: false, shape: "arch", depth: .6 },
  "training-base-red": { natural:false,shape:"broad",depth:.85 },
  "training-base-blue": { natural:false,shape:"broad",depth:.85 },
  "training-outpost": { natural:false,shape:"round",depth:.65 },
  "training-rune": { natural:false,shape:"round",depth:.85 },
  "training-cover": { natural:false,shape:"broad",depth:.67 },
};
function footprints(object: Scenery): Footprint[] {
  const { x, y, width, sprite } = object;
  const rule = GROUND_RULES[sprite];
  if (rule.shape === "arch") {
    const offset = width / (2 * TILE) - .8;
    return [-1, 1].map(side => ({ x: x + side * offset, y, radius: rule.depth }));
  }
  if (rule.shape === "round") return [{ x, y, radius: rule.depth }];
  const half = width / (2 * TILE) * .78;
  return [{ x: x - half, y: y - rule.depth, width: half * 2, height: rule.depth * 2 }];
}
const sceneFootprints = new Map(SCENERY.map(object => [object, footprints(object)]));
function contact(object: Scenery): Footprint[] {
  return sceneFootprints.get(object) ?? footprints(object);
}
function footprintOverlaps(a: Footprint, b: Footprint): boolean {
  if ("radius" in a && "radius" in b) return Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius;
  if ("radius" in a) {
    const rect = b as Exclude<Footprint, { radius: number }>;
    const dx = Math.max(rect.x - a.x, 0, a.x - rect.x - rect.width);
    const dy = Math.max(rect.y - a.y, 0, a.y - rect.y - rect.height);
    return Math.hypot(dx, dy) < a.radius;
  }
  if ("radius" in b) return footprintOverlaps(b, a);
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
export function sceneryOverlaps(a: Scenery, b: Scenery): boolean {
  return contact(a).some(left => contact(b).some(right => footprintOverlaps(left, right)));
}
export function sceneryGroundValid(object: Scenery): boolean {
  const natural = GROUND_RULES[object.sprite].natural;
  for (const shape of contact(object)) {
    const bounds = "radius" in shape
      ? { x: shape.x - shape.radius, y: shape.y - shape.radius, width: shape.radius * 2, height: shape.radius * 2 }
      : shape;
    if (bounds.x < 1 || bounds.y < 1 || bounds.x + bounds.width > WORLD_WIDTH - 1 ||
        bounds.y + bounds.height > WORLD_HEIGHT - 1) return false;
    if (PLACES.some(place => footprintOverlaps(shape, place))) return false;
    if ("radius" in shape ? fountainBlocks(shape.x,shape.y,shape.radius) : fountainBlocks(Math.max(shape.x,Math.min(shape.x+shape.width,FOUNTAIN.x)),Math.max(shape.y,Math.min(shape.y+shape.height,FOUNTAIN.y)),0)) return false;
    for (let y = Math.floor(bounds.y); y < Math.ceil(bounds.y + bounds.height); y++) {
      for (let x = Math.floor(bounds.x); x < Math.ceil(bounds.x + bounds.width); x++) {
        if (!footprintOverlaps(shape, { x, y, width: 1, height: 1 })) continue;
        const material = groundAt(x, y);
        if (natural ? ![0,4,5,7].includes(material) : material === 3) return false;
      }
    }
  }
  return true;
}

export const FOUNTAIN = { x:72,y:48,radiusX:2.65,radiusY:1.32 } as const;
export function fountainBlocks(x:number,y:number,radius=.3){
  return ((x-FOUNTAIN.x)/(FOUNTAIN.radiusX+radius))**2+((y-FOUNTAIN.y)/(FOUNTAIN.radiusY+radius))**2<1;
}
export const SPAWN: Position = { x: 72, y: 56 };

export function sceneryBlocks(object: Scenery, x: number, y: number, radius = 0.3): boolean {
  return contact(object).some(shape => "radius" in shape
    ? Math.hypot(x - shape.x, y - shape.y) < shape.radius + radius
    : overlapsRect(x, y, radius, shape));
}

export function overlapsRect(x: number, y: number, radius: number,
  rect: { x: number; y: number; width: number; height: number }): boolean {
  return x + radius > rect.x && x - radius < rect.x + rect.width &&
    y + radius > rect.y && y - radius < rect.y + rect.height;
}

export function isWalkable(x: number, y: number, radius = 0.3): boolean {
  if (x - radius < 1 || y - radius < 1 || x + radius > WORLD_WIDTH - 1 || y + radius > WORLD_HEIGHT - 1) return false;
  // Every building has a solid body; its painted roof can overlap a rear path.
  // The interaction is in front of the body, not in a non-solid wall strip.
  if (PLACES.some(place => overlapsRect(x, y, radius, place))) return false;
  if (SCENERY.some((p) => sceneryBlocks(p, x, y, radius))) return false;
  if (fountainBlocks(x,y,radius)) return false;
  return true;
}

// A shelter is a real region below a tree canopy or immediately beneath a
// building eave. Wildlife and rainfall use the same spatial definition.
export function shelteredAt(x:number,y:number):boolean {
  if(PLACES.some(p=>x>=p.x+.35&&x<=p.x+p.width-.35&&y>=p.y&&y<=p.y+p.height+.65))return true;
  return SCENERY.some(p=>["oak","lime_tree","cherry"].includes(p.sprite)&&
    ((x-p.x)/(p.width/TILE*.43))**2+((y-(p.y-.8))/(p.height/TILE*.27))**2<=1);
}

// Small local movements and fishing casts use the same world collision rules.
export function pathIsWalkable(from:Position,to:Position,dry=false):boolean {
  const distance=Math.hypot(to.x-from.x,to.y-from.y),steps=Math.max(1,Math.ceil(distance/.25));
  for(let i=0;i<=steps;i++){
    const x=from.x+(to.x-from.x)*i/steps,y=from.y+(to.y-from.y)*i/steps;
    if(!isWalkable(x,y)||(dry&&groundAt(x,y)===3))return false;
  }
  return true;
}

export function movePlayer(
  position: Position, horizontal: number, vertical: number, dt: number, sprinting = false,
  walkable: (x: number, y: number) => boolean = isWalkable,
  outdoor = walkable === isWalkable,
): Position {
  const depth = outdoor ? waterDepthAt(position.x, position.y) : 0;
  const speed = depth === 2 ? WALK_SPEED * .46 : depth === 1 ? WALK_SPEED * .65 : sprinting ? RUN_SPEED : WALK_SPEED;
  return moveEntity(position,horizontal,vertical,dt,speed,walkable);
}

export function moveEntity(position:Position,horizontal:number,vertical:number,dt:number,speed:number,walkable:(x:number,y:number)=>boolean):Position {
  const len = Math.hypot(horizontal, vertical);
  if (!len || dt <= 0) return position;
  const distance = speed * Math.min(dt, 0.05) * Math.min(len, 1);
  // Short substeps keep thin obstacles solid at both walk and sprint speeds.
  const steps = Math.ceil(distance / 0.2);
  const dx = horizontal / len * distance / steps;
  const dy = vertical / len * distance / steps;
  let next = position;
  for (let i = 0; i < steps; i++) {
    const x = next.x + dx;
    const nextX = walkable(x, next.y) ? x : next.x;
    const y = next.y + dy;
    const nextY = walkable(nextX, y) ? y : next.y;
    next = { x: nextX, y: nextY };
  }
  return next;
}

// Doors are part of each building's existing footprint, not separate invisible portals.
// Enter only while walking towards the front threshold, never by passing along the facade.
export function outdoorDoorAt(position: Position, vertical: number): Place | null {
  if (vertical >= 0) return null;
  return PLACES.find(place => {
    const bottom = place.y + place.height;
    return Math.abs(position.x - (place.x + place.width / 2)) <= 1.35 &&
      position.y >= bottom + 0.3 && position.y <= bottom + 0.75;
  }) ?? null;
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

export function benchExit(bench: Scenery, from?:Position): Position | null {
  if (bench.sprite !== "bench") return null;
  const radius = bench.width / (2 * TILE) + 0.9;
  const candidates = [
    { x: bench.x, y: bench.y + 1.25 },
    { x: bench.x - radius, y: bench.y },
    { x: bench.x + radius, y: bench.y },
    { x: bench.x, y: bench.y - 1.4 },
  ];
  return candidates.filter(p=>isWalkable(p.x,p.y)&&(!from||pathIsWalkable(from,p,true))).sort((a,b)=>from?Math.hypot(a.x-from.x,a.y-from.y)-Math.hypot(b.x-from.x,b.y-from.y):0)[0]??null;
}

export function benchSeat(bench: Scenery): Position {
  // Seat surface is 15px above the prop anchor; the seated frame
  // places the hips about 11px above its bottom.
  return { x: bench.x, y: bench.y - 4 / TILE };
}

export function directionToward(position:Position,target:Position,fallback:Direction):Direction {
  const dx=target.x-position.x,dy=target.y-position.y;
  if(Math.abs(dx)+Math.abs(dy)<.01)return fallback;
  return Math.abs(dx)>Math.abs(dy)?dx>0?"right":"left":dy>0?"down":"up";
}
export function facingScore(position:Position, target:Position, facing?:Direction) {
  const dx=target.x-position.x,dy=target.y-position.y;
  return (facing==="up"?-dy:facing==="down"?dy:facing==="left"?-dx:facing==="right"?dx:0)>0?.35:0;
}
export function nearDoor(place:Place,position:Position) {
  return Math.abs(position.x-place.x-place.width/2)<=1.35 &&
    position.y>=place.y+place.height+.3 && position.y<=place.y+place.height+3;
}
export function closestFeature(position:Position,facing?:Direction,previous?:Place|Scenery|null):Place|Scenery|null {
  if(waterDepthAt(position.x,position.y))return null;
  const door=PLACES.find(p=>nearDoor(p,position));
  if(door)return door;
  let best=Infinity,result:Scenery|null=null;
  for(const item of SCENERY){
    if(!item.story&&item.sprite!=="bench")continue;
    const distance=Math.hypot(item.x-position.x,item.y-position.y);
    if(distance>=(item.sprite==="bench"?2.5:2.8))continue;
    if(item.sprite==="bench"&&!benchExit(item,position))continue;
    const score=distance-facingScore(position,item,facing)-(previous===item?.12:0);
    if(score<best){best=score;result=item;}
  }
  return result;
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

// Share the terrain seed between rendering and contact effects.
export function worldHash(x:number,y:number):number {
  let n=Math.imul(x+47,374761393)^Math.imul(y+103,668265263);
  n=Math.imul(n^(n>>>13),1274126177);
  return (n^(n>>>16))>>>0;
}
export function puddleCell(x:number,y:number):boolean {
  const ground=groundAt(x,y);
  return (ground===1||ground===2)&&worldHash(x,y)%49===0&&!shelteredAt(x+.5,y+9/TILE);
}
export function puddleAt(x:number,y:number):boolean {
  const cx=Math.floor(x),cy=Math.floor(y),dx=Math.abs((x-cx)*TILE-8),dy=Math.abs((y-cy)*TILE-9);
  return ((dx<=5&&dy<=2)||(dx<=3&&dy<=3))&&puddleCell(cx,cy);
}

// A single terrain trail follows actual movement, never the held key.
export type SurfaceMark = Position & {
  kind: "water" | "snow" | "puddle"; angle: number; age: number; ttl: number; depth: 0 | 1 | 2;
};
export function advanceSurfaceTrail(marks: SurfaceMark[], previous: Position, current: Position,
  dt: number, surface: SurfaceWeather, motion: boolean): void {
  for (let i = marks.length - 1; i >= 0; i--) {
    const mark = marks[i];
    mark.age += dt;
    if (!motion || mark.age >= mark.ttl || (mark.kind === "snow" && surface.snow < .12) || (mark.kind === "puddle" && surface.wet < .12)) marks.splice(i, 1);
  }
  const dx = current.x - previous.x, dy = current.y - previous.y;
  if (!motion || Math.hypot(dx, dy) < .001) return;
  const depth = waterDepthAt(current.x, current.y);
  const kind = depth ? "water" : surface.snow >= .25 ? "snow" : surface.wet >= .22 && puddleAt(current.x,current.y) ? "puddle" : null;
  if (!kind) return;
  let last: SurfaceMark | undefined;
  for (let i = marks.length - 1; i >= 0; i--) {
    if (marks[i].kind === kind) { last = marks[i]; break; }
  }
  if (last && Math.hypot(last.x - current.x, last.y - current.y) < (kind === "snow" ? .65 : .32)) return;
  if (marks.length >= 96) marks.shift();
  marks.push({ ...current, kind, angle: Math.atan2(dy, dx), age: 0, ttl: kind === "snow" ? 16 : kind === "water" ? 1.25 : .65, depth });
}

// All scene layers must use the same whole-pixel camera offset per frame.
export function snapCamera(camera: Position): Position {
  return { x: Math.round(camera.x), y: Math.round(camera.y) };
}

export function cameraAt(
  position: Position, viewWidth: number, viewHeight: number,
  worldWidth = WORLD_WIDTH * TILE, worldHeight = WORLD_HEIGHT * TILE,
): Position {
  const axis = (target: number, view: number, span: number) =>
    span <= view ? (span - view) / 2 : Math.max(0, Math.min(span - view, target));
  return {
    x: axis(position.x * TILE - viewWidth / 2, viewWidth, worldWidth),
    y: axis(position.y * TILE - viewHeight * 0.7, viewHeight, worldHeight),
  };
}
