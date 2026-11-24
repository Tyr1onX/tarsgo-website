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
function HealthBar({value,max,damage=0,label}:{value:number;max:number;damage?:number;label:string}){
  return <div className="rmul3d-health" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
    <i style={{width:Math.max(0,Math.min(100,value/max*100))+"%"}}/>
    {damage>0&&<b className="rmul3d-damage">−{damage}</b>}
  </div>;
}
function RobotIcon({kind}:{kind:"heavy"|"infantry"|"sentry"}){
  return <svg viewBox="0 0 24 16" width="24" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M3 12V7h18v5M2 12h20M5 12v2m14-2v2"/>
    {kind==="heavy"?<path d="M8 7V3h7v4M15 4h8v2h-8"/>:kind==="sentry"?<path d="M10 7V2h4v5M7 2h10"/>:<path d="M9 7V4h6v3m0-2h7"/>}
  </svg>;
}
function TeamScore({team,side}:{team:"red"|"blue";side:NonNullable<ArenaStatus["match"]>["sides"]["red"]}){
  return <section className={"rmul3d-team "+team} aria-label={teamName(team)+"方"}>
    <div className="rmul3d-base-line"><span>{teamName(team)}方基地</span><strong>{side.base}</strong></div>
    <HealthBar value={side.base} max={10000} damage={side.baseDamage} label={teamName(team)+"方基地血量"}/>
    <div className="rmul3d-outpost-line"><span>前哨 · {teamName(side.outpostOwner)}</span><b>{side.outpost}</b></div>
    <HealthBar value={side.outpost} max={1000} damage={side.outpostDamage} label={teamName(team)+"方前哨血量"}/>
    <div className="rmul3d-team-metrics"><span>金币 <b>{side.coins??"—"}</b></span><span>科技 <b>{side.technology??"—"}</b></span><span>控制 <b>{side.control}</b></span></div>
    <div className="rmul3d-roster">{side.robots.map(r=>{
      const labels=r.hp===0?[r.powerOff?"战亡":"撤离"]:[r.powerOff?"断电":"",r.launcherLocked?"枪锁":"",r.weak?"虚弱":"",r.immune?"无敌":""].filter(Boolean);
      const label=labels.join(" ");
      return <div className={"rmul3d-robot-status"+(r.hp===0?" dead":"")} key={r.id} aria-label={teamName(team)+r.number+"号 "+r.hp+"/"+r.maxHp+" 级别"+r.level+" "+label}>
        <div className="rmul3d-robot-id"><RobotIcon kind={r.kind}/><b>{r.number}</b></div>
        <div className="rmul3d-robot-hp"><b>{r.hp}</b><span>Lv{r.level}</span></div>
        <HealthBar value={r.hp} max={r.maxHp} damage={r.damage} label={teamName(team)+r.number+"号血量"}/>
        <div className="rmul3d-robot-state">{r.revival!==null?<><span>{label}</span><span>{r.revival}%</span></>:(labels.length?labels.map(text=><span key={text}>{text}</span>):<span> </span>)}</div>
      </div>;
    })}</div>
    <div className="rmul3d-territory" title={"前哨阵地 "+areaText(side.outpostArea)+" · 基地阵地 "+areaText(side.baseArea)}><span>前哨 {areaText(side.outpostArea)}</span><span>基地 {areaText(side.baseArea)}</span></div>
  </section>;
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
        {loading && !error && <p className="rmul3d-loading" role="status">正在加载战场…</p>}
        {error && <div className="rmul3d-error" role="alert">{error}<button onClick={() => window.location.reload()}>重试</button></div>}
        <div className="rmul3d-hud">
        <header className="rmul3d-header">
          <Link to={returnTo} className="rmul3d-back" aria-label={experienceReturnLabel(returnTo)}>←</Link>
          <button className="rmul3d-settings" type="button" onClick={() => toggleMenu(!menu)} aria-label="战场菜单" aria-expanded={menu}>☰</button>
        </header>
        {!disabled && !menu && status.match && <div className="rmul3d-match">
          {status.match.phase === "ready" ? <button onClick={() => controller.current?.start()}>开始自主对抗训练</button> : <>
            <div className="rmul3d-score"><TeamScore team="red" side={status.match.sides.red} /><div className="rmul3d-clock"><strong>{Math.floor(status.match.seconds/60)}:{String(status.match.seconds%60).padStart(2,"0")}</strong><small>{status.match.phase==="finished"?"结束":"RMUC 2027"}</small></div><TeamScore team="blue" side={status.match.sides.blue} /></div>
            {status.match.phase === "finished" && <><strong>{status.match.winner==="draw"?"平局":status.match.winner==="red"?"红方获胜":"蓝方获胜"}</strong><button onClick={() => controller.current?.reset()}>重新开始</button></>}
          </>}
        </div>}
        {!disabled&&!menu&&status.radarMap&&status.match?.phase==="running"&&<aside className="rmul3d-minimap">
          <div className="rmul3d-map-head"><select aria-label="地图情报视角" value={status.radarMap.perspective} disabled={!!status.robot} onChange={e=>controller.current?.radarView(e.target.value as "all"|"red"|"blue")}><option value="all">全局观战</option><option value="red">红方情报</option><option value="blue">蓝方情报</option></select>
          {status.radarMap.perspective!=="all"&&<span>雷达 {status.radarMap[status.radarMap.perspective].doubleUntil>0?"易伤×2 "+status.radarMap[status.radarMap.perspective].doubleUntil+"s":"机会 "+status.radarMap[status.radarMap.perspective].opportunities}</span>}</div>
          <svg viewBox="0 0 280 150" role="img" aria-label="CAD战场地图"><image href={status.radarMap.image} width="280" height="150"/>
            {(["red","blue"] as const).map(team=>{const sign=team==="red"?1:-1,s=status.match!.sides[team];return <g key={team} stroke={team==="red"?"#fb7777":"#7bbdff"} fill="none"><rect x={(14-11.68*sign)*10-5} y="70" width="10" height="10" opacity={s.base?1:.25}/><circle cx={(14-3.126*sign)*10} cy={(7.5+3.892*sign)*10} r="5" stroke={s.outpostOwner==="red"?"#fb7777":"#7bbdff"} opacity={s.outpost?1:.25}/><path d={sign===1?"M2 70v10h7":"M278 70v10h-7"}/></g>})}
            {status.radarMap.tracks.map(r=><g key={r.id} transform={`translate(${(14-r.x)*10} ${(7.5-r.z)*10})`} opacity={r.stale?.4:1} aria-label={r.team+" "+r.id+" P="+r.progress}><circle r="4.5" fill={r.team==="red"?"#d94b4b":"#287de0"} stroke={r.localized?"white":"#222"} strokeDasharray={r.stale?"2 2":undefined}/><text textAnchor="middle" y="2.2" fontSize="6" fill="white">{r.id.slice(-2)}</text></g>)}
          </svg>
          {status.robot&&status.radarMap.perspective!=="all"&&!status.match.dart?.blind&&status.radarMap[status.radarMap.perspective].opportunities>0&&<button disabled={status.radarMap[status.radarMap.perspective].doubleUntil>0} onClick={()=>controller.current?.radarDouble()}>双倍易伤</button>}
        </aside>}
        {!disabled && !menu && playing && status.robot && status.match?.phase==="ready" && status.match.performance && <div className="rmul3d-combat">
          <label>底盘 <select value={status.match.performance.chassis} onChange={e=>controller.current?.performance({...status.match!.performance!,chassis:e.target.value as "hp"|"power"})}><option value="hp">血量优先</option><option value="power">功率优先</option></select></label>
          <label>发射机构 <select value={status.match.performance.launcher} onChange={e=>controller.current?.performance({...status.match!.performance!,launcher:e.target.value as "cooling"|"burst"})}><option value="cooling">冷却优先</option><option value="burst">爆发优先</option></select></label>
          <span>HP {status.match.maxHp} · {status.match.power?.limit}W · 热量上限 {status.match.heatLimit}</span>
        </div>}
        {!disabled && !menu && playing && status.robot && status.match?.phase==="ready" && status.match.stance && <div className="rmul3d-combat">
          <label>哨兵控制 <select value={status.match.stance.control} onChange={e=>controller.current?.sentryControl(e.target.value as "auto"|"semi")}><option value="auto">全自动</option><option value="semi">半自动</option></select></label>
          <span>HP {status.match.maxHp} · 热量上限 {status.match.heatLimit}</span>
        </div>}
        {!disabled && !menu && playing && status.robot && status.match?.phase==="running" && <div className="rmul3d-combat">
          <span>HP {status.match.hp}/{status.match.maxHp}</span>{(status.match.xp!==null||status.match.launcher)&&<span>Lv.{status.match.level}{status.match.xp!==null&&` · ${Math.floor(status.match.xp)} XP`}</span>}<span>弹药 {status.match.ammo}{status.match.reserve>0&&` + ${status.match.reserve} 储备`}</span><span>{status.match.coins} 金币</span>
          {status.match.revival?.weak&&<span>虚弱</span>}{status.match.revival?.immune&&<span>无敌</span>}
          {status.match.buff>0&&<span>能量增益 {status.match.buff}s</span>}
          {status.match.power&&<span>{status.match.power.locked>0?"底盘断电 "+status.match.power.locked+"s":"缓冲 "+status.match.power.buffer+"/60J · "+status.match.power.limit+"W"}</span>}
          {status.match.heatLimit>0&&<span>热量 {status.match.heat}/{status.match.heatLimit}</span>}
          {status.match.revival?.dead?<>{status.match.technology?.canCancel&&<button onClick={()=>controller.current?.cancelAssembly()}>退出装配</button>}<span>复活读条 {Math.floor(status.match.revival.progress*100)}%</span><button disabled={!status.match.revival.canConfirm} onClick={()=>controller.current?.revive(false)}>确认复活 {status.match.revival.fee>0&&`${status.match.revival.fee}金币`}</button><button disabled={!status.match.revival.canPay} onClick={()=>controller.current?.revive(true)}>立即复活 {status.match.revival.cost}金币</button></>:<>
          {status.match.rune&&<button disabled={status.match.rune.active||status.match.rune.buff>0||status.match.rune.available<=0||!!status.match.revival?.weak} onClick={()=>controller.current?.rune()}>{status.match.rune.active?"机关 "+status.match.rune.groups+"/5":(status.match.rune.large?"大":"小")+"能量机关 "+status.match.rune.available}</button>}
          {status.match.stance&&(()=>{
            const stance=status.match.stance;
            return <><span>{stance.control==="auto"?"全自动 · 指挥50币/次":"半自动"}</span>{stance.control==="auto"&&<select aria-label="指挥哨兵目标" value="" disabled={status.match!.coins<stance.commandCost} onChange={e=>controller.current?.sentryMark(e.target.value as "supply"|"outpost"|"central"|"highpoint")}><option value="" disabled>{stance.commandTarget?"更改目标":"指挥目标"}</option><option value="supply">补给区</option><option value="outpost">本方前哨</option><option value="central">本方高地</option><option value="highpoint">本方制高点</option></select>}<span>{stance.enhanced?"强化":""}{({attack:"进攻",defense:"防御",move:"移动"})[stance.mode]}姿态{stance.cooldown>0?" · "+Math.ceil(stance.cooldown)+"s":""}</span>{(["attack","defense","move"] as const).map(mode=><button key={mode} disabled={status.match!.coins<stance.commandCost||stance.cooldown>0||stance.mode===mode&&!stance.enhanced} onClick={()=>controller.current?.stance(mode,false)}>{({attack:"进攻",defense:"防御",move:"移动"})[mode]}</button>)}<button disabled={status.match!.coins<stance.commandCost||stance.enhanced||stance.cooldown>0||stance.remaining[stance.mode]<=0} onClick={()=>controller.current?.stance(stance.mode,true)}>强化 {Math.ceil(stance.remaining[stance.mode])}s</button></>;
          })()}
          {status.match.terrain?.highpoint&&<span>制高点 · 50%防御</span>}
          {!!status.match.terrain?.defense&&<span>跨越 · {status.match.terrain.defense*100}%防御</span>}
          {status.match.terrain?.cooling===1.5&&<span>穿越 · 1.5倍冷却</span>}
          {status.match.armor?.center&&<span>装甲加固 {Math.round(status.match.armor.center.x*1000)},{Math.round(status.match.armor.center.y*1000)}mm{status.match.armor.lastHit&&" · "+({default:"默认",reinforced:"加固区命中",exposed:"未加固区命中"})[status.match.armor.lastHit]}</span>}
          {status.match.armor?.canFortify&&<form onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);const x=data.get("x"),y=data.get("y");controller.current?.armorFortify(x===""?undefined:Number(x)/1000,y===""?undefined:Number(y)/1000);}}><input aria-label="加固中心横坐标（毫米）" name="x" type="number" min="0" step="1" placeholder="X 自动" style={{width:"5em"}}/><input aria-label="加固中心纵坐标（毫米）" name="y" type="number" min="0" step="1" placeholder="Y 自动" style={{width:"5em"}}/><button type="submit">加固 {status.match.armor.available}次</button></form>}
          {status.match.dart&&<><span>虚拟飞镖 {status.match.dart.remaining}/4 · {({opening:"开闸中",open:"已开启",closing:"关闸中",cooldown:"冷却",closed:"已关闭"})[status.match.dart.phase as "opening"|"open"|"closing"|"cooldown"|"closed"]}{status.match.dart.inFlight?" · 飞行中":""}</span>{status.match.dart.canSelect&&<select aria-label="飞镖目标" value={status.match.dart.mode} onChange={e=>controller.current?.dartSelect(e.target.value as NonNullable<NonNullable<ArenaStatus["match"]>["dart"]>["mode"])}>{Object.entries({outpost:"前哨站",fixed:"固定基地",randomFixed:"随机固定",randomMoving:"随机移动",terminalMoving:"末端移动"}).map(([id,label])=><option key={id} value={id} disabled={id==="outpost"&&status.match!.dart!.phase==="open"}>{label}</option>)}</select>}{status.match.dart.canOpen&&<button onClick={()=>controller.current?.dartOpen()}>开启闸门</button>}{status.match.dart.canFire&&<button onClick={()=>controller.current?.dartFire()}>虚拟发射</button>}</>}
          {status.match.technology&&status.match.technology.highest>0&&<span>科技 {status.match.technology.highest}级 · +{status.match.technology.income}币/10s{status.match.technology.defense>0&&` · 防御 ${status.match.technology.defense}%`}</span>}
          {status.match.energy&&status.match.energy.carrying>0&&<span>能量单元 {status.match.energy.carrying}/2</span>}
          {status.match.technology?.available.map(level=><button key={level} onClick={()=>controller.current?.assembly(level)}>装配 {level}级</button>)}
          {status.match.technology?.level&&status.match.energy&&<>
            <span>{status.match.technology.level}级装配{status.match.technology.remaining!==null&&` · ${status.match.technology.remaining}s`}{status.match.technology.pending&&" · 动作中"}</span>
            {status.match.technology.actions.map(action=><button key={action.core} onClick={()=>controller.current?.assemblyStep(action.core,action.step,action.angle)}>{status.match!.technology!.level===4?(action.core==="red"?"红核心 ":"蓝核心 "):""}{({2:"对准并插入",3:"上移100mm",4:"向上翻转90°",5:`旋转至 ${action.angle}°`,6:"确认装配"})[action.step]}</button>)}
            {status.match.technology.canCancel&&<button onClick={()=>controller.current?.cancelAssembly()}>取消装配</button>}
          </>}
          {status.match.energy&&status.match.technology?.failure&&<span role="status">{status.match.technology.failure}</span>}
          {status.match.energy?.pickup&&<button onClick={()=>controller.current?.pickup()}>拾取能量单元</button>}
          {status.match.energy?.canDrop&&<button onClick={()=>controller.current?.drop()}>释放能量单元</button>}
          {status.match.launcher?.state==="locked"&&<span>{status.match.launcher.unlockIn}s</span>}
          {status.match.launcher?.state==="unlocked"&&<button disabled={!status.match.launcher.canInstall} onClick={()=>controller.current?.install()}>拾取并安装 42mm</button>}
          {status.match.launcher?.canRemove&&<button onClick={()=>controller.current?.removeLauncher()}>拆回工作台</button>}
          <button disabled={!status.match.canBuy} onClick={()=>controller.current?.buy()}>{status.match.pendingAmmo>0?"补弹 "+status.match.pendingAmmo+"s":"补弹 "+status.match.ammoCount+"发 · "+status.match.ammoCost+"金币"}</button>
          {status.match.hp<status.match.maxHp&&<button disabled={!status.match.canHeal} onClick={()=>controller.current?.heal()}>{status.match.pendingHeal>0?"回血 "+status.match.pendingHeal+"s":"回血 "+status.match.healCost+"金币"}</button>}
          </>}
        </div>}
        <div className="rmul3d-actions">
        {!disabled && !menu && playing && (status.robot || status.nearby) && (
          <button className="rmul3d-interact" onClick={() => controller.current?.interact()}>
            <kbd>E</kbd> {status.robot ? "退出 " + status.robot : "接管 " + status.nearby}
          </button>
        )}
        {!disabled && !menu && playing && status.robot && status.match?.phase==="running" && !status.match.revival?.dead && status.match.stance?.control!=="auto" && <button type="button" className="rmul3d-fire" aria-disabled={!status.match.canFire}
          onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);controller.current?.fire("button:"+event.pointerId,true);}}
          onPointerUp={event=>controller.current?.fire("button:"+event.pointerId,false)}
          onPointerCancel={event=>controller.current?.fire("button:"+event.pointerId,false)}
          onLostPointerCapture={event=>controller.current?.fire("button:"+event.pointerId,false)}>{status.match.thermalLock==="permanent"?"发射机构已锁定":status.match.thermalLock?"冷却中":status.match.launcher?.state==="test"?"测试射击":"开火"}</button>}
        </div>
        {!disabled && !menu && playing && status.match?.stance?.control!=="auto" && <div className="rmul3d-touch" aria-label="移动控制">
          {touchKeys.map(([key, arrow]) => <button key={key} type="button"
            aria-label={key === "KeyW" ? "前进" : key === "KeyS" ? "后退" : key === "KeyA" ? "左移" : "右移"}
            onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); controller.current?.input(key, true); }}
            onPointerUp={() => controller.current?.input(key, false)}
            onPointerCancel={() => controller.current?.input(key, false)}
            onLostPointerCapture={() => controller.current?.input(key, false)}>{arrow}</button>)}
        </div>}
        </div>
        {!disabled && playing && status.match?.phase==="running" && (status.match.thermalLock==="cooling"||!!status.match.dart?.blind) && <div className="rmul3d-thermal-lock" aria-label={status.match.dart?.blind?"飞镖命中，图传遮挡":"热量超限，图传断开"} />}
        {!disabled && !menu && playing && status.match?.thermalLock!=="cooling" && <div className="rmul3d-crosshair" aria-hidden="true" />}
        {menu && <aside className="rmul3d-help" aria-label="战场菜单" onKeyDown={event => { if (event.key === "Escape") toggleMenu(false); }}>
          <button className="rmul3d-close" onClick={() => toggleMenu(false)} aria-label="关闭">×</button>
          <Link to="/pixel-jijia/battle" state={{ experienceReturnTo: returnTo }}>战术演练</Link>
          <h2>视角</h2>
          <nav className="rmul3d-views" aria-label="校准视角">
            {CAMERA_VIEWS.filter(({id})=>!status.robot||id==="first").map(({ id, label }) => (
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
            <dt>左键 / 空格</dt><dd>按住持续开火</dd>
            <dt>B</dt><dd>远程补弹</dd>
            <dt>V / M</dt><dd>切换视角 / 全场</dd>
            <dt>Esc</dt><dd>释放鼠标</dd>
          </dl>
          <h2>资产来源</h2>
          <a href="https://bbs.robomaster.com/article/1970956" target="_blank" rel="noreferrer">RoboMaster 2027 官方 CAD</a>
          <a href="https://github.com/hxyulin/rm-map-tools/releases/tag/rm2027-assets-20261015" target="_blank" rel="noreferrer">rm-map-tools · CAD 转换</a>
          <Link to="/robots">TARS-Go 2026 定妆照</Link>
          <p>场地资料 CC BY-NC-SA 4.0；机器人为照片参考的外观模型，非官方尺寸。当前为自主对抗训练，非完整官方裁判仿真。基地装甲攻击尚未实现；飞镖为虚拟检测训练，装配机构与护甲行程、场地交互模块卡覆盖范围为训练近似。</p>
        </aside>}
      </section>
    </main>
  );
}