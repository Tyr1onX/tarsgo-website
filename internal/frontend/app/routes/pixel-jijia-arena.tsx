import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { getExperienceReturnTo, experienceReturnLabel } from "~/lib/experience-navigation";
import type { Route } from "./+types/pixel-jijia-arena";
import { buildPublicMeta } from "~/lib/social-meta";
import type { ArenaController, ArenaStatus, ArenaView } from "~/lib/rmul-3d-scene";
import "./pixel-jijia-arena.css";

export function meta({}: Route.MetaArgs) {
  return buildPublicMeta({
    title: "RMUC 2027 三维战场 | TARSGO",
    description: "RMUC 2027 官方 CAD 场地，支持自由探索与机器人对抗训练。",
    path: "/pixel-jijia/arena",
    image: "/assets/images/Social/home.jpg",
  });
}

type AreaStatus = NonNullable<ArenaStatus["match"]>["sides"]["red"]["baseArea"];
const teamName=(team:"red"|"blue")=>team==="red"?"红":"蓝";
const areaText=(area:AreaStatus)=>teamName(area.controller)+(area.full?"完全":"临时")+(area.contested?"·争夺":area.progress>0?"·"+Math.floor(area.progress/5)*10+"%":"");
function TeamScore({team,side}:{team:"red"|"blue";side:NonNullable<ArenaStatus["match"]>["sides"]["red"]}){
  return <span className={team}>基地 {side.base}<small>前哨 {side.outpost} ({teamName(side.outpostOwner)}) · {side.alive}/4</small><small>前哨阵地 {areaText(side.outpostArea)}</small><small>基地阵地 {areaText(side.baseArea)} · 控制度 {side.control}</small></span>;
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
  const returnTo = getExperienceReturnTo(useLocation().state);
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
      <section className="rmul3d-stage" aria-label="RMUC 2027 三维训练战场">
        <div ref={mountRef} className="rmul3d-canvas" />
        <header className="rmul3d-header">
          <Link to={returnTo} className="rmul3d-back" aria-label={experienceReturnLabel(returnTo)}>←</Link>
          <button className="rmul3d-settings" type="button" onClick={() => toggleMenu(!menu)} aria-label="战场菜单" aria-expanded={menu}>☰</button>
        </header>
        {loading && !error && <p className="rmul3d-loading" role="status">正在加载战场…</p>}
        {error && <div className="rmul3d-error" role="alert">{error}<button onClick={() => window.location.reload()}>重试</button></div>}
        {!disabled && !menu && status.match && <div className="rmul3d-match">
          {status.match.phase === "ready" ? <button onClick={() => controller.current?.start()}>开始自主对抗训练</button> : <>
            <div className="rmul3d-score"><TeamScore team="red" side={status.match.sides.red} /><strong>{Math.floor(status.match.seconds/60)}:{String(status.match.seconds%60).padStart(2,"0")}</strong><TeamScore team="blue" side={status.match.sides.blue} /></div>
            {status.match.phase === "finished" && <><strong>{status.match.winner==="draw"?"平局":status.match.winner==="red"?"红方获胜":"蓝方获胜"}</strong><button onClick={() => controller.current?.reset()}>重新开始</button></>}
          </>}
        </div>}
        {!disabled && !menu && playing && status.robot && status.match?.phase==="ready" && status.match.performance && <div className="rmul3d-combat">
          <label>底盘 <select value={status.match.performance.chassis} onChange={e=>controller.current?.performance({...status.match!.performance!,chassis:e.target.value as "hp"|"power"})}><option value="hp">血量优先</option><option value="power">功率优先</option></select></label>
          <label>发射机构 <select value={status.match.performance.launcher} onChange={e=>controller.current?.performance({...status.match!.performance!,launcher:e.target.value as "cooling"|"burst"})}><option value="cooling">冷却优先</option><option value="burst">爆发优先</option></select></label>
          <span>HP {status.match.maxHp} · {status.match.power?.limit}W · 热量上限 {status.match.heatLimit}</span>
        </div>}
        {!disabled && !menu && playing && status.robot && status.match?.phase==="running" && <div className="rmul3d-combat">
          <span>HP {status.match.hp}/{status.match.maxHp}</span>{status.match.xp!==null&&<span>Lv.{status.match.level} · {Math.floor(status.match.xp)} XP</span>}<span>弹药 {status.match.ammo}{status.match.reserve>0&&` + ${status.match.reserve} 储备`}</span><span>{status.match.coins} 金币</span>
          {status.match.revival?.weak&&<span>虚弱</span>}{status.match.revival?.immune&&<span>无敌</span>}
          {status.match.buff>0&&<span>能量增益 {status.match.buff}s</span>}
          {status.match.power&&<span>{status.match.power.locked>0?"底盘断电 "+status.match.power.locked+"s":"缓冲 "+status.match.power.buffer+"/60J · "+status.match.power.limit+"W"}</span>}
          {status.match.heatLimit>0&&<span>热量 {status.match.heat}/{status.match.heatLimit}</span>}
          {status.match.revival?.dead?<><span>复活读条 {Math.floor(status.match.revival.progress*100)}%</span><button disabled={!status.match.revival.canConfirm} onClick={()=>controller.current?.revive(false)}>确认复活</button><button disabled={!status.match.revival.canPay} onClick={()=>controller.current?.revive(true)}>立即复活 {status.match.revival.cost}金币</button></>:<>
          {status.match.rune&&<button disabled={status.match.rune.active||status.match.rune.buff>0||status.match.rune.available<=0||!!status.match.revival?.weak} onClick={()=>controller.current?.rune()}>{status.match.rune.active?"机关 "+status.match.rune.groups+"/5":(status.match.rune.large?"大":"小")+"能量机关 "+status.match.rune.available}</button>}
          {status.match.stance&&(()=>{
            const stance=status.match.stance;
            return <><span>{stance.enhanced?"强化":""}{({attack:"进攻",defense:"防御",move:"移动"})[stance.mode]}姿态{stance.cooldown>0?" · "+Math.ceil(stance.cooldown)+"s":""}</span>{(["attack","defense","move"] as const).map(mode=><button key={mode} disabled={stance.cooldown>0||stance.mode===mode&&!stance.enhanced} onClick={()=>controller.current?.stance(mode,false)}>{({attack:"进攻",defense:"防御",move:"移动"})[mode]}</button>)}<button disabled={stance.enhanced||stance.cooldown>0||stance.remaining[stance.mode]<=0} onClick={()=>controller.current?.stance(stance.mode,true)}>强化 {Math.ceil(stance.remaining[stance.mode])}s</button></>;
          })()}
          {status.match.launcher?.state==="locked"&&<span>{status.match.launcher.unlockIn}s</span>}
          {status.match.launcher?.state==="unlocked"&&<button disabled={!status.match.launcher.canInstall} onClick={()=>controller.current?.install()}>安装 42mm</button>}
          <button disabled={!status.match.canBuy} onClick={()=>controller.current?.buy()}>{status.match.pendingAmmo>0?"补弹 "+status.match.pendingAmmo+"s":"补弹 "+status.match.ammoCount+"发 · "+status.match.ammoCost+"金币"}</button>
          {status.match.hp<status.match.maxHp&&<button disabled={!status.match.canHeal} onClick={()=>controller.current?.heal()}>{status.match.pendingHeal>0?"回血 "+status.match.pendingHeal+"s":"回血 "+status.match.healCost+"金币"}</button>}
          <button disabled={!status.match.canFire} onClick={()=>controller.current?.fire()}>{status.match.thermalLock==="permanent"?"发射机构已锁定":status.match.thermalLock?"冷却中":status.match.launcher?.state==="test"?"测试射击":"开火"}</button></>}
        </div>}
        {!disabled && playing && status.match?.phase==="running" && status.match.thermalLock==="cooling" && <div className="rmul3d-thermal-lock" aria-label="热量超限，图传断开" />}
        {!disabled && !menu && playing && status.match?.thermalLock!=="cooling" && <div className="rmul3d-crosshair" aria-hidden="true" />}
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
          <Link to="/pixel-jijia/battle" state={{ experienceReturnTo: returnTo }}>战术演练</Link>
          <h2>视角</h2>
          <nav className="rmul3d-views" aria-label="校准视角">
            {CAMERA_VIEWS.map(({ id, label }) => (
              <button key={id} type="button" disabled={disabled}
                aria-pressed={status.view === id} className={status.view === id ? "is-active" : ""}
                onClick={() => { controller.current?.view(id); toggleMenu(false); }}>{label}</button>
            ))}
          </nav>
          <h2>训练</h2>
          <button disabled={disabled} onClick={()=>{controller.current?.reset();toggleMenu(false);}}>重置比赛</button>
          <h2>操作</h2>
          <dl>
            <dt>W A S D</dt><dd>移动</dd>
            <dt>单击画面 / 鼠标</dt><dd>锁定并转向</dd>
            <dt>拖动 / 方向键</dt><dd>转向</dd>
            <dt>自由视角</dt><dd>拖动旋转、右键平移、滚轮缩放</dd>
            <dt>Shift</dt><dd>加速行走 / 底盘超功率训练</dd>
            <dt>E</dt><dd>接管 / 退出机器人</dd>
            <dt>左键 / 空格</dt><dd>开火</dd>
            <dt>B</dt><dd>远程补弹</dd>
            <dt>V / M</dt><dd>切换视角 / 全场</dd>
            <dt>Esc</dt><dd>释放鼠标</dd>
          </dl>
          <h2>资产来源</h2>
          <a href="https://bbs.robomaster.com/article/1970956" target="_blank" rel="noreferrer">RoboMaster 2027 官方 CAD</a>
          <a href="https://github.com/hxyulin/rm-map-tools/releases/tag/rm2027-assets-20261015" target="_blank" rel="noreferrer">rm-map-tools · CAD 转换</a>
          <Link to="/robots">TARS-Go 2026 定妆照</Link>
          <p>场地资料 CC BY-NC-SA 4.0；机器人为照片参考的外观模型，非官方尺寸。当前为自主对抗训练，非完整官方裁判仿真。基地装甲攻击、科技核心实体装配及飞镖尚未实现；护甲行程及场地交互模块卡覆盖范围为训练近似。</p>
        </aside>}
      </section>
    </main>
  );
}