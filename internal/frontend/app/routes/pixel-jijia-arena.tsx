import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/pixel-jijia-arena";
import { buildPublicMeta } from "~/lib/social-meta";
import type { ArenaController, ArenaStatus, ArenaView } from "~/lib/rmul-3d-scene";
import "./pixel-jijia-arena.css";

export function meta({}: Route.MetaArgs) {
  return buildPublicMeta({
    title: "RMUC 2027 三维战场 | TARSGO",
    description: "RMUC 2027 官方 CAD 场地，支持自由探索与机器人驾驶预览。",
    path: "/pixel-jijia/arena",
    image: "/assets/images/Social/home.jpg",
  });
}

const CAMERA_VIEWS = [
  { id: "first", label: "第一人称" },
  { id: "third", label: "自由视角" },
  { id: "all", label: "全场" },
  { id: "red", label: "红方" },
  { id: "blue", label: "蓝方" },
  { id: "top", label: "俯视" },
] as const satisfies readonly { id: ArenaView; label: string }[];

export default function PixelJijiaArenaPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const controller = useRef<ArenaController | null>(null);
  const [status, setStatus] = useState<ArenaStatus>({ view: "first", robot: null, nearby: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);

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
        message => { setLoading(false); setError(message); },
        setStatus,
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

  const playing = status.view === "first";
  const toggleMenu = (open: boolean) => {
    controller.current?.pauseInput(open);
    setMenu(open);
  };
  const disabled = loading || !!error;
  const touchKeys = [["KeyW", "↑"], ["KeyA", "←"], ["KeyS", "↓"], ["KeyD", "→"]] as const;

  return (
    <main className="rmul3d">
      <section className="rmul3d-stage" aria-label="RMUC 2027 完整三维战场">
        <div ref={mountRef} className="rmul3d-canvas" />
        <header className="rmul3d-header">
          <Link to="/pixel-jijia/battle" className="rmul3d-back" aria-label="返回战术演练">←</Link>
          <button className="rmul3d-settings" type="button" onClick={() => toggleMenu(!menu)} aria-label="战场菜单" aria-expanded={menu}>☰</button>
        </header>
        {loading && !error && <p className="rmul3d-loading" role="status">正在加载战场…</p>}
        {error && <div className="rmul3d-error" role="alert">{error}<button onClick={() => window.location.reload()}>重试</button></div>}
        {!disabled && !menu && playing && <div className="rmul3d-crosshair" aria-hidden="true" />}
        {!disabled && !menu && playing && (status.robot || status.nearby) && (
          <button className="rmul3d-interact" onClick={() => controller.current?.interact()}>
            <kbd>E</kbd> {status.robot ? "退出 " + status.robot : "接管 " + status.nearby}
          </button>
        )}
        {!disabled && !menu && playing && <div className="rmul3d-touch" aria-label="移动控制">
          {touchKeys.map(([key, arrow]) => <button key={key} type="button"
            aria-label={key === "KeyW" ? "前进" : key === "KeyS" ? "后退" : key === "KeyA" ? "左移" : "右移"}
            onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); controller.current?.input(key, true); }}
            onPointerUp={() => controller.current?.input(key, false)}
            onPointerCancel={() => controller.current?.input(key, false)}
            onLostPointerCapture={() => controller.current?.input(key, false)}>{arrow}</button>)}
        </div>}
        {menu && <aside className="rmul3d-help" aria-label="战场菜单" onKeyDown={event => { if (event.key === "Escape") toggleMenu(false); }}>
          <button className="rmul3d-close" onClick={() => toggleMenu(false)} aria-label="关闭">×</button>
          <h2>视角</h2>
          <nav className="rmul3d-views" aria-label="校准视角">
            {CAMERA_VIEWS.map(({ id, label }) => (
              <button key={id} type="button" disabled={disabled}
                aria-pressed={status.view === id} className={status.view === id ? "is-active" : ""}
                onClick={() => { controller.current?.view(id); toggleMenu(false); }}>{label}</button>
            ))}
          </nav>
          <h2>操作</h2>
          <dl>
            <dt>W A S D</dt><dd>移动</dd>
            <dt>单击画面 / 鼠标</dt><dd>锁定并转向</dd>
            <dt>拖动 / 方向键</dt><dd>转向</dd>
            <dt>自由视角</dt><dd>拖动旋转、右键平移、滚轮缩放</dd>
            <dt>Shift</dt><dd>加速行走</dd>
            <dt>E</dt><dd>接管 / 退出机器人</dd>
            <dt>V / M</dt><dd>切换视角 / 全场</dd>
            <dt>Esc</dt><dd>释放鼠标</dd>
          </dl>
          <h2>资产来源</h2>
          <a href="https://bbs.robomaster.com/article/1970956" target="_blank" rel="noreferrer">RoboMaster 2027 官方 CAD</a>
          <a href="https://github.com/hxyulin/rm-map-tools/releases/tag/rm2027-assets-20261015" target="_blank" rel="noreferrer">rm-map-tools · CAD 转换</a>
          <Link to="/robots">TARS-Go 2026 定妆照</Link>
          <p>场地资料 CC BY-NC-SA 4.0；机器人为照片参考的外观模型，非官方尺寸。当前为探索与驾驶预览。</p>
        </aside>}
      </section>
    </main>
  );
}