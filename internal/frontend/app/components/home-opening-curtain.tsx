import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  GroupAnimatedMark,
  TARS_LED_PATHS,
  TARS_ROBOT_PATHS,
  TARS_WORDMARK_POLYS,
} from "./tarsgo-motion-marks";
import "./home-opening-curtain.css";

const SESSION_KEY = "tarsgo-opening-seen";
const OPENING_GROUPS = ["机械组", "电控组", "视觉组", "AI组", "运营组"] as const;

export type OpeningPhase = "idle" | "playing" | "docking" | "done";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function clearRootPending() {
  if (typeof document !== "undefined") {
    delete document.documentElement.dataset.homeOpening;
  }
}

export function HomeOpeningCurtain({
  enabled,
  targetSelector = "#home-hero-logo-slot",
  onPhaseChange,
}: {
  enabled: boolean;
  targetSelector?: string;
  onPhaseChange?: (phase: OpeningPhase) => void;
}) {
  const [phase, setPhase] = useState<OpeningPhase>("idle");
  const [stage, setStage] = useState(0);
  const curtainRef = useRef<HTMLDivElement | null>(null);
  const logoBoxRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const timersRef = useRef<number[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  useIsomorphicLayoutEffect(() => {
    if (!enabled) {
      clearRootPending();
      setPhase("done");
      onPhaseChange?.("done");
      return;
    }
    if (typeof window === "undefined") return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      seen = false;
    }

    if (reducedMotion || seen) {
      clearRootPending();
      setPhase("done");
      onPhaseChange?.("done");
      return;
    }

    try {
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Ignore storage failures in restricted browsing modes.
    }

    setPhase("playing");
    onPhaseChange?.("playing");

    const skip = () => {
      clearTimers();
      clearRootPending();
      setPhase("done");
      onPhaseChange?.("done");
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") skip();
    };
    window.addEventListener("pointerdown", skip);
    window.addEventListener("keydown", onKeyDown);

    const schedule = (fn: () => void, ms: number) => {
      timersRef.current.push(window.setTimeout(fn, ms));
    };

    // Stage 1: Gold axis expands + 5 sculptural division emblems ignite left -> right
    schedule(() => setStage(1), 40);

    // Stage 2: Axis + 5 divisions compress smoothly to center core
    schedule(() => {
      const container = curtainRef.current;
      const cx = container ? container.getBoundingClientRect().width / 2 : window.innerWidth / 2;
      nodeRefs.current.forEach((node) => {
        if (!node) return;
        const rect = node.getBoundingClientRect();
        const dx = cx - (rect.left + rect.width / 2);
        node.style.setProperty("--converge-x", `${dx.toFixed(1)}px`);
      });
      setStage(2);
    }, 1340);

    // Stage 3: Core spark + razor-thin optical ring + TARS blueprint wireframe
    schedule(() => setStage(3), 1820);

    // Stage 4: TARS 3-pillar mechanical lock (back -> mid -> front)
    schedule(() => setStage(4), 2080);

    // Stage 5: 24-deg champagne-gold blade sweeps out to physically unveil TARSGO + LEDs
    schedule(() => setStage(5), 2540);

    // Stage 6 (Docking): Measure exact Hero logo slot and FLIP-morph the TARSGO logo into place
    // while melting the dark backdrop away to reveal the live Hero video underneath!
    schedule(() => {
      clearRootPending();
      const logoEl = logoBoxRef.current;
      const targetEl = document.querySelector<HTMLElement>(targetSelector);
      if (logoEl && targetEl) {
        const from = logoEl.getBoundingClientRect();
        const to = targetEl.getBoundingClientRect();
        if (from.width > 0 && to.width > 0) {
          const dx = to.left + to.width / 2 - (from.left + from.width / 2);
          const dy = to.top + to.height / 2 - (from.top + from.height / 2);
          const scale = to.width / from.width;
          logoEl.style.setProperty("--dock-x", `${dx.toFixed(2)}px`);
          logoEl.style.setProperty("--dock-y", `${dy.toFixed(2)}px`);
          logoEl.style.setProperty("--dock-scale", scale.toFixed(4));
        }
      }
      setPhase("docking");
      onPhaseChange?.("docking");
    }, 3320);

    // Finish: Land pixel-exact on Hero logo slot and unmount curtain cleanly
    schedule(() => {
      clearRootPending();
      setPhase("done");
      onPhaseChange?.("done");
    }, 4180);

    return () => {
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", onKeyDown);
      clearTimers();
      clearRootPending();
    };
  }, [enabled, targetSelector]);

  if (phase === "idle" || phase === "done") return null;

  return (
    <div
      ref={curtainRef}
      className={`home-opening ${phase === "docking" ? "home-opening--docking" : ""} home-opening--s${stage}`}
      aria-hidden="true"
    >
      <div className="home-opening__backdrop" />
      <div className="home-opening__halo" />
      <div className="home-opening__axis" />
      <div className="home-opening__ring" />
      <div className="home-opening__core-dot" />

      <div className="home-opening__groups">
        {OPENING_GROUPS.map((name, idx) => (
          <span
            key={name}
            ref={(el) => {
              nodeRefs.current[idx] = el;
            }}
            className="home-opening__group-node"
            style={{ "--idx": idx } as React.CSSProperties}
          >
            <GroupAnimatedMark groupName={name} play={false} />
          </span>
        ))}
      </div>

      <div ref={logoBoxRef} className="home-opening__logo-box">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="10 0 340 104">
          <defs>
            <linearGradient id="home-op-blade-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#D0AD69" stopOpacity="0" />
              <stop offset="30%" stopColor="#D0AD69" stopOpacity="0.38" />
              <stop offset="50%" stopColor="#FFFDF5" stopOpacity="0.98" />
              <stop offset="70%" stopColor="#D0AD69" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#D0AD69" stopOpacity="0" />
            </linearGradient>
            <clipPath id="home-op-word-clip">
              <rect className="home-opening__word-clip-rect" x="104" y="0" width="256" height="104" />
            </clipPath>
            <mask id="home-op-full-mask">
              <g fill="#FFFFFF">
                {TARS_ROBOT_PATHS.map((p, i) => (
                  <path key={`omr-${i}`} d={p.d} fillRule="evenodd" />
                ))}
                {TARS_WORDMARK_POLYS.map((pts, i) => (
                  <polygon key={`omw-${i}`} points={pts} />
                ))}
              </g>
            </mask>
          </defs>

          <g className="home-opening__wire-group">
            {TARS_ROBOT_PATHS.map((p, i) => (
              <path
                key={`ow-${i}`}
                className="home-opening__wire"
                style={{ "--i": i } as React.CSSProperties}
                d={p.d}
                fillRule="evenodd"
              />
            ))}
          </g>

          <g className="home-opening__robot-group">
            {TARS_ROBOT_PATHS.map((p, i) => (
              <path
                key={`or-${i}`}
                className="home-opening__robot-part"
                style={
                  {
                    "--dx": `${p.dir[0]}px`,
                    "--dy": `${p.dir[1]}px`,
                    "--stage": p.stage,
                  } as React.CSSProperties
                }
                d={p.d}
                fillRule="evenodd"
              />
            ))}
          </g>

          <g className="home-opening__led-group">
            {TARS_LED_PATHS.map((d, i) => (
              <path
                key={`oled-${i}`}
                className="home-opening__led"
                style={{ "--i": i } as React.CSSProperties}
                d={d}
              />
            ))}
          </g>

          <g fill="#FFFFFF" clipPath="url(#home-op-word-clip)">
            {TARS_WORDMARK_POLYS.map((pts, i) => (
              <polygon key={`oword-${i}`} points={pts} />
            ))}
          </g>

          <g mask="url(#home-op-full-mask)">
            <rect
              className="home-opening__blade"
              x="0"
              y="-12"
              width="44"
              height="128"
              fill="url(#home-op-blade-grad)"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}
