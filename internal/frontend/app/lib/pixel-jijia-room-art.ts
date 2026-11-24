import { TILE, type Position } from "./pixel-jijia-world.ts";
import type { RoomObject, RoomScene } from "./pixel-jijia-room.ts";
import type { WeatherKind } from "./pixel-jijia-climate.ts";

export const ROOM_ART_SCALE = 2;
const ink = "#293b3e"; // shared muted campus outline
type Paint = (x: number, y: number, w: number, h: number, color: string) => void;

function shade(color: string, n: number) {
  return "#" + [1, 3, 5].map(i => Math.max(0, Math.min(255, parseInt(color.slice(i, i + 2), 16) + n)).toString(16).padStart(2, "0")).join("");
}
function painter(ctx: CanvasRenderingContext2D): Paint {
  return (x, y, w, h, color) => {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x * 2) / 2, Math.round(y * 2) / 2, Math.max(.5, Math.round(w * 2) / 2), Math.max(.5, Math.round(h * 2) / 2));
  };
}
function bitmap(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w * ROOM_ART_SCALE);
  canvas.height = Math.ceil(h * ROOM_ART_SCALE);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(ROOM_ART_SCALE, ROOM_ART_SCALE);
  return { canvas, p: painter(ctx) };
}
function panel(p: Paint, x: number, y: number, w: number, h: number, color: string) {
  p(x, y, w, h, ink);
  p(x + 1, y + 1, w - 2, h - 2, color);
  p(x + 1, y + 1, w - 2, 1, shade(color, 34));
  p(x + 1, y + 2, 1, h - 3, shade(color, 17));
  p(x + 2, y + h - 2, w - 3, 1, shade(color, -24));
  p(x + w - 2, y + 2, 1, h - 3, shade(color, -19));
}
function line(p: Paint, x: number, y: number, X: number, Y: number, c: string, size = 1) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(X - x), Math.abs(Y - y)) * 2));
  for (let i = 0; i <= n; i++) p(x + (X - x) * i / n, y + (Y - y) * i / n, size, size, c);
}
function oval(p: Paint, x: number, y: number, r: number, color: string, ratio = 1) {
  for (let d = -r; d <= r; d += .5) {
    const a = Math.sqrt(Math.max(0, r * r - d * d));
    p(x - a, y + d * ratio, a * 2 + .5, .5, color);
  }
}
// A lit upper surface, bevel and recessed front are separate pixel planes.
function desk(p: Paint, w: number, h: number, y: number, color: string) {
  const depth = Math.min(24, h * .32), front = y + h - depth;
  panel(p, 0, y, w, h, shade(color, -30));
  panel(p, 0, y, w, h - depth + 1, color);
  p(2, y + 2, w - 4, 2, shade(color, 30));
  for (let k = 0; k < 5; k++) {
    p(2, front - 6 + k, w - 4, 1, shade(color, 9 - k * 6));
  }
  const wood = color === "#a0805b";
  for (let j = y + 7; j < front - 6; j += 4) {
    for (let i = 5; i < w - 5; i += 17) {
      const n = (i * 17 + j * 7) % 9;
      p(i, j + n % 3 * .5, Math.min(4 + n, w - i - 4), .5, shade(color, wood ? -10 + n : 3 - n));
      if (wood) p(i + 2, j + 1, Math.min(6 + n, w - i - 5), .5, shade(color, 12));
    }
  }
  const cols = Math.max(1, Math.round(w / 33)), cw = (w - 6) / cols;
  for (let i = 0; i < cols; i++) {
    const x = 3 + i * cw;
    panel(p, x, front + 2, cw - 2, depth - 6, shade(color, -19 - i % 2 * 6));
    p(x + cw / 2 - 4, front + 5, 6, 1.5, shade(color, 24));
    p(x + cw / 2 - 3, front + 6.5, 4, .5, ink);
    if (!wood) for (let k = 0; k < 4; k++) p(x + 4 + k * 2, front + depth - 8, 1, 2, shade(color, -44));
  }
  p(2, y + h - 3, w - 4, 2, shade(color, -48));
  for (const x of [3, w - 7]) p(x, y + h - 4, 4, 4, ink);
}
function mat(p: Paint, x: number, y: number, w: number, h: number, color: string) {
  panel(p, x, y, w, h, color);
  for (let a = 4; a < w - 3; a += 6) for (let b = 4; b < h - 3; b += 6) p(x + a, y + b, 1, 1, shade(color, 14));
  p(x + 2, y + 2, w - 4, .5, shade(color, 26));
}
function gear(p: Paint, x: number, y: number, r: number) {
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    p(x + Math.cos(a) * r - 1.5, y + Math.sin(a) * r * .7 - 1, 3, 2, "#73818a");
  }
  oval(p, x, y, r - 1, "#334651", .7); oval(p, x, y - .5, r - 2, "#c0c8c3", .7);
  oval(p, x, y, r * .42, "#667680", .7); oval(p, x, y, r * .24, "#2e414b", .7);
}
function book(p: Paint, x: number, y: number, w: number, h: number, color: string) {
  panel(p, x, y, w, h, color);
  p(x + 3, y + 2, w - 5, h - 4, "#dfd1ad");
  p(x + w / 2, y + 2, 1, h - 4, "#9c8768");
  for (let j = 4; j < h - 2; j += 3) {
    p(x + 4, y + j, w / 2 - 6, .5, "#a0967e");
    p(x + w / 2 + 2, y + j, w / 2 - 5, .5, "#a0967e");
  }
}
function tool(p: Paint, x: number, y: number, length: number, color: string) {
  line(p, x, y, x + length, y - length * .3, "#34434a", 2.5);
  line(p, x + 1, y - .5, x + length, y - length * .3 - .5, "#c3ceca", 1);
  line(p, x, y, x + length * .37, y - length * .11, color, 3);
  oval(p, x + length, y - length * .3, 2.8, "#adbebd", .8);
  oval(p, x + length, y - length * .3, 1.2, "#48565a", .8);
}
function portrait(p: Paint, x: number, y: number, w: number, h: number, n: number) {
  panel(p, x, y, w, h, "#ac8553");
  p(x + 2, y + 2, w - 4, h - 4, ["#55787a", "#657991", "#786b70"][n % 3]);
  const m = x + w / 2;
  oval(p, m, y + h * .33, w * .15, "#d8b393", 1.1);
  p(m - w * .18, y + h * .22, w * .36, 2, "#3d3531");
  oval(p, m, y + h * .69, w * .28, ["#394954", "#67544d", "#425b5c"][n % 3], .6);
  p(x + 2, y + h - 4, w - 4, 2, "#e5d1a7");
}

