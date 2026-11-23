import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/pixel-jijia-arena";
import { buildPublicMeta } from "~/lib/social-meta";
import type { ArenaController, FieldView } from "~/lib/rmul-3d-scene";
import "./pixel-jijia-arena.css";

export function meta({}: Route.MetaArgs) {
  return buildPublicMeta({
    title: "RMUC 2027 三维战场 | TARSGO",
    description: "直接浏览 RMUC 2027 官方 CAD 场地，以及参照 TARS-Go 2026 机器人定妆照制作的三维外形草模。",
    path: "/pixel-jijia/arena",
    image: "/assets/images/Social/home.jpg",
  });
}

const CAMERA_VIEWS = [
  { id: "all", label: "全场" },
  { id: "red", label: "红方" },
  { id: "blue", label: "蓝方" },
  { id: "top", label: "俯视" },
] as const satisfies readonly { id: FieldView; label: string }[];

export default function PixelJijiaArenaPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const controller = useRef<ArenaController | null>(null);
  const [view, setView] = useState<FieldView>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;
    let active = true;
    void import("~/lib/rmul-3d-scene").then(({ mountArena }) => {
      if (!active) return;
      controller.current = mountArena(
        host,
        () => { setLoading(true); setError(""); },
        () => setLoading(false),
        (message) => { setLoading(false); setError(message); },
      );
    }).catch(() => {
      if (active) { setLoading(false); setError("当前设备无法打开三维场景"); }
    });
    return () => {
      active = false;
      controller.current?.dispose();
      controller.current = null;
    };
  }, []);

  const selectView = (next: FieldView) => {
    setView(next);
    controller.current?.view(next);
  };

  return (
    <main className="rmul3d">
      <header className="rmul3d-header">
        <Link to="/pixel-jijia/battle" className="rmul3d-back">← 返回战术演练</Link>
        <h1>RMUC 2027 <span>三维战场</span></h1>
        <span className="rmul3d-header-meta">TARS-Go · 2026 机器人外形预览</span>
      </header>
      <section className="rmul3d-stage" aria-label="RMUC 2027 完整三维战场">
        <div ref={mountRef} className="rmul3d-canvas" />
        {loading && !error && <p className="rmul3d-loading" role="status">正在加载三维场地…</p>}
        {error && <p className="rmul3d-error" role="alert">{error}</p>}
        <nav className="rmul3d-views" aria-label="校准视角">
          {CAMERA_VIEWS.map(({ id, label }) => (
            <button key={id} type="button" disabled={loading || !!error}
              aria-pressed={view === id} className={view === id ? "is-active" : ""}
              onClick={() => selectView(id)}>{label}</button>
          ))}
        </nav>
        <Link className="rmul3d-source" to="/robots">机器人外形参考：2026 赛季定妆照 · 当前为展示草模</Link>
      </section>
    </main>
  );
}
