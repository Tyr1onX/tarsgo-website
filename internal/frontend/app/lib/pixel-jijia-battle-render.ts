import { FIELD_HEIGHT, FIELD_WIDTH, MATCH_SECONDS, OBSTACLES,
  type Battle, type Robot } from "./pixel-jijia-battle";

const COLORS = {
  grass: "#779580", grassDark: "#718e79", stone: "#c9bea2",
  stoneLight: "#d7caae", wall: "#526b66", wallTop: "#aab9a4",
  red: "#efbd6d", redDark: "#765a40", blue: "#cd7d75", blueDark: "#6f4548",
};
const square = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

function drawTerrain(ctx: CanvasRenderingContext2D) {
  square(ctx, 0, 0, FIELD_WIDTH, FIELD_HEIGHT, COLORS.grass);
  // The town's warm sandstone and sage-green palette continues inside the arena.
  for (let y = 0; y < FIELD_HEIGHT; y += 20) {
    for (let x = 0; x < FIELD_WIDTH; x += 20) {
      if ((x * 13 + y * 7) % 11 < 5) square(ctx, x, y, 20, 20, COLORS.grassDark);
      if ((x * 3 + y * 17) % 67 === 0) square(ctx, x + 9, y + 8, 3, 3, "#b3be8d");
    }
  }
  square(ctx, 0, 228, FIELD_WIDTH, 64, COLORS.stone);
  square(ctx, 0, 236, FIELD_WIDTH, 4, COLORS.stoneLight);
  square(ctx, 0, 284, FIELD_WIDTH, 4, "#a99e86");
  for (let x = 0; x < FIELD_WIDTH; x += 32) {
    square(ctx, x, 229, 2, 60, "#b4a98e");
    square(ctx, x + 16, 228, 2, 2, "#ece0bf");
  }
  for (const x of [70, 790]) {
    square(ctx, x, 84, 40, 40, "#a4b6aa");
    square(ctx, x + 6, 90, 28, 28, "#e6d3a7");
    square(ctx, x + 12, 96, 16, 16, "#72897e");
    square(ctx, x, 396, 40, 40, "#a4b6aa");
    square(ctx, x + 6, 402, 28, 28, "#e6d3a7");
    square(ctx, x + 12, 408, 16, 16, "#72897e");
  }
  square(ctx, 445, 0, 10, FIELD_HEIGHT, "#d9d5b54b");
  for (let y = 20; y < FIELD_HEIGHT; y += 36) square(ctx, 449, y, 2, 16, "#eeead184");
  // Distinct deployment regions.
  square(ctx, 23, 168, 5, 184, "#e9c87c");
  square(ctx, 872, 168, 5, 184, "#d88383");
  for (const [x, color] of [[17, "#ffe0a4"], [840, "#eab0aa"]] as const) {
    square(ctx, x, 218, 44, 5, color);
    square(ctx, x, 296, 44, 5, color);
  }
  for (const o of OBSTACLES) {
    square(ctx, o.x + 5, o.y + 7, o.width, o.height, "#2d504baa");
    square(ctx, o.x, o.y, o.width, o.height, "#4b655e");
    square(ctx, o.x, o.y, o.width, 9, "#e5d6af");
    square(ctx, o.x + 6, o.y + 9, o.width - 12, o.height - 15, "#9cad96");
    for (let y = o.y + 14; y < o.y + o.height - 7; y += 24) {
      square(ctx, o.x + 6, y, o.width - 12, 3, "#899c89");
      for (let x = o.x + 11 + (Math.floor(y / 24) % 2) * 12; x < o.x + o.width - 7; x += 24)
        square(ctx, x, y + 3, 3, 20, "#899c89");
    }
  }
  square(ctx, 0, 0, FIELD_WIDTH, 8, "#294f49");
  square(ctx, 0, FIELD_HEIGHT - 8, FIELD_WIDTH, 8, "#294f49");
  square(ctx, 0, 0, 8, FIELD_HEIGHT, "#294f49");
  square(ctx, FIELD_WIDTH - 8, 0, 8, FIELD_HEIGHT, "#294f49");
}

