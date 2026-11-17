import { useCallback, useEffect, useRef, type PointerEvent } from "react";
import { LAB_THUMB_START, LAB_THUMB_TRAVEL, LAB_WIDTH, paintThemeLab } from "./theme-lab-scene";
import { useTheme } from "./theme-provider";

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function pointerProgress(event: PointerEvent<HTMLButtonElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return clamp((event.clientX - bounds.left - bounds.width * LAB_THUMB_START / LAB_WIDTH) / (bounds.width * LAB_THUMB_TRAVEL / LAB_WIDTH));
}

export function ThemeControl() {
  const { resolvedTheme, setPreference } = useTheme();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HTMLCanvasElement | null>(null);
  const progressRef = useRef(0);
  const targetRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const pointerRef = useRef<{ id: number; startX: number; dragged: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const initializedRef = useRef(false);

  const paint = useCallback((blink = false) => {
    if (canvasRef.current && sceneRef.current) {
      paintThemeLab(canvasRef.current, sceneRef.current, progressRef.current, blink);
    }
  }, []);

  const stopAnimation = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const animateTo = useCallback((to: number) => {
    stopAnimation();
    if (document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      progressRef.current = to;
      paint();
      return;
    }
    const from = progressRef.current;
    if (Math.abs(to - from) < 0.001) {
      progressRef.current = to;
      paint();
      return;
    }
    const started = performance.now();
    const duration = 480 * Math.abs(to - from);
    const tick = (now: number) => {
      const fraction = clamp((now - started) / duration);
      const eased = 1 - (1 - fraction) ** 2.4;
      progressRef.current = from + (to - from) * eased;
      paint(to === 1 && fraction > 0.7 && fraction < 0.8);
      if (fraction < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
      }
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [paint, stopAnimation]);

  useEffect(() => {
    sceneRef.current = document.createElement("canvas");
    const initial = document.documentElement.dataset.theme === "light" ? 0 : 1;
    progressRef.current = initial;
    targetRef.current = initial;
    const observer = new ResizeObserver(() => paint());
    if (buttonRef.current) observer.observe(buttonRef.current);
    const onVisibility = () => {
      if (document.hidden) {
        stopAnimation();
        progressRef.current = targetRef.current;
      } else {
        paint();
      }
    };
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onReducedMotion = () => {
      if (!motion.matches) return;
      stopAnimation();
      progressRef.current = targetRef.current;
      paint();
    };
    document.addEventListener("visibilitychange", onVisibility);
    motion.addEventListener("change", onReducedMotion);
    paint();
    return () => {
      stopAnimation();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      motion.removeEventListener("change", onReducedMotion);
      sceneRef.current = null;
    };
  }, [paint, stopAnimation]);

  useEffect(() => {
    // The document bootstrap already applied the persisted/system theme before hydration.
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    const next = resolvedTheme === "dark" ? 1 : 0;
    targetRef.current = next;
    if (!pointerRef.current?.dragged) animateTo(next);
  }, [resolvedTheme, animateTo]);

  const toggle = () => setPreference(resolvedTheme === "dark" ? "light" : "dark");

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    stopAnimation();
    suppressClickRef.current = false;
    pointerRef.current = { id: event.pointerId, startX: event.clientX, dragged: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (!pointer.dragged && Math.abs(event.clientX - pointer.startX) < 4) return;
    pointer.dragged = true;
    progressRef.current = pointerProgress(event);
    paint();
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    pointerRef.current = null;
    if (!pointer.dragged) return;
    suppressClickRef.current = true;
    progressRef.current = pointerProgress(event);
    const next = progressRef.current >= 0.5 ? "dark" : "light";
    targetRef.current = next === "dark" ? 1 : 0;
    if (next !== resolvedTheme) setPreference(next);
    else animateTo(targetRef.current);
  };

  const onPointerCancel = (event: PointerEvent<HTMLButtonElement>) => {
    if (pointerRef.current?.id !== event.pointerId) return;
    pointerRef.current = null;
    animateTo(targetRef.current);
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      className="theme-lab-switch"
      role="switch"
      aria-checked={resolvedTheme === "dark"}
      aria-label="深色模式"
      title={resolvedTheme === "dark" ? "切换至白天" : "切换至夜晚"}
      onClick={(event) => {
        if (suppressClickRef.current && event.detail !== 0) {
          suppressClickRef.current = false;
          return;
        }
        suppressClickRef.current = false;
        toggle();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "Home") {
          event.preventDefault();
          setPreference("light");
        } else if (event.key === "ArrowRight" || event.key === "End") {
          event.preventDefault();
          setPreference("dark");
        }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <canvas ref={canvasRef} className="theme-lab-switch__scene" aria-hidden="true" />
    </button>
  );
}
