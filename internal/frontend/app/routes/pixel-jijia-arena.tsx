import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/pixel-jijia-arena";
import { buildPublicMeta } from "~/lib/social-meta";
import { CAD_MODELS, type CadModelId } from "~/lib/rmul-3d-cad-assets";
import type { ArenaController, FieldView } from "~/lib/rmul-3d-scene";
import "./pixel-jijia-arena.css";

export function meta({}: Route.MetaArgs) {
  return buildPublicMeta({
    title: "RMU 2027 官方 CAD 三维场地 | TARSGO",
    description: "查看 RMUL 2027 3V3 场地、2027 能量单元和 RMUC 2027 基地的 CAD 模型。",
    path: "/pixel-jijia/arena",
    image: "/assets/images/Social/home.jpg",
  });
}

export default function PixelJijiaArenaPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const controller = useRef<ArenaController | null>(null);
  const [model, setModel] = useState<CadModelId>("field");
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
      if (active) { setLoading(false); setError("此设备无法打开三维场景"); }
    });
    return () => {
      active = false;
      controller.current?.dispose();
      controller.current = null;
    };
  }, []);

  const selectModel = (next: CadModelId) => {
    setModel(next);
    setView("all");
    controller.current?.show(next);
  };

  const selectView = (next: FieldView) => {
    setView(next);
    controller.current?.view(next);
  };

  return (
    <main className="rmul3d">
      <header className="rmul3d-header">
        <Link to="/pixel-jijia/battle" className="rmul3d-back">← 返回战术演练</Link>
        <h1>RMU 2027 <span>三维 CAD</span></h1>
        <span className="rmul3d-header-meta">OFFICIAL CAD · V1.0.0</span>
      </header>

      <div className="rmul3d-layout">
        <section className="rmul3d-stage" aria-label="官方 CAD 三维模型">
          <div ref={mountRef} className="rmul3d-canvas" />
          {loading && !error && <p className="rmul3d-loading" role="status">正在加载三维模型…</p>}
          {error && <p className="rmul3d-error" role="alert">{error}</p>}
          <div className="rmul3d-orbit-hint">拖动旋转 · 滚动缩放 · 双指平移</div>
        </section>
        <aside className="rmul3d-panel">
          <div className="rmul3d-panel-heading">
            <strong>官方 CAD 模型</strong>
          </div>
          <div className="rmul3d-models" role="group" aria-label="三维模型选择">
            {(Object.keys(CAD_MODELS) as CadModelId[]).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={id === model}
                className={id === model ? "is-active" : ""}
                onClick={() => selectModel(id)}
              >{CAD_MODELS[id].label}</button>
            ))}
          </div>

          {model === "field" && (
            <div className="rmul3d-teamviews" role="group" aria-label="场地观察角度">
              <strong>观察角度</strong>
              <div>
                {([
                  ["red", "红方"],
                  ["all", "全场"],
                  ["blue", "蓝方"],
                ] as const).map(([side, label]) => (
                  <button
                    key={side}
                    type="button"
                    disabled={loading || !!error}
                    className={view === side ? "is-active" : ""}
                    aria-pressed={view === side}
                    onClick={() => selectView(side)}
                  >{label}</button>
                ))}
              </div>
            </div>
          )}

          <div className="rmul3d-selected-detail">
            <strong>{CAD_MODELS[model].label}</strong>
            <span>来源：{CAD_MODELS[model].source}</span>
            {model === "field" && <span>场地尺寸：12.6 × 8.6 m（含围挡）</span>}
            {model === "energy" && <span>单元本体：约 150 × 95 mm，独立模型展示</span>}
            {model === "base" && <span>此基地属于 RMUC，不属于 RMUL 3V3 场地总成</span>}
          </div>

          <p className="rmul3d-provenance">
            模型由 2027 官方 STEP 转换，保留 CAD 材质颜色。网格经过近毫米级采样简化，不等同于无误差制造图纸。
            RMUL 3V3 场地 STEP 未提供独立前哨站实体，故不再展示旧版猜测的设施模型。
            <a href="https://bbs.robomaster.com/article/1970956" target="_blank" rel="noopener noreferrer">
              官方 CAD 图纸 · RoboMaster 高校赛务
            </a>
            <a href="https://github.com/hxyulin/rm-map-tools/releases/tag/rm2027-assets-20261015" target="_blank" rel="noopener noreferrer">
              GLB 转换来源 · rm-map-tools
            </a>
            <span>原始资料：CC BY-NC-SA 4.0，仅限许可范围内使用</span>
          </p>
        </aside>
      </div>
    </main>
  );
}