function drawRobot(ctx: CanvasRenderingContext2D, robot: Robot, selected: boolean, seconds: number) {
  const { x, y, team, hp } = robot;
  if (hp <= 0) {
    square(ctx, x - 18, y - 11, 36, 22, "#3c514b");
    square(ctx, x - 11, y - 7, 21, 14, "#5a655f");
    square(ctx, x - 5, y - 12, 11, 5, "#b17e60");
    return;
  }
  if (selected) {
    const pulse = Math.floor(seconds * 3) % 2 ? "#fff0b0" : "#ffe19a";
    ctx.strokeStyle = pulse;
    ctx.lineWidth = 3;
    ctx.strokeRect(Math.round(x - 24), Math.round(y - 25), 48, 48);
  }
  // Four rectangular treads, chassis, and an independently aimed turret.
  square(ctx, x - 22, y - 12, 44, 33, "#304f4e77");
  square(ctx, x - 19, y - 17, 10, 34, "#39494a");
  square(ctx, x + 9, y - 17, 10, 34, "#39494a");
  for (let i = -12; i <= 10; i += 8) {
    square(ctx, x - 18, y + i, 8, 3, "#83938c");
    square(ctx, x + 10, y + i, 8, 3, "#83938c");
  }
  square(ctx, x - 12, y - 15, 24, 30, team === "red" ? COLORS.redDark : COLORS.blueDark);
  square(ctx, x - 11, y - 17, 22, 28, team === "red" ? COLORS.red : COLORS.blue);
  square(ctx, x - 6, y - 12, 12, 19, team === "red" ? "#f5d9a2" : "#e9b5ab");
  square(ctx, x - 4, y - 6, 8, 10, "#42696b");
  square(ctx, x - 4, y - 20, 8, 8, "#2e5456");
  square(ctx, x - 2, y - 26, 4, 13, team === "red" ? "#ffedb3" : "#f4d0c7");
  square(ctx, x - 1, y - 28, 2, 3, "#fff9dd");
  ctx.fillStyle = "#1b363c";
  ctx.font = "bold 12px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(robot.id.endsWith("-1") ? "1" : "2", x, y + 3);

  // HP uses the same single combat state as the simulation.
  square(ctx, x - 24, y - 39, 48, 8, "#253d3b");
  square(ctx, x - 22, y - 37, 44, 4, "#704b46");
  square(ctx, x - 22, y - 37, 44 * hp / 100, 4, team === "red" ? "#f8d67a" : "#e5a49b");
  ctx.font = "bold 11px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#203d3c";
  ctx.fillText(team === "red" ? "吉甲" : "对手", x, y + 34);
}

export function renderBattle(ctx: CanvasRenderingContext2D, battle: Battle) {
  ctx.clearRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
  ctx.imageSmoothingEnabled = false;
  drawTerrain(ctx);
  for (const robot of battle.robots) {
    if (robot.hp <= 0 || robot.team !== "red" || !battle.selected.includes(robot.id)) continue;
    const goal = robot.route.at(-1);
    if (!goal) continue;
    ctx.save();
    ctx.strokeStyle = "#f9e6b0aa";
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.moveTo(robot.x, robot.y);
    for (const waypoint of robot.route) ctx.lineTo(waypoint.x, waypoint.y);
    ctx.stroke();
    ctx.restore();
    square(ctx, goal.x - 6, goal.y - 1, 12, 2, "#ffe3a0");
    square(ctx, goal.x - 1, goal.y - 6, 2, 12, "#ffe3a0");
  }
  for (const robot of battle.robots) drawRobot(ctx, robot, battle.selected.includes(robot.id), battle.seconds);
  for (const shot of battle.shots) {
    const alpha = Math.max(0, Math.min(1, shot.life / 0.14));
    ctx.strokeStyle = shot.team === "red" ? `rgba(255,247,188,${alpha})` : `rgba(255,168,148,${alpha})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(shot.from.x, shot.from.y);
    ctx.lineTo(shot.to.x, shot.to.y);
    ctx.stroke();
    square(ctx, shot.to.x - 4, shot.to.y - 4, 8, 8, shot.team === "red" ? "#fff5bf" : "#ffb3a4");
  }
  ctx.textAlign = "center";
  ctx.font = "bold 14px ui-monospace, monospace";
  ctx.fillStyle = "#f7dfac";
  ctx.fillText("TARSGO  ·  TRAINING V0", FIELD_WIDTH / 2, 35);
  ctx.font = "bold 11px ui-monospace, monospace";
  ctx.fillStyle = "#e3e6d1";
  ctx.fillText(`剩余 ${Math.ceil(MATCH_SECONDS - battle.seconds)} 秒`, FIELD_WIDTH / 2, 54);
}
