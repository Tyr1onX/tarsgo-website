import { FIELD_HEIGHT, FIELD_WIDTH, MATCH_SECONDS, OBSTACLES,
  type Battle, type Robot } from "./pixel-jijia-battle";
import { FIELD_INSET, HIGH_WALLS } from "./pixel-jijia-field";

const COLORS = {
  red: "#efbd6d", redDark: "#765a40", blue: "#cd7d75", blueDark: "#6f4548",
};
const square = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

function paintPolygon(ctx: CanvasRenderingContext2D, points: readonly { x: number; y: number }[]) {
  ctx.beginPath();
  points.forEach((point, index) => index === 0
    ? ctx.moveTo(point.x, point.y)
    : ctx.lineTo(point.x, point.y));
  ctx.closePath();
}

function drawTerrain(ctx: CanvasRenderingContext2D) {
  // Map dimensions, perimeter and raised footprints come from rmul_2027.stl.
  square(ctx, 0, 0, FIELD_WIDTH, FIELD_HEIGHT, "#779589");
  for (let y = 0; y < FIELD_HEIGHT; y += 22) {
    for (let x = 0; x < FIELD_WIDTH; x += 22) {
      if ((x * 17 + y * 3) % 9 < 3) square(ctx, x, y, 22, 22, "#718b7e");
      if ((x * 3 + y * 11) % 19 === 0) square(ctx, x + 9, y + 8, 2, 2, "#a1ab8d");
    }
  }

  // 300-unit-high perimeter top footprint, including visible metal joints.
  square(ctx, 0, 0, FIELD_WIDTH, FIELD_INSET, "#354e4d");
  square(ctx, 0, FIELD_HEIGHT - FIELD_INSET, FIELD_WIDTH, FIELD_INSET, "#354e4d");
  square(ctx, 0, 0, FIELD_INSET, FIELD_HEIGHT, "#354e4d");
  square(ctx, FIELD_WIDTH - FIELD_INSET, 0, FIELD_INSET, FIELD_HEIGHT, "#354e4d");
  square(ctx, FIELD_INSET - 5, FIELD_INSET, 3, FIELD_HEIGHT - 2 * FIELD_INSET, "#b1bdab");
  square(ctx, FIELD_WIDTH - FIELD_INSET + 2, FIELD_INSET, 3, FIELD_HEIGHT - 2 * FIELD_INSET, "#b1bdab");
  square(ctx, FIELD_INSET, FIELD_INSET - 5, FIELD_WIDTH - 2 * FIELD_INSET, 3, "#b1bdab");
  square(ctx, FIELD_INSET, FIELD_HEIGHT - FIELD_INSET + 2, FIELD_WIDTH - 2 * FIELD_INSET, 3, "#b1bdab");
  for (let x = 12; x < FIELD_WIDTH - 12; x += 38) {
    square(ctx, x, 8, 5, 5, "#80998a");
    square(ctx, x, FIELD_HEIGHT - 13, 5, 5, "#80998a");
  }
  for (let y = 26; y < FIELD_HEIGHT - 26; y += 36) {
    square(ctx, 8, y, 5, 5, "#80998a");
    square(ctx, FIELD_WIDTH - 13, y, 5, 5, "#80998a");
  }

  for (const feature of OBSTACLES) {
    ctx.save();
    ctx.translate(5, 7);
    paintPolygon(ctx, feature.points);
    ctx.fillStyle = "#293f3ba0";
    ctx.fill();
    ctx.restore();

    paintPolygon(ctx, feature.points);
    ctx.fillStyle = feature.kind === "platform" ? "#c1aa84" : "#738b82";
    ctx.fill();
    ctx.strokeStyle = feature.kind === "platform" ? "#e6d7ad" : "#b8c4aa";
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.save();
    paintPolygon(ctx, feature.points);
    ctx.clip();
    for (let y = feature.bounds.y; y < feature.bounds.y + feature.bounds.height; y += 21) {
      square(ctx, feature.bounds.x, y, feature.bounds.width, 2, feature.kind === "platform" ? "#b29c7b" : "#627d76");
      for (let x = feature.bounds.x + (Math.floor(y / 21) % 2) * 19; x < feature.bounds.x + feature.bounds.width; x += 38) {
        square(ctx, x, y + 2, 2, 19, feature.kind === "platform" ? "#d9c6a0" : "#95a89a");
      }
    }
    ctx.restore();
  }

  for (const wall of HIGH_WALLS) {
    square(ctx, wall.x, wall.y, wall.width, wall.height, "#4a625d");
    square(ctx, wall.x, wall.y, 4, wall.height, "#a3b7a1");
    for (let y = wall.y + 9; y < wall.y + wall.height; y += 17)
      square(ctx, wall.x + 5, y, Math.max(2, wall.width - 6), 2, "#72897a");
  }
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
  ctx.fillText("TARSGO  ·  RMUL 2027", FIELD_WIDTH / 2, 42);
  ctx.font = "bold 11px ui-monospace, monospace";
  ctx.fillStyle = "#e3e6d1";
  ctx.fillText(`剩余 ${Math.ceil(MATCH_SECONDS - battle.seconds)} 秒`, FIELD_WIDTH / 2, 54);
}
