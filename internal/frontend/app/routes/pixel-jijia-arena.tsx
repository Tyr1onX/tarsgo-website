import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject, type CSSProperties } from "react";
import {ARENA_VISUAL} from "~/lib/rmuc-3d-visual";
import {GROUND_NAMES,groundLabel,systemLabel} from "~/lib/rmuc-3d-identity";
import {ARENA_ZONES} from "~/lib/rmuc-3d-zones";
import {getOptionalCurrentUser,subscribeAuthStateChange} from "~/lib/auth-client";
import {apiRequest} from "~/lib/api-client";
import {joystickVector} from "~/lib/rmuc-3d-input";
import { Link, useLocation, useNavigate } from "react-router";
import { getExperienceReturnTo, getPixelReturn } from "~/lib/experience-navigation";
import type { Route } from "./+types/pixel-jijia-arena";
import { buildPublicMeta } from "~/lib/social-meta";
import type { ArenaController, ArenaLoadProgress, ArenaStatus, ArenaView } from "~/lib/rmul-3d-scene";
import {DEFAULT_ARENA_SETTINGS,loadArenaSettings,saveArenaSettings,type ArenaSettings} from "~/lib/rmuc-3d-settings";
import {defaultStrategy,STRATEGY_PRESETS,WEIGHT_KEYS,type Strategy} from "~/lib/rmuc-3d-strategy";
import {pairedSummary,type ExperimentProgress} from "~/lib/rmuc-3d-experiment";
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
const visualStyle={"--arena-red":ARENA_VISUAL.red,"--arena-blue":ARENA_VISUAL.blue,"--arena-damage":ARENA_VISUAL.damage,"--arena-recovery":ARENA_VISUAL.recovery,"--arena-track":ARENA_VISUAL.track} as CSSProperties;
const areaText=(area:AreaStatus)=>!area.enabled?"失效":teamName(area.controller)+(area.full?"完全":"临时")+(area.contested?"·争":area.progressing?"·夺":area.progress>0?"·退":"")+(area.progress>0?Math.floor(area.progress*2)+"%":"");
function DamageValue({value=0}:{value?:number}){return <span className="rmul3d-damage" aria-hidden="true">{value>0?"−"+value:""}</span>;}
function HealthBar({value,max,label}:{value:number;max:number;label:string}){
  return <div className="rmul3d-health" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
    <i style={{transform:`scaleX(${Math.max(0,Math.min(1,value/max))})`}}/>
  </div>;
}
function RobotIcon({kind}:{kind:"heavy"|"infantry"|"sentry"}){
  return <svg viewBox="0 0 24 16" width="24" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M3 12V7h18v5M2 12h20M5 12v2m14-2v2"/>
    {kind==="heavy"?<path d="M8 7V3h7v4M15 4h8v2h-8"/>:kind==="sentry"?<path d="M10 7V2h4v5M7 2h10"/>:<path d="M9 7V4h6v3m0-2h7"/>}
  </svg>;
}
function ControlIcon({kind}:{kind:"up"|"down"|"boost"|"fire"|"interact"}){
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind==="fire"?<><circle cx="16" cy="16" r="9"/><path d="M16 3v7m0 12v7M3 16h7m12 0h7"/><circle cx="16" cy="16" r="1.5" fill="currentColor"/></>:kind==="interact"?<><path d="M15 5H6v22h9M17 9l7 7-7 7M10 16h14"/></>:kind==="boost"?<><path d="m8 17 8-8 8 8M8 24l8-8 8 8"/><path d="M16 4v2"/></>:<path d={kind==="up"?"m7 17 9-9 9 9M16 8v16":"m7 15 9 9 9-9M16 8v16"}/>}
  </svg>;
}
function ArtIcon({kind}:{kind:string}){
  const path=kind==="start"?"M7 4l14 8-14 8z":kind==="explore"?"M12 3l9 9-9 9-9-9zM12 3v18M3 12h18":kind==="experiment"?"M8 3h8M10 3v7L4 20h16l-6-10V3M7 16h10":kind==="settings"?"M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-8 0v6":kind.includes("dead")||kind.includes("destroyed")?"M5 5l14 14M19 5L5 19":kind.includes("revived")||kind.includes("rebuilt")||kind==="heal"?"M12 3v18M3 12h18":kind.startsWith("assembly")?"M12 3l8 5v8l-8 5-8-5V8zM4 8l8 5 8-5m-8 5v8":kind.startsWith("rune")||kind.startsWith("energy")?"M13 2L4 14h7l-1 8 10-12h-8z":kind.startsWith("dart")?"M3 21L20 4M12 4h8v8M4 12l8 8":kind.startsWith("cover")||kind==="territory"?"M12 3l8 4v7c0 3-4 6-8 8-4-2-8-5-8-8V7z":kind==="ammo"||kind.startsWith("launcher")?"M6 20V9l6-6 6 6v11zM6 15h12":"M4 20V4h16l-4 5 4 5H4";
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path}/></svg>;
}
function TeamScore({team,side,select,selected}:{team:"red"|"blue";side:NonNullable<ArenaStatus["match"]>["sides"]["red"];select?:(id:string)=>void;selected?:string|null}){
  return <section className={"rmul3d-team "+team} aria-label={teamName(team)+"方"}>
    <div className="rmul3d-base-line"><span className="rmul3d-team-identity"><i aria-hidden="true"/>{teamName(team)}方<span className="rmul3d-base-caption"> · 基地</span></span><DamageValue value={side.baseDamage}/><strong>{side.base}</strong></div>
    <HealthBar value={side.base} max={10000} label={teamName(team)+"方基地血量"}/>
    <div className="rmul3d-team-metrics">
      <div className="rmul3d-outpost" title={"建筑归属："+teamName(side.outpostOwner)+"方 · 阵地："+areaText(side.outpostArea)}>
        <span>前哨 <b>{side.outpost}</b><DamageValue value={side.outpostDamage}/></span>
        <HealthBar value={side.outpost} max={1000} label={teamName(team)+"方前哨血量"}/>
      </div>
      <span className="rmul3d-area" title="前哨阵地控制权">{areaText(side.outpostArea)}</span>
      <span className="rmul3d-economy">币 <b>{side.coins??"—"}</b></span><span className="rmul3d-economy">科 <b>{side.technology??"—"}</b></span><span className="rmul3d-economy">控 <b>{side.control}</b></span>
    </div>
    <div className="rmul3d-roster">{side.robots.map(r=>{
      const d=r.detail,labels=d?(r.hp===0?[d.powerOff?"战亡":"撤离"]:[d.powerOff?"断电":"",d.launcherLocked?"枪锁":"",d.weak?"虚弱":"",d.immune?"无敌":""].filter(Boolean)):[],label=labels.join(" ");
      return <div className={"rmul3d-robot-status"+(r.hp===0?" dead":"")+(selected===r.id?" selected":"")} key={r.id} role={select?"button":undefined} tabIndex={select?0:undefined} aria-pressed={select?selected===r.id:undefined} onClick={select?()=>select(r.id):undefined} onKeyDown={select?e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();select(r.id);}}:undefined} aria-label={teamName(team)+r.number+"号 "+GROUND_NAMES[r.kind]+" "+r.hp+"/"+r.maxHp+(d?" 级别"+d.level+" "+label:"")}>
        <div className="rmul3d-robot-id"><RobotIcon kind={r.kind}/><b>{r.number}</b>{d&&<span className="rmul3d-level">L{d.level}</span>}</div><div className="rmul3d-robot-name">{GROUND_NAMES[r.kind]}</div>
        <div className="rmul3d-robot-hp"><b>{r.hp}</b><DamageValue value={d?.damage}/>{d&&(label||d.revival!==null)&&<span className="rmul3d-robot-state" title={label}>{d.revival!==null?`${d.powerOff?"复活":"撤离"}${d.revival}%`:labels[0]}</span>}</div>
        <HealthBar value={r.hp} max={r.maxHp} label={teamName(team)+r.number+"号血量"}/>
      </div>;
    })}</div>
  </section>;
}
const CAMERA_VIEWS = [
  { id: "first", label: "第一人称" },
  { id: "third", label: "自由飞行" },
  { id: "all", label: "全场" },
  { id: "red", label: "红方" },
  { id: "blue", label: "蓝方" },
  { id: "top", label: "俯视" },
] as const satisfies readonly { id: ArenaView; label: string }[];

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

