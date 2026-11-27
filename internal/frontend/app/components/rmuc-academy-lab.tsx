import { useEffect,useMemo,useState,type ReactNode } from "react";
import { KNOWLEDGE,RULE_SOURCE,RULE_VERSION } from "~/lib/rmuc-academy";
import { LAB_TOPICS,buildLabTrace,type LabCase,type LabFrame } from "~/lib/rmuc-academy-lab";
import type { MatchEvent } from "~/lib/rmuc-3d-match";

export function LabDirectory({completed,onOpen}:{completed:(c:LabCase)=>boolean;onOpen:(c:LabCase)=>void}){
  const [query,setQuery]=useState("");
  const needle=query.trim().toLowerCase();
  const topics=LAB_TOPICS.map(t=>({...t,cases:t.cases.filter(c=>!needle||[t.title,t.keywords,c.title,KNOWLEDGE[c.knowledge].title,KNOWLEDGE[c.knowledge].summary,c.initial,c.trigger].join(" ").toLowerCase().includes(needle))})).filter(t=>t.cases.length);
  return <section className="rmul3d-lab-directory"><label className="rmul3d-lab-search">查阅规则<input type="search" placeholder="规则、区域、机器人…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    {topics.length?topics.map(t=><details key={t.title} open={needle?true:undefined}><summary><strong>{t.title}</strong><small>{t.cases.filter(completed).length}/{t.cases.length}</small></summary><div className="rmul3d-lab-case-list">{t.cases.map(c=><button key={c.id} onClick={()=>onOpen(c)}><span>{c.title}</span><small>{completed(c)?"已验证":"演示"} ›</small></button>)}</div></details>):<p>没有匹配的规则案例。</p>}
  </section>;
}
function eventText(e:MatchEvent){
  switch(e.type){
    case "territory":return (e.team==="red"?"红方":"蓝方")+(e.full?"完全控制":"临时控制")+(e.structure==="base"?"基地阵地":"前哨阵地");
    case "outpost-destroyed":return "前哨站被摧毁";
    case "outpost-rebuilt":return "前哨重建："+e.hp+" HP";
    case "cover-opening":return "基地护甲开始展开";
    case "cover-open":return "基地护甲已展开";
    case "heal":return e.status==="requested"?"远程回血已请求":"回血 +"+e.amount+" HP";
    case "ammo":return e.status==="requested"?"弹量兑换已请求":"弹量 +"+e.amount;
    case "robot-dead":return "机器人战亡";
    case "robot-revived":return "机器人复活："+e.hp+" HP";
    case "power-off":return "裁判触发底盘断电";
    case "assembly-start":return "开始"+e.level+"级装配";
    case "assembly-step-start":return "装配步骤开始";
    case "assembly-step-complete":return "装配步骤完成 "+e.completed+"/"+e.total;
    case "assembly-end":return e.reason?"装配失败："+e.reason:"装配完成 · 科技 "+e.technology+"级";
    case "energy-spent":return "能量单元结算";
    case "energy-picked":return "能量单元拾取";
    case "energy-dropped":return "能量单元落地";
    case "launcher-unlocked":return "能力使用权解锁";
    case "launcher-installed":return "进入待校验状态";
    case "launcher-ready":return "校验完成";
    case "launcher-removed":return "解除安装状态";
    case "rune-start":return "能量机关进入正在激活";
    case "rune-success":return "能量机关激活成功";
    case "rune-failed":return "能量机关激活失败";
    case "dart-launch":return "虚拟飞镖检测请求";
    case "dart-hit":return "虚拟飞镖检测命中";
    case "dart-miss":return "虚拟飞镖检测未命中";
    case "match-end":return "比赛结算："+(e.winner==="draw"?"平局":e.winner==="red"?"红方胜":"蓝方胜");
    case "match-start":return "比赛开始";
  }
}
function RuleDiagram({frame,events}:{frame:LabFrame;events:MatchEvent[]}){
  const value=(label:string)=>frame.metrics.find(m=>m.label===label)?.value;
  const territory=value("蓝方前哨阵地");
  if(territory)return <section className="rmul3d-lab-diagram" aria-label="前哨阵地状态示意">
    <div className="rmul3d-lab-territory"><div data-side="red" data-active={value("红方区域激活")==="是"}><small>红方 · 区域检测</small><strong>{value("红方区域激活")==="是"?"已激活":"未激活"}</strong></div><span aria-hidden="true">↔</span><div data-side="blue" data-active={value("蓝方区域激活")==="是"}><small>蓝方 · 区域检测</small><strong>{value("蓝方区域激活")==="是"?"已激活":"未激活"}</strong></div></div>
    <div className="rmul3d-lab-territory-result" data-side={String(territory).startsWith("红")?"red":"blue"}><strong>{territory}</strong><span>{value("双方争夺")==="是"?"争夺 · 进度冻结":"占领 / 恢复进度 "+value("占领 / 恢复进度")+" / 5秒"}</span><progress max={5} value={Number(value("占领 / 恢复进度"))}/><small>前哨：{value("前哨所属")} · {value("蓝方前哨血量")} HP</small></div>
  </section>;
  const steps=events.filter(e=>e.type==="assembly-step-complete");
  const latest=events.filter(e=>e.type==="assembly-start"||e.type==="assembly-step-start"||e.type==="assembly-step-complete"||e.type==="assembly-end").at(-1);
  if(latest&&"completed" in latest&&"total" in latest)return <section className="rmul3d-lab-diagram" aria-label="科技装配步骤示意"><div className="rmul3d-lab-state-head"><strong>{latest.level}级装配 · {latest.completed}/{latest.total}</strong><small>{latest.reason?"已中断":latest.type==="assembly-end"?"已完成":latest.type==="assembly-step-start"?"动作执行中":"等待下一步骤"}</small></div><div className="rmul3d-lab-assembly-steps">{Array.from({length:latest.total},(_,i)=><span key={i} data-done={i<latest.completed}>{i+1}</span>)}</div><ol className="rmul3d-lab-step-log">{steps.map((e,i)=>"step" in e?<li key={i}>{e.core==="red"?"红方":"蓝方"}核心 · {({2:"插入",3:"平移",4:"定位",5:"旋转",6:"确认"} as Record<number,string>)[e.step??0]}</li>:null)}</ol></section>;
  return null;
}
function Trend({frames,index}:{frames:LabFrame[];index:number}){
  const numeric=frames[0].metrics.map((m,i)=>typeof m.value==="number"?i:-1).filter(i=>i>=0);
  const [selected,setSelected]=useState(numeric[0]??0);
  if(!numeric.length)return null;
  const metric=frames[index].metrics[selected];
  const values=frames.map(f=>Number(f.metrics[selected].value));
  const low=Math.min(0,...values),high=Math.max(1,...values,metric.max??0);
  const x=(i:number)=>12+296*i/Math.max(1,frames.length-1);
  const y=(n:number)=>92-80*(n-low)/(high-low);
  const points=values.slice(0,index+1).map((v,i)=>x(i)+","+y(v)).join(" ");
  return <section className="rmul3d-lab-trend"><label>状态曲线<select aria-label="状态曲线" value={selected} onChange={e=>setSelected(Number(e.target.value))}>{numeric.map(i=><option key={i} value={i}>{frames[0].metrics[i].label}</option>)}</select></label>
    <svg viewBox="0 0 320 108" role="img" aria-label={metric.label+"实际裁判状态变化"}><path d="M12 12V92H308" fill="none" stroke="#62726a"/><line x1="12" x2="308" y1={y(0)} y2={y(0)} stroke="#62726a" strokeDasharray="3 3"/><polyline points={points} fill="none" stroke="#D0AD69" strokeWidth="2" strokeLinejoin="round"/><line x1={x(index)} x2={x(index)} y1="12" y2="92" stroke="#F1D794" strokeDasharray="3 3"/><circle cx={x(index)} cy={y(values[index])} r="3" fill="#F1D794"/></svg>
    <div className="rmul3d-lab-axis"><span>{low} – {high}{metric.unit??""}</span><span>{(frames.at(-1)!.time-frames[0].time).toFixed(1)} 秒</span></div>
  </section>;
}
export function RuleLab({demo,completed,onBack,onOpen,onComplete,saving,saveFeedback}:{demo:LabCase;completed:boolean;onBack:()=>void;onOpen:(c:LabCase)=>void;onComplete:()=>Promise<boolean>;saving:boolean;saveFeedback:ReactNode}){
  const result=useMemo(()=>{try{return {trace:buildLabTrace(demo)}}catch{return {trace:null}}},[demo]);
  const trace=result.trace;
  const [index,setIndex]=useState(0);
  const [playing,setPlaying]=useState(false);
  const [speed,setSpeed]=useState(2);
  const [answer,setAnswer]=useState<number|null>(null);
  const last=trace?trace.frames.length-1:0;
  useEffect(()=>{if(!playing||!trace)return;const timer=window.setInterval(()=>setIndex(i=>Math.min(i+speed,last)),100);return ()=>clearInterval(timer);},[playing,speed,last,trace]);
  useEffect(()=>{if(index>=last)setPlaying(false);},[index,last]);
  const topic=LAB_TOPICS.find(t=>t.cases.includes(demo))!;
  const k=KNOWLEDGE[demo.knowledge];
  function reset(){setPlaying(false);setIndex(0);setAnswer(null);}
  const frame=trace?.frames[index];
  const logs=frame&&trace?[...trace.inputs.slice(0,frame.inputCount).map(e=>({at:e.at,text:e.label+(e.accepted===undefined?"":e.accepted?" · 已受理":" · 未通过条件"),input:true})),...trace.events.slice(0,frame.eventCount).map(e=>({at:e.at,text:eventText(e),input:false}))].sort((a,b)=>a.at-b.at):[];
  return <main className="rmul3d rmul3d-academy rmul3d-lab"><header className="rmul3d-lab-header"><button disabled={saving} onClick={onBack}>← 返回</button><small>{RULE_VERSION} · {topic.title}</small><h1>{demo.title}</h1></header>
    <label className="rmul3d-lab-variant">切换情境<select aria-label="切换情境" value={demo.id} disabled={saving} onChange={e=>{const next=topic.cases.find(c=>c.id===e.target.value);if(next)onOpen(next);}}>{topic.cases.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
    <div className="rmul3d-lab-body"><section className="rmul3d-lab-live"><div className="rmul3d-lab-state-head"><strong>裁判状态回放</strong><small>独立虚拟裁判实例 · 10Hz 采样</small></div>
      {!frame||!trace?<p role="alert">该案例初始化失败，请返回目录。</p>:<>
        <div className="rmul3d-lab-time"><strong>{Math.floor(frame.time/60)}:{(frame.time%60).toFixed(1).padStart(4,"0")}</strong><span>比赛已进行</span></div>
        <RuleDiagram frame={frame} events={trace.events.slice(0,frame.eventCount)}/><div className="rmul3d-lab-metrics" aria-label="当前裁判状态">{frame.metrics.map(m=><div key={m.label}><small>{m.label}</small><strong>{m.value}{m.unit&&" "+m.unit}</strong>{typeof m.value==="number"&&m.max!==undefined&&<progress aria-label={m.label} max={m.max} value={Math.max(0,Math.min(m.max,m.value))}/>}</div>)}</div>
        <Trend frames={trace.frames} index={index}/>
        <input type="range" aria-label="演示时间" min={0} max={last} value={index} onChange={e=>{setPlaying(false);setIndex(Number(e.target.value));setAnswer(null);}}/>
        <div className="rmul3d-lab-actions"><button className="rmul3d-primary" onClick={()=>{if(index===last){reset();setPlaying(true);}else setPlaying(v=>!v);}}>{playing?"暂停":index===last?"重播":"播放"}</button><button onClick={reset}>重置</button><button disabled={index===last} onClick={()=>{setPlaying(false);setIndex(i=>Math.min(last,i+10));}}>前进1秒</button><select aria-label="播放速度" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[1,2,4].map(n=><option key={n} value={n}>{n}×</option>)}</select></div>
        <section className="rmul3d-lab-events"><h3>触发与裁判事件</h3>{logs.length?<ol>{logs.slice(-8).map((e,i)=><li key={i}><time>{e.at.toFixed(1)}s</time><span>{e.input?"输入 · ":"裁判 · "}{e.text}</span></li>)}</ol>:<p>尚无事件。</p>}<details><summary>完整记录（{logs.length}）</summary><ol>{logs.map((e,i)=><li key={i}><time>{e.at.toFixed(1)}s</time><span>{e.input?"输入 · ":"裁判 · "}{e.text}</span></li>)}</ol></details></section>
      </>}
    </section><aside className="rmul3d-lab-rules"><h2>{k.title}</h2><p>{k.summary}</p><dl><dt>初始条件</dt><dd>{demo.initial}</dd><dt>触发条件</dt><dd>{demo.trigger}</dd><dt>规则结果</dt><dd>{demo.expected}</dd></dl><details><summary>完整规则与特殊情况</summary><p>{k.detail}</p>{"boundary" in k&&<p>{k.boundary}</p>}</details><p className="rmul3d-rule-boundary">演示边界：{demo.limits}</p><a href={RULE_SOURCE} target="_blank" rel="noreferrer">官方原文 · {k.reference}</a>
      {frame&&index===last&&<section className="rmul3d-lab-question"><h3>{demo.question.prompt}</h3><div className="rmul3d-academy-answers">{demo.question.options.map((s,i)=><button key={i} aria-pressed={answer===i} data-correct={answer===i?i===demo.question.answer:undefined} onClick={()=>setAnswer(i)}>{s}</button>)}</div>{answer!==null&&<p role="status">{answer===demo.question.answer?"判断正确":"请根据实际状态重新判断"}。{demo.expected}</p>}<button className="rmul3d-primary" disabled={answer!==demo.question.answer||saving||completed} onClick={()=>void onComplete()}>{completed?"案例已验证":"保存案例进度"}</button></section>}
      {saveFeedback}
    </aside></div>
  </main>;
}
