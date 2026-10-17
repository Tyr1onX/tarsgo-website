import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  beginStringGesture,
  createStringState,
  getStringDisplacementLimit,
  moveStringGesture,
  releaseStringGesture,
  sampleString,
  stepStringState,
  stringMotionIsActive,
  type StringState,
} from "../lib/time-harp-physics";
import {
  buildSmoothStudyPath,
  findNearestStudyString,
  getStudyLayout,
  getStudyNeckPoints,
  getSweepStringIndices,
  STUDY_STRING_COUNT,
  STUDY_VIEW_HEIGHT,
  STUDY_VIEW_WIDTH,
  STUDY_YEARS,
  type HarpForm,
  type StudyPoint,
  type StudyString,
  type StringArrangement,
} from "../lib/time-harp-study-model";

type LightBeam = {
  startedAt: number;
  position: number;
};

type ActivePointer = {
  pointerId: number;
  currentIndex: number;
  currentStartX: number;
  previousX: number;
  previousTime: number;
};

const BEAM_DURATION_MS = 760;
const REDUCED_BEAM_DURATION_MS = 180;
const STRING_HIT_WIDTH = 44;
const STUDY_FORMS: Array<{ id: HarpForm; key: string; name: string; descriptor: string }> = [
  { id: "literal", key: "A", name: "具象竖琴", descriptor: "乐器骨架" },
  { id: "abstract", key: "B", name: "抽象时间竖琴", descriptor: "错位秩序" },
  { id: "array", key: "C", name: "时间弦阵", descriptor: "时间场域" },
];
const ARRANGEMENTS: Array<{ id: StringArrangement; name: string; direction: string }> = [
  { id: "ascending", name: "长度递增", direction: "2018 → 2026" },
  { id: "descending", name: "长度递减", direction: "2026 → 2018" },
  { id: "artistic", name: "艺术曲线", direction: "错位 · 非对称" },
];

