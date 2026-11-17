// A single 92 × 40 pixel world is redrawn at different times of day.
export const LAB_WIDTH = 92;
export const LAB_HEIGHT = 40;
export const LAB_THUMB_START = 20;
export const LAB_THUMB_TRAVEL = 52;

type RGB = [number, number, number];

const mix = (a: RGB, b: RGB, t: number) =>
  "rgb(" + a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(" ") + ")";

const shade = (day: RGB, night: RGB, time: number) => mix(day, night, time);
const tile = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};

function paintScene(ctx: CanvasRenderingContext2D, time: number, blink: boolean) {
  const dusk = Math.min(time / 0.53, 1);
  const dark = Math.max(0, (time - 0.53) / 0.47);
  const sky = (day: RGB, sunset: RGB, night: RGB) =>
    dark > 0 ? mix(sunset, night, dark) : mix(day, sunset, dusk);
  const wall = shade([219, 212, 188], [43, 48, 61], time);
  const metal = shade([112, 127, 125], [60, 80, 90], time);
  const wood = shade([127, 91, 65], [76, 57, 56], time);
  const glow = Math.max(0, (time - 0.35) / 0.65);

  ctx.clearRect(0, 0, LAB_WIDTH, LAB_HEIGHT);
  tile(ctx, 0, 0, LAB_WIDTH, 30, wall);

  // The same campus window and building silhouettes remain in place all day.
  tile(ctx, 2, 2, 37, 28, shade([148, 153, 142], [28, 36, 49], time));
  tile(ctx, 4, 4, 33, 22, sky([169, 215, 232], [237, 168, 119], [20, 38, 80]));
  tile(ctx, 4, 14, 33, 12, sky([205, 230, 224], [225, 132, 112], [36, 53, 93]));
  tile(ctx, 4, 21, 33, 5, sky([198, 208, 194], [153, 122, 120], [42, 59, 81]));
  ctx.globalAlpha = Math.max(0, 1 - time * 2.4);
  tile(ctx, 26, 7, 5, 5, "#fff1b6");
  tile(ctx, 27, 6, 3, 7, "#fff1b6");
  ctx.globalAlpha = 1;

  // Distant lecture building, lit windows, and campus trees.
  tile(ctx, 15, 17, 21, 9, sky([139, 156, 164], [107, 100, 117], [38, 54, 78]));
  tile(ctx, 18, 14, 12, 3, sky([151, 166, 172], [112, 106, 126], [46, 61, 86]));
  tile(ctx, 13, 19, 2, 7, shade([103, 124, 135], [42, 55, 75], time));
  for (const x of [18, 24, 30]) {
    for (const y of [19, 23]) {
      tile(ctx, x, y, 2, 2, shade([103, 130, 147], [224, 184, 114], glow));
    }
  }
  tile(ctx, 8, 18, 2, 8, shade([84, 103, 79], [37, 62, 59], time));
  tile(ctx, 5, 17, 7, 4, shade([86, 142, 93], [35, 79, 75], time));
  tile(ctx, 7, 14, 5, 5, shade([108, 164, 104], [41, 89, 83], time));
  tile(ctx, 5, 21, 10, 5, shade([77, 124, 85], [37, 70, 65], time));
  ctx.globalAlpha = Math.max(0, (time - 0.55) * 2.1);
  for (const [x, y] of [[9, 8], [17, 6], [32, 11], [25, 13]]) {
    tile(ctx, x, y, 1, 1, "#f1e9c9");
  }
  ctx.globalAlpha = 1;
  tile(ctx, 20, 4, 2, 22, shade([186, 189, 177], [54, 62, 75], time));
  tile(ctx, 3, 25, 35, 2, shade([189, 192, 183], [53, 61, 75], time));

  // Workbench, floor and shelving.
  tile(ctx, 0, 29, LAB_WIDTH, 11, shade([151, 143, 123], [38, 43, 56], time));
  tile(ctx, 0, 29, LAB_WIDTH, 2, shade([185, 174, 148], [57, 59, 70], time));
  tile(ctx, 37, 25, 44, 4, wood);
  tile(ctx, 39, 29, 4, 11, shade([93, 89, 79], [46, 52, 62], time));
  tile(ctx, 75, 29, 4, 11, shade([93, 89, 79], [46, 52, 62], time));
  tile(ctx, 38, 25, 42, 1, shade([172, 126, 85], [122, 91, 71], time));
  tile(ctx, 84, 9, 2, 24, metal);
  tile(ctx, 90, 9, 2, 24, metal);
  for (const y of [13, 22, 31]) tile(ctx, 84, y, 8, 2, metal);
  tile(ctx, 86, 10, 4, 3, shade([185, 142, 85], [110, 90, 71], time));
  tile(ctx, 86, 18, 5, 4, shade([98, 124, 133], [60, 79, 96], time));
  tile(ctx, 87, 16, 3, 2, shade([146, 149, 129], [73, 87, 91], time));
  tile(ctx, 86, 26, 4, 5, shade([181, 149, 104], [104, 86, 77], time));

  // Robot: chassis, protective armour, wheels, vision mast and turret.
  tile(ctx, 46, 21, 21, 5, shade([58, 81, 91], [35, 65, 87], time));
  tile(ctx, 49, 18, 16, 5, shade([228, 231, 221], [139, 162, 174], time));
  tile(ctx, 50, 19, 12, 2, shade([177, 205, 210], [104, 151, 166], time));
  tile(ctx, 52, 15, 10, 4, shade([79, 101, 111], [62, 94, 113], time));
  tile(ctx, 55, 12, 3, 4, shade([108, 123, 131], [85, 121, 139], time));
  tile(ctx, 59, 16, 6, 2, shade([72, 87, 98], [59, 85, 107], time));
  tile(ctx, 48, 24, 5, 3, "#293e4b");
  tile(ctx, 61, 24, 5, 3, "#293e4b");
  tile(ctx, 51, 20, 3, 2, "#c7564a");
  tile(ctx, 62, 20, 2, 2, blink ? "#efffdb" : shade([89, 176, 193], [59, 181, 210], time));

  // Monitor, keyboard, electronics and desk lamp.
  tile(ctx, 67, 14, 10, 10, shade([54, 65, 71], [28, 46, 67], time));
  tile(ctx, 68, 15, 8, 7, shade([133, 165, 163], [26, 108, 157], time));
  tile(ctx, 69, 17, 5, 1, shade([165, 191, 185], [97, 205, 225], time));
  tile(ctx, 71, 24, 2, 2, metal);
  tile(ctx, 67, 26, 10, 1, shade([91, 100, 92], [66, 98, 103], time));
  tile(ctx, 42, 27, 5, 1, shade([63, 72, 67], [54, 72, 72], time));
  tile(ctx, 43, 26, 2, 1, "#d0a86e");
  tile(ctx, 78, 23, 3, 2, metal);
  tile(ctx, 79, 16, 2, 8, metal);
  tile(ctx, 77, 13, 4, 2, metal);
  tile(ctx, 74, 13, 5, 3, shade([102, 112, 105], [191, 159, 100], time));
  if (glow > 0) {
    ctx.fillStyle = "rgba(255, 198, 105, " + (glow * 0.10) + ")";
    ctx.beginPath();
    ctx.moveTo(75, 16);
    ctx.lineTo(63, 28);
    ctx.lineTo(86, 28);
    ctx.fill();
    tile(ctx, 75, 16, 3, 1, "rgba(255, 226, 155, " + (glow * 0.9) + ")");
    tile(ctx, 62, 25, 17, 1, "rgba(255, 197, 110, " + (glow * 0.2) + ")");
  }
  tile(ctx, 0, 37, LAB_WIDTH, 3, shade([135, 128, 110], [30, 36, 47], time));
}

