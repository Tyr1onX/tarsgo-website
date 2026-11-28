import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import {getOptionalCurrentUser,subscribeAuthStateChange} from "~/lib/auth-client";
import {apiRequest} from "~/lib/api-client";
import {joystickVector} from "~/lib/rmuc-3d-input";
import { useLocation, useNavigate } from "react-router";
import { getExperienceReturnTo, getPixelReturn } from "~/lib/experience-navigation";
import type { Route } from "./+types/pixel-jijia-arena";
import { buildPublicMeta } from "~/lib/social-meta";
import type { ArenaController, ArenaLoadProgress, ArenaStatus } from "~/lib/rmuc-3d-scene";
import {DEFAULT_ARENA_SETTINGS,loadArenaSettings,saveArenaSettings,type ArenaSettings} from "~/lib/rmuc-3d-settings";
import {defaultStrategy,STRATEGY_PRESETS,WEIGHT_KEYS,type Strategy} from "~/lib/rmuc-3d-strategy";
import {pairedSummary,type ExperimentProgress} from "~/lib/rmuc-3d-experiment";
import {KNOWLEDGE} from "~/lib/rmuc-academy";
import "./pixel-jijia-arena.css";

export function meta({}: Route.MetaArgs) {
  return buildPublicMeta({
    title: "RMUC 2027 三维战场 | TARSGO",
    description: "RMUC 2027 官方 CAD 场地，支持自由探索与机器人对抗训练。",
    path: "/pixel-jijia/arena",
    image: "/assets/images/Social/home.jpg",
  });
}

