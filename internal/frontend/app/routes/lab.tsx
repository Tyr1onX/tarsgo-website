import { useCallback, useEffect, useRef, useState } from "react";
import type { Route } from "./+types/lab";
import { Navbar } from "~/components/navbar";
import { PublicFooter } from "~/components/public-footer";
import { paintThemeLab } from "~/components/theme-lab-scene";
import "./lab.css";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "光影实验室 | TARSGO" },
    { name: "description", content: "探索吉甲大师校园机器人工位从白天到夜晚的像素光影。" },
  ];
}

export default function LabPage() {
  const [time, setTime] = useState(48);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HTMLCanvasElement | null>(null);
  const rangeRef = useRef<HTMLInputElement>(null);

  const paint = useCallback(() => {
    if (!canvasRef.current || !sceneRef.current) return;
    paintThemeLab(canvasRef.current, sceneRef.current, Number(rangeRef.current?.value ?? 48) / 100);
  }, []);

  useEffect(() => {
    sceneRef.current = document.createElement("canvas");
    const observer = new ResizeObserver(paint);
    if (canvasRef.current) observer.observe(canvasRef.current);
    paint();
    return () => {
      observer.disconnect();
      sceneRef.current = null;
    };
  }, [paint]);

  const minutes = 8 * 60 + Math.round(time * 9);
  const clock = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  return (
    <div className="public-home lab-page min-h-screen bg-surface-primary text-fg-primary">
      <Navbar />
      <main className="public-route-content lab-main">
        <div className="public-home-container lab-content">
          <div className="lab-intro">
            <h1>光影实验室</h1>
            <p>拖动时间，看看校园机器人工位从白天走向夜晚。</p>
          </div>

          <div className="lab-stage">
            <canvas
              ref={canvasRef}
              className="lab-scene"
              role="img"
              aria-label="校园机器人工位、窗外校园和变化的昼夜光影"
            />
          </div>

          <div className="lab-controls">
            <div className="lab-control-heading">
              <label htmlFor="lab-time">时间</label>
              <output htmlFor="lab-time">{clock}</output>
            </div>
            <input
              ref={rangeRef}
              id="lab-time"
              className="lab-range"
              type="range"
              min={0}
              max={100}
              step={1}
              value={time}
              aria-valuetext={clock}
              style={{
                background: `linear-gradient(to right, var(--theme-accent-contrast) ${time}%, var(--theme-border) ${time}%)`,
              }}
              onChange={(event) => {
                setTime(Number(event.currentTarget.value));
                paint();
              }}
            />
            <div className="lab-range-markers" aria-hidden="true">
              <span>08:00</span>
              <span>23:00</span>
            </div>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