function paper(p: Paint, x: number, y: number, w: number, h: number) {
  panel(p, x, y, w, h, "#dcd0ac");
  for (let i = 4; i < h - 2; i += 3) p(x + 3, y + i, w - 7 - i % 4, .5, "#92998b");
}
function screen(p: Paint, x: number, y: number, w: number, h: number, mode: string) {
  panel(p, x, y, w, h, "#53616c");
  p(x + 3, y + 3, w - 6, h - 7, "#142c43");
  p(x + 4, y + 4, w - 8, 1, "#648da5");
  for (let i = 6; i < w - 5; i += 7) p(x + i, y + 6, .5, h - 12, "#254860");
  for (let i = 6; i < h - 5; i += 6) p(x + 5, y + i, w - 10, .5, "#254860");
  if (mode === "oscilloscope" || mode === "signal-wall") {
    for (let i = 0; i < w - 12; i++) {
      const a = y + h / 2 + Math.sin(i * .4) * (h - 12) * .27;
      const b = y + h / 2 + Math.sin((i + 1) * .4) * (h - 12) * .27;
      line(p, x + 6 + i, a, x + 7 + i, b, "#96e3c5", .5);
    }
  } else if (mode === "cad") {
    const cx = x + w / 2, cy = y + h / 2;
    for (const [dx, dy] of [[-10, -4], [10, -4], [-10, 4], [10, 4]]) {
      line(p, cx, cy - 8, cx + dx, cy + dy, "#a6d4ea", .5);
      line(p, cx + dx, cy + dy, cx, cy + 8, "#73b4cc", .5);
    }
    line(p, cx - 10, cy - 4, cx + 10, cy - 4, "#9fdfdf", .5);
    line(p, cx - 10, cy + 4, cx + 10, cy + 4, "#9fdfdf", .5);
  } else if (mode === "dataset" || mode === "observe") {
    for (let i = 0; i < 3; i++) {
      const q = x + 5 + i * (w - 10) / 3;
      panel(p, q, y + 6, (w - 13) / 3, h - 14, "#3c6977");
      p(q + 3, y + 9, 3, 3, "#92c28a");
      line(p, q + 2, y + h - 12, q + (w - 13) / 3 - 2, y + 9, "#8ebfc4", .5);
    }
  } else for (let i = 0; i < 4; i++) p(x + 5, y + 6 + i * 3, Math.max(2, (w - 13) * (.4 + i % 3 * .2)), 1, i === 2 ? "#a7d4ad" : "#77a9cb");
  p(x + w - 6, y + h - 3, 2, 1, "#a0e5ae");
}
function circuit(p: Paint, x: number, y: number, w: number, h: number) {
  panel(p, x, y, w, h, "#426e54");
  for (let i = 4; i < w - 5; i += 7) {
    line(p, x + i, y + 3, x + i, y + h - 4, "#b7a96c", .5);
    p(x + i, y + 4 + i * 3 % Math.max(3, h - 10), 3, 3, "#d6c17f");
  }
  panel(p, x + w / 2 - 5, y + h / 2 - 4, 10, 8, "#34444b");
  for (let i = -4; i <= 4; i += 2) {
    p(x + w / 2 + i, y + h / 2 - 6, .5, 2, "#e2d3ae");
    p(x + w / 2 + i, y + h / 2 + 4, .5, 2, "#e2d3ae");
  }
}
function trophy(p: Paint, x: number, y: number, s = 1) {
  const q = (a: number, b: number, w: number, h: number, c: string) => p(x + a * s, y + b * s, w * s, h * s, c);
  q(4, 0, 10, 3, "#f8d88c"); q(5, 3, 8, 8, "#bd8437"); q(6, 3, 2, 7, "#ffe2a0");
  q(1, 2, 3, 1, "#cb9a50"); q(0, 3, 2, 5, "#d6a652"); q(2, 7, 4, 2, "#edc472");
  q(14, 2, 3, 1, "#edc472"); q(16, 3, 2, 5, "#cb9848"); q(12, 7, 4, 2, "#edc472");
  q(8, 10, 2, 5, "#d6a450"); q(5, 15, 8, 2, "#f0c778"); q(2, 17, 14, 3, "#74513c");
}
function arm(p: Paint, x: number, y: number, dir: number) {
  panel(p, x - 8, y + 22, 16, 8, "#59666a");
  line(p, x, y + 21, x - dir * 8, y + 2, "#7b5335", 6);
  line(p, x, y + 20, x - dir * 8, y, "#c89a54", 4);
  line(p, x - dir * 8, y, x + dir * 4, y - 16, "#b5823e", 5);
  line(p, x - dir * 7, y - 1, x + dir * 4, y - 16, "#edc477", 2);
  oval(p, x - dir * 6, y, 3, "#715a44"); oval(p, x - dir * 6, y, 1.5, "#d8c89a");
  panel(p, x + dir * 4 - 2, y - 19, 5, 7, "#4f626b");
}
function robot(p: Paint, x: number, y: number) {
  panel(p, x - 9, y - 19, 18, 13, "#b2c1c3");
  panel(p, x - 5, y - 17, 10, 5, "#293f58"); p(x - 3, y - 16, 6, 1, "#91d9eb");
  panel(p, x - 12, y - 6, 24, 21, "#7c909a");
  panel(p, x - 6, y - 4, 12, 13, "#d2d7c7"); p(x - 3, y, 6, 2, "#d58a51");
  for (const dx of [-18, 12]) {
    panel(p, x + dx, y - 3, 6, 20, "#bbc7c6");
    panel(p, x + dx + 1, y + 9, 4, 7, "#4c6069");
  }
  for (const dx of [-11, 3]) {
    panel(p, x + dx, y + 15, 8, 19, "#8196a0");
    panel(p, x + dx - 1, y + 30, 10, 5, "#384b58");
  }
}
function plant(p: Paint, w: number, foot: number) {
  panel(p, 1, foot - 14, w - 2, 14, "#9c7556");
  p(0, foot - 15, w, 3, "#cc9b65");
  line(p, w / 2, foot - 13, w / 2, foot - 36, "#405438", 1.5);
  for (let i = 0; i < 19; i++) {
    const a = i * 2.399, r = 3 + i % 5 * 2, x = w / 2 + Math.cos(a) * r, y = foot - 29 + Math.sin(a) * r;
    oval(p, x, y, 5.5, "#315d44", .8); oval(p, x - 1, y - 1, 4, ["#64904f", "#749d5c", "#4c7b4b"][i % 3], .8);
    p(x - 2, y - 3, 2, 1, "#a0bc69");
  }
}
const WINDOW_X = [42, 162, 358, 478];
function windowArt(p: Paint, x: number, y: number, w: number, light: string) {
  panel(p, x - 3, y - 3, w + 6, 45, "#9e8b71");
  panel(p, x, y, w, 37, "#283f4a");
  for (let i = 3; i < w - 3; i += 13) for (let j = 3; j < 32; j += 15) {
    const n = Math.min(10, w - i - 3);
    p(x + i, y + j, n, 12, shade(light, j === 3 ? 17 : -12));
    p(x + i + 1, y + j + 1, n - 2, 1, "#e5ead4");
    p(x + i + 1, y + j + 3, 1, 6, "#f2f3df");
    p(x + i + 3, y + j + 9, n - 4, 2, shade(light, -28));
  }
  panel(p, x - 5, y + 37, w + 10, 5, "#bdac8c");
}
function lamp(p: Paint, x: number, y: number) {
  panel(p, x - 6, y - 4, 12, 19, "#665443");
  panel(p, x - 4, y, 8, 12, "#c6904f");
  p(x - 2, y + 2, 4, 8, "#ffe4a5"); p(x - 1, y + 3, 2, 4, "#fff7ce");
}
function banner(p: Paint, x: number, y: number, w: number, color: string) {
  panel(p, x, y, w, 32, color);
  for (let i = 0; i < 10; i++) p(x + i, y + 31 + i * .5, w - 2 * i, .5, "#cba466");
  oval(p, x + w / 2, y + 14, 7, "#cfa861"); oval(p, x + w / 2, y + 14, 4.5, color);
  p(x + w / 2 - 1, y + 8, 2, 12, "#f3dc9b"); p(x + w / 2 - 4, y + 12, 8, 2, "#f3dc9b");
}
export function renderPublicRoomTerrain(room: RoomScene, campusTiles?: HTMLImageElement) {
  const w = room.width * TILE, h = room.height * TILE, {canvas, p} = bitmap(w, h);
  const wood = room.id === "guild" || room.id === "honors";
  const base = room.theme.floor, wall = room.theme.wall, trim = wood ? "#a88b6b" : "#8c9991";
  p(0, 0, w, h, "#28343b");
  const tw = wood ? 42 : room.id === "mechanical" ? 36 : 32, th = wood ? 12 : 24;
  for (let y = 80; y < h - 16; y += th) for (let x = 16 - (Math.round(y / th) % 2) * tw / 2; x < w - 16; x += tw) {
    const a = Math.max(16, x), b = Math.min(w - 16, x + tw) - a, c = Math.min(th, h - 16 - y);
    const n = ((Math.round(x * 7 + y * 11) % 13) + 13) % 13 - 6;
    p(a, y, b, c, shade(base, -21)); p(a + .5, y + .5, b - 1, c - 1, shade(base, n));
    p(a + 1, y + 1, b - 2, .5, shade(base, n + 21));
    if (wood) {
      for (let j = 0; j < 3; j++) {
        p(a + 3 + j * 4, y + 3 + j * 2.5, Math.min(b - 7 - j * 4, 14 + n), .5, shade(base, n - 13));
        p(a + 4 + j * 4, y + 3.5 + j * 2.5, Math.min(b - 8 - j * 4, 9 + n), .5, shade(base, n + 12));
      }
    }
    else {
      for (let j = 0; j < 5; j++) {
        const dx = (j * 11 + n * 3 + 30) % Math.max(3, b - 3);
        const dy = (j * 7 + n + 18) % Math.max(3, c - 3);
        p(a + dx + 1, y + dy + 1, 1, .5, shade(base, n - 9 + j * 4));
      }
      p(a + b - 4, y + c - 4, 1, 1, shade(base, n - 18));
    }
  }
  // Reuse the campus masonry texture in the labs, with a subdued indoor
  // finish rather than introducing a second unrelated texture library.
  if (!wood && campusTiles) {
    const ctx = canvas.getContext("2d")!;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = .28;
    for (let y = 80; y < h - TILE; y += TILE) for (let x = TILE; x < w - TILE; x += TILE) {
      const variant = (Math.floor(x / 128) + Math.floor(y / 128) * 2) % 3;
      ctx.drawImage(campusTiles, variant * 128 + x % 128, 256 + y % 128, TILE, TILE, x, y, TILE, TILE);
    }
    ctx.restore();
  }
  panel(p, 0, 0, w, 80, wall);
  for (let x = 8; x < w - 8; x += 48) {
    p(x, 7, 1, 61, shade(wall, -17)); p(x + 1, 8, 1, 60, shade(wall, 18));
    p(x + 4, 60, 40, 2, shade(wall, -13));
  }
  for (const x of WINDOW_X) windowArt(p, x, 13, 56, room.theme.window);
  banner(p, w / 2 - 24, 11, 48, wood ? "#783e49" : "#344f72");
  // Each room's wall has a distinct emblem and decorative inlay.
  const cxWall = w / 2, cyWall = 25;
  p(cxWall - 13, cyWall - 9, 26, 19, wood ? "#783e49" : "#344f72");
  if (room.id === "mechanical") {
    gear(p, cxWall, cyWall, 10);
  } else if (room.id === "honors") {
    trophy(p, cxWall - 9, cyWall - 10, 1);
  } else if (room.id === "guild") {
    book(p, cxWall - 12, cyWall - 8, 24, 16, "#a88756");
  } else if (room.id === "electrical") {
    for (let i = 0; i < 23; i++) line(p, cxWall - 11 + i, cyWall + Math.sin(i * .5) * 5, cxWall - 10 + i, cyWall + Math.sin((i + 1) * .5) * 5, "#b6e4ce", 1);
  } else if (room.id === "vision") {
    oval(p, cxWall, cyWall, 9, "#9bc3b6", .7);
    oval(p, cxWall, cyWall, 5, "#263f53", .8);
    oval(p, cxWall - 2, cyWall - 1, 2, "#d2e8e0");
  } else {
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4, x = cxWall + Math.cos(a) * 11, y = cyWall + Math.sin(a) * 7;
      line(p, cxWall, cyWall, x, y, "#88bdd2", .7); oval(p, x, y, 1.8, "#d1eff2");
    }
  }
  for (const x of [132, 446]) lamp(p, x, 35);
  panel(p, 0, 69, w, 11, trim);
  // Soft stepped window light and wall contact shadow are baked into terrain;
  // they are decoration, never entities or colliders.
  const ctx = canvas.getContext("2d")!;
  ctx.save();
  for (let i = 0; i < 16; i++) {
    ctx.globalAlpha = .12 * (1 - i / 16);
    p(16, 80 + i, w - 32, 1, "#26343d");
  }
  for (const x of WINDOW_X) {
    for (let i = 0; i < 32; i++) {
      ctx.globalAlpha = .045 * (1 - i / 32);
      p(x + i * .35, 80 + i, 54 + i * .6, 1, room.theme.window);
    }
  }
  ctx.restore();
  panel(p, 0, 79, 16, h - 79, trim); panel(p, w - 16, 79, 16, h - 79, trim);
  const exit = room.objects.find(o => o.kind === "exit")!, cx = w / 2, bottom = (exit.y - .55) * TILE;
  if (wood) {
    const x = cx - 39, y = 152, rh = bottom - y;
    panel(p, x, y, 78, rh, room.theme.rug); p(x + 4, y + 4, 70, rh - 8, shade(room.theme.rug, 15));
    for (let i = y + 8; i < bottom - 5; i += 10) { p(x + 8, i, 2, 5, "#d7b47d"); p(x + 68, i, 2, 5, "#d7b47d"); }
    oval(p, cx, y + rh * .64, 17, "#c6a36b", .8); oval(p, cx, y + rh * .64, 13, shade(room.theme.rug, 15), .8);
    for (let j = y + 9; j < bottom - 8; j += 6) {
      p(x + 15, j, 48, .5, shade(room.theme.rug, 21));
      p(x + 18, j + 1, 1, 1, "#c6a36b"); p(x + 59, j + 1, 1, 1, "#c6a36b");
    }
    for (let j = -12; j <= 12; j += 4) {
      line(p, cx - 9, y + rh * .64 + j, cx, y + rh * .64 + j - 3, "#d5b67b", .5);
      line(p, cx, y + rh * .64 + j - 3, cx + 9, y + rh * .64 + j, "#d5b67b", .5);
    }
  } else {
    for (let i = 21; i < w - 20; i += 22) { p(i, 87, 11, 1.5, "#c4b47a"); p(i, h - 24, 11, 1.5, "#c4b47a"); }
    for (const o of room.objects.filter(o => o.solid && (o.kind === "machine" || o.id === "assembly"))) {
      const x = o.x * TILE - 3, y = o.y * TILE - 3, a = o.width * TILE + 6, b = o.height * TILE + 6;
      for (let i = 0; i < a; i += 8) { p(x + i, y, 4, 1.5, "#d9b969"); p(x + i, y + b, 4, 1.5, "#d9b969"); }
      for (let i = 0; i < b; i += 8) { p(x, y + i, 1.5, 4, "#d9b969"); p(x + a, y + i, 1.5, 4, "#d9b969"); }
    }
  }
  panel(p, 0, h - 16, exit.x * TILE, 16, trim);
  panel(p, (exit.x + exit.width) * TILE, h - 16, w - (exit.x + exit.width) * TILE, 16, trim);
  for (const object of room.objects.filter(o => o.solid)) {
    const x = object.x * TILE, y = object.y * TILE, a = object.width * TILE, b = object.height * TILE;
    ctx.save();
    for (let d = 5; d >= 1; d--) {
      ctx.globalAlpha = .035;
      p(x - d, y + 3, a + d * 2, b + d, "#202d34");
    }
    ctx.restore();
  }
  const ex = exit.x * TILE, ew = exit.width * TILE;
  panel(p, ex, bottom, ew, h - bottom, shade(base, -12));
  for (let i = bottom + 4; i < h - 3; i += 6) p(ex + 3, i, ew - 6, 1, shade(base, -25));
  p(ex + 3, bottom + 3, ew - 6, 2, "#e9c990");
  p(ex + ew / 2 - 3, bottom + 12, 6, 1, shade(base, 22));
  line(p, ex + ew / 2 - 5, bottom + 15, ex + ew / 2, bottom + 19, shade(base, 22), 1);
  line(p, ex + ew / 2, bottom + 19, ex + ew / 2 + 5, bottom + 15, shade(base, 22), 1);
  return canvas;
}