export function paintThemeLab(
  canvas: HTMLCanvasElement,
  scene: HTMLCanvasElement,
  time: number,
  blink = false,
) {
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 3);
  const width = Math.round(bounds.width * ratio);
  const height = Math.round(bounds.height * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  if (scene.width !== LAB_WIDTH || scene.height !== LAB_HEIGHT) {
    scene.width = LAB_WIDTH;
    scene.height = LAB_HEIGHT;
  }

  const sceneContext = scene.getContext("2d");
  const ctx = canvas.getContext("2d");
  if (!sceneContext || !ctx) return;
  sceneContext.imageSmoothingEnabled = false;
  paintScene(sceneContext, time, blink);

  ctx.setTransform(width / LAB_WIDTH, 0, 0, height / LAB_HEIGHT, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, LAB_WIDTH, LAB_HEIGHT);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, LAB_WIDTH, LAB_HEIGHT, LAB_HEIGHT / 2);
  ctx.clip();
  ctx.drawImage(scene, 0, 0);

  // Refract the existing scene. No secondary image, WebGL texture or mirrored axis.
  const cx = LAB_THUMB_START + time * LAB_THUMB_TRAVEL;
  const cy = 20;
  const radius = 16;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(scene, cx - 14.3, cy - 14.3, 28.6, 28.6, cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.fillStyle = "rgba(218, 234, 244, 0.075)";
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  const depth = ctx.createRadialGradient(cx - 2, cy - 3, 3, cx, cy, radius);
  depth.addColorStop(0, "rgba(255,255,255,0)");
  depth.addColorStop(0.75, "rgba(255,255,255,0.02)");
  depth.addColorStop(1, "rgba(12,29,42,0.43)");
  ctx.fillStyle = depth;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 0.6, 0, Math.PI * 2);
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = "rgba(22,35,45,0.48)";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - 0.5, cy - 0.5, radius - 2, Math.PI * 1.05, Math.PI * 1.7);
  ctx.lineWidth = 0.85;
  ctx.strokeStyle = "rgba(251,253,255,0.43)";
  ctx.stroke();
  ctx.restore();
}
