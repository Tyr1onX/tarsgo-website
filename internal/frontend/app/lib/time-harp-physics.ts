export const STRING_SAMPLE_COUNT = 41;

const WAVE_SPEED = 5.4;
const DAMPING = 6.5;
const MAX_STEP_SECONDS = 1 / 500;
const MAX_DRAG_SPEED = 1_600;
const REDUCED_MOTION_SETTLE_RATE = 32;

export type StringState = {
  displacement: Float64Array;
  velocity: Float64Array;
  previousDisplacement: Float64Array;
  displacementLimit: number;
  gesture: {
    index: number;
    startDisplacement: number;
    previousAmplitude: number;
    originDisplacement: Float64Array;
    originVelocity: Float64Array;
  } | null;
};

export function createStringState(sampleCount = STRING_SAMPLE_COUNT): StringState {
  const safeCount = Math.max(5, Math.floor(sampleCount));
  return {
    displacement: new Float64Array(safeCount),
    velocity: new Float64Array(safeCount),
    previousDisplacement: new Float64Array(safeCount),
    displacementLimit: Number.POSITIVE_INFINITY,
    gesture: null,
  };
}

export function beginStringGesture(state: StringState, position: number): number {
  const last = state.displacement.length - 1;
  const index = clamp(Math.round(clamp(position, 0, 1) * last), 1, last - 1);

  state.gesture = {
    index,
    startDisplacement: state.displacement[index],
    previousAmplitude: 0,
    originDisplacement: state.displacement.slice(),
    originVelocity: state.velocity.slice(),
  };

  return index / last;
}

export function moveStringGesture(
  state: StringState,
  deltaX: number,
  maxDisplacement: number,
  deltaSeconds: number,
) {
  const gesture = state.gesture;
  if (!gesture) return;

  const limit = Math.max(0, maxDisplacement);
  state.displacementLimit = Math.max(limit, largestMagnitude(gesture.originDisplacement));
  const target = clamp(gesture.startDisplacement + deltaX, -limit, limit);
  const amplitude = target - gesture.startDisplacement;
  const elapsed = Math.max(1 / 240, deltaSeconds);
  const amplitudeVelocity = clamp(
    (amplitude - gesture.previousAmplitude) / elapsed,
    -MAX_DRAG_SPEED,
    MAX_DRAG_SPEED,
  );
  const last = state.displacement.length - 1;

  for (let index = 0; index <= last; index += 1) {
    const profile = triangleProfile(index, gesture.index, last);
    state.displacement[index] = clamp(
      gesture.originDisplacement[index] + amplitude * profile,
      -limit,
      limit,
    );
    state.velocity[index] = gesture.originVelocity[index] + amplitudeVelocity * profile;
  }

  state.displacement[0] = 0;
  state.displacement[last] = 0;
  state.velocity[0] = 0;
  state.velocity[last] = 0;
  gesture.previousAmplitude = amplitude;
}

export function releaseStringGesture(state: StringState) {
  const releasePosition = state.gesture
    ? state.gesture.index / (state.displacement.length - 1)
    : null;
  state.gesture = null;
  return releasePosition;
}

export function stepStringState(state: StringState, deltaSeconds: number, reducedMotion = false) {
  if (state.gesture) return;

  const elapsed = clamp(deltaSeconds, 0, 0.05);
  if (elapsed === 0) return;

  if (reducedMotion) {
    const settle = Math.exp(-REDUCED_MOTION_SETTLE_RATE * elapsed);
    for (let index = 1; index < state.displacement.length - 1; index += 1) {
      state.displacement[index] *= settle;
      state.velocity[index] = 0;
    }
    settleBoundaries(state);
    return;
  }

  const last = state.displacement.length - 1;
  const spacing = 1 / last;
  const tension = (WAVE_SPEED / spacing) ** 2;
  const substeps = Math.max(1, Math.ceil(elapsed / MAX_STEP_SECONDS));
  const step = elapsed / substeps;

  for (let substep = 0; substep < substeps; substep += 1) {
    state.previousDisplacement.set(state.displacement);
    const currentDisplacement = state.previousDisplacement;
    for (let index = 1; index < last; index += 1) {
      const left = currentDisplacement[index - 1];
      const center = currentDisplacement[index];
      const right = currentDisplacement[index + 1];
      const acceleration = tension * (left - 2 * center + right) - DAMPING * state.velocity[index];
      state.velocity[index] += acceleration * step;
      const nextPosition = center + state.velocity[index] * step;
      const boundedPosition = clamp(nextPosition, -state.displacementLimit, state.displacementLimit);
      if (boundedPosition !== nextPosition && Math.sign(state.velocity[index]) === Math.sign(nextPosition)) {
        state.velocity[index] = 0;
      }
      state.displacement[index] = boundedPosition;
    }

    settleBoundaries(state);
  }
}

export function stringMotionIsActive(state: StringState) {
  if (state.gesture) return false;

  for (let index = 1; index < state.displacement.length - 1; index += 1) {
    if (Math.abs(state.displacement[index]) > 1.2 || Math.abs(state.velocity[index]) > 28) {
      return true;
    }
  }

  return false;
}

export function sampleString(state: StringState, position: number) {
  const last = state.displacement.length - 1;
  const location = clamp(position, 0, 1) * last;
  const lower = Math.floor(location);
  const upper = Math.min(last, lower + 1);
  const fraction = location - lower;
  return state.displacement[lower] * (1 - fraction) + state.displacement[upper] * fraction;
}

function triangleProfile(index: number, anchor: number, last: number) {
  if (index === 0 || index === last) return 0;
  if (index === anchor) return 1;
  if (index < anchor) return index / anchor;
  return (last - index) / (last - anchor);
}

function settleBoundaries(state: StringState) {
  const last = state.displacement.length - 1;
  state.displacement[0] = 0;
  state.displacement[last] = 0;
  state.velocity[0] = 0;
  state.velocity[last] = 0;
}

function largestMagnitude(values: Float64Array) {
  let largest = 0;
  for (const value of values) largest = Math.max(largest, Math.abs(value));
  return largest;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
