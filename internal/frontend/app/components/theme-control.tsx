import { useEffect, useRef } from "react";
import { createGlassSwitchScene } from "./glass-switch-scene";
import { useTheme } from "./theme-provider";

const clamp = (value: number) => Math.max(0, Math.min(1, value));

type SwitchController = { setLight: (light: boolean) => void };

export function ThemeControl() {
  const { resolvedTheme, setPreference } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const controllerRef = useRef<SwitchController | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const button = buttonRef.current;
    if (!canvas || !button) return;

    const scene = createGlassSwitchScene(canvas);
    if (!scene) return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const abort = new AbortController();
    const signal = abort.signal;
    let checked = document.documentElement.dataset.theme === "light";
    let progress = checked ? 1 : 0;
    let target = progress;
    let velocity = 0;
    let dragging = false;
    let pointer: { id: number; startX: number; startProgress: number; lastX: number; lastTime: number; speed: number; moved: boolean } | null = null;
    let suppressClick = false;
    let springing = false;
    let raf = 0;
    let starTimer = 0;
    let previousFrame = 0;

    const paint = (now = performance.now()) => scene.render(progress, now);
    const cancelQueued = () => {
      if (raf) cancelAnimationFrame(raf);
      if (starTimer) clearTimeout(starTimer);
      raf = starTimer = 0;
    };
    const schedule = () => {
      if (document.hidden || dragging || raf || starTimer) return;
      if (springing) raf = requestAnimationFrame(frame);
      else if (!media.matches && progress < 0.6) {
        starTimer = window.setTimeout(() => {
          starTimer = 0;
          raf = requestAnimationFrame(frame);
        }, 110);
      }
    };
    function frame(now: number) {
      raf = 0;
      if (document.hidden) return;
      if (springing) {
        const dt = Math.min((now - (previousFrame || now)) / 1000, 0.05);
        const omega = media.matches ? 30 : 10;
        const distance = progress - target;
        const factor = Math.exp(-omega * dt);
        const term = velocity + omega * distance;
        progress = target + (distance + term * dt) * factor;
        velocity = (velocity - omega * term * dt) * factor;
        if ((progress < 0 && target === 0) || (progress > 1 && target === 1) ||
            (Math.abs(progress - target) < 0.0003 && Math.abs(velocity) < 0.005)) {
          progress = target;
          velocity = 0;
          springing = false;
        }
      }
      previousFrame = now;
      paint(now);
      schedule();
    }
    const drawNow = () => {
      cancelQueued();
      paint();
      schedule();
    };
    const animateTo = (to: number, initialVelocity = 0) => {
      target = to;
      if (document.hidden) {
        progress = to;
        velocity = 0;
        springing = false;
      } else {
        velocity = initialVelocity;
        springing = Math.abs(progress - to) > 0.0003 || Math.abs(initialVelocity) > 0.005;
        previousFrame = performance.now();
      }
      drawNow();
    };
    const commit = (to: boolean, initialVelocity = 0) => {
      const next = to ? 1 : 0;
      if (checked !== to) {
        checked = to;
        if (statusRef.current) statusRef.current.textContent = to ? "浅色" : "深色";
        button.dispatchEvent(new Event("change", { bubbles: true }));
        setPreference(to ? "light" : "dark");
      }
      animateTo(next, initialVelocity);
    };
    const pointerTravel = () => button.getBoundingClientRect().width * 156 / 350;
    const onDown = (event: PointerEvent) => {
      if ((event.pointerType === "mouse" && event.button !== 0) || pointer) return;
      button.setPointerCapture(event.pointerId);
      dragging = true;
      springing = false;
      velocity = 0;
      suppressClick = false;
      cancelQueued();
      pointer = {
        id: event.pointerId,
        startX: event.clientX,
        startProgress: clamp(progress),
        lastX: event.clientX,
        lastTime: performance.now(),
        speed: 0,
        moved: false,
      };
    };
    const onMove = (event: PointerEvent) => {
      if (!pointer || event.pointerId !== pointer.id) return;
      const delta = event.clientX - pointer.startX;
      if (!pointer.moved && Math.abs(delta) < 4) return;
      pointer.moved = true;
      const now = performance.now();
      const dt = (now - pointer.lastTime) / 1000;
      const travel = pointerTravel();
      progress = clamp(pointer.startProgress + delta / travel);
      if (dt > 0) pointer.speed = 0.3 * pointer.speed + 0.7 * (event.clientX - pointer.lastX) / travel / dt;
      pointer.lastX = event.clientX;
      pointer.lastTime = now;
      paint(now);
    };
    const onUp = (event: PointerEvent) => {
      if (!pointer || event.pointerId !== pointer.id) return;
      const current = pointer;
      pointer = null;
      dragging = false;
      suppressClick = true;
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      const delta = event.clientX - current.startX;
      if (Math.abs(delta) < 4) {
        commit(!checked);
      } else {
        progress = clamp(current.startProgress + delta / pointerTravel());
        commit(progress + current.speed * 0.06 >= 0.5, current.speed);
      }
    };
    const onCancel = (event: PointerEvent) => {
      if (!pointer || event.pointerId !== pointer.id) return;
      pointer = null;
      dragging = false;
      suppressClick = false;
      animateTo(checked ? 1 : 0);
    };
    const onClick = () => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      commit(!checked);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      commit(event.key === "ArrowRight" || event.key === "End");
    };
    const onVisibility = () => {
      if (document.hidden) {
        cancelQueued();
        progress = target;
        velocity = 0;
        springing = false;
      } else {
        drawNow();
      }
    };
    const onMotion = () => {
      if (media.matches) {
        progress = target;
        velocity = 0;
        springing = false;
      }
      drawNow();
    };

    button.addEventListener("pointerdown", onDown, { signal });
    button.addEventListener("pointermove", onMove, { signal });
    button.addEventListener("pointerup", onUp, { signal });
    button.addEventListener("pointercancel", onCancel, { signal });
    button.addEventListener("click", onClick, { signal });
    button.addEventListener("keydown", onKeyDown, { signal });
    document.addEventListener("visibilitychange", onVisibility, { signal });
    media.addEventListener("change", onMotion, { signal });

    const observer = new ResizeObserver(drawNow);
    observer.observe(canvas);
    controllerRef.current = {
      setLight: (nextLight) => {
        checked = nextLight;
        if (!dragging && target !== Number(nextLight)) animateTo(Number(nextLight));
      },
    };
    drawNow();

    return () => {
      controllerRef.current = null;
      abort.abort();
      observer.disconnect();
      cancelQueued();
    };
  }, [setPreference]);

  useEffect(() => {
    controllerRef.current?.setLight(resolvedTheme === "light");
  }, [resolvedTheme]);

  return (
    <div className="theme-glass-switch">
      <canvas ref={canvasRef} className="theme-glass-switch__canvas" aria-hidden="true" />
      <button
        ref={buttonRef}
        type="button"
        className="theme-glass-switch__button"
        role="switch"
        aria-label="浅色模式"
        aria-checked={resolvedTheme === "light"}
        title={resolvedTheme === "light" ? "切换至夜晚" : "切换至白天"}
      />
      <span ref={statusRef} className="theme-glass-switch__status" role="status" aria-live="polite" aria-atomic="true" />
    </div>
  );
}
