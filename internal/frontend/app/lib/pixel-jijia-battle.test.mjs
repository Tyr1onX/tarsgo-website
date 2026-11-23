import assert from "node:assert/strict";
import test from "node:test";
import {
  FIELD_WIDTH, FIELD_HEIGHT, MATCH_SECONDS, OBSTACLES,
  canStand, createBattle, findRoute, orderMove, selectRobots, tickBattle,
} from "./pixel-jijia-battle.ts";
import { FIELD_INSET, HIGH_WALLS } from "./pixel-jijia-field.ts";

test("rmul_2027.stl overhead geometry drives the same visible and physical map", () => {
  assert.equal(FIELD_WIDTH, 900);
  assert.equal(FIELD_HEIGHT, 614);
  assert.equal(FIELD_INSET, 900 * 300 / 12600);
  assert.deepEqual(OBSTACLES.map((area) => area.kind), ["platform", "platform", "guard", "guard"]);
  assert.equal(HIGH_WALLS.length, 2);
  assert.deepEqual(
    OBSTACLES.slice(0, 2).map((o) => [Math.round(o.bounds.x), Math.round(o.bounds.y), Math.round(o.bounds.width), Math.round(o.bounds.height)]),
    [[200, 236, 143, 357], [557, 21, 143, 357]],
  );
  assert.deepEqual(createBattle().robots.map((r) => [r.x, r.y, r.hp]), [
    [120, 190, 100], [120, 425, 100], [780, 190, 100], [780, 425, 100],
  ]);
});

test("the mesh perimeter, elevated platforms and guards are not passable", () => {
  for (const p of [
    { x: 10, y: 280 }, { x: 890, y: 280 }, { x: 450, y: 10 },
    { x: 280, y: 410 }, { x: 625, y: 180 },
    { x: 50, y: 570 }, { x: 850, y: 44 },
  ]) assert.equal(canStand(p), false, JSON.stringify(p));
  for (const p of [
    { x: 120, y: 190 }, { x: 120, y: 425 },
    { x: 780, y: 190 }, { x: 780, y: 425 },
    { x: 440, y: 310 },
  ]) assert.equal(canStand(p), true, JSON.stringify(p));
});

test("movement follows passable corridors around STL-derived platforms", () => {
  const start = { x: 120, y: 190 };
  const target = { x: 780, y: 190 };
  const route = findRoute(start, target);
  assert.ok(route.length >= 3, "the raised geometry must block the straight path");
  assert.deepEqual(route.at(-1), target);
  let before = start;
  for (const point of route) {
    const steps = Math.ceil(Math.hypot(point.x - before.x, point.y - before.y) / 4);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      assert.equal(canStand({ x: before.x + (point.x - before.x) * t, y: before.y + (point.y - before.y) * t }), true);
    }
    before = point;
  }
});

test("orders reject raised terrain and cannot start a ready match", () => {
  const battle = createBattle();
  assert.equal(orderMove(battle, { x: 450, y: 310 }), false);
  battle.phase = "playing";
  assert.equal(orderMove(battle, { x: 280, y: 410 }), false);
  selectRobots(battle, ["opponent-infantry-1", "tarsgo-infantry-1", "unknown"]);
  assert.deepEqual(battle.selected, ["tarsgo-infantry-1"]);
  assert.equal(orderMove(battle, { x: 450, y: 310 }), true);
  assert.ok(battle.robots[0].route.length);
});

test("selected units preserve formation in an open section", () => {
  const battle = createBattle();
  battle.phase = "playing";
  assert.equal(orderMove(battle, { x: 150, y: 305 }), true);
  assert.deepEqual(battle.robots[0].route.at(-1), { x: 150, y: 187.5 });
  assert.deepEqual(battle.robots[1].route.at(-1), { x: 150, y: 422.5 });
});

test("enemy AI advances and match settles while preserving the HP rules", () => {
  const battle = createBattle();
  battle.phase = "playing";
  const blueInitial = battle.robots[2].x;
  for (let i = 0; i < 120; i++) tickBattle(battle, 1 / 60);
  assert.ok(battle.robots[2].x < blueInitial, "enemy AI should pursue");
  assert.ok(battle.robots.every((robot) => robot.hp >= 0 && robot.hp <= 100));
  assert.ok(battle.seconds > 1.9 && battle.seconds < 2.1);
  for (const r of battle.robots.filter((r) => r.team === "blue")) r.hp = 0;
  tickBattle(battle, 1 / 60);
  assert.equal(battle.phase, "victory");
  const elapsed = battle.seconds;
  tickBattle(battle, 1 / 60);
  assert.equal(battle.seconds, elapsed);
});

test("simultaneous shots do not give either team an array-order advantage", () => {
  const battle = createBattle();
  battle.phase = "playing";
  battle.robots[0].x = 420; battle.robots[0].y = 100; battle.robots[0].hp = 10;
  battle.robots[1].hp = 0;
  battle.robots[2].x = 480; battle.robots[2].y = 100; battle.robots[2].hp = 10;
  battle.robots[3].hp = 0;
  tickBattle(battle, 1 / 60);
  assert.equal(battle.robots[0].hp, 0);
  assert.equal(battle.robots[2].hp, 0);
  assert.equal(battle.phase, "draw");
});

test("different orders lead to different results on the new field", () => {
  const run = (destination) => {
    const battle = createBattle();
    battle.phase = "playing";
    if (destination) assert.equal(orderMove(battle, destination), true);
    for (let i = 0; i < MATCH_SECONDS * 60 && battle.phase === "playing"; i++) {
      tickBattle(battle, 1 / 60);
    }
    return battle.phase;
  };
  assert.equal(run(null), "defeat");
  assert.equal(run({ x: 130, y: 530 }), "victory");
});

test("timeout compares remaining HP and a new match resets the battle", () => {
  const battle = createBattle();
  battle.phase = "playing";
  battle.seconds = MATCH_SECONDS - 0.01;
  battle.robots[2].hp = 30;
  tickBattle(battle, 0.05);
  assert.equal(battle.phase, "victory");
  const again = createBattle();
  assert.equal(again.phase, "ready");
  assert.deepEqual(again.robots.map((r) => r.hp), [100, 100, 100, 100]);
});
