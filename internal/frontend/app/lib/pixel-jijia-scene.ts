import { PLACES, TILE, TREES, WORLD_HEIGHT, WORLD_WIDTH, type Direction, type Position, type Place } from "./pixel-jijia-world";

const px = (tile: number) => tile * TILE;
const colors = {
  pavement: "#d4c9ab", grass: "#688b65", deepGreen: "#3c6b59",
};

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function tile(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, col: number, row: number, x: number, y: number) {
  ctx.drawImage(atlas, col * 16, row * 16, 16, 16, x, y, 16, 16);
}

function noise(x: number, y: number): number {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

function lawn(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  x = px(x); y = px(y); w = px(w); h = px(h);
  rect(ctx, x - 3, y - 3, w + 6, h + 6, "#edf0d2");
  rect(ctx, x, y, w, h, colors.deepGreen);
  rect(ctx, x + 3, y + 3, w - 6, h - 6, colors.grass);
  for (let j = 6; j < h - 6; j += 12) {
    for (let i = 5; i < w - 6; i += 15) {
      const n = noise(i + x, j + y);
      if (n % 5 === 0) {
        rect(ctx, x + i, y + j, 2, 4, "#9db77b");
        rect(ctx, x + i + 2, y + j + 2, 3, 2, "#416d53");
      } else if (n % 27 === 0) {
        rect(ctx, x + i, y + j, 3, 3, "#edc576");
      }
    }
  }
}

function water(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  x = px(x); y = px(y); w = px(w); h = px(h);
  rect(ctx, x - 5, y - 5, w + 10, h + 10, "#efe9c9");
  rect(ctx, x - 2, y - 2, w + 4, h + 4, "#567e78");
  rect(ctx, x, y, w, h, "#389b9c");
  rect(ctx, x + 6, y + 6, w - 12, h - 12, "#65c9c6");
  for (let j = 12; j < h - 12; j += 17) {
    for (let i = 11; i < w - 10; i += 21) {
      if (noise(i, j) % 3 === 0) {
        rect(ctx, x + i, y + j, 10, 2, "#b7f0d6");
        rect(ctx, x + i + 4, y + j + 4, 8, 1, "#389b9c");
      }
    }
  }
}

function tree(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, x: number, y: number, type: number) {
  const X = px(x), Y = px(y);
  rect(ctx, X - 10, Y + 4, 32, 7, "#263c3766");
  const row = 10;
  const col = type % 3 === 2 ? 17 : 16;
  // Each atlas tile already contains a complete tree, not two stacked halves.
  ctx.drawImage(atlas, col * 16, row * 16, 16, 16, X - 13, Y - 40, 42, 56);
}

function flowerBed(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  rect(ctx, x, y + 7, w, 4, "#4f4d43");
  rect(ctx, x, y, w, 8, "#395e55");
  for (let i = 3; i < w - 2; i += 7) {
    rect(ctx, x + i, y + (i % 3), 4, 4, i % 2 ? "#ffe6ae" : "#e8a88c");
    rect(ctx, x + i + 1, y - 2, 2, 2, "#e9e2ab");
  }
}

function bench(ctx: CanvasRenderingContext2D, x: number, y: number) {
  rect(ctx, x + 4, y + 11, 37, 6, "#423e3e");
  rect(ctx, x, y + 2, 45, 8, "#9b6750");
  rect(ctx, x + 3, y, 39, 3, "#e1a778");
  rect(ctx, x + 4, y + 16, 4, 8, "#464a45");
  rect(ctx, x + 35, y + 16, 4, 8, "#464a45");
}

function lamp(ctx: CanvasRenderingContext2D, x: number, y: number) {
  rect(ctx, x + 2, y + 8, 4, 38, "#40545c");
  rect(ctx, x - 2, y + 42, 12, 3, "#40545c");
  rect(ctx, x - 6, y + 2, 20, 8, "#475c65");
  rect(ctx, x - 3, y + 5, 14, 5, "#fee4a5");
  rect(ctx, x - 1, y, 10, 3, "#e2b671");
}

function pennants(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string) {
  rect(ctx, x, y, w, 2, "#e9dbc1");
  for (let i = 6; i < w - 4; i += 14) {
    rect(ctx, x + i, y + 3, 9, 9, i % 2 ? color : "#eee6b9");
    rect(ctx, x + i + 2, y + 12, 5, 3, i % 2 ? color : "#eee6b9");
  }
}

function robot(ctx: CanvasRenderingContext2D, x: number, y: number, size = 1) {
  const X = Math.round(x), Y = Math.round(y);
  rect(ctx, X + 2 * size, Y + 22 * size, 32 * size, 6 * size, "#5b5951");
  rect(ctx, X + 5 * size, Y + 19 * size, 26 * size, 6 * size, "#283e45");
  rect(ctx, X + 6 * size, Y + 6 * size, 24 * size, 15 * size, "#ad644b");
  rect(ctx, X + 9 * size, Y + 9 * size, 18 * size, 9 * size, "#dbbd8b");
  rect(ctx, X + 13 * size, Y + 10 * size, 4 * size, 4 * size, "#3d737e");
  rect(ctx, X + 21 * size, Y + 10 * size, 4 * size, 4 * size, "#3d737e");
  rect(ctx, X + 16 * size, Y, 4 * size, 8 * size, "#5c6060");
  rect(ctx, X + 15 * size, Y - 3 * size, 6 * size, 5 * size, "#e2b970");
  rect(ctx, X + 3 * size, Y + 23 * size, 5 * size, 6 * size, "#253a46");
  rect(ctx, X + 27 * size, Y + 23 * size, 5 * size, 6 * size, "#253a46");
}

function building(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, p: Place, index: number) {
  const x = px(p.x), y = px(p.y), w = px(p.width), h = px(p.height);
  const facadeY = y + 75;
  const facadeH = h - 78;
  const themes = [
    ["#516e75", "#2b4754", "#e2c49a", "#365865", "#efbb7a"],
    ["#8a4c4c", "#62353c", "#e7ceb1", "#574250", "#f9da91"],
    ["#4e6680", "#2f445e", "#d5dcce", "#42698a", "#a8d9dd"],
    ["#477780", "#325962", "#e3d8c3", "#27536e", "#9fd7c4"],
    ["#ae6a52", "#7c4d41", "#efcdaa", "#784750", "#f6d9a2"],
    ["#65608e", "#424467", "#d4d2e7", "#4c547c", "#c1b9f6"],
  ];
  const [roof, roofDark, wall, trim, light] = themes[index];
  // Shadow, narrow foundation and colorful deep roof.
  rect(ctx, x + 11, y + h - 3, w + 15, 17, "#54565d5e");
  rect(ctx, x - 5, facadeY + 7, w + 10, facadeH - 4, "#433f44");
  rect(ctx, x, facadeY, w, facadeH, wall);
  for (let yy = facadeY + 8; yy < y + h - 3; yy += 18) {
    rect(ctx, x + 3, yy, w - 6, 2, index % 2 ? "#c3af9c" : "#bdc8bf");
    for (let xx = x + 10 + (yy % 3) * 8; xx < x + w - 6; xx += 39) {
      rect(ctx, xx, yy + 2, 2, 15, "#b4a5a3");
    }
  }
  rect(ctx, x - 8, y + 3, w + 16, 84, roofDark);
  rect(ctx, x - 5, y + 8, w + 10, 72, roof);
  for (let yy = y + 11; yy < y + 78; yy += 12) {
    rect(ctx, x - 1, yy, w + 2, 3, roofDark);
    for (let xx = x + 7 + (yy % 3) * 5; xx < x + w - 5; xx += 28) {
      rect(ctx, xx, yy + 3, 3, 6, roofDark);
    }
  }
  rect(ctx, x - 11, y + 78, w + 22, 8, trim);
  rect(ctx, x - 8, y + 86, w + 16, 4, "#f1e4c8");
  rect(ctx, x - 9, y + h - 6, w + 18, 6, "#69615c");
  rect(ctx, x - 7, y + h, w + 14, 4, "#f4e6c4");

  // Vertical wall bays and windows.
  for (let i = 0; i < 4; i++) {
    const ww = Math.floor((w - 94) / 4);
    const xx = x + 19 + i * (ww + 17);
    rect(ctx, xx - 4, facadeY + 15, ww + 8, 41, trim);
    rect(ctx, xx, facadeY + 19, ww, 29, "#2c4c5c");
    rect(ctx, xx + 3, facadeY + 22, ww - 6, 20, "#82b7ba");
    rect(ctx, xx + 3, facadeY + 22, Math.max(4, ww - 8), 5, "#c6e2cf");
    rect(ctx, xx + Math.floor(ww / 2), facadeY + 21, 2, 23, "#e0e9dc");
    rect(ctx, xx - 5, facadeY + 50, ww + 10, 6, "#6b706a");
  }

  // The door has a physical walk-up point on the south edge.
  const doorX = x + w / 2 - 18;
  rect(ctx, doorX - 7, facadeY + 29, 50, facadeH - 33, "#3a424a");
  rect(ctx, doorX, facadeY + 34, 36, facadeH - 38, "#224e59");
  rect(ctx, doorX + 3, facadeY + 38, 13, facadeH - 49, "#648d97");
  rect(ctx, doorX + 20, facadeY + 38, 13, facadeH - 49, "#648d97");
  rect(ctx, doorX + 17, facadeY + 36, 2, facadeH - 40, "#ebdcb8");
  rect(ctx, doorX + 13, facadeY + 61, 2, 5, light);
  rect(ctx, doorX + 22, facadeY + 61, 2, 5, light);
  rect(ctx, doorX - 12, y + h + 3, 60, 6, "#a99d8e");
  rect(ctx, doorX - 18, y + h + 9, 72, 5, "#e4d9bc");

  // The illuminated sign lives on the facade rather than floating in the road.
  const labelW = Math.min(w - 52, 212);
  const labelX = x + (w - labelW) / 2;
  rect(ctx, labelX - 5, y + 88, labelW + 10, 34, roofDark);
  rect(ctx, labelX - 2, y + 91, labelW + 4, 28, trim);
  rect(ctx, labelX, y + 94, labelW, 22, "#142e3a");
  ctx.textAlign = "center";
  ctx.fillStyle = light;
  ctx.font = "bold 15px system-ui, sans-serif";
  ctx.fillText(p.title, x + w / 2, y + 110);
  ctx.textAlign = "left";
  pennants(ctx, x + 12, y + 83, w - 24, roofDark);

  if (index === 0) { // Workshop tooling and a garage.
    rect(ctx, x + 9, facadeY + 66, 55, facadeH - 69, "#53656e");
    for (let i = 0; i < 4; i++) rect(ctx, x + 13, facadeY + 69 + i * 11, 46, 3, "#95a9ac");
  } else if (index === 1) { // Honor hall with gold columns.
    for (const offset of [8, 64, w - 69, w - 13]) {
      rect(ctx, x + offset, facadeY + 8, 9, facadeH - 8, "#faebce");
      rect(ctx, x + offset - 3, facadeY + 4, 15, 6, "#bfa677");
    }
    for (const offset of [w * 0.19, w * 0.82]) {
      rect(ctx, x + offset, y + 36, 8, 24, "#ecd27e");
      rect(ctx, x + offset + 2, y + 42, 4, 12, "#ffeab5");
    }
  } else if (index === 2) { // A control antenna.
    rect(ctx, x + 29, y - 22, 5, 30, "#4b667a");
    rect(ctx, x + 19, y - 18, 24, 5, "#a7d5da");
    rect(ctx, x + 30, y - 29, 3, 13, "#d7a77c");
  } else if (index === 3) { // Vision camera array.
    for (const offset of [35, w - 40]) {
      rect(ctx, x + offset, y - 9, 6, 16, "#3b4656");
      rect(ctx, x + offset - 8, y - 15, 22, 8, "#5c8294");
      rect(ctx, x + offset - 3, y - 13, 5, 5, "#a1d4e0");
    }
  } else if (index === 4) { // Guild's bulletin and doorway awning.
    rect(ctx, x + 9, facadeY + 56, 51, 34, "#4a5250");
    rect(ctx, x + 13, facadeY + 59, 43, 25, "#dfc59c");
    for (let k = 0; k < 3; k++) rect(ctx, x + 18 + k * 11, facadeY + 64 + k * 3, 8, 12, "#ba7359");
  } else { // AI research satellite dish.
    rect(ctx, x + w - 46, y - 15, 4, 25, "#5d5c8e");
    rect(ctx, x + w - 65, y - 21, 42, 6, "#a5a0d2");
    rect(ctx, x + w - 57, y - 27, 24, 7, "#d1c7ec");
  }
  // Signs and flower planters at ground level.
  flowerBed(ctx, x + 8, y + h + 9, 52);
  flowerBed(ctx, x + w - 60, y + h + 9, 52);
}

function plaza(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement) {
  const x = px(32), y = px(23), w = px(32), h = px(23);
  rect(ctx, x - 8, y - 8, w + 16, h + 16, "#6f8377");
  rect(ctx, x - 3, y - 3, w + 6, h + 6, "#eee3ca");
  rect(ctx, x, y, w, h, "#c6baa0");
  for (let ty = 0; ty < 23; ty++) {
    for (let tx = 0; tx < 32; tx++) {
      const xx = x + tx * 16, yy = y + ty * 16;
      tile(ctx, atlas, 1, 4, xx, yy);
      if ((tx + ty) % 7 === 0) rect(ctx, xx + 10, yy + 6, 2, 2, "#c6ac87");
    }
  }
  rect(ctx, x + 16, y + 18, w - 32, 4, "#efe2c0");
  rect(ctx, x + 16, y + h - 22, w - 32, 4, "#efe2c0");
  rect(ctx, x + 12, y + 18, 4, h - 36, "#efe2c0");
  rect(ctx, x + w - 16, y + 18, 4, h - 36, "#efe2c0");
  // Circular fountain with transparent blue water and a robot monument.
  const cx = px(48), cy = px(31.5);
  rect(ctx, cx - 38, cy - 25, 76, 53, "#827a71");
  rect(ctx, cx - 36, cy - 31, 72, 57, "#eee3c9");
  rect(ctx, cx - 30, cy - 23, 60, 41, "#347f89");
  rect(ctx, cx - 25, cy - 18, 50, 31, "#6cbdbb");
  for (let i = -16; i <= 16; i += 16) {
    rect(ctx, cx + i, cy - 13 + (i % 7), 9, 3, "#b9edcd");
  }
  robot(ctx, cx - 20, cy - 30, 1);
  rect(ctx, cx - 28, cy + 20, 56, 13, "#4a666b");
  ctx.fillStyle = "#f4d891";
  ctx.font = "bold 10px monospace";
  ctx.fillText("TARSGO", cx - 22, cy + 30);

  for (const k of [[x + 30, y + 40], [x + w - 76, y + 42], [x + 28, y + h - 65], [x + w - 75, y + h - 65]]) {
    bench(ctx, k[0], k[1]);
  }
  for (const k of [[x + 10, y + 25], [x + w - 18, y + 25], [x + 10, y + h - 45], [x + w - 18, y + h - 45]]) {
    lamp(ctx, k[0], k[1]);
  }
}

function worldGround(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement) {
  const w = px(WORLD_WIDTH), h = px(WORLD_HEIGHT);
  rect(ctx, 0, 0, w, h, colors.pavement);
  for (let y = 0; y < h; y += 16) {
    for (let x = 0; x < w; x += 16) {
      const n = noise(x / 16, y / 16);
      tile(ctx, atlas, n % 13 === 0 ? 1 : 0, 4, x, y);
      if (n % 23 === 0) rect(ctx, x + 7, y + 10, 2, 2, "#8b8b82");
    }
  }

  // Green campuses surrounding a compact, connected paved town.
  for (const area of [
    [1, 1, 35, 7], [60, 1, 35, 7],
    [1, 10, 6, 15], [29, 10, 7, 13], [60, 10, 7, 13], [89, 10, 6, 15],
    [1, 36, 6, 25], [29, 36, 7, 25], [60, 36, 7, 25], [89, 36, 6, 25],
    [1, 55, 35, 7], [60, 55, 35, 7],
  ]) lawn(ctx, area[0], area[1], area[2], area[3]);

  // Two broad east-west pedestrian streets and the main north-south avenue.
  for (const [x, y, ww, hh] of [
    [0, 26, 96, 9], [44, 8, 8, 52], [18, 19, 7, 28], [73, 19, 7, 28],
    [18, 47, 58, 7],
  ]) {
    rect(ctx, px(x) - 3, px(y) - 3, px(ww) + 6, px(hh) + 6, "#768c87");
    rect(ctx, px(x), px(y), px(ww), px(hh), "#bec3bd");
    for (let yy = y; yy < y + hh; yy++) {
      for (let xx = x; xx < x + ww; xx++) {
        const tx = px(xx), ty = px(yy);
        rect(ctx, tx, ty, 16, 16, "#858f90");
        rect(ctx, tx + 1, ty + 1, 15, 14, noise(xx, yy) % 6 === 0 ? "#c0c4b6" : "#aeb7b0");
        if ((xx + yy) % 4 === 0) rect(ctx, tx + 6, ty + 7, 4, 1, "#d1d4c6");
      }
    }
  }

  // Decorative water gardens on both sides of the square.
  water(ctx, 4, 27.5, 10, 6);
  water(ctx, 83, 27.5, 9, 6);
  for (const [x, y] of [[2, 25], [12, 36], [88, 25], [81, 35]]) flowerBed(ctx, px(x), px(y), 62);
  plaza(ctx, atlas);

  // Pedestrian zebra stripes and border paving at paths.
  for (const x of [20, 47, 77]) {
    for (let i = -3; i <= 3; i++) rect(ctx, px(x + i) + 1, px(33.7), 10, 4, "#ede5d1");
  }
}

function props(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement) {
  TREES.forEach((p, i) => tree(ctx, atlas, p.x, p.y, i % 3));
  // Around the center: lamps, bikes, flower pots, robots, notice board, art.
  for (const [x, y] of [[31, 24], [64, 24], [31, 44], [64, 44], [8, 24], [88, 24], [8, 42], [88, 42]]) lamp(ctx, px(x), px(y));
  for (const [x, y] of [[27, 16], [67, 16], [27, 49], [67, 49], [37, 27], [56, 27], [39, 42], [54, 42]]) bench(ctx, px(x), px(y));
  for (const [x, y] of [[8, 23], [87, 23], [8, 54], [87, 54], [34, 26], [58, 26], [34, 42], [58, 42]]) flowerBed(ctx, px(x), px(y), 70);

  // Small robots parked along the roadway.
  robot(ctx, px(33), px(33.8));
  robot(ctx, px(61), px(35.5));
  // A welcome noticeboard and colored little banners.
  rect(ctx, px(38), px(20), 95, 54, "#444b53");
  rect(ctx, px(38) + 5, px(20) + 5, 85, 43, "#d1a473");
  rect(ctx, px(38) + 9, px(20) + 9, 77, 32, "#eee3cb");
  ctx.font = "bold 12px system-ui";
  ctx.fillStyle = "#324e4d";
  ctx.fillText("欢迎来到吉甲", px(38) + 12, px(20) + 28);
  pennants(ctx, px(37), px(18), 150, "#cc8165");

  // Passersby: matching CC0 urban characters, each occupies a 16px tile.
  for (const [x, y, col, row] of [
    [16, 25, 23, 1], [79, 25, 24, 4], [32, 38, 25, 2],
    [66, 39, 23, 8], [59, 26, 26, 0], [24, 38, 25, 7],
    [47, 21, 24, 3], [44, 22, 25, 0], [52, 22, 23, 6], [41, 26, 24, 4], [55, 44, 26, 6],
  ]) {
    rect(ctx, px(x) + 1, px(y) + 14, 14, 3, "#464e5160");
    tile(ctx, atlas, col, row, px(x), px(y));
  }
}

export function renderTown(atlas: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WORLD_WIDTH * TILE;
  canvas.height = WORLD_HEIGHT * TILE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("地图画布不可用");
  ctx.imageSmoothingEnabled = false;
  worldGround(ctx, atlas);
  PLACES.forEach((place, i) => building(ctx, atlas, place, i));
  props(ctx, atlas);
  return canvas;
}

export function renderExplorer(
  ctx: CanvasRenderingContext2D, atlas: HTMLImageElement,
  player: Position, direction: Direction, walking: boolean, elapsed: number, camera: Position,
) {
  const x = Math.round(px(player.x) - camera.x - 8);
  const y = Math.round(px(player.y) - camera.y - 16);
  const bob = walking ? Math.floor(Math.sin(elapsed * 16) * 1.5) : 0;
  rect(ctx, x + 2, y + 15, 13, 4, "#212a2b65");
  const col = direction === "up" ? 25 : direction === "left" ? 24 : direction === "right" ? 26 : 23;
  const row = walking ? Math.floor(elapsed * 9) % 3 : 0;
  tile(ctx, atlas, col, row, x, y - bob);
  // Small yellow marker makes the player recognizable in busy scenery.
  rect(ctx, x + 6, y - 8 - bob, 5, 5, "#f8d378");
  rect(ctx, x + 7, y - 5 - bob, 3, 3, "#f8d378");
}
