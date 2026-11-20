import type { CSSProperties } from "react";
import { groupMotionGeometry } from "../data/group-motion-geometry";
import "./tarsgo-motion-marks.css";

export const TARS_ROBOT_PATHS = [
  { d: "M59 15 L73 15 L82 10 L67 10Z", dir: [0, -16] as const, pillar: "front" as const, stage: 2 },
  { d: "M85 12 L73 18 L76 32 L88 24Z", dir: [14, -10] as const, pillar: "front" as const, stage: 2 },
  { d: "M57 17 L59 22 L67 22 L72 25 L72 34 L73 30 L70 18Z", dir: [4, -10] as const, pillar: "front" as const, stage: 2 },
  { d: "M30 27 L41 27 L46 23 L36 23Z", dir: [-14, -10] as const, pillar: "back" as const, stage: 0 },
  { d: "M48 25 L41 29 L42 37 L45 30 L48 28Z", dir: [-10, -8] as const, pillar: "back" as const, stage: 0 },
  { d: "M51 29 L63 29 L66 27 L56 26Z", dir: [0, -10] as const, pillar: "mid" as const, stage: 1 },
  {
    d: "M69 28 L65 30 L62 42 L49 73 L48 70 L62 32 L47 32 L22 85 L44 80 L48 72 L49 75 L47 82 L50 83 L54 74 L54 69 L57 66 L60 58 L59 54 L66 48Z M57.25 39.8 L59.8 39.8 L59.2 41.5 L56.65 41.5 Z M55.75 44.5 L58.3 44.5 L57.7 46.2 L55.15 46.2 Z M54.25 49.2 L56.8 49.2 L56.2 50.9 L53.65 50.9 Z M52.75 53.9 L55.3 53.9 L54.7 55.6 L52.15 55.6 Z M51.25 58.6 L53.8 58.6 L53.2 60.3 L50.65 60.3 Z",
    dir: [-16, 8] as const,
    pillar: "mid" as const,
    stage: 1,
  },
  { d: "M27 30 L33 56 L35 52 L33 36 L34 35 L36 37 L37 46 L40 42 L39 31Z", dir: [-16, -4] as const, pillar: "back" as const, stage: 0 },
  {
    d: "M82 32 L73 36 L72 40 L71 38 L66 72 L71 76 L71 88 L81 92 L72 44 L73 39 L76 47 L83 91 L92 86 L87 68 L93 65Z M77.4 42.7 L81.2 41.8 L82.0 43.4 L78.0 44.4 Z M78.8 46.4 L82.6 45.5 L83.3 47.1 L79.4 48.1 Z M80.2 50.1 L84.0 49.2 L84.6 50.9 L80.8 51.8 Z",
    dir: [16, 8] as const,
    pillar: "front" as const,
    stage: 2,
  },
  { d: "M90 69 L90 72 L95 85 L98 83 L94 68Z", dir: [12, 10] as const, pillar: "front" as const, stage: 2 },
  { d: "M66 75 L63 92 L68 89 L68 77Z", dir: [-4, 12] as const, pillar: "front" as const, stage: 2 },
  { d: "M62 78 L57 82 L56 93 L60 93Z", dir: [-6, 12] as const, pillar: "mid" as const, stage: 1 },
  { d: "M53 95 L44 82 L22 88 L31 95Z", dir: [-10, 14] as const, pillar: "mid" as const, stage: 1 },
] as const;

export const TARS_WORDMARK_POLYS = [
  "111,45 151,45 145,52 116,52",
  "126,54 135,54 135,68 126,77",
  "136,76 145,76 161,52 165,52 173,76 183,76 174,45 157,45",
  "152,72 165,60 167,68",
  "182,45 212,45 217,50 217,61 211,67 220,77 208,77 195,63 195,61 207,61 209,59 209,53 207,52 185,52",
  "186,56 194,56 194,77 185,77",
  "227,45 259,45 252,52 230,52 229,57 250,57 255,62 255,70 249,77 224,77 219,70 246,70 246,64 224,64 219,59 219,51",
  "263,45 298,45 291,52 260,52",
  "260,55 268,55 268,68 259,77",
  "293,57 293,77 263,77 269,70 283,70 285,68 285,63 273,63 276,58",
  "302,45 327,45 334,52 334,70 327,77 297,77 297,55 305,55 305,68 307,70 322,70 324,69 324,53 322,52 297,52",
] as const;

export const TARS_LED_PATHS = [
  "M57.25 39.8 L59.8 39.8 L59.2 41.5 L56.65 41.5 Z",
  "M55.75 44.5 L58.3 44.5 L57.7 46.2 L55.15 46.2 Z",
  "M54.25 49.2 L56.8 49.2 L56.2 50.9 L53.65 50.9 Z",
  "M52.75 53.9 L55.3 53.9 L54.7 55.6 L52.15 55.6 Z",
  "M51.25 58.6 L53.8 58.6 L53.2 60.3 L50.65 60.3 Z",
] as const;

export type GroupKey = "mech" | "elec" | "vision" | "ai" | "ops";

export function resolveGroupKey(groupName: string): GroupKey {
  if (groupName.includes("机械")) return "mech";
  if (groupName.includes("电控")) return "elec";
  if (groupName.includes("视觉")) return "vision";
  if (groupName.toUpperCase().includes("AI")) return "ai";
  return "ops";
}

function styleVars(vars: Record<string, string | number>): CSSProperties {
  return vars as CSSProperties;
}

