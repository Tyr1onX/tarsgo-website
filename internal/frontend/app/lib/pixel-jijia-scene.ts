import { PLACES, TILE, TREES, WORLD_HEIGHT, WORLD_WIDTH, type Direction, type Place, type Position } from "./pixel-jijia-world";

export type SpriteBox = [number, number, number, number];
export type SpriteIndex = Record<string, SpriteBox>;

function sprite(
  ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, sprites: SpriteIndex,
  name: string, x: number, y: number, w: number, h: number,
) {
  const box = sprites[name];
  if (!box) throw new Error(`像素素材缺失：${name}`);
  ctx.drawImage(atlas, box[0], box[1], box[2], box[3], Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

const point = (v: number) => Math.round(v * TILE);
function hash(x: number, y: number) {
  let n = Math.imul(x + 47, 374761393) ^ Math.imul(y + 103, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

function terrainTile(
  ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, sprites: SpriteIndex,
  kind: string, x: number, y: number,
) {
  const rotation = kind === "water" ? 0 : hash(x, y) % 4;
  ctx.save();
  ctx.translate(point(x) + TILE / 2, point(y) + TILE / 2);
  ctx.rotate(rotation * Math.PI / 2);
  sprite(ctx, atlas, sprites, `terrain_${kind}`, -TILE / 2, -TILE / 2, TILE, TILE);
  ctx.restore();
}

function drawPatch(
  ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, sprites: SpriteIndex,
  kind: string, x: number, y: number, w: number, h: number,
) {
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      terrainTile(ctx, atlas, sprites, kind, col, row);
    }
  }
}

function ground(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, sprites: SpriteIndex) {
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const n = hash(x, y);
      const variant = n % 29 === 0 ? "flowers1" : n % 43 === 0 ? "flowers2" : n % 7 === 0 ? "grass2" : "grass";
      terrainTile(ctx, atlas, sprites, variant, x, y);
    }
  }

  // The paths are tiled from generated source imagery rather than hand-drawn rectangles.
  for (const [x, y, w, h] of [
    [0, 28, 96, 7], [44, 17, 8, 40], [18, 19, 7, 28], [73, 19, 7, 28],
    [18, 47, 61, 7], [34, 16, 29, 6],
  ]) drawPatch(ctx, atlas, sprites, "soil", x, y, w, h);

  drawPatch(ctx, atlas, sprites, "stone", 32, 23, 32, 23);
  for (let i = 0; i < 32; i++) {
    terrainTile(ctx, atlas, sprites, "stone2", 32 + i, 23);
    terrainTile(ctx, atlas, sprites, "stone2", 32 + i, 45);
  }
  for (const [x, y, w, h] of [[3, 28, 9, 6], [84, 28, 9, 6]]) {
    drawPatch(ctx, atlas, sprites, "stone2", x - 1, y - 1, w + 2, h + 2);
    drawPatch(ctx, atlas, sprites, "water", x, y, w, h);
  }
}

function building(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, sprites: SpriteIndex, place: Place) {
  const box = sprites[place.id];
  if (!box) throw new Error(`建筑素材缺失：${place.id}`);
  const w = point(place.width);
  const h = Math.round(w * box[3] / box[2]);
  const x = point(place.x);
  const y = point(place.y + place.height) - h;
  sprite(ctx, atlas, sprites, place.id, x, y, w, h);
}

function tree(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, sprites: SpriteIndex, where: Position, index: number) {
  const names = ["green_tree", "green_tree", "pink_tree", "orange_tree", "green_tree", "spruce"];
  const name = names[index % names.length];
  const box = sprites[name];
  const width = name === "spruce" ? 50 : 67;
  const height = Math.round(width * box[3] / box[2]);
  sprite(ctx, atlas, sprites, name, point(where.x) - width / 2, point(where.y) - height + 5, width, height);
}

function props(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, sprites: SpriteIndex) {
  TREES.forEach((where, index) => tree(ctx, atlas, sprites, where, index));
  for (const [x, y] of [[29, 23], [64, 23], [29, 44], [64, 44], [8, 23], [88, 23]]) {
    sprite(ctx, atlas, sprites, "lamp", point(x), point(y) - 30, 19, 47);
  }
  for (const [x, y] of [[33, 26], [58, 26], [34, 42], [58, 42], [26, 17], [67, 17]]) {
    sprite(ctx, atlas, sprites, "bench", point(x), point(y), 51, 28);
  }
  for (const [x, y] of [[10, 23], [86, 23], [10, 44], [86, 44]]) {
    sprite(ctx, atlas, sprites, "fence", point(x), point(y), 84, 18);
  }
  for (let i = 0; i < 34; i++) {
    const x = 2 + hash(i, 13) % 92;
    const y = 3 + hash(i, 97) % 57;
    if (x > 30 && x < 65 && y > 20 && y < 47) continue;
    const name = i % 4 === 0 ? "pink_bush" : "green_bush";
    sprite(ctx, atlas, sprites, name, point(x), point(y), 25, 18);
  }

  sprite(ctx, atlas, sprites, "fountain", point(48) - 45, point(31.5) - 51, 90, 90);
  sprite(ctx, atlas, sprites, "robot", point(32), point(34), 47, 60);
  sprite(ctx, atlas, sprites, "robot", point(62), point(35), 42, 54);

  sprite(ctx, atlas, sprites, "noticeboard", point(38), point(21) - 12, 74, 54);
  for (const [x, y, direction] of [
    [17, 26, "down"], [78, 26, "left"], [31, 38, "right"], [66, 39, "up"],
    [57, 26, "down"], [24, 38, "left"], [55, 44, "down"],
  ] as const) {
    sprite(ctx, atlas, sprites, `hero_${direction}`, point(x) - 11, point(y) - 28, 22, 31);
  }
}

export function renderTown(atlas: HTMLImageElement, sprites: SpriteIndex): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WORLD_WIDTH * TILE;
  canvas.height = WORLD_HEIGHT * TILE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("地图画布不可用");
  ctx.imageSmoothingEnabled = false;
  ground(ctx, atlas, sprites);
  PLACES.forEach((place) => building(ctx, atlas, sprites, place));
  props(ctx, atlas, sprites);
  return canvas;
}

export function renderExplorer(
  ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, sprites: SpriteIndex,
  player: Position, direction: Direction, walking: boolean, elapsed: number, camera: Position,
) {
  const bob = walking ? Math.sin(elapsed * 17) * 1.1 : 0;
  sprite(ctx, atlas, sprites, `hero_${direction}`,
    player.x * TILE - camera.x - 12,
    player.y * TILE - camera.y - 31 + bob,
    25, 34);
}
