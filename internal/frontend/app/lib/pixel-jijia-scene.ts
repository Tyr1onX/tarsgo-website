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

type GroundKind = 0 | 1 | 2 | 3; // grass, path, plaza, water
const GROUND_PATCH = TILE * 8;
const GROUND_EDGE_Y = GROUND_PATCH * 4;

function ground(ctx: CanvasRenderingContext2D, tiles: HTMLImageElement): Uint8Array {
  // Each cell has one ground material; transitions are derived from its neighbors.
  const materials = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  const paint = (kind: GroundKind, x: number, y: number, width: number, height: number) => {
    for (let row = y; row < y + height; row++) {
      for (let col = x; col < x + width; col++) {
        materials[row * WORLD_WIDTH + col] = kind;
      }
    }
  };

  for (const [x, y, width, height] of [
    [0, 28, 96, 7], [44, 17, 8, 40], [18, 19, 7, 28],
    [73, 19, 7, 28], [18, 47, 61, 7], [34, 16, 29, 6],
  ]) paint(1, x, y, width, height);
  paint(2, 32, 23, 32, 23);
  for (const [x, y, width, height] of [[3, 28, 9, 6], [84, 28, 9, 6]]) {
    paint(2, x - 1, y - 1, width + 2, height + 2);
    paint(3, x, y, width, height);
  }

  const at = (x: number, y: number) =>
    x >= 0 && x < WORLD_WIDTH && y >= 0 && y < WORLD_HEIGHT
      ? materials[y * WORLD_WIDTH + x] : 0;

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const kind = at(x, y) as GroundKind;
      // Each 8×8-cell patch comes from the original generated terrain artwork.
      const variant = hash(Math.floor(x / 8), Math.floor(y / 8)) % 3;
      const sourceX = variant * GROUND_PATCH + (x % 8) * TILE;
      const sourceY = kind * GROUND_PATCH + (y % 8) * TILE;
      const destX = point(x), destY = point(y);
      ctx.drawImage(tiles, sourceX, sourceY, TILE, TILE, destX, destY, TILE, TILE);

      // Draw reusable pixel-art edge sprites only on real material boundaries.
      if (kind === 0) continue;
      const borders = (neighbor: number) =>
        neighbor !== kind && (kind !== 1 || neighbor === 0) && !(kind === 2 && neighbor === 3);
      for (const [side, nx, ny] of [[0, x, y - 1], [1, x, y + 1], [2, x - 1, y], [3, x + 1, y]]) {
        if (borders(at(nx, ny))) {
          ctx.drawImage(tiles, ((kind - 1) * 4 + side) * TILE, GROUND_EDGE_Y, TILE, TILE, destX, destY, TILE, TILE);
        }
      }
    }
  }
  return materials;
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

function props(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, sprites: SpriteIndex, materials: Uint8Array) {
  TREES.forEach((where, index) => tree(ctx, atlas, sprites, where, index));
  for (let i = 0; i < 24; i++) {
    const x = 2 + hash(i, 13) % 92;
    const y = 3 + hash(i, 97) % 57;
    // Shrubs belong on grass, not over walkways or in front of building doors.
    const onGrass = (col: number, row: number) =>
      col > 0 && col < WORLD_WIDTH && row > 0 && row < WORLD_HEIGHT
      && materials[row * WORLD_WIDTH + col] === 0;
    if (![[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => onGrass(x + dx, y + dy))) continue;
    if (PLACES.some(p => x > p.x - 2 && x < p.x + p.width + 2 && y > p.y - 2 && y < p.y + p.height + 2)) continue;
    const name = i % 4 === 0 ? "pink_bush" : "green_bush";
    sprite(ctx, atlas, sprites, name, point(x), point(y), 25, 18);
  }

  sprite(ctx, atlas, sprites, "fountain", point(48) - 45, point(31.5) - 51, 90, 90);

}

export function renderTown(atlas: HTMLImageElement, sprites: SpriteIndex, tiles: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WORLD_WIDTH * TILE;
  canvas.height = WORLD_HEIGHT * TILE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("地图画布不可用");
  ctx.imageSmoothingEnabled = false;
  const materials = ground(ctx, tiles);
  PLACES.forEach((place) => building(ctx, atlas, sprites, place));
  props(ctx, atlas, sprites, materials);
  return canvas;
}

const EXPLORER_ROWS: Record<Direction, number> = {
  down: 0, left: 1, right: 2, up: 3,
};
const EXPLORER_FRAME_WIDTH = 40;
const EXPLORER_FRAME_HEIGHT = 54;

export function renderExplorer(
  ctx: CanvasRenderingContext2D, characterSheet: HTMLImageElement,
  player: Position, direction: Direction, walking: boolean, traveled: number, camera: Position,
) {
  const footX = Math.round(player.x * TILE - camera.x);
  const footY = Math.round(player.y * TILE - camera.y);
  const frame = walking ? Math.floor(traveled / 0.5) % 4 : 0;
  ctx.fillStyle = "rgba(44, 66, 48, 0.20)";
  ctx.beginPath();
  ctx.ellipse(footX, footY - 2, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(
    characterSheet,
    frame * EXPLORER_FRAME_WIDTH, EXPLORER_ROWS[direction] * EXPLORER_FRAME_HEIGHT,
    EXPLORER_FRAME_WIDTH, EXPLORER_FRAME_HEIGHT,
    footX - 20, footY - 54, 40, 54,
  );
}
