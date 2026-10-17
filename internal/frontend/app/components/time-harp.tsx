import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  beginStringGesture,
  createStringState,
  moveStringGesture,
  releaseStringGesture,
  sampleString,
  stepStringState,
  stringMotionIsActive,
  type StringState,
} from "../lib/time-harp-physics";

const VIEW_SIZE = 1000;
const BEAM_DURATION_MS = 760;
const REDUCED_BEAM_DURATION_MS = 180;

type PointerGesture = {
  pointerId: number;
  startX: number;
  previousTime: number;
  maxDisplacement: number;
};

type LightBeam = {
  startedAt: number;
  position: number;
};

export default function TimeHarp() {
  const svgRef = useRef<SVGSVGElement>(null);
  const stringRef = useRef<SVGPathElement>(null);
  const upperBeamRef = useRef<SVGPathElement>(null);
  const lowerBeamRef = useRef<SVGPathElement>(null);
  const stateRef = useRef<StringState>(createStringState());
  const pointerRef = useRef<PointerGesture | null>(null);
  const beamRef = useRef<LightBeam | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);
  const [pressed, setPressed] = useState(false);
  const keyboardDirectionRef = useRef(1);

  useEffect(() => {
    document.body.classList.add("traces-of-time-body");
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = preference.matches;

    const updatePreference = (event: MediaQueryListEvent) => {
      reducedMotionRef.current = event.matches;
      if (event.matches) scheduleFrame();
    };

    preference.addEventListener("change", updatePreference);

    return () => {
      preference.removeEventListener("change", updatePreference);
      document.body.classList.remove("traces-of-time-body");
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  function paintString() {
    const svg = svgRef.current;
    const string = stringRef.current;
    if (!svg || !string) return;

    const bounds = svg.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    string.setAttribute("d", buildStringPath(stateRef.current, width));
  }

  function paintBeams(now: number) {
    const upper = upperBeamRef.current;
    const lower = lowerBeamRef.current;
    const beam = beamRef.current;
    const width = svgRef.current?.getBoundingClientRect().width ?? 1;
    if (!upper || !lower) return false;

    if (!beam) {
      upper.setAttribute("opacity", "0");
      lower.setAttribute("opacity", "0");
      return false;
    }

    const duration = reducedMotionRef.current ? REDUCED_BEAM_DURATION_MS : BEAM_DURATION_MS;
    const progress = clamp((now - beam.startedAt) / duration, 0, 1);
    const opacity = (1 - progress) ** 2 * 0.82;
    const upperPosition = reducedMotionRef.current
      ? beam.position
      : beam.position * (1 - progress);
    const lowerPosition = reducedMotionRef.current
      ? beam.position
      : beam.position + (1 - beam.position) * progress;

    upper.setAttribute("d", buildBeamPath(stateRef.current, upperPosition, width));
    lower.setAttribute("d", buildBeamPath(stateRef.current, lowerPosition, width));
    upper.setAttribute("opacity", String(opacity));
    lower.setAttribute("opacity", String(opacity));

    if (progress >= 1) beamRef.current = null;
    return progress < 1;
  }

  function scheduleFrame() {
    if (frameRef.current !== null) return;
    lastFrameRef.current = null;
    frameRef.current = requestAnimationFrame(animate);
  }

  function animate(now: number) {
    frameRef.current = null;
    const previous = lastFrameRef.current ?? now;
    const delta = Math.min(0.05, Math.max(0, (now - previous) / 1000));
    lastFrameRef.current = now;

    stepStringState(stateRef.current, delta, reducedMotionRef.current);
    paintString();
    const beamActive = paintBeams(now);

    if (stringMotionIsActive(stateRef.current) || beamActive) {
      frameRef.current = requestAnimationFrame(animate);
      return;
    }

    lastFrameRef.current = null;
    settleStringState(stateRef.current);
    paintString();
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (pointerRef.current) return;

    const svg = svgRef.current;
    const hitArea = event.currentTarget;
    if (!svg) return;

    const bounds = hitArea.getBoundingClientRect();
    const position = clamp((event.clientY - bounds.top) / Math.max(1, bounds.height), 0, 1);
    const lineBounds = svg.getBoundingClientRect();
    const maxDisplacement = clamp(lineBounds.width * 0.12, 42, 88);

    beamRef.current = null;
    pointerRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      previousTime: event.timeStamp,
      maxDisplacement,
    };
    beginStringGesture(stateRef.current, position);
    hitArea.setPointerCapture(event.pointerId);
    setPressed(true);
    paintString();
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = pointerRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const elapsed = Math.max(1 / 240, (event.timeStamp - gesture.previousTime) / 1000);
    moveStringGesture(
      stateRef.current,
      event.clientX - gesture.startX,
      gesture.maxDisplacement,
      elapsed,
    );
    gesture.previousTime = event.timeStamp;
    paintString();
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    finishPointer(event, true);
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLButtonElement>) {
    finishPointer(event, false);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if ((event.key !== " " && event.key !== "Enter") || event.repeat) return;
    if (pointerRef.current) return;
    event.preventDefault();

    const amplitude = keyboardDirectionRef.current * 42;
    keyboardDirectionRef.current *= -1;
    beginStringGesture(stateRef.current, 0.5);
    moveStringGesture(stateRef.current, amplitude, 68, 0.11);
    const releasePosition = releaseStringGesture(stateRef.current);
    beamRef.current = releasePosition === null
      ? null
      : { startedAt: performance.now(), position: releasePosition };
    setPressed(true);
    paintString();
    window.setTimeout(() => {
      if (!pointerRef.current) setPressed(false);
    }, 110);
    scheduleFrame();
  }

  function finishPointer(event: ReactPointerEvent<HTMLButtonElement>, launchLight: boolean) {
    const gesture = pointerRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    pointerRef.current = null;
    const releasePosition = releaseStringGesture(stateRef.current);
    setPressed(false);
    if (launchLight && releasePosition !== null && Math.abs(event.clientX - gesture.startX) > 0.6) {
      beamRef.current = { startedAt: performance.now(), position: releasePosition };
    }
    scheduleFrame();
  }

  return (
    <main className={`time-harp${pressed ? " is-pressed" : ""}`}>
      <header className="time-harp__heading">
        <h1>时间有迹</h1>
        <p>TRACES OF TIME</p>
      </header>

      <span className="time-harp__year">2018</span>

      <div className="time-harp__string-stage">
        <svg
          ref={svgRef}
          className="time-harp__svg"
          viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path ref={stringRef} className="time-harp__string" d="M 500 0 L 500 1000" />
          <path ref={upperBeamRef} className="time-harp__light" d="M 500 0 L 500 0" opacity="0" />
          <path ref={lowerBeamRef} className="time-harp__light" d="M 500 0 L 500 0" opacity="0" />
        </svg>
        <button
          className="time-harp__hit-area"
          type="button"
          aria-label="时间竖琴。按住并横向拖动，或按空格键、回车键拨弦。"
          aria-keyshortcuts="Space Enter"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onLostPointerCapture={handlePointerCancel}
          onKeyDown={handleKeyDown}
        />
      </div>

      <p className="time-harp__prompt">轻拨琴弦，唤醒记忆</p>
      <span className="sr-only" aria-live="polite">{pressed ? "琴弦已触碰" : ""}</span>
    </main>
  );
}

function buildStringPath(state: StringState, width: number) {
  const last = state.displacement.length - 1;
  const scale = VIEW_SIZE / width;
  const point = (index: number) => ({
    x: VIEW_SIZE / 2 + state.displacement[index] * scale,
    y: (index / last) * VIEW_SIZE,
  });

  let path = "M 500 0";
  for (let index = 1; index < last; index += 1) {
    const current = point(index);
    const next = point(index + 1);
    path += ` Q ${current.x.toFixed(2)} ${current.y.toFixed(2)} ${((current.x + next.x) / 2).toFixed(2)} ${((current.y + next.y) / 2).toFixed(2)}`;
  }

  const end = point(last);
  return `${path} Q ${end.x.toFixed(2)} ${end.y.toFixed(2)} 500 ${VIEW_SIZE}`;
}

function buildBeamPath(state: StringState, position: number, width: number) {
  const center = clamp(position, 0, 1) * (state.displacement.length - 1);
  const first = clamp(center - 0.38, 0, state.displacement.length - 1);
  const second = clamp(center + 0.38, 0, state.displacement.length - 1);
  const point = (index: number) => ({
    x: VIEW_SIZE / 2 + sampleString(state, index / (state.displacement.length - 1)) * VIEW_SIZE / Math.max(1, width),
    y: (index / (state.displacement.length - 1)) * VIEW_SIZE,
  });
  const from = point(first);
  const to = point(second);
  return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} L ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
}

function settleStringState(state: StringState) {
  if (state.gesture) return;
  for (let index = 0; index < state.displacement.length; index += 1) {
    state.displacement[index] = 0;
    state.velocity[index] = 0;
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