export default function TimeHarpStudy() {
  const svgRef = useRef<SVGSVGElement>(null);
  const stringRefs = useRef<Array<SVGPathElement | null>>([]);
  const upperBeamRefs = useRef<Array<SVGPathElement | null>>([]);
  const lowerBeamRefs = useRef<Array<SVGPathElement | null>>([]);
  const statesRef = useRef<StringState[] | null>(null);
  if (!statesRef.current) statesRef.current = STUDY_YEARS.map(() => createStringState());
  const beamsRef = useRef<Array<LightBeam | null>>(Array(STUDY_STRING_COUNT).fill(null));
  const activePointerRef = useRef<ActivePointer | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);
  const keyboardDirectionRef = useRef(1);
  const keyboardTimerRef = useRef<number | null>(null);
  const [form, setForm] = useState<HarpForm>("abstract");
  const [arrangement, setArrangement] = useState<StringArrangement>("artistic");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pressedIndex, setPressedIndex] = useState<number | null>(null);
  const layout = useMemo(() => getStudyLayout(form, arrangement), [form, arrangement]);
  const formInfo = STUDY_FORMS.find((item) => item.id === form) ?? STUDY_FORMS[1];
  const arrangementInfo = ARRANGEMENTS.find((item) => item.id === arrangement) ?? ARRANGEMENTS[2];

  useEffect(() => {
    document.body.classList.add("time-harp-study-body");
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = preference.matches;
    const updatePreference = (event: MediaQueryListEvent) => {
      reducedMotionRef.current = event.matches;
      if (event.matches) scheduleFrame();
    };
    preference.addEventListener("change", updatePreference);

    return () => {
      preference.removeEventListener("change", updatePreference);
      document.body.classList.remove("time-harp-study-body");
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (keyboardTimerRef.current !== null) window.clearTimeout(keyboardTimerRef.current);
    };
  }, []);

  useEffect(() => {
    activePointerRef.current = null;
    setPressedIndex(null);
    statesRef.current = STUDY_YEARS.map(() => createStringState());
    beamsRef.current = Array(STUDY_STRING_COUNT).fill(null);
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    lastFrameRef.current = null;
    paintStrings();
    paintBeams(performance.now());
  }, [layout]);

  function paintStrings() {
    const svg = svgRef.current;
    const states = statesRef.current;
    if (!svg || !states) return;
    const bounds = svg.getBoundingClientRect();

    layout.forEach((string, index) => {
      const element = stringRefs.current[index];
      if (element) {
        element.setAttribute("d", buildStringPath(
          states[index],
          string,
          bounds.width,
          bounds.height,
        ));
      }
    });
  }

  function paintBeams(now: number) {
    const svg = svgRef.current;
    const states = statesRef.current;
    if (!svg || !states) return false;
    const bounds = svg.getBoundingClientRect();
    let active = false;

    beamsRef.current.forEach((beam, index) => {
      const upper = upperBeamRefs.current[index];
      const lower = lowerBeamRefs.current[index];
      if (!upper || !lower) return;
      if (!beam) {
        upper.setAttribute("opacity", "0");
        lower.setAttribute("opacity", "0");
        return;
      }

      const duration = reducedMotionRef.current ? REDUCED_BEAM_DURATION_MS : BEAM_DURATION_MS;
      const progress = clamp((now - beam.startedAt) / duration, 0, 1);
      const opacity = (1 - progress) ** 2 * 0.82;
      const upperPosition = reducedMotionRef.current ? beam.position : beam.position * (1 - progress);
      const lowerPosition = reducedMotionRef.current
        ? beam.position
        : beam.position + (1 - beam.position) * progress;

      upper.setAttribute("d", buildBeamPath(states[index], layout[index], upperPosition, bounds.width, bounds.height));
      lower.setAttribute("d", buildBeamPath(states[index], layout[index], lowerPosition, bounds.width, bounds.height));
      upper.setAttribute("opacity", String(opacity));
      lower.setAttribute("opacity", String(opacity));
      if (progress >= 1) beamsRef.current[index] = null;
      else active = true;
    });

    return active;
  }

  function scheduleFrame() {
    if (frameRef.current !== null) return;
    lastFrameRef.current = null;
    frameRef.current = requestAnimationFrame(animate);
  }

  function animate(now: number) {
    frameRef.current = null;
    const states = statesRef.current;
    if (!states) return;
    const previous = lastFrameRef.current ?? now;
    const delta = Math.min(0.05, Math.max(0, (now - previous) / 1000));
    lastFrameRef.current = now;
    let motionActive = false;

    states.forEach((state) => {
      stepStringState(state, delta, reducedMotionRef.current);
      if (stringMotionIsActive(state)) motionActive = true;
    });
    paintStrings();
    const beamActive = paintBeams(now);

    if (motionActive || beamActive) {
      frameRef.current = requestAnimationFrame(animate);
      return;
    }

    lastFrameRef.current = null;
    states.forEach(settleStringState);
    paintStrings();
  }

  function getLinePosition(index: number, clientY: number, height: number) {
    const string = layout[index];
    const start = height * string.startY / STUDY_VIEW_HEIGHT;
    const end = height * string.endY / STUDY_VIEW_HEIGHT;
    return clamp((clientY - start) / Math.max(1, end - start), 0.03, 0.97);
  }

  function getDisplacementLimit(index: number, stageHeight: number) {
    const string = layout[index];
    const physicalLength = (string.endY - string.startY) / STUDY_VIEW_HEIGHT * stageHeight;
    return getStringDisplacementLimit(physicalLength);
  }

  function startLight(index: number, position: number) {
    beamsRef.current[index] = { startedAt: performance.now(), position };
    scheduleFrame();
  }

  function releaseString(index: number, launchLight: boolean) {
    const states = statesRef.current;
    if (!states) return;
    const position = releaseStringGesture(states[index]);
    if (launchLight && position !== null) startLight(index, position);
  }

  function triggerKeyboardPluck(index: number) {
    if (activePointerRef.current || !svgRef.current) return;
    const states = statesRef.current;
    if (!states) return;
    const bounds = svgRef.current.getBoundingClientRect();
    const maxDisplacement = getDisplacementLimit(index, bounds.height);
    const deltaX = keyboardDirectionRef.current * maxDisplacement * 0.72;
    keyboardDirectionRef.current *= -1;
    beginStringGesture(states[index], 0.5);
    moveStringGesture(states[index], deltaX, maxDisplacement, 0.11);
    const position = releaseStringGesture(states[index]);
    if (position !== null) startLight(index, position);
    setSelectedIndex(index);
    setPressedIndex(index);
    paintStrings();
    if (keyboardTimerRef.current !== null) window.clearTimeout(keyboardTimerRef.current);
    keyboardTimerRef.current = window.setTimeout(() => setPressedIndex(null), 110);
    scheduleFrame();
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (activePointerRef.current) return;
    const svg = event.currentTarget;
    const bounds = svg.getBoundingClientRect();
    const index = findNearestStudyString(layout, event.clientX, bounds.left, bounds.width, STRING_HIT_WIDTH);
    if (index === null) return;
    const states = statesRef.current;
    if (!states) return;

    beginStringGesture(states[index], getLinePosition(index, event.clientY - bounds.top, bounds.height));
    activePointerRef.current = {
      pointerId: event.pointerId,
      currentIndex: index,
      currentStartX: event.clientX,
      previousX: event.clientX,
      previousTime: event.timeStamp,
    };
    svg.setPointerCapture(event.pointerId);
    setSelectedIndex(index);
    setPressedIndex(index);
    paintStrings();
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const active = activePointerRef.current;
    const states = statesRef.current;
    if (!active || active.pointerId !== event.pointerId || !states || !svgRef.current) return;
    const bounds = svgRef.current.getBoundingClientRect();
    const nextIndex = findNearestStudyString(layout, event.clientX, bounds.left, bounds.width, STRING_HIT_WIDTH);
    const elapsed = Math.max(1 / 240, (event.timeStamp - active.previousTime) / 1000);

    if (nextIndex !== null && nextIndex !== active.currentIndex) {
      const crossed = getSweepStringIndices(active.currentIndex, nextIndex, layout.length);
      releaseString(active.currentIndex, true);

      crossed.forEach((index, offset) => {
        const position = getLinePosition(index, event.clientY - bounds.top, bounds.height);
        const maxDisplacement = getDisplacementLimit(index, bounds.height);
        beginStringGesture(states[index], position);
        const direction = Math.sign(event.clientX - active.previousX) || Math.sign(nextIndex - active.currentIndex) || 1;
        const impulseDistance = maxDisplacement * 0.72;
        const moved = moveStringGesture(states[index], direction * impulseDistance, maxDisplacement, elapsed);
        setSelectedIndex(index);
        active.currentIndex = index;
        active.currentStartX = event.clientX - direction * impulseDistance;
        if (moved.released && moved.releasePosition !== null) {
          startLight(index, moved.releasePosition);
        }
        if (offset < crossed.length - 1) releaseString(index, true);
      });
      setPressedIndex(nextIndex);
    } else {
      const state = states[active.currentIndex];
      if (state.gesture) {
        const maxDisplacement = getDisplacementLimit(active.currentIndex, bounds.height);
        const result = moveStringGesture(
          state,
          event.clientX - active.currentStartX,
          maxDisplacement,
          elapsed,
        );
        if (result.released && result.releasePosition !== null) {
          startLight(active.currentIndex, result.releasePosition);
          setPressedIndex(null);
        }
      }
    }

    active.previousX = event.clientX;
    active.previousTime = event.timeStamp;
    paintStrings();
  }

  function finishPointer(event: ReactPointerEvent<SVGSVGElement>, launchLight: boolean) {
    const active = activePointerRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    activePointerRef.current = null;
    releaseString(active.currentIndex, launchLight);
    setPressedIndex(null);
    scheduleFrame();
  }

  function changeForm(nextForm: HarpForm) {
    if (nextForm !== form) setForm(nextForm);
  }

  function changeArrangement(nextArrangement: StringArrangement) {
    if (nextArrangement !== arrangement) setArrangement(nextArrangement);
  }

  const neckPoints = getStudyNeckPoints(layout, form === "abstract" ? 38 : 30);

  return (
    <main className="time-harp-study">
      <header className="time-harp-study__hero">
        <div className="time-harp-study__eyebrow">
          <span>GIJIA · INTERACTION STUDY 02</span>
          <span>2018 — 2026</span>
        </div>
        <h1>时间有迹</h1>
        <p className="time-harp-study__english">TRACES OF TIME <span>／</span> FORM STUDY</p>
        <p className="time-harp-study__motto">以光为弦，以时间为谱。</p>
        <p className="time-harp-study__intro">一件暂未显露琴身的时间装置。触碰它，才知道它可以被演奏。</p>
      </header>

      <section className="time-harp-study__workspace" aria-label="时间竖琴形态交互研究">
        <div className="time-harp-study__controls">
          <div className="time-harp-study__control-group">
            <div className="time-harp-study__control-heading">
              <span className="time-harp-study__step">01</span>
              <span>形态</span>
            </div>
            <div className="time-harp-study__segmented" role="group" aria-label="切换琴体形态">
              {STUDY_FORMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={form === item.id ? "is-active" : ""}
                  aria-pressed={form === item.id}
                  onClick={() => changeForm(item.id)}
                >
                  <span className="time-harp-study__option-key">{item.key}</span>
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="time-harp-study__control-group">
            <div className="time-harp-study__control-heading">
              <span className="time-harp-study__step">02</span>
              <span>弦长排列</span>
            </div>
            <div className="time-harp-study__segmented time-harp-study__segmented--arrangement" role="group" aria-label="切换琴弦长度排列">
              {ARRANGEMENTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={arrangement === item.id ? "is-active" : ""}
                  aria-pressed={arrangement === item.id}
                  onClick={() => changeArrangement(item.id)}
                >
                  <span>{item.name}</span>
                  <small>{item.direction}</small>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="time-harp-study__instrument">
          <div className="time-harp-study__instrument-heading">
            <div>
              <span className="time-harp-study__micro-label">CURRENT FORM / {formInfo.key}</span>
              <h2>{formInfo.name}</h2>
            </div>
            <p>{formInfo.descriptor}<span> · </span>{arrangementInfo.name}</p>
          </div>

          <div className={`time-harp-study__stage time-harp-study__stage--${form}`}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${STUDY_VIEW_WIDTH} ${STUDY_VIEW_HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
              aria-labelledby="time-harp-study-title time-harp-study-description"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={(event) => finishPointer(event, true)}
              onPointerCancel={(event) => finishPointer(event, false)}
              onLostPointerCapture={(event) => finishPointer(event, false)}
            >
              <title id="time-harp-study-title">{formInfo.name}交互形态</title>
              <desc id="time-harp-study-description">九根琴弦分别对应2018至2026年。按住琴弦并横向拖动可以拨弦，横向扫过时会依次触发经过的琴弦。</desc>
              {form === "literal" && <LiteralFrame strings={layout} />}
              {form === "abstract" && <AbstractNeck points={neckPoints} />}
              {form === "array" && <ArrayGuides strings={layout} />}

              {layout.map((string, index) => (
                <g key={string.year} className={`time-harp-study__string-group${pressedIndex === index ? " is-pressed" : ""}${selectedIndex === index ? " is-selected" : ""}`}>
                  <path
                    ref={(element) => { stringRefs.current[index] = element; }}
                    className="time-harp-study__string"
                    d={`M ${string.x} ${string.startY} L ${string.x} ${string.endY}`}
                  />
                  <circle className="time-harp-study__string-stop" cx={string.x} cy={string.startY} r="3.2" />
                  <circle className="time-harp-study__string-stop time-harp-study__string-stop--end" cx={string.x} cy={string.endY} r="2.2" />
                  <path
                    ref={(element) => { upperBeamRefs.current[index] = element; }}
                    className="time-harp-study__light"
                    d="M 0 0 L 0 0"
                    opacity="0"
                  />
                  <path
                    ref={(element) => { lowerBeamRefs.current[index] = element; }}
                    className="time-harp-study__light"
                    d="M 0 0 L 0 0"
                    opacity="0"
                  />
                </g>
              ))}
              <line className="time-harp-study__time-axis" x1="36" x2="964" y1="870" y2="870" />
              <circle className="time-harp-study__focus-marker" cx={layout[selectedIndex]?.x ?? 56} cy="870" r="3" />
            </svg>
          </div>

          <div className="time-harp-study__year-row" aria-label="选择时间坐标">
            {layout.map((string, index) => (
              <button
                key={string.year}
                type="button"
                className={selectedIndex === index ? "is-selected" : ""}
                aria-pressed={selectedIndex === index}
                aria-label={`选择 ${string.year} 年；按空格或回车拨动对应琴弦`}
                onClick={() => setSelectedIndex(index)}
                onKeyDown={(event) => {
                  if (event.key !== " " && event.key !== "Enter") return;
                  event.preventDefault();
                  triggerKeyboardPluck(index);
                }}
              >
                {string.year}
              </button>
            ))}
          </div>

          <div className="time-harp-study__interaction-note">
            <span className="time-harp-study__interaction-mark" aria-hidden="true" />
            <p>按住并横向轻拨，或沿弦横向扫过；点击年份只定位时间坐标。</p>
            <span>触控命中带 44px</span>
          </div>
          <p className="time-harp-study__live-region" aria-live="polite" aria-atomic="true">
            已选择 {STUDY_YEARS[selectedIndex]} 年
          </p>
        </div>

        <section className="time-harp-study__reading" aria-labelledby="time-harp-study-reading-title">
          <div className="time-harp-study__reading-heading">
            <span className="time-harp-study__micro-label">FORM / LENGTH / TOUCH</span>
            <h2 id="time-harp-study-reading-title">形态研究记录</h2>
            <p>九根弦只标记年份，不代表真实队史事件。</p>
          </div>
          <div className="time-harp-study__research-grid">
            <article className={`time-harp-study__research-card${form === "literal" ? " is-current" : ""}`}>
              <span className="time-harp-study__research-key">A / FRAME</span>
              <h3>具象竖琴</h3>
              <p>以弧形琴颈、侧柱和底座建立熟悉的乐器轮廓。</p>
              <div className="time-harp-study__tradeoff"><b>优势</b>易于理解，交互预期清楚。<br /><b>取舍</b>器物感较强，神秘感稍弱。</div>
            </article>
            <article className={`time-harp-study__research-card${form === "abstract" ? " is-current" : ""}`}>
              <span className="time-harp-study__research-key">B / OFFSET ORDER <i>推荐</i></span>
              <h3>抽象时间竖琴</h3>
              <p>弦端沿错位的颈线排列，留下可辨认、未说尽的器物暗示。</p>
              <div className="time-harp-study__tradeoff"><b>优势</b>克制而有张力，空间留白充分。<br /><b>取舍</b>需要轻提示帮助用户发现可拨动。</div>
            </article>
            <article className={`time-harp-study__research-card${form === "array" ? " is-current" : ""}`}>
              <span className="time-harp-study__research-key">C / FIELD</span>
              <h3>时间弦阵</h3>
              <p>去掉完整琴身，让九根年份琴弦直接构成一片时间场域。</p>
              <div className="time-harp-study__tradeoff"><b>优势</b>轻盈、易扩展，阵列秩序突出。<br /><b>取舍</b>更像装置界面，琴的意象较弱。</div>
            </article>
          </div>

          <div className="time-harp-study__length-reading">
            <div>
              <span className="time-harp-study__micro-label">STRING LENGTH / 03 OPTIONS</span>
              <h3>弦长如何写出时间</h3>
            </div>
            <div className="time-harp-study__length-cards">
              <div className={arrangement === "ascending" ? "is-current" : ""}>
                <span>01</span><b>递增</b><p>方向明确、阅读自然；秩序感较强。</p>
              </div>
              <div className={arrangement === "descending" ? "is-current" : ""}>
                <span>02</span><b>递减</b><p>形成回望感；时间方向需要年份辅助。</p>
              </div>
              <div className={arrangement === "artistic" ? "is-current" : ""}>
                <span>03</span><b>艺术曲线</b><p>错落而连续，形成有机琴颈与节奏变化。</p>
              </div>
            </div>
          </div>

          <aside className="time-harp-study__recommendation">
            <span>当前建议</span>
            <p><b>B 抽象时间竖琴 × 艺术曲线。</b>保留年份阅读的清晰度，同时以非对称弦长制造“秩序发生偏移”的第一眼印象；触碰之后，琴弦的光与振动再揭示它可被演奏。</p>
          </aside>
        </section>
      </section>
      <footer className="time-harp-study__footer">TRACES OF TIME <span>·</span> V0.2 FORM STUDY</footer>
    </main>
  );
}

function LiteralFrame({ strings }: { strings: readonly StudyString[] }) {
  const left = (strings[0]?.x ?? 56) - 28;
  const right = (strings.at(-1)?.x ?? 944) + 28;
  const neck = getStudyNeckPoints(strings, 46);
  const top = buildSmoothStudyPath(neck);
  return (
    <g className="time-harp-study__frame" aria-hidden="true">
      <path className="time-harp-study__frame-main" d={`${top} L ${right + 30} 842 Q ${right + 30} 859 ${right + 12} 859`} />
      <path className="time-harp-study__frame-secondary" d={`M ${left - 22} 827 Q ${left - 34} 845 ${left - 13} 850 L ${left + 44} 850`} />
      <path className="time-harp-study__frame-secondary" d={`M ${left + 8} 850 Q 500 880 ${right + 10} 850`} />
      <path className="time-harp-study__frame-inlay" d={`M ${left - 22} 827 Q ${left - 34} 845 ${left - 13} 850`} />
    </g>
  );
}

function AbstractNeck({ points }: { points: readonly StudyPoint[] }) {
  const neck = buildSmoothStudyPath(points);
  const upperGuide = buildSmoothStudyPath(points.map(({ x, y }) => ({ x, y: y - 15 })));
  return (
    <g className="time-harp-study__abstract-neck" aria-hidden="true">
      <path className="time-harp-study__neck-ghost" d={upperGuide} />
      <path className="time-harp-study__neck-main" d={neck} />
      {points.map((point, index) => (
        <circle key={index} className="time-harp-study__neck-node" cx={point.x} cy={point.y} r={index === 3 ? 2.8 : 1.8} />
      ))}
      <path className="time-harp-study__abstract-axis" d="M 84 850 C 288 862 712 862 916 850" />
    </g>
  );
}

function ArrayGuides({ strings }: { strings: readonly StudyString[] }) {
  return (
    <g className="time-harp-study__array-guides" aria-hidden="true">
      <path d="M 28 258 H 972" />
      <path d="M 28 838 H 972" />
      {strings.map((string, index) => (
        <path key={string.year} d={`M ${string.x} ${string.startY - 22} v 10 M ${string.x + (index % 2 === 0 ? -7 : 7)} 846 v 16`} />
      ))}
    </g>
  );
}

function buildStringPath(state: StringState, string: StudyString, width: number, height: number) {
  const last = state.displacement.length - 1;
  const horizontalScale = STUDY_VIEW_WIDTH / Math.max(1, width);
  const points = Array.from({ length: last + 1 }, (_, index) => {
    const progress = index / last;
    return {
      x: string.x + state.displacement[index] * horizontalScale,
      y: string.startY + (string.endY - string.startY) * progress,
    };
  });
  return buildSmoothStudyPath(points);
}

function buildBeamPath(
  state: StringState,
  string: StudyString,
  position: number,
  width: number,
  height: number,
) {
  const last = state.displacement.length - 1;
  const center = clamp(position, 0, 1) * last;
  const first = clamp(center - 0.38, 0, last);
  const second = clamp(center + 0.38, 0, last);
  const point = (index: number) => {
    const progress = index / last;
    return {
      x: string.x + sampleString(state, progress) * STUDY_VIEW_WIDTH / Math.max(1, width),
      y: string.startY + (string.endY - string.startY) * progress,
    };
  };
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
