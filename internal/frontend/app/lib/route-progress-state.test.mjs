import assert from "node:assert/strict";
import test from "node:test";
import {
  ROUTE_PROGRESS_REVEAL_DELAY_MS,
  ROUTE_PROGRESS_SETTLE_DELAY_MS,
  routeProgressReducer,
} from "./route-progress-state.ts";

test("a route that finishes before the reveal delay never flashes the indicator", () => {
  const waiting = routeProgressReducer("hidden", { type: "navigation-started" });
  assert.equal(waiting, "waiting");
  assert.equal(routeProgressReducer(waiting, { type: "navigation-finished" }), "hidden");
  assert.equal(ROUTE_PROGRESS_REVEAL_DELAY_MS, 120);
});

test("a visible route indicator moves, aligns on completion, then settles", () => {
  const moving = routeProgressReducer("waiting", { type: "reveal" });
  const aligned = routeProgressReducer(moving, { type: "navigation-finished" });

  assert.equal(moving, "moving");
  assert.equal(aligned, "aligned");
  assert.equal(routeProgressReducer(aligned, { type: "settle" }), "hidden");
  assert.equal(ROUTE_PROGRESS_SETTLE_DELAY_MS, 240);
});

test("a new navigation takes over while the lines are aligning", () => {
  assert.equal(
    routeProgressReducer("aligned", { type: "navigation-started" }),
    "moving",
  );
  assert.equal(routeProgressReducer("moving", { type: "navigation-started" }), "moving");
});
