import assert from "node:assert/strict";
import test from "node:test";
import { capabilityRadarPoint, capabilityRadarPolygon } from "./capability-radar.ts";

test("capability radar maps 0 and 100 to center and edge", () => {
  assert.deepEqual(capabilityRadarPoint(0, 3, 0), { x: 180, y: 145 });
  const edge = capabilityRadarPoint(0, 3, 100);
  assert.equal(edge.x.toFixed(2), "180.00");
  assert.equal(edge.y.toFixed(2), "45.00");
});

test("capability radar omits a filled polygon when a dimension is unevaluated", () => {
  assert.equal(capabilityRadarPolygon([80, null, 65]), null);
  assert.equal(capabilityRadarPolygon([80, 65]), null);
});

test("capability radar makes a deterministic polygon for complete scores", () => {
  assert.equal(capabilityRadarPolygon([100, 100, 100]), "180.00,45.00 266.60,195.00 93.40,195.00");
});
