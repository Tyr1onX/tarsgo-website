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
  const wall = shade([221, 216, 202], [39, 42, 43], time);
  const metal = shade([117, 123, 115], [66, 72, 70], time);
  const wood = shade([131, 103, 74], [89, 71, 58], time);
  const glow = Math.max(0, (time - 0.24) / 0.76);

  ctx.clearRect(0, 0, LAB_WIDTH, LAB_HEIGHT);
  tile(ctx, 0, 0, LAB_WIDTH, 30, wall);

  // The same campus window and building silhouettes remain in place all day.
  tile(ctx, 2, 2, 37, 28, shade([153, 152, 139], [31, 36, 39], time));
  tile(ctx, 4, 4, 33, 22, sky([172, 209, 218], [227, 172, 136], [26, 42, 72]));
  tile(ctx, 4, 14, 33, 12, sky([204, 224, 217], [224, 144, 119], [38, 54, 78]));
  tile(ctx, 4, 21, 33, 5, sky([194, 210, 198], [155, 128, 118], [43, 57, 73]));
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
  tile(ctx, 0, 29, LAB_WIDTH, 11, shade([151, 144, 129], [40, 42, 42], time));
  tile(ctx, 0, 29, LAB_WIDTH, 2, shade([181, 171, 148], [58, 59, 56], time));
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

  // Distinctive competition robot silhouette: dark wheels, light armour, turret and barrel.
  tile(ctx, 46, 22, 22, 3, shade([62, 73, 70], [45, 53, 53], time));
  tile(ctx, 49, 18, 17, 5, shade([230, 227, 216], [171, 174, 165], time));
  tile(ctx, 49, 19, 3, 3, shade([171, 181, 176], [107, 126, 123], time));
  tile(ctx, 54, 19, 6, 1, shade([93, 107, 102], [75, 93, 92], time));
  tile(ctx, 61, 19, 4, 3, shade([183, 75, 63], [167, 83, 68], time));
  tile(ctx, 53, 16, 11, 3, shade([71, 85, 82], [59, 75, 76], time));
  tile(ctx, 55, 12, 5, 5, shade([224, 220, 208], [157, 163, 155], time));
  tile(ctx, 55, 13, 2, 2, shade([74, 87, 86], [50, 73, 75], time));
  tile(ctx, 59, 14, 2, 2, shade([182, 78, 64], [158, 82, 69], time));
  tile(ctx, 62, 16, 7, 2, shade([76, 90, 89], [68, 92, 94], time));
  tile(ctx, 68, 16, 1, 3, shade([62, 72, 69], [52, 72, 75], time));
  tile(ctx, 48, 24, 5, 3, "#283237");
  tile(ctx, 61, 24, 5, 3, "#283237");
  tile(ctx, 50, 25, 2, 1, "#8c9490");
  tile(ctx, 63, 25, 2, 1, "#8c9490");
  tile(ctx, 64, 20, 1, 1, blink ? "#fff3bc" : shade([137, 158, 142], [208, 173, 105], time));

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
  tile(ctx, 0, 37, LAB_WIDTH, 3, shade([138, 133, 117], [31, 34, 35], time));
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
  const radius = 14.5;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(scene, cx - 13, cy - 13, 26, 26, cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.fillStyle = "rgba(242, 232, 211, 0.045)";
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  const depth = ctx.createRadialGradient(cx - 2, cy - 3, 3, cx, cy, radius);
  depth.addColorStop(0, "rgba(255,255,255,0)");
  depth.addColorStop(0.76, "rgba(255,248,233,0.025)");
  depth.addColorStop(1, "rgba(34,36,33,0.30)");
  ctx.fillStyle = depth;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 0.6, 0, Math.PI * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(39,43,41,0.36)";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - 0.5, cy - 0.5, radius - 2, Math.PI * 1.08, Math.PI * 1.64);
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = "rgba(255,248,231,0.28)";
  ctx.stroke();
  ctx.restore();
}
