import assert from "node:assert/strict";
import test from "node:test";
import {
  FIELD_WIDTH, FIELD_HEIGHT, MATCH_SECONDS, OBSTACLES,
  canStand, createBattle, findRoute, orderMove, selectRobots, tickBattle,
} from "./pixel-jijia-battle.ts";

test("training-v0 matches the simulator's first-steps roster, arena and baseline values", () => {
  const battle = createBattle();
  assert.equal(FIELD_WIDTH, 900);
  assert.equal(FIELD_HEIGHT, 520);
  assert.equal(MATCH_SECONDS, 150);
  assert.equal(OBSTACLES.length, 3);
  assert.deepEqual(battle.robots.map((robot) => [robot.id, robot.x, robot.y, robot.hp]), [
    ["tarsgo-infantry-1", 120, 210, 100],
    ["tarsgo-infantry-2", 120, 310, 100],
    ["opponent-infantry-1", 780, 210, 100],
    ["opponent-infantry-2", 780, 310, 100],
  ]);
  assert.equal(battle.phase, "ready");
});

test("orders cannot start a match accidentally, and impassable destinations are rejected", () => {
  const battle = createBattle();
  assert.equal(orderMove(battle, { x: 700, y: 260 }), false);
  battle.phase = "playing";
  assert.equal(orderMove(battle, { x: 420, y: 200 }), false);
  selectRobots(battle, ["opponent-infantry-1", "tarsgo-infantry-1", "unknown"]);
  assert.deepEqual(battle.selected, ["tarsgo-infantry-1"]);
  assert.equal(orderMove(battle, { x: 700, y: 260 }), true);
  assert.ok(battle.robots[0].route.length);
});

test("visibility graph takes units around the actual wall rather than through it", () => {
  const start = { x: 120, y: 210 };
  const goal = { x: 780, y: 210 };
  const waypoints = findRoute(start, goal);
  assert.ok(waypoints.length >= 2);
  assert.deepEqual(waypoints.at(-1), goal);
  assert.ok(waypoints.every((point) => canStand(point)));
  for (const point of [{ x: 440, y: 225 }, { x: 275, y: 195 }])
    assert.equal(canStand(point), false);
});

test("selected units keep their formation while taking movement orders", () => {
  const battle = createBattle();
  battle.phase = "playing";
  assert.equal(orderMove(battle, { x: 190, y: 260 }), true);
  assert.deepEqual(battle.robots[0].route.at(-1), { x: 190, y: 210 });
  assert.deepEqual(battle.robots[1].route.at(-1), { x: 190, y: 310 });
});

test("AI advances, attacks are bounded and a match settles in a result", () => {
  const battle = createBattle();
  battle.phase = "playing";
  const blueInitial = battle.robots[2].x;
  for (let i = 0; i < 120; i++) tickBattle(battle, 1 / 60);
  assert.ok(battle.robots[2].x < blueInitial, "enemy AI should pursue");
  assert.ok(battle.robots.every((robot) => robot.hp <= 100 && robot.hp >= 0));
  assert.ok(battle.seconds > 1.9 && battle.seconds < 2.1);
  battle.robots.filter((robot) => robot.team === "blue").forEach((robot) => { robot.hp = 0; });
  tickBattle(battle, 1 / 60);
  assert.equal(battle.phase, "victory");
  const elapsed = battle.seconds;
  tickBattle(battle, 1 / 60);
  assert.equal(battle.seconds, elapsed);
});

test("simultaneous shots do not give either team an array-order advantage", () => {
  const battle = createBattle();
  battle.phase = "playing";
  battle.robots[0].x = 200; battle.robots[0].y = 90; battle.robots[0].hp = 10;
  battle.robots[1].hp = 0;
  battle.robots[2].x = 260; battle.robots[2].y = 90; battle.robots[2].hp = 10;
  battle.robots[3].hp = 0;
  tickBattle(battle, 1 / 60);
  assert.equal(battle.robots[0].hp, 0);
  assert.equal(battle.robots[2].hp, 0);
  assert.equal(battle.phase, "draw");
});

test("real movement changes the battle outcome: passive play draws, an upper flank wins", () => {
  const run = (destination) => {
    const battle = createBattle();
    battle.phase = "playing";
    if (destination) assert.equal(orderMove(battle, destination), true);
    for (let tick = 0; tick < 9000 && battle.phase === "playing"; tick++) {
      tickBattle(battle, 1 / 60);
    }
    return battle.phase;
  };
  assert.equal(run(null), "draw");
  assert.equal(run({ x: 270, y: 90 }), "victory");
});

test("timeout compares remaining HP, and reset restores a fresh game", () => {
  const battle = createBattle();
  battle.phase = "playing";
  battle.seconds = MATCH_SECONDS - 0.01;
  battle.robots[2].hp = 30;
  tickBattle(battle, 0.05);
  assert.equal(battle.phase, "victory");
  const again = createBattle();
  assert.equal(again.phase, "ready");
  assert.deepEqual(again.robots.map((robot) => robot.hp), [100, 100, 100, 100]);
});
