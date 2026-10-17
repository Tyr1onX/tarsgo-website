import assert from "node:assert/strict";
import test from "node:test";
import {
  beginStringGesture,
  createStringState,
  moveStringGesture,
  releaseStringGesture,
  sampleString,
  stepStringState,
  stringMotionIsActive,
} from "./time-harp-physics.ts";

function dragFromRest(position, deltaX, maxDisplacement = 80) {
  const state = createStringState();
  beginStringGesture(state, position);
  moveStringGesture(state, deltaX, maxDisplacement, 0.12);
  return state;
}

function advance(state, seconds, reducedMotion = false) {
  const frames = Math.ceil(seconds * 120);
  for (let frame = 0; frame < frames; frame += 1) {
    stepStringState(state, seconds / frames, reducedMotion);
  }
}

function largestDisplacement(state) {
  return Math.max(...Array.from(state.displacement, Math.abs));
}

test("弦的两端固定，触点附近的形变最大并向远处递减", () => {
  const state = dragFromRest(0.35, 52);
  const nearTouch = Math.abs(sampleString(state, 0.38));
  const fartherAway = Math.abs(sampleString(state, 0.82));

  assert.equal(state.displacement[0], 0);
  assert.equal(state.displacement.at(-1), 0);
  assert.ok(nearTouch > fartherAway);
  assert.ok(fartherAway > 0);
});

test("触碰、拖动和释放按顺序交接交互状态", () => {
  const state = createStringState();
  assert.equal(state.gesture, null);

  const releasePosition = beginStringGesture(state, 0.29);
  assert.ok(state.gesture);
  moveStringGesture(state, 24, 70, 0.08);
  assert.ok(state.gesture);

  assert.equal(releaseStringGesture(state), releasePosition);
  assert.equal(state.gesture, null);
  assert.equal(stringMotionIsActive(state), true);
});

test("拖动和初始振动都受最大形变限制", () => {
  const state = dragFromRest(0.5, 900, 46);
  assert.ok(largestDisplacement(state) <= 46);
  assert.ok(Math.abs(sampleString(state, 0.5) - 46) < 1e-8);
});

test("释放后出现反向回弹并在约一秒内衰减", () => {
  const state = dragFromRest(0.5, 48);
  releaseStringGesture(state);
  const initial = largestDisplacement(state);
  let crossedCenter = false;
  let elapsed = 0;

  while (elapsed < 1.2) {
    advance(state, 1 / 120);
    elapsed += 1 / 120;
    if (sampleString(state, 0.5) < -0.5) crossedCenter = true;
  }

  assert.ok(crossedCenter, "弦应在释放后自然越过静止位置");
  assert.ok(largestDisplacement(state) < initial * 0.12);
  assert.ok(largestDisplacement(state) <= state.displacementLimit);
  assert.equal(state.displacement[0], 0);
  assert.equal(state.displacement.at(-1), 0);
  assert.equal(stringMotionIsActive(state), false);
});

test("振动期间再次触碰会从当前状态接管，边界仍固定", () => {
  const state = dragFromRest(0.42, -44);
  releaseStringGesture(state);
  advance(state, 0.08);
  const before = state.displacement.slice();

  const contact = beginStringGesture(state, 0.72);
  moveStringGesture(state, 0, 72, 0.02);

  assert.ok(Math.abs(sampleString(state, contact) - sampleArray(before, contact)) < 1e-8);
  assert.deepEqual(Array.from(state.displacement), Array.from(before));
  assert.equal(state.displacement[0], 0);
  assert.equal(state.displacement.at(-1), 0);
});

test("减少动态效果时，交互仍可形变，释放后快速安静下来", () => {
  const state = dragFromRest(0.63, 36);
  const held = largestDisplacement(state);
  releaseStringGesture(state);
  advance(state, 0.22, true);

  assert.ok(held > 30);
  assert.ok(largestDisplacement(state) < held * 0.02);
  assert.equal(stringMotionIsActive(state), false);
});

function sampleArray(values, position) {
  const last = values.length - 1;
  const location = Math.min(1, Math.max(0, position)) * last;
  const lower = Math.floor(location);
  const upper = Math.min(last, lower + 1);
  const fraction = location - lower;
  return values[lower] * (1 - fraction) + values[upper] * fraction;
}