const INITIAL_STATUS:ArenaStatus={view:"first",robot:null,nearby:null};
const PHASE_LABELS:Record<ArenaLoadProgress["phase"],string>={program:"初始化三维程序",download:"下载战场资源",verify:"解压与完整性校验",parse:"解析模型",terrain:"生成地形与地图",initialize:"初始化机器人与机关",firstFrame:"准备首个画面"};
function SettingsPanel({value,onChange}:{value:ArenaSettings;onChange:(value:ArenaSettings)=>void}){
  return <div className="rmul3d-options">
    <fieldset><legend>画面</legend><label>画质<select value={value.quality} onChange={e=>onChange({...value,quality:e.target.value as ArenaSettings["quality"]})}><option value="auto">自动推荐</option><option value="low">流畅</option><option value="medium">均衡</option><option value="high">精细</option></select></label>
    </fieldset><fieldset><legend>声音</legend><label>静音<input type="checkbox" checked={value.muted} onChange={e=>onChange({...value,muted:e.target.checked})}/></label>
    <label>总音量<input type="range" min="0" max="1" step=".05" value={value.volume} onChange={e=>onChange({...value,volume:Number(e.target.value)})}/><output>{Math.round(value.volume*100)}%</output></label>
    </fieldset><fieldset><legend>操作</legend><label>视角灵敏度<input type="range" min=".25" max="2" step=".05" value={value.sensitivity} onChange={e=>onChange({...value,sensitivity:Number(e.target.value)})}/><output>{Math.round(value.sensitivity*100)}%</output></label>
    <label>纵向反转<input type="checkbox" checked={value.invertY} onChange={e=>onChange({...value,invertY:e.target.checked})}/></label>
    </fieldset><button onClick={()=>onChange({...DEFAULT_ARENA_SETTINGS})}>恢复默认</button>
  </div>;
}
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
    if(!controller.current?.move(event.pointerId,vector,begin))return false;
    if(thumb.current)thumb.current.style.transform=`translate(${vector.r*radius}px,${-vector.f*radius}px)`;
    return true;
  }
  function end(event:ReactPointerEvent<HTMLDivElement>){if(owner.current!==event.pointerId)return;controller.current?.move(event.pointerId,null);reset();}
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
    if(next&&(!old||next.step===0&&old.step!==0))lessonOwner.current=identity.current;
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
  const [settings,setSettings]=useState<ArenaSettings>(DEFAULT_ARENA_SETTINGS);
  const settingsRef=useRef(settings);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [exportedCount,setExportedCount]=useState(0);
  useEffect(()=>{const value=loadArenaSettings();settingsRef.current=value;setSettings(value);},[]);
  function updateSettings(value:ArenaSettings){settingsRef.current=value;setSettings(value);saveArenaSettings(value);controller.current?.settings(value);}
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  const [tacticsOpen,setTacticsOpen]=useState(false);
  useEffect(()=>setTacticsOpen(false),[status.robot,status.match?.phase]);
  const [experimentOpen,setExperimentOpen]=useState(false);
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
    void import("~/lib/rmul-3d-scene").then(({ mountArena }) => {
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
  const focus=status.focus,focused=!!focus&&!!status.match;
  const observed=focused&&!status.robot;
  const select=(id:string)=>controller.current?.observe(id);
  const legalTeam=(team:"red"|"blue")=>!status.robot&&(status.radarMap?.perspective==="all"||status.radarMap?.perspective===team);
  const toggleMenu = (open: boolean) => {
    controller.current?.pause(open);
    setMenu(open);
    if(!open)setSettingsOpen(false);
  };
  function restart(){
    if(experimentRunning||!controller.current)return;
    if(guided)return;
    if(status.match?.phase==="running"&&!window.confirm("重新开始将结束当前比赛，确定继续？"))return;
    const startMatch=status.match?.phase==="running"||status.match?.phase==="finished";
    controller.current.reset();toggleMenu(false);
    if(startMatch)controller.current.start();
    else controller.current.explore();
  }
  const disabled = loading || !!error;
  const showTouch=!(guided&&status.teaching?.paused)&&!disabled&&!menu&&!status.countdown&&!experimentRunning&&!experimentOpen&&(flying||playing&&status.match?.stance?.control!=="auto"&&!status.match?.revival?.dead&&status.match?.phase!=="finished");

  const configFields=<>
    <StrategyEditor label="红方 A" value={strategies.red} onChange={red=>setStrategies(s=>({...s,red}))} disabled={experimentRunning||status.match?.phase==="running"}/>
    <StrategyEditor label="蓝方 B" value={strategies.blue} onChange={blue=>setStrategies(s=>({...s,blue}))} disabled={experimentRunning||status.match?.phase==="running"}/>
    <div className="rmul3d-experiment-config"><label>起始种子<input aria-label="起始种子" type="number" min="0" max="4294967295" step="1" value={seed} disabled={experimentRunning} onChange={e=>setSeed(e.target.value)}/></label><label>配对数<input aria-label="配对数" type="number" min="1" max="20" step="1" value={pairs} disabled={experimentRunning} onChange={e=>setPairs(e.target.value)}/></label><span>{Number(pairs)*2} 场 · 每对交换红蓝</span></div>
  </>;
  return (
    <main data-territory-completed={territoryCompleted} data-world-view={status.view} data-world-mode={guided?"teaching":exploring?"explore":"match"} data-teaching-step={teaching?.step} data-teaching-done={teaching?.done} data-teaching-captured={teaching?.captured} data-teaching-paused={teaching?.paused} data-world-driving={!!status.robot} data-world-progress={status.match?.sides.blue.outpostArea.progress} data-world-contested={status.match?.sides.blue.outpostArea.contested} data-world-controller={status.match?.sides.blue.outpostArea.controller} data-world-full={status.match?.sides.blue.outpostArea.full} data-world-seconds={status.match?.seconds} data-world-outpost={status.match?.sides.blue.outpost} className={"rmul3d"+(guided?" rmul3d-world-teaching":"")} style={visualStyle}>
      <section className="rmul3d-stage" aria-label="RMUC 2027 三维训练战场">
        <div ref={mountRef} className="rmul3d-canvas" data-ready={!disabled} />

        {loading && !error && <div className="rmul3d-loading"><div className="rmul3d-load-content"><div className="rmul3d-load-brand"><span>TARS-GO</span><b>RMUC 2027</b></div><strong key={progress.phase} role="status">{PHASE_LABELS[progress.phase]}</strong>{progress.phase==="download"&&<><progress aria-label="资源下载进度" max={progress.total} value={progress.total===undefined?undefined:progress.received}/><span>{((progress.received??0)/1000000).toFixed(1)} MB{progress.total!==undefined?` / ${(progress.total/1000000).toFixed(1)} MB · ${Math.min(100,Math.floor((progress.received??0)/Math.max(1,progress.total)*100))}%`:""}</span></>}<button onClick={exitToMenu}>取消</button></div></div>}
        {error && <div className="rmul3d-error"><span role="alert">{error}</span><button onClick={retry}>重试</button><button onClick={()=>controller.current?.explore()}>返回探索</button></div>}
        {saveError&&<div className="rmul3d-save-error" role="alert">进度未保存 <button onClick={()=>void saveTerritory()}>重试</button></div>}
        {!disabled&&<><div className={"rmul3d-hud"+(focused?" is-focused":"")+(status.robot?" is-manual":"")+(flying?" is-flight":"")+(tacticsOpen||status.match?.revival?.dead?" is-tactics-open":"")}>
        {!guided&&<header className="rmul3d-header">
          {!exploring&&!menu&&!status.robot&&<div className="rmul3d-view-dock"><select aria-label="观战视角" value={status.view} disabled={experimentRunning} onChange={e=>controller.current?.view(e.target.value as ArenaView)}>
            {!CAMERA_VIEWS.some(v=>v.id===status.view)&&<option value={status.view} disabled>{status.view==="detail"?"赛事特写":status.view==="ai-first"?"AI第一人称":"跟随观战"}</option>}
            {CAMERA_VIEWS.filter(({id})=>(!experimentRunning||id==="all")&&(id!=="third"||status.radarMap?.perspective==="all")).map(({id,label})=><option key={id} value={id}>{label}</option>)}
          </select>{!!status.experiment&&!experimentOpen&&<button onClick={()=>setExperimentOpen(true)}>实验结果</button>}</div>}
          <div className="rmul3d-header-actions">
            <button className="rmul3d-settings" type="button" onClick={() => toggleMenu(!menu)} aria-label="战场菜单" aria-expanded={menu}>☰</button>
            {!exploring&&!disabled&&!menu&&<button className="rmul3d-sound" aria-label={status.sound?"静音":"开启声音"} aria-pressed={!!status.sound} onClick={()=>updateSettings({...settings,muted:!settings.muted})}>{status.sound?"声音开":"声音关"}</button>}
            {!disabled&&!menu&&(status.canDirect||status.director)&&<button className="rmul3d-director" aria-pressed={!!status.director} onClick={()=>controller.current?.director(!status.director)}>导播{status.director?"开":"关"}</button>}
          </div>
        </header>}
        {!guided&&!exploring&&!disabled && !menu && status.match && <div className="rmul3d-match">
          {status.match.phase === "ready" ? status.countdown?<div className="rmul3d-countdown" role="status"><div><b>红方</b><span>VS</span><b>蓝方</b></div><small>比赛即将开始</small><strong key={status.countdown}>{status.countdown}</strong><button onClick={()=>controller.current?.cancelStart()}>取消</button></div>:<><button onClick={() => controller.current?.start()}>开始模拟</button></> : <>
            <div className="rmul3d-score"><TeamScore team="red" side={status.match.sides.red} select={legalTeam("red")?select:undefined} selected={focus?.id??status.selected}/><div className="rmul3d-clock" data-final={status.match.seconds<=60}><small>RMUC 2027</small><strong>{String(Math.floor(status.match.seconds/60)).padStart(2,"0")}:{String(status.match.seconds%60).padStart(2,"0")}</strong><small>{status.match.phase==="finished"?"比赛结束":"剩余时间"}</small></div><TeamScore team="blue" side={status.match.sides.blue} select={legalTeam("blue")?select:undefined} selected={focus?.id??status.selected}/></div>
            {!teaching&&status.match.phase === "finished" && <section className={"rmul3d-result "+status.match.winner} aria-label="比赛结算">
              <small>RMUC 2027 · 比赛结束</small><h2>{status.match.winner==="draw"?"平局":status.match.winner==="red"?"红方胜利":"蓝方胜利"}</h2>
              <div className="rmul3d-result-stats"><b>红方</b><span>比赛统计</span><b>蓝方</b>
              {(["base","outpost","control"] as const).map(key=><div className="rmul3d-result-row" key={key}><strong>{status.match!.sides.red[key]}</strong><span>{{base:"基地血量",outpost:"前哨血量",control:"控制度"}[key]}</span><strong>{status.match!.sides.blue[key]}</strong></div>)}</div>
              <div className="rmul3d-result-actions"><button className="rmul3d-primary" onClick={() => {controller.current?.reset();controller.current?.start();}}>再来一局</button><button onClick={()=>controller.current?.explore()}>返回探索</button></div>
            </section>}
          </>}
        </div>}
        {!guided&&!disabled&&!menu&&!experimentRunning&&!!status.events?.items.length&&<aside className="rmul3d-event-feed" aria-label="赛事播报">{status.events.items.map(item=><div key={item.id} className={"team" in item.event?item.event.team:""} data-major={item.major} data-recovery={item.event.type==="outpost-rebuilt"}><ArtIcon kind={item.event.type}/><time>{Math.floor(Math.ceil(420-item.event.at)/60)}:{String(Math.ceil(420-item.event.at)%60).padStart(2,"0")}</time><span>{item.text}</span></div>)}</aside>}
        {!disabled&&!menu&&flying&&<span className="rmul3d-flight-speed">{status.flightSpeed?.toFixed(1)} m/s</span>}
        {!guided&&!disabled&&!menu&&status.radarMap&&(teaching||status.match?.phase==="running")&&<aside className="rmul3d-minimap">
          <div className="rmul3d-map-head">{status.robot?<span>{status.radarMap.perspective==="red"?"红方情报":"蓝方情报"}</span>:<select aria-label="地图情报视角" value={status.radarMap.perspective} disabled={status.view==="ai-first"} onChange={e=>controller.current?.radarView(e.target.value as "all"|"red"|"blue")}><option value="all">全局观战</option><option value="red">红方情报</option><option value="blue">蓝方情报</option></select>}
          {!flying&&Object.entries(status.radarMap.summary).map(([team,r])=><span key={team} title={systemLabel("radar")+" · 干扰难度 "+r.encryptionLevel}>{team==="red"?"红":"蓝"}09 雷达 {r.doubleUntil>0?"×2 "+r.doubleUntil+"s":r.opportunities+"次"}</span>)}</div>
          <svg viewBox="0 0 280 150" role="group" aria-label="CAD战场地图，红方在左，蓝方在右"><image href={status.radarMap.image} width="280" height="150"/><rect x=".5" y=".5" width="279" height="149" fill="none" stroke="#a8b7c5" strokeOpacity=".65"/>
            {ARENA_ZONES.filter(z=>z.kind==="supply"||z.kind==="assembly"||z.kind==="highpoint").map(z=><g key={z.id} fill={ARENA_VISUAL[z.team]}><polygon points={z.polygon.map(([x,y])=>((14-x)*10)+","+((7.5-y)*10)).join(" ")} fillOpacity=".13" stroke={ARENA_VISUAL[z.team]} strokeOpacity=".7" strokeWidth=".7" strokeDasharray="2 1"/><text x={(14-z.goal[0])*10} y={(7.5-z.goal[1])*10} className="rmul3d-zone-label" textAnchor="middle" fill="#e6edf3" stroke="#101820" strokeWidth="2" paintOrder="stroke">{({supply:"补给",assembly:"装配",highpoint:"高地",base:"基地",fortress:"堡垒",central:"中央",outpost:"前哨"})[z.kind]}</text></g>)}
            {(["red","blue"] as const).map(team=>{const sign=team==="red"?1:-1,s=status.match!.sides[team];return <g key={team} stroke={team==="red"?"#fb7777":"#7bbdff"} fill="none"><rect x={(14-11.68*sign)*10-5} y="70" width="10" height="10" opacity={s.base?1:.25}><title>{teamName(team)}方基地</title></rect><circle cx={(14-3.126*sign)*10} cy={(7.5+3.892*sign)*10} r="5" stroke={!s.outpostArea.enabled?"#64748b":s.outpostArea.controller==="red"?"#fb7777":"#7bbdff"} strokeDasharray={!s.outpostArea.full?"3 2":undefined} opacity={s.outpostArea.enabled?1:.35} aria-label={teamName(team)+"方前哨阵地 "+areaText(s.outpostArea)}><title>{teamName(team)}方前哨站</title></circle><path d={sign===1?"M2 70v10h7":"M278 70v10h-7"}/></g>})}
            {status.air?.map(a=><g key={a.team+"-air"} fill={a.team==="red"?"#fb7777":"#7bbdff"}><title>{teamName(a.team)}方 {systemLabel("air")}</title><rect x={(14-a.x)*10-3} y={(7.5-a.z)*10-3} width="6" height="6" stroke="white"/>{a.airborne.map(v=><circle key={v.id} cx={(14-v.x)*10} cy={(7.5-v.z)*10} r="2.5" stroke="white"/>)}</g>)}
            {status.radarMap.tracks.map(r=><g key={r.id} transform={`translate(${(14-r.x)*10} ${(7.5-r.z)*10})`} opacity={r.stale?.65:1} aria-label={teamName(r.team)+"方 "+groundLabel(r.id)+" · 标记 "+r.progress+(r.stale?" · 过期情报":"")} role={legalTeam(r.team)?"button":undefined} tabIndex={legalTeam(r.team)?0:undefined} aria-pressed={legalTeam(r.team)?focus?.id===r.id:undefined} onClick={legalTeam(r.team)?()=>select(r.id):undefined} onKeyDown={legalTeam(r.team)?e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();select(r.id);}}:undefined}><circle className="rmul3d-map-marker" r="7.5" fill={ARENA_VISUAL[r.team]} stroke={focus?.id===r.id?"#F1D794":r.localized?"white":"#222"} strokeWidth={focus?.id===r.id?2:1} strokeDasharray={r.stale?"2 2":undefined}/><text textAnchor="middle" dominantBaseline="central" className="rmul3d-map-number" fontWeight="700" fill="white">{r.number}</text></g>)}
          </svg>
        </aside>}
        <div className="rmul3d-side-status">
        {!guided&&!disabled&&!menu&&focus&&status.match&&<section className={"rmul3d-focus-panel "+focus.team} aria-label="单机器人状态">
          <div className="rmul3d-focus-title"><RobotIcon kind={focus.kind}/><strong>{focus.number}</strong><span>{GROUND_NAMES[focus.kind]}</span><small>{focus.manual?"人工":status.robot?"AI · 指挥":"AI"}</small></div>
          <div className="rmul3d-focus-hp"><b>{status.match.hp}<small> / {status.match.maxHp}</small></b><span>Lv.{status.match.level}{status.match.xp!==null&&" · "+Math.floor(status.match.xp)+" XP"}</span></div>
          <HealthBar value={status.match.hp} max={status.match.maxHp} label="当前机器人血量"/>
          <div className="rmul3d-focus-metrics">
            <span>弹药 <b>{status.match.ammo}{status.match.reserve>0?" + "+status.match.reserve:""}</b></span>
            {status.match.heatLimit>0&&<span>热量 <b>{status.match.heat}/{status.match.heatLimit}</b></span>}
            {status.match.power&&<><span>能量 <b>{Math.round(status.match.power.buffer)}/60J</b></span><span>功率 <b>{Math.round(focus.demand)}/{status.match.power.limit}W</b></span></>}
          </div>
          <div className="rmul3d-focus-states" data-dead={!!status.match.revival?.dead}>{focus.spin&&<span>小陀螺</span>}{status.match.revival?.dead?<span className="rmul3d-revival-state">战亡 · 复活 {Math.floor(status.match.revival.progress*100)}%<progress aria-label="复活进度" value={status.match.revival.progress} max={1}/></span>:<>{!!status.match.power?.locked&&<span>断电 {status.match.power.locked}s</span>}{status.match.revival?.weak&&<span>虚弱</span>}{status.match.revival?.immune&&<span>无敌</span>}{status.match.buff>0&&<span>能量增益 {status.match.buff}s</span>}{status.match.thermalLock&&<span>发射锁定</span>}</>}
          {status.match.launcher&&<span>42mm {{locked:"锁定",unlocked:"未装配",test:"测试",ready:"就绪"}[status.match.launcher.state]}</span>}
          {status.match.stance&&<span>{status.match.stance.control==="auto"?"全自动":"半自动"} · {{attack:"进攻",defense:"防御",move:"移动"}[status.match.stance.mode]}{status.match.stance.enhanced?"强化":""}</span>}
          {focus.kind==="heavy"&&status.match.technology&&status.match.technology.highest>0&&<span>科技 {status.match.technology.highest}级</span>}</div>
          {observed&&status.match.technology?.level&&focus.kind==="heavy"&&<div className="rmul3d-assembly-progress">{status.match.technology.level}级装配 · {status.match.technology.completed}/{status.match.technology.total}{status.match.technology.pending?" · 动作中":""}<progress aria-label="装配进度" value={status.match.technology.completed} max={status.match.technology.total}/></div>}
          {observed&&<nav className="rmul3d-observer-controls" aria-label="观战相机"><button onClick={()=>controller.current?.view("all")}>全场</button><button onClick={()=>controller.current?.view(status.view==="follow"?"ai-first":"follow")}>{status.view==="follow"?"AI第一人称":"第三人称"}</button>{!guided&&<button disabled={!focus.canTakeControl} onClick={()=>controller.current?.takeControl()}>人工接管</button>}</nav>}
          {!teaching&&status.robot&&status.match.phase==="running"&&!status.match.revival?.dead&&<button className="rmul3d-tactics-toggle" type="button" aria-expanded={tacticsOpen} aria-controls="rmul3d-live-tactics" onClick={()=>setTacticsOpen(open=>!open)}>{tacticsOpen?"关闭战术":"战术操作"}</button>}
        </section>}
        {!disabled && !menu && !status.countdown && playing && status.robot && status.match?.phase==="ready" && status.match.performance && <div className="rmul3d-combat">
          <label>底盘 <select value={status.match.performance.chassis} onChange={e=>controller.current?.performance({...status.match!.performance!,chassis:e.target.value as "hp"|"power"})}><option value="hp">血量优先</option><option value="power">功率优先</option></select></label>
          <label>发射机构 <select value={status.match.performance.launcher} onChange={e=>controller.current?.performance({...status.match!.performance!,launcher:e.target.value as "cooling"|"burst"})}><option value="cooling">冷却优先</option><option value="burst">爆发优先</option></select></label>
        </div>}
        {!disabled && !menu && !status.countdown && playing && status.robot && status.match?.phase==="ready" && status.match.stance && <div className="rmul3d-combat">
          <label>哨兵控制 <select value={status.match.stance.control} onChange={e=>controller.current?.sentryControl(e.target.value as "auto"|"semi")}><option value="auto">全自动</option><option value="semi">半自动</option></select></label>
        </div>}
        {!teaching&&!disabled && !menu && playing && status.robot && status.match?.phase==="running" && <div id="rmul3d-live-tactics" className="rmul3d-combat rmul3d-combat-live">
          <span>{status.match.coins} 金币</span>
          {status.robot&&status.radarMap&&status.radarMap.perspective!=="all"&&!status.match.dart?.blind&&status.radarMap.summary[status.radarMap.perspective]!.opportunities>0&&<button disabled={status.radarMap.summary[status.radarMap.perspective]!.doubleUntil>0} onClick={()=>controller.current?.radarDouble()}>双倍易伤</button>}
          {focus?.kind==="infantry"&&focus.manual&&<button disabled={!focus.canSpin} aria-pressed={focus.spin} onClick={()=>controller.current?.toggleSpin()}>{focus.spin?"关闭小陀螺":"小陀螺"}</button>}
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
          {status.match.dart&&<><span>{systemLabel("dart")} {status.match.dart.remaining}/4 · {({opening:"开闸中",open:"已开启",closing:"关闸中",cooldown:"冷却",closed:"已关闭"})[status.match.dart.phase as "opening"|"open"|"closing"|"cooldown"|"closed"]}{status.match.dart.inFlight?" · 飞行中":""}</span>{status.match.dart.canSelect&&<select aria-label="飞镖目标" value={status.match.dart.mode} onChange={e=>controller.current?.dartSelect(e.target.value as NonNullable<NonNullable<ArenaStatus["match"]>["dart"]>["mode"])}>{Object.entries({outpost:"前哨站",fixed:"固定基地",randomFixed:"随机固定",randomMoving:"随机移动",terminalMoving:"末端移动"}).map(([id,label])=><option key={id} value={id} disabled={id==="outpost"&&status.match!.dart!.phase==="open"}>{label}</option>)}</select>}{status.match.dart.canOpen&&<button onClick={()=>controller.current?.dartOpen()}>开启闸门</button>}{status.match.dart.canFire&&<button onClick={()=>controller.current?.dartFire()}>虚拟发射</button>}</>}
          {status.match.technology&&status.match.technology.highest>0&&<span>科技 {status.match.technology.highest}级 · +{status.match.technology.income}币/10s{status.match.technology.defense>0&&` · 防御 ${status.match.technology.defense}%`}</span>}
          {status.match.energy&&status.match.energy.carrying>0&&<span>能量单元 {status.match.energy.carrying}/2</span>}
          {status.match.technology?.available.map(level=><button key={level} onClick={()=>controller.current?.assembly(level)}>装配 {level}级</button>)}
          {status.match.technology?.level&&status.match.energy&&<>
            <span>{status.match.technology.level}级装配 · {status.match.technology.completed}/{status.match.technology.total}{status.match.technology.remaining!==null&&` · ${status.match.technology.remaining}s`}{status.match.technology.pending&&" · 动作中"}</span>
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
        {!guided&&!disabled&&!menu&&!flying&&!focused&&status.match?.phase==="running"&&!!status.air?.length&&<div className="rmul3d-combat">
          {!flying&&status.air?.map(a=><span key={a.team}>{teamName(a.team)}方 {systemLabel("air")} · {a.powered?a.docked+"/"+a.total:"已停桨"}</span>)}
          {!flying&&!experimentRunning&&!focused&&!status.robot&&status.radarMap?.perspective==="all"&&status.air?.some(a=>a.powered)&&<details className="rmul3d-air-safety"><summary>安全员操作</summary>{status.air.filter(a=>a.powered).map(a=><button key={a.team} onClick={()=>controller.current?.airStop(a.team)}>{teamName(a.team)}方停桨</button>)}</details>}
        </div>}
        </div>
        <div className="rmul3d-actions">
        {showTouch&&!flying&&<button className="rmul3d-ground-boost" type="button" aria-label="加速" title="加速"
          onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);controller.current?.touchAction(event.pointerId,"ShiftLeft",true);}}
          onPointerUp={event=>controller.current?.touchAction(event.pointerId,"ShiftLeft",false)}
          onPointerCancel={event=>controller.current?.touchAction(event.pointerId,"ShiftLeft",false)}
          onLostPointerCapture={event=>controller.current?.touchAction(event.pointerId,"ShiftLeft",false)}><ControlIcon kind="boost"/></button>}
        {showTouch&&flying&&<div className="rmul3d-flight-actions">{([["Space","上升"],["ShiftLeft","下降"],["ControlLeft","加速"]] as const).map(([key,label])=><button key={key} type="button" aria-label={label} title={label}
          onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);controller.current?.touchAction(event.pointerId,key,true);}}
          onPointerUp={event=>controller.current?.touchAction(event.pointerId,key,false)}
          onPointerCancel={event=>controller.current?.touchAction(event.pointerId,key,false)}
          onLostPointerCapture={event=>controller.current?.touchAction(event.pointerId,key,false)}><ControlIcon kind={key==="Space"?"up":key==="ShiftLeft"?"down":"boost"}/></button>)}</div>}
        {!guided&&!disabled && !menu && playing && (status.robot || status.nearby) && (
          <button className="rmul3d-interact" aria-label={status.robot?"退出机器人":"接管机器人"} title={status.robot?"退出机器人":"接管机器人"} onClick={() => controller.current?.interact()}>
            <kbd>E</kbd><ControlIcon kind="interact"/><span className="rmul3d-interact-long">{status.robot?"退出机器人":"接管机器人"}</span><span className="rmul3d-interact-short">{status.robot?"退出":"接管"}</span>
          </button>
        )}
        {!teaching&&!disabled && !menu && playing && status.robot && status.match?.phase==="running" && !status.match.revival?.dead && status.match.stance?.control!=="auto" && <button type="button" className="rmul3d-fire" aria-label="开火" aria-disabled={!status.match.canFire}
          onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);controller.current?.fire("button:"+event.pointerId,true);}}
          onPointerUp={event=>controller.current?.fire("button:"+event.pointerId,false)}
          onPointerCancel={event=>controller.current?.fire("button:"+event.pointerId,false)}
          onLostPointerCapture={event=>controller.current?.fire("button:"+event.pointerId,false)}><ControlIcon kind="fire"/><span>{status.match.thermalLock==="permanent"?"发射机构已锁定":status.match.thermalLock?"冷却中":status.match.launcher?.state==="test"?"测试射击":"开火"}</span></button>}
        </div>
        {showTouch&&<div className="rmul3d-touch"><TouchJoystick controller={controller} resetRef={resetTouch}/></div>}
        </div>
        {!disabled && firstPerson && status.match?.phase==="running" && (status.match.thermalLock==="cooling"||!!status.match.dart?.blind) && <div className="rmul3d-thermal-lock" role="status"><strong>图传中断</strong><span>{status.match.dart?.blind?"飞镖命中 · 图传遮挡":"热量超限 · 冷却中"}</span></div>}
        {!disabled && !menu && firstPerson && (!focus||focus.sight&&status.match!.hp>0) && status.match?.thermalLock!=="cooling"&&!status.match?.dart?.blind && <svg className="rmul3d-crosshair" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3v10m0 14v10M3 20h10m14 0h10" stroke="currentColor" strokeWidth="1.6" fill="none"/><circle cx="20" cy="20" r="1.5" fill="currentColor"/>{status.impact&&<path key={status.impact.serial} className={"rmul3d-impact "+status.impact.kind} d="m8 8 6 6m12 12 6 6M32 8l-6 6M14 26l-6 6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" fill="none"/>}</svg>}
        {experimentRunning&&!experimentOpen&&!menu&&<div className="rmul3d-experiment-progress"><span>实验 {status.experiment!.completed+1}/{status.experiment!.total} · {Math.floor(status.experiment!.elapsed)}s</span><button onClick={()=>setExperimentOpen(true)}>进度</button><button onClick={()=>controller.current?.cancelExperiment()}>停止</button></div>}
        {experimentOpen&&!menu&&<aside className="rmul3d-help rmul3d-experiment" aria-label="策略与实验">
          <button className="rmul3d-close" onClick={()=>setExperimentOpen(false)} aria-label="关闭实验">×</button>
          <h2>策略与实验</h2>
          {configFields}
          {experimentRunning?<><progress max={status.experiment!.total*420} value={Math.min(status.experiment!.total*420,status.experiment!.completed*420+status.experiment!.elapsed)}/><button onClick={()=>controller.current?.cancelExperiment()}>停止实验</button></>:<div className="rmul3d-presets"><button disabled={!validConfig||status.match?.phase==="running"} onClick={()=>{if(controller.current?.configureSeed(Number(seed))&&controller.current.configureStrategies(strategies)){setExperimentOpen(false);controller.current.start();}}}>开始单局训练</button><button disabled={!validConfig||status.match?.phase==="running"} onClick={()=>{if((status.experiment?.results.length??0)>exportedCount&&!window.confirm("开始新实验将覆盖未导出的结果，确定继续？"))return;if(controller.current?.startExperiment({seed:Number(seed),pairs:Number(pairs),strategies})){setExportedCount(0);}}}>运行配对实验</button></div>}
          {status.experiment&&<ExperimentResults progress={status.experiment} onExport={()=>setExportedCount(status.experiment!.results.length)}/>}
        </aside>}
        {menu && <aside className="rmul3d-help" aria-label="战场菜单" onKeyDown={event => { if (event.key === "Escape") toggleMenu(false); }}>
          <button className="rmul3d-close" onClick={() => toggleMenu(false)} aria-label="关闭">×</button>
          {settingsOpen?<><h2>设置</h2><SettingsPanel value={settings} onChange={updateSettings}/><button onClick={()=>setSettingsOpen(false)}>返回菜单</button></>:<>
          <h2>{experimentRunning?"战场菜单":status.match?.phase==="running"||status.countdown?"比赛已暂停":"战场菜单"}</h2>
          <div className="rmul3d-menu-actions"><button className="rmul3d-primary" onClick={()=>toggleMenu(false)}>继续{status.match?.phase==="running"||status.countdown?"比赛":""}</button><button onClick={()=>setSettingsOpen(true)}>设置</button><button onClick={()=>{toggleMenu(false);setExperimentOpen(true);}}>策略实验</button>{!status.experiment?.running&&<button disabled={disabled||experimentRunning} onClick={restart}>重新开始</button>}<button onClick={()=>{controller.current?.explore();toggleMenu(false);}}>返回探索</button><button onClick={exitToMenu}>退出战场</button></div>
          <details className="rmul3d-menu-detail"><summary>操作说明</summary>
            {flying?<><p>键盘：WASD 移动，鼠标转向，空格上升，Shift 下降，Ctrl 加速，滚轮调速。</p><p className="rmul3d-touch-help">触屏：左侧摇杆移动，右侧滑动转向，箭头升降，双箭头加速。</p></>:playing?<><p>键盘：WASD 移动，鼠标转向，Shift 加速，E 接管或退出，左键 / 空格开火，R 小陀螺，B 补弹，Esc 释放鼠标。</p><p className="rmul3d-touch-help">触屏：摇杆移动，右侧滑动转向，双箭头加速，准星按钮开火。</p></>:<p>选择机器人查看状态，切换跟随视角或人工接管；通过左上角视角菜单切换观战模式。</p>}
          </details>
          <details className="rmul3d-menu-detail"><summary>资产与规则覆盖</summary>
            <a href="https://bbs.robomaster.com/article/1970956" target="_blank" rel="noreferrer">RoboMaster 2027 官方 CAD</a>
            <a href="https://github.com/hxyulin/rm-map-tools/releases/tag/rm2027-assets-20261015" target="_blank" rel="noreferrer">rm-map-tools · CAD 转换</a>
            <Link to="/robots" onClick={e=>{if(!canLeave())e.preventDefault();}}>TARS-Go 2026 定妆照</Link>
            <p>场地资料 CC BY-NC-SA 4.0；机器人为照片参考的外观模型，非官方尺寸。当前为自主对抗训练，非完整官方裁判仿真。基地装甲攻击尚未实现；飞镖为虚拟检测训练，装配机构与护甲行程、场地交互模块卡覆盖范围为训练近似。</p>
          </details>
          </>}
        </aside>}
        </>}
      </section>
    </main>
  );
}