export function GroupAnimatedMark({
  groupName,
  play = true,
  className = "",
}: {
  groupName: string;
  play?: boolean;
  className?: string;
}) {
  const key = resolveGroupKey(groupName);
  const playClass = play ? "group-motion--play" : "";

  if (key === "mech") {
    const { transform, outer, inner } = groupMotionGeometry.mech;
    return (
      <span className={`group-motion group-motion--mech ${playClass} ${className}`.trim()} aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
          <g transform={transform}>
            <g>
              {outer.map((item, i) => (
                <path
                  key={i}
                  className="gm-mech-outer"
                  style={styleVars({ "--dx": `${item.dx}px`, "--dy": `${item.dy}px`, "--i": i })}
                  d={item.d}
                  fillRule="evenodd"
                />
              ))}
            </g>
            <path className="gm-mech-bearing" d={inner} fillRule="evenodd" />
          </g>
        </svg>
      </span>
    );
  }

  if (key === "elec") {
    const { rings, bolts } = groupMotionGeometry.elec;
    return (
      <span className={`group-motion group-motion--elec ${playClass} ${className}`.trim()} aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -44.5 545 545">
          <g>
            {rings.map((d, i) => (
              <path key={`r-${i}`} className="gm-elec-ring" style={styleVars({ "--i": i })} d={d} />
            ))}
            {bolts.map((d, i) => (
              <path key={`b-${i}`} className="gm-elec-bolt" style={styleVars({ "--i": i })} d={d} />
            ))}
          </g>
        </svg>
      </span>
    );
  }

  if (key === "vision") {
    const { wings, iris } = groupMotionGeometry.vision;
    return (
      <span className={`group-motion group-motion--vision ${playClass} ${className}`.trim()} aria-hidden="true">
        <span className="gm-vis-reticle" />
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1600">
          <g>
            {wings.map((item, i) => (
              <path
                key={`w-${i}`}
                className="gm-vis-wing"
                style={styleVars({ "--side": item.side, "--i": i })}
                d={item.d}
                fillRule="evenodd"
              />
            ))}
          </g>
          <g>
            {iris.map((d, i) => (
              <path key={`ir-${i}`} className="gm-vis-iris" style={styleVars({ "--i": i })} d={d} fillRule="evenodd" />
            ))}
          </g>
        </svg>
      </span>
    );
  }

  if (key === "ai") {
    const { transform, star, beams } = groupMotionGeometry.ai;
    return (
      <span className={`group-motion group-motion--ai ${playClass} ${className}`.trim()} aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360">
          <g transform={transform}>
            {beams.map((item, i) => (
              <path
                key={i}
                className="gm-ai-beam"
                style={styleVars({ "--dx": `${item.dx}px`, "--dy": `${item.dy}px`, "--i": i })}
                d={item.d}
              />
            ))}
            <path className="gm-ai-star" d={star} />
          </g>
        </svg>
      </span>
    );
  }

  const { viewBox, segs } = groupMotionGeometry.ops;
  return (
    <span className={`group-motion group-motion--ops ${playClass} ${className}`.trim()} aria-hidden="true">
      <span className="gm-ops-glint" />
      <svg xmlns="http://www.w3.org/2000/svg" viewBox={viewBox}>
        <g>
          {segs.map((item, i) => (
            <path
              key={i}
              className="gm-ops-seg"
              style={styleVars({ "--dx": `${item.dx}px`, "--dy": `${item.dy}px`, "--i": i })}
              d={item.d}
              fillRule="evenodd"
            />
          ))}
        </g>
      </svg>
    </span>
  );
}

export function TarsgoHeroLogo({
  sweepKey = 0,
  className = "",
}: {
  sweepKey?: number;
  className?: string;
}) {
  return (
    <span className={`tarsgo-hero-logo ${className}`.trim()} role="img" aria-label="TARSGO">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="10 0 340 104" aria-hidden="true">
        <defs>
          <linearGradient id="tarsgo-hero-blade-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#D0AD69" stopOpacity="0" />
            <stop offset="32%" stopColor="#D0AD69" stopOpacity="0.28" />
            <stop offset="50%" stopColor="#FFFDF5" stopOpacity="0.95" />
            <stop offset="68%" stopColor="#D0AD69" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#D0AD69" stopOpacity="0" />
          </linearGradient>
          <mask id="tarsgo-hero-logo-mask">
            <g fill="#FFFFFF">
              {TARS_ROBOT_PATHS.map((p, i) => (
                <path key={`mr-${i}`} d={p.d} fillRule="evenodd" />
              ))}
              {TARS_WORDMARK_POLYS.map((pts, i) => (
                <polygon key={`mw-${i}`} points={pts} />
              ))}
            </g>
          </mask>
        </defs>
        <g fill="#FFFFFF">
          {TARS_ROBOT_PATHS.map((p, i) => (
            <path key={`r-${i}`} d={p.d} fillRule="evenodd" />
          ))}
          {TARS_WORDMARK_POLYS.map((pts, i) => (
            <polygon key={`w-${i}`} points={pts} />
          ))}
        </g>
        <g fill="#D0AD69">
          {TARS_LED_PATHS.map((d, i) => (
            <path key={`led-${i}`} className="tarsgo-hero-logo__led" d={d} />
          ))}
        </g>
        <g mask="url(#tarsgo-hero-logo-mask)">
          <rect
            key={sweepKey}
            className="tarsgo-hero-logo__blade"
            x="0"
            y="-12"
            width="40"
            height="128"
            fill="url(#tarsgo-hero-blade-grad)"
          />
        </g>
      </svg>
    </span>
  );
}
