import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/pixel-jijia-arena";
import { buildPublicMeta } from "~/lib/social-meta";
import { FACILITIES, type FacilityId, type Team } from "~/lib/rmul-3d-facilities";
import type { ArenaController } from "~/lib/rmul-3d-scene";
import "./pixel-jijia-arena.css";

export function meta({}: Route.MetaArgs) {
  return buildPublicMeta({
    title: "RMUL 2027 三维场地 | TARSGO",
    description: "查看 RMUL 2027 原始 STL 三维场地与红蓝双方设施模型。",
    path: "/pixel-jijia/arena",
    image: "/assets/images/Social/home.jpg",
  });
}

export default function PixelJijiaArenaPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const controller = useRef<ArenaController | null>(null);
  const [selected, setSelected] = useState<FacilityId | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;
    let active = true;
    void import("~/lib/rmul-3d-scene")
      .then(({ mountArena }) => {
        if (!active) return;
        controller.current = mountArena(host, setSelected, setError, () => setReady(true));
      })
      .catch(() => { if (active) setError("无法打开三维场景，请使用支持 WebGL 的浏览器"); });
    return () => {
      active = false;
      controller.current?.dispose();
      controller.current = null;
    };
  }, []);

  const focus = (id: FacilityId | null) => {
    setSelected(id);
    controller.current?.focus(id);
  };
  const info = FACILITIES.find((item) => item.id === selected);
  const teams: Team[] = ["red", "blue"];
  return (
    <main className="rmul3d">
      <header className="rmul3d-header">
        <Link to="/pixel-jijia/battle" className="rmul3d-back">← 返回战术演练</Link>
        <h1>RMUL 2027 <span>三维场地</span></h1>
        <span className="rmul3d-header-meta">3V3 · FIELD VIEW</span>
      </header>

      <div className="rmul3d-layout">
        <section className="rmul3d-stage" aria-label="三维比赛场地">
          <div ref={mountRef} className="rmul3d-canvas" />
          {!ready && !error && <p className="rmul3d-loading" role="status">正在加载三维场地…</p>}
          {error && <p className="rmul3d-error" role="alert">{error}</p>}
          <div className="rmul3d-orbit-hint">拖动旋转 · 滚动缩放 · 双指平移</div>
        </section>
        <aside className="rmul3d-panel">
          <div className="rmul3d-panel-heading">
            <strong>场地设施</strong>
            <button type="button" onClick={() => focus(null)} disabled={!ready}>全场视角</button>
          </div>
          {teams.map((team) => (
            <div className={"rmul3d-team rmul3d-team-" + team} key={team}>
              <h2>{team === "red" ? "红方" : "蓝方"}</h2>
              {FACILITIES.filter((item) => item.team === team).map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={selected === item.id ? "rmul3d-selected" : ""}
                  disabled={!ready}
                  aria-pressed={selected === item.id}
                  onClick={() => focus(item.id)}
                >{item.kind === "base" ? "基地" : item.kind === "outpost" ? "前哨站" : "能量单元"}</button>
              ))}
            </div>
          ))}
          {info && (
            <div className="rmul3d-selected-detail" role="status">
              <strong>{info.name}</strong>
              <span>结构与位置：概念示意</span>
            </div>
          )}
          <p className="rmul3d-provenance">
            场地网格来自原始 STL。基地、前哨站和能量单元为示意件，尚未按独立 CAD 校准。
            <a href="https://bbs.robomaster.com/article/1970956" target="_blank" rel="noopener noreferrer">
              RoboMaster 高校赛务 · CC BY-NC-SA 4.0
            </a>
          </p>
        </aside>
      </div>
    </main>
  );
}