function ControlIcon({kind}:{kind:"up"|"down"|"boost"|"fire"|"interact"}){
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind==="fire"?<><circle cx="16" cy="16" r="9"/><path d="M16 3v7m0 12v7M3 16h7m12 0h7"/><circle cx="16" cy="16" r="1.5" fill="currentColor"/></>:kind==="interact"?<><path d="M15 5H6v22h9M17 9l7 7-7 7M10 16h14"/></>:kind==="boost"?<><path d="m8 17 8-8 8 8M8 24l8-8 8 8"/><path d="M16 4v2"/></>:<path d={kind==="up"?"m7 17 9-9 9 9M16 8v16":"m7 15 9 9 9-9M16 8v16"}/>}
  </svg>;
}
const weightLabels={attack:"进攻",defense:"防御",resources:"资源",technology:"科技",cooperation:"协同"};
function StrategyEditor({label,value,onChange,disabled}:{label:string;value:Strategy;onChange:(s:Strategy)=>void;disabled:boolean}){
  return <fieldset disabled={disabled} className="rmul3d-strategy">
    <legend>{label}</legend>
    <label>算法<select aria-label={label+"算法"} value={value.algorithm} onChange={e=>onChange({...value,algorithm:e.target.value as Strategy["algorithm"]})}><option value="priority">规则优先级</option><option value="utility">任务效用评分</option></select></label>
    {value.algorithm==="utility"&&<>
      <div className="rmul3d-presets">{Object.entries({balanced:"均衡",attack:"进攻",defense:"防御",technology:"科技"}).map(([key,name])=><button key={key} type="button" onClick={()=>onChange({...value,weights:{...STRATEGY_PRESETS[key]}})}>{name}</button>)}</div>
      {WEIGHT_KEYS.map(k=><label key={k}>{weightLabels[k]}<input aria-label={label+weightLabels[k]} type="range" min="0" max="100" step="1" value={value.weights[k]} onChange={e=>onChange({...value,weights:{...value.weights,[k]:Number(e.target.value)}})}/><output>{value.weights[k]}</output></label>)}
    </>}
  </fieldset>;
}
function ExperimentResults({progress,onExport}:{progress:ExperimentProgress;onExport:()=>void}){
  const summary=pairedSummary(progress.results);
  function download(){
    const url=URL.createObjectURL(new Blob([JSON.stringify({schema:1,ruleVersion:"RMUC 2027 V1.0.0",codeVersion:import.meta.env.VITE_ARENA_CODE_VERSION??"unknown",...summary,rounds:progress.results},null,2)],{type:"application/json"}));
    const a=document.createElement("a");a.href=url;a.download="rmuc-experiment.json";a.click();onExport();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <div className="rmul3d-experiment-results">
    <p>已完成 {progress.completed}/{progress.total} 场 · 完整配对 {summary.completePairs}</p>
    {progress.results.length>0&&<><p>A 胜 {summary.aWins} · B 胜 {summary.bWins} · 平 {summary.draws}　红胜 {summary.redWins} · 蓝胜 {summary.blueWins}</p>
    <div className="rmul3d-experiment-table"><table><thead><tr><th>种子</th><th>红 / 蓝</th><th>胜方</th><th>控制度 红 / 蓝</th><th>伤害 红 / 蓝</th></tr></thead><tbody>{progress.results.map(r=><tr key={r.index}><td>{r.seed}</td><td>{r.swapped?"B / A":"A / B"}</td><td>{r.winner==="red"?"红":r.winner==="blue"?"蓝":"平"}</td><td>{r.sides.red.control} / {r.sides.blue.control}</td><td>{r.sides.red.damage} / {r.sides.blue.damage}</td></tr>)}</tbody></table></div><button onClick={download}>导出 JSON</button></>}
  </div>;
}

const teamName=(team:"red"|"blue")=>team==="red"?"红方":"蓝方";
const robotNames={heavy:"重装",infantry:"步兵",sentry:"哨兵"};
const teachingChapters=[
  ["认识比赛","阵容、场地、比赛流程与胜负"],
  ["基础操控","自由探索、视角、接管与瞄准"],
  ["生存与资源","补给、复活、金币、弹量、热量与功率"],
  ["阵地争夺","前哨阵地争夺与恢复"],
  ["攻防机制","基地、堡垒、装甲与跨越增益"],
  ["工程与科技","重装、能量单元、装配与发射机构"],
  ["特殊机制","能量机关、哨兵、空中、飞镖与雷达"],
  ["完整实战","420 秒比赛与胜负判定"],
] as const;
const teachingPhases=["规则介绍","实体定位","动态演示","玩家实践","结果反馈"];
const territorySteps=[
  "蓝色边界标出了同一前哨阵地的两个增益点：中央高地和前哨站。注意红、蓝方步兵的位置。",
  "红方步兵正在前往蓝方中央高地。进入增益点之前，占领进度不会增加。",
  "红方激活了蓝方中央高地，占领进度开始累积。此时蓝方仍拥有完全控制。",
  "蓝方步兵正前往蓝方前哨站。即使两台步兵处于不同增益点，也在争夺同一阵地。",
  "双方同时激活同一阵地，进度暂停。交火本身不会直接改变阵地归属。",
  "蓝方正在撤离前哨站增益点。等待双方争夺结束。",
  "红方独自激活阵地，占领进度继续累积。连续有效激活达到五秒即可临时控制。",
  "红方已获得临时控制。观察前哨站生命值：建筑没有被摧毁，阵地归属已经改变。",
  "红方正在离开增益点，蓝方回到阵地。临时控制方不再激活满五秒，原阵营恢复完全控制。",
  "蓝方已恢复完全控制。双方步兵正在回到练习起点，接下来由你操作红方步兵。",
] as const;
function ArenaScore({status}:{status:ArenaStatus}){
  const m=status.match;if(!m)return null;
  const clock=String(Math.floor(Math.max(0,m.seconds)/60)).padStart(2,"0")+":"+String(Math.max(0,m.seconds)%60).padStart(2,"0");
  function side(team:"red"|"blue"){
    const value=m!.sides[team];
    return <div className={"rmuc-score-side "+team}><strong>{teamName(team)}</strong>
      <span>基地生命值 <b>{value.base}</b></span>
      <span>前哨站生命值 <b>{value.outpost}</b></span>
      <span>金币 <b title={value.coins===null?"当前视角不可见":undefined}>{value.coins??"—"}</b></span>
    </div>;
  }
  return <section className="rmuc-score" aria-label="比赛信息">{side("red")}<div className="rmuc-score-time"><small>{status.countdown?"比赛倒计时":m.phase==="finished"?"比赛结束":"比赛剩余时间"}</small><strong>{status.countdown??clock}</strong>{status.paused&&m.phase!=="finished"&&<small>已暂停</small>}{m.phase==="finished"&&<b>{m.winner==="draw"?"平局":m.winner?teamName(m.winner)+"胜利":""}</b>}</div>{side("blue")}</section>;
}
function RobotTelemetry({status}:{status:ArenaStatus}){
  const m=status.match,f=status.focus;if(!m||!f)return null;
  return <section className={"rmuc-telemetry "+f.team} aria-label="当前机器人状态">
    <strong>{teamName(f.team)} {f.number}号 {robotNames[f.kind]} · {f.manual?"人工接管":"观察"}</strong>
    <div><span>生命值 <b>{m.hp}/{m.maxHp}</b></span><span>弹药 <b>{m.ammo}{m.reserve>0?" + "+m.reserve:""}</b></span>{m.heatLimit>0&&<span>热量 <b>{m.heat}/{m.heatLimit}</b></span>}{m.power&&<span>缓冲能量 <b>{m.power.buffer}/60 J</b></span>}</div>
    {m.revival?.dead?<span>战亡 · 复活 {Math.floor(m.revival.progress*100)}%</span>:<>{!!m.power?.locked&&<span>底盘断电 {m.power.locked}s</span>}{m.thermalLock&&<span>发射锁定</span>}{m.revival?.weak&&<span>虚弱</span>}{m.revival?.immune&&<span>免疫</span>}{m.pendingAmmo>0&&<span>补弹 {m.pendingAmmo}s</span>}{m.pendingHeal>0&&<span>回血 {m.pendingHeal}s</span>}</>}
  </section>;
}
function TerritoryTeaching({status}:{status:ArenaStatus}){
  const t=status.teaching!,side=status.match?.sides.blue,area=side?.outpostArea;
  const phase=t.done?4:t.step===10?3:t.step===-1?0:t.step===0?1:2;
  let message=t.step===-1?KNOWLEDGE.territory.detail+" "+KNOWLEDGE.outpost.summary:
    t.step===10?t.captured?"已获得红方临时控制。离开蓝方中央高地及前哨站，回到金色起点标记，等待蓝方恢复完全控制。":status.robot?"使用 WASD 或左侧摇杆，沿金色目标指引进入蓝方中央高地，停留至红方临时控制。无需开火。":"接管红方步兵，亲自完成临时占领与归属恢复。":
    territorySteps[t.step]??"";
  if(t.done)message="实践通过：你亲自取得红方临时控制，离开阵地后让蓝方恢复完全控制。两次归属变化均由裁判系统实际判定。";
  if(t.error)message=t.error;
  return <aside className="rmuc-lesson" aria-label="前哨阵地教学">
    <div className="rmuc-lesson-heading"><strong>前哨阵地争夺与恢复</strong><span>{phase+1}/5 · {teachingPhases[phase]}</span></div>
    <div className="rmuc-lesson-steps">{teachingPhases.map((name,i)=><span key={name} data-active={i===phase} data-done={i<phase}>{name}</span>)}</div>
    <p role={t.error?"alert":undefined}>{message}</p>
    {area&&side&&t.step>=0&&<div className="rmuc-lesson-live"><span>蓝方前哨阵地：<b>{teamName(area.controller)}{area.full?"完全控制":"临时控制"}</b></span><span>{area.contested?"争夺暂停":area.progressing?"进度累积":area.progress>0?"进度回退":"未争夺"} <b>{(area.progress/10).toFixed(1)} / 5 秒</b></span><progress aria-label="阵地争夺进度" max={50} value={area.progress}/><span>前哨站生命值 <b>{side.outpost}</b></span></div>}
  </aside>;
}
function ArenaRadar({status}:{status:ArenaStatus}){
  const map=status.radarMap;if(!map)return null;
  return <aside className="rmuc-radar" aria-label="雷达地图">
    <strong>{map.perspective==="all"?"全局雷达地图":teamName(map.perspective)+"雷达情报"}</strong>
    <svg viewBox="0 0 280 150" role="img" aria-label="红蓝双方机器人位置">
      <image href={map.image} width="280" height="150"/>
      {map.tracks.map(r=><g key={r.id} transform={"translate("+((14-r.x)*10)+" "+((7.5-r.z)*10)+")"} opacity={r.stale?.45:1}><title>{teamName(r.team)}{r.number}号</title><circle r="6.5" fill={r.team==="red"?"#dc4747":"#2585d9"}/><text textAnchor="middle" dominantBaseline="central" fill="white" fontSize="7" fontWeight="bold">{r.number}</text></g>)}
    </svg>
    {Object.entries(map.summary).map(([team,r])=><span key={team}>{team==="red"?"红方":"蓝方"}雷达 · {r.doubleUntil>0?"双倍易伤 "+r.doubleUntil+" 秒":"剩余机会 "+r.opportunities}</span>)}
  </aside>;
}

const INITIAL_STATUS:ArenaStatus={view:"first",robot:null,nearby:null};
const PHASE_LABELS:Record<ArenaLoadProgress["phase"],string>={program:"初始化三维程序",download:"下载战场资源",verify:"解压与完整性校验",parse:"解析模型",terrain:"生成地形与地图",initialize:"初始化机器人与机关",firstFrame:"准备首个画面"};
function TouchJoystick({controller,resetRef}:{controller:RefObject<ArenaController|null>;resetRef:RefObject<()=>void>}){
  const owner=useRef<number|null>(null),base=useRef<HTMLDivElement>(null),thumb=useRef<HTMLSpanElement>(null);
  function reset(){
    const id=owner.current;owner.current=null;
    if(thumb.current)thumb.current.style.transform="";
    if(id!==null&&base.current?.hasPointerCapture(id))base.current.releasePointerCapture(id);
  }
  useEffect(()=>{resetRef.current=reset;return()=>{const id=owner.current;if(id!==null)controller.current?.move(id,null);reset();resetRef.current=()=>{};};},[controller,resetRef]);
  function update(event:ReactPointerEvent<HTMLDivElement>,begin=false){
    const rect=event.currentTarget.getBoundingClientRect(),radius=rect.width*.33;
    const vector=joystickVector(event.clientX-rect.left-rect.width/2,event.clientY-rect.top-rect.height/2,radius);
    if(!controller.current?.move(event.pointerId,vector,begin,event.timeStamp))return false;
    if(thumb.current)thumb.current.style.transform=`translate(${vector.r*radius}px,${-vector.f*radius}px)`;
    return true;
  }
  function end(event:ReactPointerEvent<HTMLDivElement>){if(owner.current!==event.pointerId)return;controller.current?.move(event.pointerId,null,false,event.timeStamp);reset();}
  return <div className="rmul3d-joystick" ref={base} aria-label="移动摇杆"
    onPointerDown={event=>{if(event.button!==0||owner.current!==null)return;event.preventDefault();if(update(event,true)){owner.current=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);}}}
    onPointerMove={event=>{if(owner.current===event.pointerId&&!update(event))reset();}}
    onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}><span ref={thumb}/></div>;
}
export default function PixelJijiaArenaPage() {
  const location=useLocation();
  const navigate=useNavigate();
  const returnTo=getExperienceReturnTo(location.state);
  const pixelReturn=getPixelReturn(location.state);
  const mountRef = useRef<HTMLDivElement>(null);
  const controller=useRef<ArenaController | null>(null);
  const resetTouch=useRef<()=>void>(()=>{});
  // Progress belongs to the authenticated session, not to the lifetime of the
  // renderer. Existing course records stay in the existing progress table.
  const identity=useRef<number|null|undefined>(undefined);
  const lessonOwner=useRef<number|null|undefined>(undefined);
  const previousLesson=useRef<ArenaStatus["teaching"]>(undefined);
  const progressAbort=useRef<AbortController|null>(null);
  const completedRef=useRef(false);
  const [territoryCompleted,setTerritoryCompleted]=useState(false);
  const [saveError,setSaveError]=useState(false);
  function markCompleted(value:boolean){
    completedRef.current=value;setTerritoryCompleted(value);controller.current?.territoryCompleted(value);
  }
  async function saveTerritory(){
    const owner=lessonOwner.current;
    if(owner===undefined||owner!==identity.current)return;
    if(owner===null){markCompleted(true);return;}
    const abort=new AbortController();progressAbort.current?.abort();progressAbort.current=abort;
    setSaveError(false);
    try{
      const row=await apiRequest<{completed:boolean}>("/api/rmuc-academy/progress",{method:"PUT",body:{courseId:"guided-territory",version:1,position:1,completed:true},signal:abort.signal});
      if(!abort.signal.aborted&&identity.current===owner)markCompleted(row.completed);
    }catch{if(!abort.signal.aborted&&identity.current===owner)setSaveError(true);}
  }
  function receiveStatus(value:ArenaStatus){
    const old=previousLesson.current,next=value.teaching;
    if(next&&(!old||next.step===-1&&old.step!==-1))lessonOwner.current=identity.current;
    previousLesson.current=next;
    setStatus(value);
    if(next?.done&&!old?.done)void saveTerritory();
  }
  useEffect(()=>{
    let active=true;
    let load:AbortController|null=null;
    function account(user:{id:number}|null){
      if(!active)return;
      const next=user?.id??null,old=identity.current;
      if(old===next)return;
      load?.abort();progressAbort.current?.abort();setSaveError(false);
      identity.current=next;
      if(old===undefined&&previousLesson.current)lessonOwner.current=next;
      else if(old!==undefined&&previousLesson.current)controller.current?.explore();
      markCompleted(false);
      if(next===null)return;
      const abort=new AbortController();load=abort;
      void apiRequest<{courseId:string;version:number;completed:boolean}[]>("/api/rmuc-academy/progress",{signal:abort.signal,cache:"no-store"}).then(rows=>{
        if(active&&!abort.signal.aborted&&identity.current===next)markCompleted(completedRef.current||rows.some(r=>r.courseId==="guided-territory"&&r.version===1&&r.completed));
      }).catch(()=>{});
    }
    const off=subscribeAuthStateChange(account);
    void getOptionalCurrentUser().then(account).catch(()=>{});
    return()=>{active=false;off();load?.abort();progressAbort.current?.abort();};
  },[]);
  const [status, setStatus] = useState<ArenaStatus>(INITIAL_STATUS);
  const [attempt,setAttempt]=useState(0);
  const [loading, setLoading] = useState(true);
  const [progress,setProgress]=useState<ArenaLoadProgress>({phase:"program"});
  const settingsRef=useRef(DEFAULT_ARENA_SETTINGS);
  const [exportedCount,setExportedCount]=useState(0);
  useEffect(()=>{const value=loadArenaSettings();settingsRef.current=value;},[]);
  function updateSettings(value:ArenaSettings){settingsRef.current=value;saveArenaSettings(value);controller.current?.settings(value);}
  const [error, setError] = useState("");
  const analysis=new URLSearchParams(location.search).get("experiment")==="1";
  const [experimentOpen,setExperimentOpen]=useState(analysis);
  const [strategies,setStrategies]=useState({red:defaultStrategy(),blue:defaultStrategy()});
  const [seed,setSeed]=useState("2061");
  const [pairs,setPairs]=useState("1");
  const experimentRunning=!!status.experiment?.running;
  const validConfig=seed!==""&&Number.isInteger(Number(seed))&&Number(seed)>=0&&Number(seed)<=0xffffffff&&pairs!==""&&Number.isInteger(Number(pairs))&&Number(pairs)>=1&&Number(pairs)<=20;

  function retry(){
    previousLesson.current=undefined;setStatus(INITIAL_STATUS);setProgress({phase:"program"});setError("");setLoading(true);setAttempt(a=>a+1);
  }
  function canLeave(){
    const unsaved=(status.experiment?.results.length??0)>exportedCount;
    return !(experimentRunning||unsaved||status.match?.phase==="running")||window.confirm(experimentRunning||unsaved?"离开战场将丢失当前实验或未导出的结果，确定离开？":"当前比赛尚未结束，确定离开战场？");
  }
  function exitToMenu(){
    if(!canLeave())return;
    navigate(returnTo,{state:returnTo==="/pixel-jijia"&&pixelReturn?{pixelReturn}:undefined});
  }

  const exitRef=useRef(exitToMenu);exitRef.current=exitToMenu;
  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;
    let active = true;
    const importStarted=performance.now();
    function fail(message:string){
      if(!active)return;
      setLoading(false);setError(message);
      queueMicrotask(()=>{if(active){controller.current?.dispose();controller.current=null;}});
    }
    void import("~/lib/rmuc-3d-scene").then(({ mountArena }) => {
      if (!active) return;
      performance.measure("arena:import",{start:importStarted,end:performance.now()});
      controller.current = mountArena(
        host,settingsRef.current,
        value=>{if(active)setProgress(value);},
        () => {
          if(!active)return;
          const arena=controller.current;
          if(!arena)return;
          arena.settings(settingsRef.current);arena.territoryCompleted(completedRef.current);
          setLoading(false);
        },
        fail,
        value=>{if(active)receiveStatus(value);},
        ()=>resetTouch.current(),
        updateSettings,
        ()=>exitRef.current(),
      );
    }).catch(() => fail("当前设备无法打开三维场景，请重试"));
    return () => {
      active = false;
      controller.current?.dispose();
      controller.current = null;
    };
  }, [attempt]);

  const teaching=status.teaching;
  const guided=!!teaching;
  const exploring=!guided&&!status.robot&&status.match?.phase==="ready"&&!status.countdown;
  const playing = status.view === "first", flying=status.view==="third";
  const firstPerson=playing||status.view==="ai-first";
  const focus=status.focus;
  const disabled = loading || !!error;
  const showTouch=!status.panel&&!status.paused&&!disabled&&!status.countdown&&!experimentRunning&&!experimentOpen&&(flying||playing&&status.match?.stance?.control!=="auto"&&!status.match?.revival?.dead&&status.match?.phase!=="finished");

  const configFields=<>
    <StrategyEditor label="红方 A" value={strategies.red} onChange={red=>setStrategies(s=>({...s,red}))} disabled={experimentRunning||status.match?.phase==="running"}/>
    <StrategyEditor label="蓝方 B" value={strategies.blue} onChange={blue=>setStrategies(s=>({...s,blue}))} disabled={experimentRunning||status.match?.phase==="running"}/>
    <div className="rmul3d-experiment-config"><label>起始种子<input aria-label="起始种子" type="number" min="0" max="4294967295" step="1" value={seed} disabled={experimentRunning} onChange={e=>setSeed(e.target.value)}/></label><label>配对数<input aria-label="配对数" type="number" min="1" max="20" step="1" value={pairs} disabled={experimentRunning} onChange={e=>setPairs(e.target.value)}/></label><span>{Number(pairs)*2} 场 · 每对交换红蓝</span></div>
  </>;
  return (
    <main data-territory-completed={territoryCompleted} data-world-view={status.view} data-world-mode={guided?"teaching":exploring?"explore":"match"} data-teaching-step={teaching?.step} data-teaching-done={teaching?.done} data-teaching-captured={teaching?.captured} data-teaching-paused={teaching?.paused} data-world-driving={!!status.robot} data-world-progress={status.match?.sides.blue.outpostArea.progress} data-world-contested={status.match?.sides.blue.outpostArea.contested} data-world-controller={status.match?.sides.blue.outpostArea.controller} data-world-full={status.match?.sides.blue.outpostArea.full} data-world-seconds={status.match?.seconds} data-world-outpost={status.match?.sides.blue.outpost} className="rmul3d">
      <section className="rmul3d-stage" aria-label="RMUC 2027 三维训练战场">
        <div ref={mountRef} className="rmul3d-canvas" data-ready={!disabled} />

        {loading && !error && <div className="rmul3d-loading"><div className="rmul3d-load-content"><div className="rmul3d-load-brand"><span>TARS-GO</span><b>RMUC 2027</b></div><strong key={progress.phase} role="status">{PHASE_LABELS[progress.phase]}</strong>{progress.phase==="download"&&<><progress aria-label="资源下载进度" max={progress.total} value={progress.total===undefined?undefined:progress.received}/><span>{((progress.received??0)/1000000).toFixed(1)} MB{progress.total!==undefined?` / ${(progress.total/1000000).toFixed(1)} MB · ${Math.min(100,Math.floor((progress.received??0)/Math.max(1,progress.total)*100))}%`:""}</span></>}<button onClick={exitToMenu}>取消</button></div></div>}
        {error && <div className="rmul3d-error"><span role="alert">{error}</span><button onClick={retry}>重试</button><button onClick={()=>controller.current?.explore()}>返回探索</button></div>}
        {saveError&&<div className="rmul3d-save-error" role="alert">进度未保存 <button onClick={()=>void saveTerritory()}>重试</button></div>}
        {!disabled&&<>
        {!experimentRunning&&!status.atControl&&status.match&&(status.match.phase!=="ready"||focus||status.countdown)&&<ArenaScore status={status}/>}
        {!experimentRunning&&focus&&!status.panel&&<RobotTelemetry status={status}/>}
        {status.radarVisible&&!guided&&!status.panel&&!experimentRunning&&<ArenaRadar status={status}/>}
        {teaching&&!status.panel&&<TerritoryTeaching status={status}/>}
        {!experimentRunning&&!experimentOpen&&status.panel==="teaching"&&<section className="rmuc-command-panel rmuc-catalog" aria-label="教学目录"><header><h2>RMUC 2027 教学目录</h2><button data-world-command="close" onClick={()=>controller.current?.command("close")}>返回</button></header><ol>{teachingChapters.map(([title,summary],i)=><li key={title}><div><strong>{title}</strong><span>{summary}</span></div>{i===3?<button data-world-command="lessonStart" onClick={()=>controller.current?.command("lessonStart")}>{territoryCompleted?"重新练习":"开始学习"}</button>:<small>待开放</small>}</li>)}</ol></section>}
        {!experimentRunning&&!experimentOpen&&status.panel&&status.panel!=="teaching"&&<section className="rmuc-command-panel" aria-label={status.panel==="robots"?"机器人选择":status.panel==="settings"?"比赛设置":"比赛操作"}><header><h2>{status.panel==="robots"?"机器人选择":status.panel==="settings"?"比赛设置":"比赛操作"}</h2><button data-world-command="close" onClick={()=>controller.current?.command("close")}>返回</button></header><div className="rmuc-command-grid">{status.controls?.filter(c=>c.id!=="close").map(c=><button key={c.id} data-world-command={c.id} aria-pressed={c.selected} title={c.label} disabled={c.disabled} onClick={()=>controller.current?.command(c.id)}>{c.label}{c.detail&&<small>{c.detail}</small>}</button>)}</div></section>}
        {!experimentRunning&&!experimentOpen&&!status.panel&&!!status.controls?.length&&<nav className="rmuc-command-bar" aria-label="战场操作">{status.controls.map(c=>{const label=c.id==="resume"&&teaching?.step===-1?"开始演示":c.id==="take"&&guided?"接管并练习":c.label;return <button key={c.id} data-world-command={c.id} title={label} disabled={c.disabled} onClick={()=>controller.current?.command(c.id)}>{label}</button>;})}</nav>}
        {!status.panel&&!experimentRunning&&!guided&&playing&&!focus&&<div className="rmuc-movement-help">WASD 移动 · 鼠标转向 · Shift 加速 · Esc 释放鼠标</div>}
        <div className="rmul3d-hud">
        <div className="rmul3d-actions">
        {showTouch&&!flying&&<button className="rmul3d-ground-boost" type="button" aria-label="加速" title="加速"
          onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);controller.current?.touchAction(event.pointerId,"ShiftLeft",true,event.timeStamp);}}
          onPointerUp={event=>controller.current?.touchAction(event.pointerId,"ShiftLeft",false,event.timeStamp)}
          onPointerCancel={event=>controller.current?.touchAction(event.pointerId,"ShiftLeft",false,event.timeStamp)}
          onLostPointerCapture={event=>controller.current?.touchAction(event.pointerId,"ShiftLeft",false,event.timeStamp)}><ControlIcon kind="boost"/></button>}
        {showTouch&&flying&&<div className="rmul3d-flight-actions">{([["Space","上升"],["ShiftLeft","下降"],["ControlLeft","加速"]] as const).map(([key,label])=><button key={key} type="button" aria-label={label} title={label}
          onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);controller.current?.touchAction(event.pointerId,key,true,event.timeStamp);}}
          onPointerUp={event=>controller.current?.touchAction(event.pointerId,key,false,event.timeStamp)}
          onPointerCancel={event=>controller.current?.touchAction(event.pointerId,key,false,event.timeStamp)}
          onLostPointerCapture={event=>controller.current?.touchAction(event.pointerId,key,false,event.timeStamp)}><ControlIcon kind={key==="Space"?"up":key==="ShiftLeft"?"down":"boost"}/></button>)}</div>}
        {!teaching&&!disabled && !status.paused && playing && status.robot && status.match?.phase==="running" && !status.match.revival?.dead && status.match.stance?.control!=="auto" && <button type="button" className="rmul3d-fire" aria-label="开火" aria-disabled={!status.match.canFire}
          onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);controller.current?.fire("button:"+event.pointerId,true);}}
          onPointerUp={event=>controller.current?.fire("button:"+event.pointerId,false)}
          onPointerCancel={event=>controller.current?.fire("button:"+event.pointerId,false)}
          onLostPointerCapture={event=>controller.current?.fire("button:"+event.pointerId,false)}><ControlIcon kind="fire"/></button>}
        </div>
        {showTouch&&<div className="rmul3d-touch"><TouchJoystick controller={controller} resetRef={resetTouch}/></div>}
        </div>
        {!disabled && firstPerson && status.match?.phase==="running" && (status.match.thermalLock==="cooling"||!!status.match.dart?.blind) && <div className="rmul3d-thermal-lock" role="status" aria-label="图传中断"><ControlIcon kind="fire"/></div>}
        {!disabled && firstPerson && (!focus||focus.sight&&status.match!.hp>0) && status.match?.thermalLock!=="cooling"&&!status.match?.dart?.blind && <svg className="rmul3d-crosshair" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3v10m0 14v10M3 20h10m14 0h10" stroke="currentColor" strokeWidth="1.6" fill="none"/><circle cx="20" cy="20" r="1.5" fill="currentColor"/>{status.impact&&<path key={status.impact.serial} className={"rmul3d-impact "+status.impact.kind} d="m8 8 6 6m12 12 6 6M32 8l-6 6M14 26l-6 6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" fill="none"/>}</svg>}
        {analysis&&experimentRunning&&!experimentOpen&&<div className="rmul3d-experiment-progress"><span>实验 {status.experiment!.completed+1}/{status.experiment!.total} · {Math.floor(status.experiment!.elapsed)}s</span><button onClick={()=>setExperimentOpen(true)}>进度</button><button onClick={()=>controller.current?.cancelExperiment()}>停止</button></div>}
        {analysis&&experimentOpen&&<aside className="rmul3d-help rmul3d-experiment" aria-label="策略与实验">
          <button className="rmul3d-close" onClick={()=>setExperimentOpen(false)} aria-label="关闭实验">×</button>
          <h2>策略与实验</h2>
          <details><summary>场地与规则来源</summary><p><a href="https://bbs.robomaster.com/article/1970956" target="_blank" rel="noreferrer">官方 CAD</a> · <a href="https://github.com/hxyulin/rm-map-tools/releases/tag/rm2027-assets-20261015" target="_blank" rel="noreferrer">模型转换</a> · CC BY-NC-SA 4.0</p></details>
          {status.match?.armor?.canFortify&&<form onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget);controller.current?.armorFortify(Number(d.get("x")),Number(d.get("y")));}}><label>装甲坐标 X<input name="x" type="number" step="any" required/></label><label>Y<input name="y" type="number" step="any" required/></label><button>设置强化区域</button></form>}
          {configFields}
          {experimentRunning?<><progress max={status.experiment!.total*420} value={Math.min(status.experiment!.total*420,status.experiment!.completed*420+status.experiment!.elapsed)}/><button onClick={()=>controller.current?.cancelExperiment()}>停止实验</button></>:<div className="rmul3d-presets"><button disabled={!validConfig||status.match?.phase==="running"} onClick={()=>{if(controller.current?.configureSeed(Number(seed))&&controller.current.configureStrategies(strategies)){setExperimentOpen(false);controller.current.start();}}}>开始单局训练</button><button disabled={!validConfig||status.match?.phase==="running"} onClick={()=>{if((status.experiment?.results.length??0)>exportedCount&&!window.confirm("开始新实验将覆盖未导出的结果，确定继续？"))return;if(controller.current?.startExperiment({seed:Number(seed),pairs:Number(pairs),strategies})){setExportedCount(0);}}}>运行配对实验</button></div>}
          {status.experiment&&<ExperimentResults progress={status.experiment} onExport={()=>setExportedCount(status.experiment!.results.length)}/>}
        </aside>}
        {analysis&&!experimentOpen&&!experimentRunning&&<button className="rmul3d-analysis-open" onClick={()=>setExperimentOpen(true)}>策略实验</button>}
        {analysis&&<button className="rmul3d-analysis-exit" onClick={exitToMenu}>退出</button>}
        </>}
      </section>
    </main>
  );
}
