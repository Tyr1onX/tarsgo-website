// Browser-native port of the simulator's synthetic training-v0 (first-steps.yaml).
// This intentionally does not implement official RMUC rules.
export const FIELD_WIDTH = 900;
export const FIELD_HEIGHT = 520;
export const MATCH_SECONDS = 150;
export const ROBOT_RADIUS = 14;
const SPEED = 190;
const RANGE = 125;
const SHOT_INTERVAL = 0.75;
const SHOT_DAMAGE = 10;

export type Point = { x: number; y: number };
export type Team = "red" | "blue";
export type Phase = "ready" | "playing" | "victory" | "defeat" | "draw";
export type Obstacle = Point & { width: number; height: number };
export type Robot = Point & {
  id: string;
  team: Team;
  hp: number;
  route: Point[];
  cooldown: number;
  rethink: number;
};
export type Shot = { from: Point; to: Point; life: number; team: Team };
export type Battle = {
  robots: Robot[];
  selected: string[];
  shots: Shot[];
  seconds: number;
  phase: Phase;
};

export const OBSTACLES: readonly Obstacle[] = [
  { x: 410, y: 125, width: 80, height: 270 },
  { x: 235, y: 170, width: 110, height: 32 },
  { x: 555, y: 318, width: 105, height: 32 },
];

export function createBattle(): Battle {
  const robot = (id: string, team: Team, x: number, y: number): Robot => ({
    id, team, x, y, hp: 100, route: [], cooldown: 0, rethink: 0,
  });
  return {
    robots: [
      robot("tarsgo-infantry-1", "red", 120, 210),
      robot("tarsgo-infantry-2", "red", 120, 310),
      robot("opponent-infantry-1", "blue", 780, 210),
      robot("opponent-infantry-2", "blue", 780, 310),
    ],
    selected: ["tarsgo-infantry-1", "tarsgo-infantry-2"],
    shots: [],
    seconds: 0,
    phase: "ready",
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function canStand({ x, y }: Point, radius = ROBOT_RADIUS): boolean {
  if (x < radius || y < radius || x > FIELD_WIDTH - radius || y > FIELD_HEIGHT - radius) return false;
  return !OBSTACLES.some((block) => {
    const dx = x - clamp(x, block.x, block.x + block.width);
    const dy = y - clamp(y, block.y, block.y + block.height);
    return dx * dx + dy * dy <= radius * radius;
  });
}

function clearSegment(a: Point, b: Point, radius: number): boolean {
  const steps = Math.max(1, Math.ceil(distance(a, b) / 6));
  for (let i = 0; i <= steps; i++) {
    const p = { x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps };
    if (!canStand(p, radius)) return false;
  }
  return true;
}

// The arena has only three rectangular walls. A small visibility graph
// around their padded corners avoids introducing a full navigation engine.
export function findRoute(start: Point, goal: Point): Point[] {
  if (!canStand(goal)) return [];
  if (clearSegment(start, goal, ROBOT_RADIUS)) return [{ ...goal }];
  const padding = ROBOT_RADIUS + 5;
  const corners = OBSTACLES.flatMap((o) => [
    { x: o.x - padding, y: o.y - padding },
    { x: o.x + o.width + padding, y: o.y - padding },
    { x: o.x - padding, y: o.y + o.height + padding },
    { x: o.x + o.width + padding, y: o.y + o.height + padding },
  ]).filter((p) => canStand(p));
  const nodes = [start, ...corners, goal];
  const end = nodes.length - 1;
  const cost = nodes.map(() => Infinity);
  const previous = nodes.map(() => -1);
  const visited = new Set<number>();
  cost[0] = 0;
  for (let step = 0; step < nodes.length; step++) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) {
      if (!visited.has(i) && (current < 0 || cost[i] < cost[current])) current = i;
    }
    if (current < 0 || !Number.isFinite(cost[current])) break;
    if (current === end) break;
    visited.add(current);
    for (let i = 1; i < nodes.length; i++) {
      if (i === current || visited.has(i) || !clearSegment(nodes[current], nodes[i], ROBOT_RADIUS)) continue;
      const next = cost[current] + distance(nodes[current], nodes[i]);
      if (next < cost[i]) {
        cost[i] = next;
        previous[i] = current;
      }
    }
  }
  if (!Number.isFinite(cost[end])) return [];
  const path: Point[] = [];
  for (let i = end; i > 0; i = previous[i]) {
    if (i < 0) return [];
    path.unshift({ ...nodes[i] });
  }
  return path;
}