// Individual transparent, native-resolution component bitmaps; no flattened room image.
export const OBJECT_OVERHANG = 40;
const sprites = new WeakMap<RoomObject, HTMLCanvasElement>();
function sprite(o: RoomObject) {
  const existing = sprites.get(o); if (existing) return existing;
  const w = o.width * TILE, h = o.height * TILE, y = OBJECT_OVERHANG, foot = y + h, m = w / 2;
  const {canvas, p} = bitmap(w, foot);
  const wood = ["workbench", "cabinet", "display", "reception"].includes(o.kind);
  const color = wood ? "#a0805b" : o.id === "planning" ? "#67748b" : "#70838a";
  if (o.kind === "plant") plant(p, w, foot);
  else if (o.kind === "chair") {
    const c = o.x < 12 ? "#7c7664" : "#577580";
    panel(p, 2, y - 19, w - 4, 23, shade(c, -15));
    panel(p, 4, y - 16, w - 8, 15, c);
    p(5, y - 14, w - 10, 1, shade(c, 26));
    panel(p, 0, y, w, h - 3, c);
    panel(p, 3, y + 2, w - 6, h - 7, shade(c, 15));
    p(2, foot - 4, 3, 4, ink); p(w - 5, foot - 4, 3, 4, ink);
  }
  else if (o.kind === "cabinet" || o.kind === "server") {
    panel(p, 0, y - 25, w, h + 25, o.kind === "server" ? "#566878" : color);
    p(2, y - 24, w - 4, 5, shade(color, 20));
    p(0, foot - 6, w, 6, "#3a4244");
    const n = Math.max(1, Math.round(w / 25)), cw = (w - 4) / n;
    for (let i = 0; i < n; i++) {
      const x = 2 + i * cw;
      panel(p, x, y - 21, cw - 1, h + 18, o.kind === "server" ? "#303f50" : "#655747");
      for (let j = y - 17; j < foot - 12; j += 13) {
        if (o.kind === "server") {
          panel(p, x + 2, j, cw - 5, 10, "#4c6273");
          for (let k = 4; k < cw - 10; k += 3) p(x + k, j + 4, 1, 3, "#263948");
          p(x + cw - 7, j + 3, 2, 1, (i + j) % 3 ? "#80c7b2" : "#e2c078");
        } else {
          p(x + 2, j + 10, cw - 5, 2, "#be9b6d");
          for (let k = 3; k < cw - 6; k += 5) {
            const a = 4 + (k + j) % 6;
            panel(p, x + k, j + 10 - a, 4, a, ["#949e9f", "#c3a268", "#577e73"][(k + i) % 3]);
          }
        }
      }
    }
  } else if (o.kind === "display") {
    if (o.solid) {
      desk(p, w, h, y, color);
      const depth = Math.min(h * .65, 58), glass = depth + 26;
      panel(p, 0, y - 28, w, glass, "#637d83"); p(3, y - 25, w - 6, glass - 6, "#2b424b");
      for (let j = y - 22; j < y + depth - 18; j += 24) {
        p(3, j + 19, w - 6, 2, "#a38662");
        for (let i = 5; i < w - 15; i += 23) {
          if (o.id === "trophies") {
            if ((i + j) % 3) trophy(p, i, j, .85);
            else { oval(p, i + 7, j + 8, 5, "#d6b77d"); p(i + 5, j + 13, 4, 4, "#b98e56"); }
          } else if (o.id === "history" || o.id === "welcome-wall") portrait(p, i, j, 15, 18, i + j);
          else { paper(p, i, j, 16, 18); p(i + 4, j + 6, 2, 6, "#9f6f56"); }
        }
      }
      for (let i = 8; i < w - 6; i += 29) {
        line(p, i + 6, y - 23, i - 5, y + depth - 5, "#73939a", .5);
        p(i, y - 25, 1, glass - 6, "#52717b");
      }
      p(2, y - 26, w - 4, 1, "#c1d9d3"); p(2, y + depth - 4, w - 4, 1, "#a3bfc3");
    } else {
      panel(p, 0, y - 26, w, 29, "#a58b66");
      if (o.id === "observe") screen(p, 3, y - 23, w - 6, 23, o.id);
      else for (let i = 5; i < w - 12; i += 17) {
        if (o.id === "team-photo") portrait(p, i, y - 22, 14, 19, i);
        else if (o.id === "signal-wall") screen(p, i, y - 21, 15, 18, "signal-wall");
        else paper(p, i, y - 21 + i % 3, 12, 17);
      }
    }
  } else if (o.kind === "camera") {
    panel(p, 0, y, w, h, "#566c74");
    mat(p, 3, y + 3, w - 6, h - 7, "#3b505a");
    for (const dx of [-w * .32, 0, w * .32]) {
      line(p, m, y - 13, m + dx, foot - 4, "#24333f", 3.5);
      line(p, m - .5, y - 13, m + dx - .5, foot - 4, "#91aab0", 1.2);
      panel(p, m + dx - 2, foot - 7, 4, 5, "#5d7680");
    }
    oval(p, m, y + h * .4, 6, "#78939a", .65);
    for (let j = 0; j < 4; j++) p(5 + j * 2, y + 5, 1, 2, "#98b4b2");
    panel(p, m - 15, y - 31, 30, 15, "#889d9f"); panel(p, m - 4, y - 28, 17, 10, "#284753");
    oval(p, m + 3, y - 23, 4, "#152439"); oval(p, m + 2, y - 24, 1.5, "#9cdbec");
  } else {
    desk(p, w, h, y, color);
    if (o.id === "assembly") {
      mat(p, 4, y + 6, w - 8, h - 30, "#556e75");
      for (let i = 9; i < w - 7; i += 10) p(i, y + h - 28, 4, 1, "#b9b397");
      for (const x of [9, w - 12]) for (const d of [12, h - 16]) panel(p, x - 2, y + d, 4, 4, "#c0c9b5");
      arm(p, 18, y + 11, 1); arm(p, w - 18, y + 11, -1); robot(p, m, y + 15);
      gear(p, 17, y + 51, 9); gear(p, 38, y + 55, 6);
      tool(p, 12, y + 69, 18, "#a47548"); tool(p, w - 33, y + 52, 20, "#5a7a89");
      paper(p, w - 31, y + 59, 18, 13);
    } else if (o.id === "machine") {
      panel(p, 2, y - 22, w - 4, h + 14, "#809297");
      panel(p, 7, y - 16, w - 14, h - 4, "#293f4a");
      line(p, m, y - 12, m, foot - 18, "#b3c0bf", 3);
      panel(p, m - 9, y + h / 2, 18, 8, "#c2a96f"); 
      for (let i = 0; i < 6; i++) p(9, y + 6 + i * 8, w - 18, 1, "#415d67");
      gear(p, m, y + h * .55, 8); panel(p, w - 12, foot - 16, 8, 9, "#344b5b");
      p(w - 10, foot - 14, 4, 2, "#b1e7c0"); p(w - 10, foot - 10, 2, 2, "#df9d69");
    } else if (o.id === "embedded" || o.id === "solder") {
      circuit(p, 5, y + 6, w * .55, h - 23); circuit(p, w * .64, y + 9, w * .26, Math.max(12, h * .35));
      screen(p, w * .64, y - 18, w * .28, 27, "oscilloscope");
      for (let i = 0; i < 4; i++) {
        const x = w * .64 + i * 4;
        line(p, x, y + h * .4, x + 9, y + h * .52, i % 2 ? "#d2b16b" : "#bc6e60", .7);
        line(p, x + 9, y + h * .52, x - 2, y + h * .63, i % 2 ? "#d2b16b" : "#bc6e60", .7);
      }
      tool(p, w * .66, y + h * .65, w * .22, "#b67b56");
    } else if (o.id === "planning" || o.id === "lens-calibration") {
      mat(p, 6, y + 7, w - 12, h - 32, "#405c71");
      const r = Math.min(w * .38, 34);
      for (let i = 0; i < 5; i++) {
        const x = 9 + i * (w - 18) / 5;
        p(x, y + h - 34, 3, 2, "#84c7d6"); p(x, y + h - 30, 8, 1, "#7895a2");
      }
      oval(p, m, y + h * .5, r + 4, "#263f56", .58); oval(p, m, y + h * .5 - 2, r, "#526f9a", .58);
      oval(p, m, y + h * .5 - 4, r - 4, "#1c4771", .58); oval(p, m, y + h * .5 - 5, r - 9, "#5299c3", .58);
      if (o.id === "planning") {
        line(p, m, y + h * .45, m, y - 15, "#68b9d5", 2);
        for (let j = 0; j < 3; j++) {
          const cy = y + 5 + j * 13;
          oval(p, m, cy, 21 - j * 5, "#47788e", .25);
          oval(p, m, cy - .5, 19 - j * 5, "#507e98", .22);
        }
        line(p, m, y + h * .45, m, y - 15, "#9ad7e5", 1);
        for (let i = 0; i < 25; i++) {
          const a = i * 2.399, r = 9 + i % 7 * 3.4;
          const x = m + Math.cos(a) * r, b = y - 5 + Math.sin(a) * r * .65;
          const branch = y + 10 + i % 3 * 7;
          line(p, m, branch, m + (x - m) * .45, b + 6, "#447a9c", .7);
          line(p, m + (x - m) * .45, b + 6, x, b, "#6aabc7", .5);
          oval(p, x, b, 2.3, "#3f7c9e"); oval(p, x, b, 1.3, "#b6e6ed");
          if (i % 4 === 0) p(x - .5, b - .5, 1, 1, "#e4f9f4");
        }
        for (let i = 0; i < 9; i++) {
          const a = i * Math.PI * 2 / 9;
          const x = m + Math.cos(a) * (r + 7), b = y + h * .5 + Math.sin(a) * (r + 7) * .58;
          p(x, b, 3, 1, "#7aafc5");
        }
      } else for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++)
        p(m + a * 5 - 2, y - 4 + b * 5, 5, 5, (a + b) % 2 === 0 ? "#b9d8dd" : "#45647d");
    } else if (o.kind === "console") {
      const count = Math.max(1, Math.floor(w / 60)), sw = (w - 10) / count;
      for (let i = 0; i < count; i++) {
        const x = 5 + i * sw; screen(p, x, y - 26, sw - 3, 32, o.id);
        mat(p, x, y + 11, sw - 4, Math.min(26, h - 35), "#49616b");
        panel(p, x + sw * .35, y + 8, sw * .32, 8, "#4c646c");
        for (let k = 0; k < 3; k++) for (let j = 0; j < Math.floor((sw - 10) / 4); j++)
          p(x + 3 + j * 4, y + 18 + k * 3, 3, 2, "#c4c7b7");
        if (h > 55) {
          paper(p, x + 5, y + 35, Math.min(18, sw - 9), 13);
          if (sw > 34) { oval(p, x + sw - 10, y + 41, 4, "#263f4a", .8); p(x + sw - 12, y + 39, 3, 2, "#a6bdb9"); }
        }
      }
    } else {
      if (o.kind === "reception") {
        mat(p, 5, y + 4, w - 10, h - 32, "#665648");
        screen(p, m - 18, y - 15, 36, 24, "welcome");
        book(p, 14, y + 12, 28, 18, "#486c79");
        for (let i = 0; i < 3; i++) paper(p, w - 34 + i * 4, y + 10 + i * 2, 18, 15);
        for (const x of [w * .28, w * .7]) {
          oval(p, x, y + 25, 5, "#d3b48d", .7);
          oval(p, x, y + 24, 3, "#624431", .65);
        }
        banner(p, m - 12, foot - 33, 24, "#405a76");
      } else {
        mat(p, 5, y + 4, w - 10, h - 31, o.id === "strategy" ? "#476b7b" : "#776c56");
        book(p, 9, y + 9, 28, 19, "#77564b");
        for (let x = 43; x < w - 18; x += 27) paper(p, x, y + 8 + x % 4, 18, 13);
        if (o.id === "review") { gear(p, m, y + 32, 8); tool(p, w - 33, y + 31, 20, "#5a7585"); }
        else {
          for (let i = 0; i < 4; i++) { oval(p, m + (i - 1.5) * 14, y + 34, 4, "#d8c5a1", .65); oval(p, m + (i - 1.5) * 14, y + 33, 2.5, "#75533e", .6); }
        }
      }
    }
  }
  if (o.href) {
    panel(p, w - 14, foot - 13, 10, 9, "#234351");
    p(w - 12, foot - 10, 5, 2, "#b4e8c4");
    p(w - 8, foot - 11, 2, 4, "#b4e8c4");
  }
  sprites.set(o, canvas); return canvas;
}
export function drawPublicRoomObject(ctx: CanvasRenderingContext2D, o: RoomObject, camera: Position, elapsed: number, motion: boolean) {
  const x = Math.round(o.x * TILE - camera.x), y = Math.round(o.y * TILE - camera.y), w = o.width * TILE, h = o.height * TILE;
  ctx.drawImage(sprite(o), x, y - OBJECT_OVERHANG, w, h + OBJECT_OVERHANG);
  if (!motion) return;
  const p = painter(ctx), t = elapsed / 1000, phase = o.x * .41 + o.y * .27;
  ctx.save();
  if (o.kind === "console" && !["planning", "lens-calibration"].includes(o.id)) {
    const sw = (w - 10) / Math.max(1, Math.floor(w / 60));
    ctx.globalAlpha = .18; p(x + 8 + (t * 3 + phase) % Math.max(1, sw - 13), y - 21, .5, 20, "#c3f5ff");
  } else if (o.kind === "server" || o.kind === "machine") {
    ctx.globalAlpha = .13 + .43 * Math.pow((Math.sin(t * 1.7 + phase) + 1) / 2, 3);
    if (o.kind === "server") {
      const n = Math.max(1, Math.round(w / 25)), cw = (w - 4) / n;
      for (let i = 0; i < n; i++) {
        const j = Math.floor((t * .35 + i * 1.7) % Math.max(1, Math.floor((h + 5) / 13)));
        ctx.globalAlpha = .18 + .4 * Math.pow((Math.sin(t * 1.5 + i * 2.4) + 1) / 2, 3);
        p(x + 2 + i * cw + cw - 7, y - 14 + j * 13, 2, 1, "#b2f4b5");
      }
    } else p(x + w - 10, y + h - 14, 4, 2, "#d7f6c7");
  } else if (o.id === "planning" || o.id === "lens-calibration") {
    for (let i = 0; i < 3; i++) {
      const a = (t * .12 + i * .29) % 1; ctx.globalAlpha = .32 * Math.sin(a * Math.PI);
      p(x + w / 2 + Math.sin(t * .6 + i) * (4 + i * 3), y + h * .34 - a * (h * .34 + 16), 1, 1, "#c6f8ff");
    }
  } else if (o.id === "assembly") {
    ctx.globalAlpha = .14 + .38 * (Math.sin(t * 1.7) + 1) / 2;
    p(x + 12, y + 7, 1.5, 1.5, "#ffe7a3");
    ctx.globalAlpha = .14 + .38 * (Math.sin(t * 1.3 + 2) + 1) / 2;
    p(x + w - 12, y + 7, 1.5, 1.5, "#ffe7a3");
  } else if (o.kind === "display" && o.solid) {
    ctx.globalAlpha = .5 * Math.pow((Math.sin(t * .7 + phase) + 1) / 2, 14);
    p(x + w * .28, y - 22, 2, 1, "#fff4d7");
  }
  ctx.restore();
}
// Windows show the same outside conditions as the campus without indoor precipitation.
export function drawRoomWindows(ctx: CanvasRenderingContext2D, camera: Position, elapsed: number,
  motion: boolean, climate: { weather: WeatherKind | null; night: number } | null) {
  if (!climate) return;
  const p = painter(ctx), weather = climate.weather;
  ctx.save();
  for (const x of WINDOW_X) for (let i = 3; i < 53; i += 13) for (let j = 3; j < 32; j += 15) {
    const left = x + i - camera.x, top = 13 + j - camera.y, w = Math.min(10, 53 - i);
    if (weather && weather !== "clear") {
      ctx.globalAlpha = weather === "fog" ? .52 : weather === "snow" ? .30 : .23;
      p(left, top, w, 12, weather === "fog" || weather === "snow" ? "#bacacb" : "#617985");
    }
    if (climate.night > 0) {
      ctx.globalAlpha = Math.min(.65, climate.night * 1.3);
      p(left, top, w, 12, "#172b43");
    }
    if (motion && (weather === "rain" || weather === "storm" || weather === "snow")) {
      const snow = weather === "snow", phase = (elapsed / (snow ? 230 : 85) + x + i * .9 + j * 1.7) % 10;
      ctx.globalAlpha = .38;
      p(left + 2 + ((i + j) % 4), top + phase, 1, snow ? 1 : Math.min(3, 12 - phase), "#d9e9ed");
    }
  }
  ctx.restore();
}

