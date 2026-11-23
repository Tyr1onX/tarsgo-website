import {
  FOUNTAIN, GROUND_AREAS, PLACES, SCENERY, TILE, WORLD_HEIGHT, WORLD_WIDTH, snapCamera,
  type Direction, type Place, type Position, type PropSprite, type Scenery,
} from "./pixel-jijia-world";

export type SpriteBox = [number, number, number, number];
export type SpriteIndex = Record<string, SpriteBox>;

const PROP_CELLS: Record<PropSprite, number> = {
  bench: 0, lamp: 1, sign: 2, planter: 3,
  oak: 4, lime_tree: 5, cherry: 6, rocks: 7,
  fence: 8, hydrangea: 9, statue: 10, arch: 11,
};
const PROP_CELL = 128;
const GROUND_PATCH = TILE * 8;
const GROUND_EDGE_Y = GROUND_PATCH * 4;
const point = (value: number) => Math.round(value * TILE);

function hash(x: number, y: number) {
  let n = Math.imul(x + 47, 374761393) ^ Math.imul(y + 103, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

function sprite(
  ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, sprites: SpriteIndex,
  name: string, x: number, y: number, width: number, height: number,
) {
  const box = sprites[name];
  if (!box) throw new Error(`像素素材缺失：${name}`);
  ctx.drawImage(atlas, ...box, Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

function ground(ctx: CanvasRenderingContext2D, tiles: HTMLImageElement) {
  const materials = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  for (const area of GROUND_AREAS) {
    for (let y = area.y; y < area.y + area.height; y++) {
      for (let x = area.x; x < area.x + area.width; x++) {
        materials[y * WORLD_WIDTH + x] = area.kind;
      }
    }
  }

  const at = (x: number, y: number) =>
    x >= 0 && x < WORLD_WIDTH && y >= 0 && y < WORLD_HEIGHT ? materials[y * WORLD_WIDTH + x] : 0;

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const kind = at(x, y);
      const variant = hash(Math.floor(x / 8), Math.floor(y / 8)) % 3;
      const destX = point(x), destY = point(y);
      ctx.drawImage(
        tiles, variant * GROUND_PATCH + (x % 8) * TILE,
        kind * GROUND_PATCH + (y % 8) * TILE, TILE, TILE, destX, destY, TILE, TILE,
      );
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
}

function building(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, sprites: SpriteIndex, place: Place, camera: Position) {
  const box = sprites[place.id];
  if (!box) throw new Error(`建筑素材缺失：${place.id}`);
  const width = point(place.width);
  const height = Math.round(width * box[3] / box[2]);
  sprite(
    ctx, atlas, sprites, place.id, point(place.x) - camera.x,
    point(place.y + place.height) - height - camera.y, width, height,
  );
}

function decoration(ctx: CanvasRenderingContext2D, props: HTMLImageElement, object: Scenery, camera: Position) {
  const cell = PROP_CELLS[object.sprite];
  ctx.drawImage(
    props, (cell % 4) * PROP_CELL, Math.floor(cell / 4) * PROP_CELL,
    PROP_CELL, PROP_CELL,
    Math.round(point(object.x) - object.width / 2 - camera.x),
    Math.round(point(object.y) - object.height - camera.y),
    object.width, object.height,
  );
}

function fountain(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, sprites: SpriteIndex, camera: Position) {
  sprite(ctx, atlas, sprites, "fountain",
    point(FOUNTAIN.x) - 48 - camera.x, point(FOUNTAIN.y) - 50 - camera.y, 96, 96);
}

// Sorting by ground contact rather than top-left image coordinates makes scenery
// and buildings share the same top-down depth rules.
type SceneNode =
  | { kind: "building"; y: number; x: number; value: Place }
  | { kind: "prop"; y: number; x: number; value: Scenery }
  | { kind: "fountain"; y: number; x: number };
const NODES: SceneNode[] = [
  ...PLACES.map(p => ({ kind: "building" as const, y: p.y + p.height, x: p.x + p.width / 2, value: p })),
  ...SCENERY.map(p => ({ kind: "prop" as const, y: p.y, x: p.x, value: p })),
  { kind: "fountain" as const, x: FOUNTAIN.x, y: FOUNTAIN.y + 2.4 },
].sort((a, b) => a.y - b.y);

function drawNode(ctx: CanvasRenderingContext2D, node: SceneNode, atlas: HTMLImageElement,
  sprites: SpriteIndex, props: HTMLImageElement, camera: Position) {
  if (node.kind === "building") building(ctx, atlas, sprites, node.value, camera);
  else if (node.kind === "prop") decoration(ctx, props, node.value, camera);
  else fountain(ctx, atlas, sprites, camera);
}

export function renderTerrain(tiles: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WORLD_WIDTH * TILE;
  canvas.height = WORLD_HEIGHT * TILE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("地图画布不可用");
  ctx.imageSmoothingEnabled = false;
  ground(ctx, tiles);
  return canvas;
}

export function renderTown(
  terrain: HTMLCanvasElement, atlas: HTMLImageElement, sprites: SpriteIndex, props: HTMLImageElement,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = terrain.width;
  canvas.height = terrain.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("地图画布不可用");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(terrain, 0, 0);
  for (const node of NODES) drawNode(ctx, node, atlas, sprites, props, { x: 0, y: 0 });
  return canvas;
}

export function renderScene(
  ctx: CanvasRenderingContext2D, terrain: HTMLCanvasElement,
  atlas: HTMLImageElement, sprites: SpriteIndex, props: HTMLImageElement,
  characterSheet: HTMLImageElement, player: Position, direction: Direction,
  walking: boolean, traveled: number, camera: Position,
) {
  const screenCamera = snapCamera(camera);
  ctx.drawImage(terrain, -screenCamera.x, -screenCamera.y);
  let playerDrawn = false;
  for (const node of NODES) {
    if (!playerDrawn && node.y > player.y) {
      renderExplorer(ctx, characterSheet, player, direction, walking, traveled, screenCamera);
      playerDrawn = true;
    }
    drawNode(ctx, node, atlas, sprites, props, screenCamera);
  }
  if (!playerDrawn) renderExplorer(ctx, characterSheet, player, direction, walking, traveled, screenCamera);
}

const EXPLORER_ROWS: Record<Direction, number> = { down: 0, left: 1, right: 2, up: 3 };
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