export function selectRobots(battle: Battle, ids: string[]) {
  const alive = new Set(battle.robots.filter((r) => r.team === "red" && r.hp > 0).map((r) => r.id));
  battle.selected = [...new Set(ids.filter((id) => alive.has(id)))];
}

export function orderMove(battle: Battle, destination: Point): boolean {
  if (battle.phase !== "playing" || !canStand(destination)) return false;
  const units = battle.robots.filter((r) => battle.selected.includes(r.id) && r.hp > 0);
  if (!units.length) return false;
  const center = {
    x: units.reduce((sum, unit) => sum + unit.x, 0) / units.length,
    y: units.reduce((sum, unit) => sum + unit.y, 0) / units.length,
  };
  let ordered = false;
  for (const robot of units) {
    const target = units.length === 1 ? destination : {
      x: destination.x + robot.x - center.x,
      y: destination.y + robot.y - center.y,
    };
    const route = findRoute(robot, target);
    if (route.length) {
      robot.route = route;
      ordered = true;
    }
  }
  return ordered;
}

function moveRobot(battle: Battle, robot: Robot, dt: number) {
  const next = robot.route[0];
  if (!next) return;
  const remaining = distance(robot, next);
  if (remaining < 0.001) { robot.route.shift(); return; }
  const travel = Math.min(remaining, SPEED * dt);
  const proposed = {
    x: robot.x + (next.x - robot.x) * travel / remaining,
    y: robot.y + (next.y - robot.y) * travel / remaining,
  };
  if (!canStand(proposed)) { robot.route = []; return; }
  const collides = battle.robots.some((other) => other !== robot && other.hp > 0 &&
    distance(proposed, other) < ROBOT_RADIUS * 2);
  if (!collides) {
    robot.x = proposed.x;
    robot.y = proposed.y;
    if (travel >= remaining - 0.001) robot.route.shift();
  }
}

function nearestEnemy(battle: Battle, robot: Robot): Robot | undefined {
  return battle.robots.filter((enemy) => enemy.team !== robot.team && enemy.hp > 0)
    .sort((a, b) => distance(robot, a) - distance(robot, b))[0];
}

export function tickBattle(battle: Battle, dt: number) {
  if (battle.phase !== "playing" || !Number.isFinite(dt) || dt <= 0) return;
  const step = Math.min(dt, 0.05);
  battle.seconds = Math.min(MATCH_SECONDS, battle.seconds + step);
  battle.shots = battle.shots.filter((shot) => (shot.life -= step) > 0);

  for (const robot of battle.robots) {
    if (robot.hp <= 0) continue;
    robot.cooldown = Math.max(0, robot.cooldown - step);
    if (robot.team === "blue") {
      robot.rethink -= step;
      if (robot.rethink <= 0) {
        robot.rethink = 0.6;
        const target = nearestEnemy(battle, robot);
        robot.route = target && (distance(robot, target) > RANGE * 0.82 ||
          !clearSegment(robot, target, 0)) ? findRoute(robot, target) : [];
      }
    }
    moveRobot(battle, robot, step);
  }

  // Resolve shots together so the first entry in the robot array has no attack advantage.
  const pendingDamage = new Map<Robot, number>();
  for (const robot of battle.robots) {
    if (robot.hp <= 0 || robot.cooldown > 0) continue;
    const target = nearestEnemy(battle, robot);
    if (!target || distance(robot, target) > RANGE || !clearSegment(robot, target, 0)) continue;
    battle.shots.push({ from: { x: robot.x, y: robot.y }, to: { x: target.x, y: target.y }, life: 0.14, team: robot.team });
    pendingDamage.set(target, (pendingDamage.get(target) ?? 0) + SHOT_DAMAGE);
    robot.cooldown = SHOT_INTERVAL;
  }
  for (const [robot, damage] of pendingDamage) {
    robot.hp = Math.max(0, robot.hp - damage);
    if (robot.hp === 0) robot.route = [];
  }

  const red = battle.robots.filter((r) => r.team === "red").reduce((total, r) => total + r.hp, 0);
  const blue = battle.robots.filter((r) => r.team === "blue").reduce((total, r) => total + r.hp, 0);
  if (blue === 0 && red > 0) battle.phase = "victory";
  else if (red === 0 && blue > 0) battle.phase = "defeat";
  else if (red === 0 && blue === 0) battle.phase = "draw";
  else if (battle.seconds >= MATCH_SECONDS) battle.phase = red === blue ? "draw" : red > blue ? "victory" : "defeat";
  battle.selected = battle.selected.filter((id) => battle.robots.some((r) => r.id === id && r.hp > 0));
}
