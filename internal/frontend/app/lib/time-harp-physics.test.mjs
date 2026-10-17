import assert from "node:assert/strict";
import test from "node:test";
import {
  beginStringGesture,
  createStringState,
  getStringDisplacementLimit,
  moveStringGesture,
  releaseStringGesture,
  sampleString,
  stringDragAmplitude,
  stringPluckProfile,
  stepStringState,
  stringMotionIsActive,
} from "./time-harp-physics.ts";

function dragFromRest(position, deltaX, maxDisplacement = 12) {
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

test("拨弦轮廓的端点和触点切线连续，形变向远处递减", () => {
  const anchor = 0.35;
  const step = 1e-5;
  const leftSlope = (stringPluckProfile(anchor, anchor) - stringPluckProfile(anchor - step, anchor)) / step;
  const rightSlope = (stringPluckProfile(anchor + step, anchor) - stringPluckProfile(anchor, anchor)) / step;
  const startSlope = stringPluckProfile(step, anchor) / step;
  const endSlope = -stringPluckProfile(1 - step, anchor) / step;

  assert.equal(stringPluckProfile(0, anchor), 0);
  assert.equal(stringPluckProfile(anchor, anchor), 1);
  assert.equal(stringPluckProfile(1, anchor), 0);
  assert.ok(Math.abs(leftSlope) < 0.001);
  assert.ok(Math.abs(rightSlope) < 0.001);
  assert.ok(Math.abs(leftSlope - rightSlope) < 0.001);
  assert.ok(Math.abs(startSlope) < 0.001);
  assert.ok(Math.abs(endSlope) < 0.001);

  const state = dragFromRest(0.35, 52);
  const nearTouch = Math.abs(sampleString(state, 0.38));
  const fartherAway = Math.abs(sampleString(state, 0.82));

  assert.equal(state.displacement[0], 0);
  assert.equal(state.displacement.at(-1), 0);
  assert.ok(nearTouch > fartherAway);
  assert.ok(fartherAway > 0);
});

test("最大位移按实际弦长计算并限制在十至十八像素", () => {
  assert.equal(getStringDisplacementLimit(320), 10);
  assert.ok(Math.abs(getStringDisplacementLimit(400) - 11.2) < 1e-10);
  assert.equal(getStringDisplacementLimit(1200), 18);
});

test("拨动映射逐渐增加阻力，位移增长逐段变小", () => {
  const first = stringDragAmplitude(5, 12);
  const second = stringDragAmplitude(10, 12);
  const third = stringDragAmplitude(15, 12);

  assert.ok(first > 0);
  assert.ok(second > first);
  assert.ok(third > second);
  assert.ok(second - first > third - second);
  assert.ok(stringDragAmplitude(-10, 12) < 0);
});

test("触碰、拖动和释放按顺序交接交互状态", () => {
  const state = createStringState();
  assert.equal(state.gesture, null);

  const releasePosition = beginStringGesture(state, 0.29);
  assert.ok(state.gesture);
  moveStringGesture(state, 6, 12, 0.08);
  assert.ok(state.gesture);

  assert.equal(releaseStringGesture(state), releasePosition);
  assert.equal(state.gesture, null);
  assert.equal(stringMotionIsActive(state), true);
});

test("越过拨动阈值会脱弦并触发振动，位移仍受限", () => {
  const state = createStringState();
  const limit = 12;
  const releasePosition = beginStringGesture(state, 0.5);

  const belowThreshold = moveStringGesture(state, limit * 1.79, limit, 0.08);
  assert.equal(belowThreshold.released, false);
  assert.ok(state.gesture);

  const released = moveStringGesture(state, limit * 1.81, limit, 0.02);
  assert.equal(released.released, true);
  assert.equal(released.releasePosition, releasePosition);
  assert.equal(state.gesture, null);
  assert.ok(Math.abs(sampleString(state, 0.5)) <= limit);
  assert.ok(Math.abs(sampleString(state, 0.5) - limit) < 1e-8);
  assert.ok(largestDisplacement(state) <= limit);
  assert.equal(state.displacement[0], 0);
  assert.equal(state.displacement.at(-1), 0);
  assert.equal(stringMotionIsActive(state), true);

  advance(state, 0.4);
  assert.ok(largestDisplacement(state) <= limit);
});

test("释放后出现反向回弹并在约一秒内衰减", () => {
  const state = dragFromRest(0.5, 9);
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
  const state = dragFromRest(0.42, -8);
  releaseStringGesture(state);
  advance(state, 0.08);
  const before = state.displacement.slice();

  const contact = beginStringGesture(state, 0.72);
  moveStringGesture(state, 0, 12, 0.02);

  assert.ok(Math.abs(sampleString(state, contact) - sampleArray(before, contact)) < 1e-8);
  assert.deepEqual(Array.from(state.displacement), Array.from(before));
  assert.equal(state.displacement[0], 0);
  assert.equal(state.displacement.at(-1), 0);
});

test("减少动态效果时，交互仍可形变，释放后快速安静下来", () => {
  const state = dragFromRest(0.63, 7);
  const held = largestDisplacement(state);
  releaseStringGesture(state);
  advance(state, 0.22, true);

  assert.ok(held > 6);
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