export function drawRoomLight(ctx: CanvasRenderingContext2D, room: RoomScene, camera: Position, elapsed: number) {
  const p = painter(ctx), t = elapsed / 1000;
  ctx.save();
  for (const x of [132, 446]) {
    ctx.globalAlpha = .14 + (Math.sin(t * 1.7 + x) + 1) * .07;
    p(x - 1 - camera.x, 38 - camera.y, 2, 5, "#fff1bf");
  }
  for (let i = 0; i < 5; i++) {
    const a = (t * (.045 + i * .008) + i * .19) % 1;
    ctx.globalAlpha = .16 * Math.sin(a * Math.PI);
    p((4.6 + i * 6.3 + Math.sin(t * .28 + i) * .32) * TILE - camera.x, (17.4 - a * 8) * TILE - camera.y, 1, .5, room.theme.window);
  }
  ctx.restore();
}

// Click the visible alpha silhouette, not the background or an invisible
// rectangle. Frontmost solid props win; decorative props block the click.
export function publicRoomObjectAt(room: RoomScene, position: Position): RoomObject | null {
  const objects = room.objects.filter(o => o.kind !== "exit").sort((a, b) =>
    Number(Boolean(b.solid)) - Number(Boolean(a.solid)) || b.y + b.height - a.y - a.height);
  for (const object of objects) {
    const x = (position.x - object.x) * TILE, y = (position.y - object.y) * TILE + OBJECT_OVERHANG;
    const image = sprite(object);
    if (x < 0 || y < 0 || x * ROOM_ART_SCALE >= image.width || y * ROOM_ART_SCALE >= image.height) continue;
    const alpha = image.getContext("2d")!.getImageData(Math.floor(x * ROOM_ART_SCALE), Math.floor(y * ROOM_ART_SCALE), 1, 1).data[3];
    if (alpha > 0) return object.decorative ? null : object;
  }
  return null;
}
