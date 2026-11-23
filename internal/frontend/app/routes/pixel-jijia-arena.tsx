import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/pixel-jijia-arena";
import { buildPublicMeta } from "~/lib/social-meta";
import { CAD_MODELS, DEFAULT_CAD_MODEL, type CadModelId } from "~/lib/rmul-3d-cad-assets";
import type { ArenaController, FieldView } from "~/lib/rmul-3d-scene";
import "./pixel-jijia-arena.css";

export function meta({}: Route.MetaArgs) {
  return buildPublicMeta({
    title: "RMU 2027 官方 CAD 三维场地 | TARSGO",
    description: "查看 RMUL 2027 3V3 场地，以及 RMUC 2027 完整场地、基地、前哨站和中央能量机关的官方 CAD 静态模型。",
    path: "/pixel-jijia/arena",
    image: "/assets/images/Social/home.jpg",
  });
}

export default function PixelJijiaArenaPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const controller = useRef<ArenaController | null>(null);
  const [model, setModel] = useState<CadModelId>(DEFAULT_CAD_MODEL);
  const [viewerReady, setViewerReady] = useState(false);
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
      setViewerReady(true);
    }).catch(() => {
      if (active) { setLoading(false); setError("此设备无法打开三维场景"); }
    });
    return () => {
      active = false;
      controller.current?.dispose();
      controller.current = null;
    };
  }, []);

  // Selection may happen while the 3D module is still importing. React owns
  // the chosen model; once mounted, the renderer loads that latest selection.
  useEffect(() => {
    if (viewerReady) controller.current?.show(model);
  }, [viewerReady, model]);

  const selectModel = (next: CadModelId) => {
    setModel(next);
    setView("all");
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

          {(model === "field" || model === "rmucField") && (
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
            {model === "rmucField" && <span>场地尺寸：28 × 15 m；包含基地、前哨站、能量机关等官方 CAD 静态构件</span>}
            {model === "outpost" && <span>单侧前哨站及底座，保留官方 CAD 静止装配位姿；完整场地仍显示双方前哨</span>}
            {model === "rune" && <span>中央能量机关（俗称大风车）官方 CAD，旋转动画尚未进行 2027 机构验证</span>}
          </div>

          <p className="rmul3d-provenance">
            模型由 2027 官方 STEP 转换，保留 CAD 材质颜色。网格经过近毫米级采样简化，不等同于无误差制造图纸。
            RMUL 3V3 与 RMUC 属于不同场地。RMUC 全场、前哨站及能量机关采用原始 CAD 静态装配模型，尚未验证实际关节运动。
            RMUC 大型模型按需从公开 CAD 查看器读取，模型加载依赖该来源可用。
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
