import { useEffect,useMemo,useState,type ReactNode } from "react";
import { KNOWLEDGE,RULE_SOURCE,RULE_VERSION } from "~/lib/rmuc-academy";
import { LAB_TOPICS,buildLabTrace,labExperiment,labPresentation,type LabCase,type LabFrame,type LabTrace,type Metric } from "~/lib/rmuc-academy-lab";
import { ARENA_ZONES } from "~/lib/rmuc-3d-zones";
import type { MatchEvent } from "~/lib/rmuc-3d-match";

export function LabDirectory({completed,onOpen}:{completed:(c:LabCase)=>boolean;onOpen:(c:LabCase)=>void}){
  const [query,setQuery]=useState("");
  const needle=query.trim().toLowerCase();
  const topics=LAB_TOPICS.map(t=>({...t,cases:t.cases.filter(c=>!needle||[t.title,t.keywords,c.title,KNOWLEDGE[c.knowledge].title,KNOWLEDGE[c.knowledge].summary,c.initial,c.trigger].join(" ").toLowerCase().includes(needle))})).filter(t=>t.cases.length);
  return <section className="rmul3d-lab-directory"><label className="rmul3d-lab-search">查阅规则<input type="search" placeholder="规则、区域、机器人…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    {topics.length?topics.map(t=><details key={t.title} open={needle?true:undefined}><summary><strong>{t.title}</strong><small>{t.cases.filter(completed).length}/{t.cases.length}</small></summary><div className="rmul3d-lab-case-list">{t.cases.map(c=><button key={c.id} onClick={()=>onOpen(c)}><span>{c.title}</span><small>{completed(c)?"已验证":labExperiment(c)?"条件实验":"演示"} ›</small></button>)}</div></details>):<p>没有匹配的规则案例。</p>}
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
const zoneNames={base:"基地",fortress:"堡垒",central:"中央高地",outpost:"前哨",assembly:"装配区",highpoint:"制高点",supply:"补给区"};
const robotNames:Record<string,string>={r:"红步兵",b:"蓝步兵",h:"红重装",s:"红哨兵",bh:"蓝重装",bs:"蓝哨兵",r2:"红步兵2",b2:"蓝步兵2"};
const display=(m:Metric)=>m.value+(m.unit?" "+m.unit:"");
function FieldDiagram({frame,trace}:{frame:LabFrame;trace:LabTrace}){
  const {relevant,cards}=useMemo(()=>{
    const relevant=new Set(trace.frames.flatMap(f=>f.contacts.flatMap(c=>c.zones)));
    const cards=new Map<string,{x:number;z:number;part:string}>();
    for(const f of trace.frames)for(const c of f.contacts)for(const k of c.crossings)cards.set(k.course+"-"+k.part,{x:c.position.x,z:c.position.z,part:k.part});
    return {relevant,cards:[...cards.entries()]};
  },[trace]);
  const x=(n:number)=>280-n*18.5,z=(n:number)=>150-n*18.5;
  return <section className="rmul3d-lab-diagram"><div className="rmul3d-lab-state-head"><strong>场地位置与检测</strong><small>俯视示意 · 使用现有场地几何</small></div>
    <svg viewBox="0 0 560 300" role="img" aria-label="场地位置与检测示意">
      <rect x="21" y="11" width="518" height="278" rx="3" fill="#17221e" stroke="#526057"/>
      <path d="M280 11V289" stroke="#69736d" strokeDasharray="5 5"/>
      <text x="34" y="29" fill="#ffb8b1" fontSize="14">红方半场</text><text x="526" y="29" fill="#95c7ff" fontSize="14" textAnchor="end">蓝方半场</text>
      {ARENA_ZONES.map(zone=>{const hit=frame.contacts.some(c=>c.zones.includes(zone.id));const color=zone.team==="red"?"#e88780":"#7db5ed";return <g key={zone.id}><polygon points={zone.polygon.map(([a,b])=>x(a)+","+z(b)).join(" ")} fill={color} fillOpacity={hit?.38:relevant.has(zone.id)?.15:.045} stroke={color} strokeOpacity={relevant.has(zone.id)?1:.35} strokeWidth={hit?2:1}/>{relevant.has(zone.id)&&<text x={x(zone.goal[0])} y={z(zone.goal[1])-8} textAnchor="middle" fontSize="12" fill={color}>{zoneNames[zone.kind]}</text>}</g>})}
      {cards.map(([key,c])=><g key={key}><rect x={x(c.x)-6} y={z(c.z)-6} width="12" height="12" fill="#d0ad69" fillOpacity=".35" stroke="#d0ad69"/><text x={x(c.x)} y={z(c.z)-10} textAnchor="middle" fontSize="12" fill="#f1d794">{({low:"低处卡",high:"高处卡",a:"端点A",b:"端点B",inside:"内部卡"} as Record<string,string>)[c.part]}</text></g>)}
      {frame.contacts.map(c=><g key={c.id}><circle cx={x(c.position.x)} cy={z(c.position.z)} r="6" fill={c.id.startsWith("b")?"#95c7ff":"#ffb8b1"} stroke="#101715" strokeWidth="2"/><text x={x(c.position.x)} y={z(c.position.z)+17} textAnchor="middle" fontSize="12" fill="#fff">{robotNames[c.id]??c.id}</text></g>)}
    </svg><small>圆点表示当前提交给裁判的检测位置，不是连续行驶路径；离区后的激活保留以裁判状态为准。</small>
  </section>;
}
function StateProcess({frame,trace,focus}:{frame:LabFrame;trace:LabTrace;focus:readonly string[]}){
  const initial=trace.frames[0];
  const selected=focus.map(label=>frame.metrics.find(m=>m.label===label)).filter((m):m is Metric=>!!m);
  const inputs=trace.inputs.slice(0,frame.inputCount);
  const last=inputs.at(-1);
  return <section className="rmul3d-lab-process" aria-label="当前规则因果过程">
    <div><small>初始预设</small><strong>{selected.slice(0,2).map(m=>initial.metrics.find(v=>v.label===m.label)).filter((m):m is Metric=>!!m).map(m=>m.label+"："+display(m)).join(" · ")}</strong></div>
    <div><small>触发条件 / 最近输入</small><strong>{last?last.label+(last.accepted===undefined?"":last.accepted?" · 受理":" · 拒绝"):"尚未触发"}</strong></div>
    <div><small>当前裁判结果</small><strong>{selected.slice(0,3).map(m=>m.label+"："+display(m)).join(" · ")}</strong></div>
  </section>;
}
function ProcessHistory({frame,trace,focus}:{frame:LabFrame;trace:LabTrace;focus:readonly string[]}){
  const discrete=trace.frames[0].metrics.filter(m=>focus.includes(m.label)&&typeof m.value==="string");
  // Discrete state transitions only; numeric samples and repetitive tick events remain in details.
  const history=useMemo(()=>{
    const steps:{time:number;text:string;index:number}[]=[];
    for(let i=1;i<trace.frames.length;i++){
      const before=trace.frames[i-1],after=trace.frames[i];
      const changes=discrete.flatMap(m=>{const a=before.metrics.find(v=>v.label===m.label),b=after.metrics.find(v=>v.label===m.label);return a&&b&&a.value!==b.value?[m.label+"："+display(a)+" → "+display(b)]:[];});
      if(changes.length)steps.push({time:after.time,text:changes.join("；"),index:i});
    }
    return steps;
  },[trace,focus]);
  const visible=history.filter(s=>s.time<=frame.time);
  if(!visible.length)return null;
  return <section className="rmul3d-lab-events"><h3>状态转换</h3><ol>{visible.slice(-6).map(s=><li key={s.index}><time>{(s.time-trace.frames[0].time).toFixed(1)}s</time><span>{s.text}</span></li>)}</ol></section>;
}
function ResultOrder({frame}:{frame:LabFrame}){
  const labels=["基地血量（红 / 蓝）","控制度（红 / 蓝）","攻击伤害（红 / 蓝）","总剩余血量（红 / 蓝）"];
  return <section className="rmul3d-lab-diagram" aria-label="比赛结算优先级"><strong>裁判判定顺序（红 / 蓝）</strong><ol className="rmul3d-lab-order">{labels.map((label,i)=><li key={label}><span>{i===0?"基地被击毁时":label.replace("（红 / 蓝）","")}</span><strong>{frame.metrics.find(m=>m.label===label)?.value}</strong></li>)}</ol><strong>实际结算：{frame.metrics.find(m=>m.label==="结算")?.value}</strong></section>;
}
function MetricCards({metrics,initial}:{metrics:Metric[];initial:LabFrame}){
  return <div className="rmul3d-lab-metrics">{metrics.map(m=>{const before=initial.metrics.find(v=>v.label===m.label);return <div key={m.label}><small>{m.label}</small><strong>{display(m)}</strong>{before&&before.value!==m.value&&<small>初始：{display(before)}</small>}{typeof m.value==="number"&&m.max!==undefined&&m.max>0&&<progress aria-label={m.label} max={m.max} value={Math.max(0,Math.min(m.max,m.value))}/>}</div>})}</div>;
}
function Trend({frames,index,focus}:{frames:LabFrame[];index:number;focus:readonly string[]}){
  const numeric=frames[0].metrics.map((m,i)=>typeof m.value==="number"?i:-1).filter(i=>i>=0);
  const [selected,setSelected]=useState(numeric.find(i=>focus.includes(frames[0].metrics[i].label))??numeric[0]??0);
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
  const experiment=useMemo(()=>labExperiment(demo),[demo]);
  const [conditions,setConditions]=useState(()=>experiment?.fields.map(f=>f.initial)??[]);
  const changed=experiment?.fields.some((f,i)=>f.initial!==conditions[i])??false;
  const active=useMemo(()=>experiment&&changed?experiment.create(conditions):demo,[demo,experiment,changed,conditions]);
  const baseline=useMemo(()=>{try{return buildLabTrace(demo)}catch{return null}},[demo]);
  const trace=useMemo(()=>{try{return changed?buildLabTrace(active):baseline}catch{return null}},[active,baseline,changed]);
  const presentation=useMemo(()=>labPresentation(active),[active]);
  const showTrend=presentation.kind==="number"||active.knowledge==="supply"||active.knowledge==="recovery";
  const [index,setIndex]=useState(0);
  const [playing,setPlaying]=useState(false);
  const [speed,setSpeed]=useState(2);
  const [answer,setAnswer]=useState<number|null>(null);
  const last=trace?trace.frames.length-1:0;
  useEffect(()=>{if(!playing||!trace)return;const timer=window.setInterval(()=>setIndex(i=>Math.min(i+speed,last)),100);return ()=>clearInterval(timer);},[playing,speed,last,trace]);
  useEffect(()=>{if(index>=last)setPlaying(false);},[index,last]);
  const topic=LAB_TOPICS.find(t=>t.cases.includes(demo))!;
  const k=KNOWLEDGE[active.knowledge];
  function reset(){setPlaying(false);setIndex(0);setAnswer(null);}
  const frame=trace?.frames[index];
  const logs=frame&&trace?[...trace.inputs.slice(0,frame.inputCount).map(e=>({at:e.at,text:e.label+(e.accepted===undefined?"":e.accepted?" · 已受理":" · 未通过条件"),input:true})),...trace.events.slice(0,frame.eventCount).map(e=>({at:e.at,text:eventText(e),input:false}))].sort((a,b)=>a.at-b.at):[];
  const focus=frame?presentation.focus.map(label=>frame.metrics.find(m=>m.label===label)).filter((m):m is Metric=>!!m):[];
  const other=frame?.metrics.filter(m=>!presentation.focus.includes(m.label))??[];
  const done=!!frame&&index===last;
  return <main className="rmul3d rmul3d-academy rmul3d-lab"><header className="rmul3d-lab-header"><button disabled={saving} onClick={onBack}>← 返回</button><small>{RULE_VERSION} · {topic.title}</small><h1>{demo.title}</h1></header>
    <label className="rmul3d-lab-variant">切换情境<select aria-label="切换情境" value={demo.id} disabled={saving} onChange={e=>{const next=topic.cases.find(c=>c.id===e.target.value);if(next)onOpen(next);}}>{topic.cases.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
    {experiment&&<section className="rmul3d-lab-conditions" aria-label="实验条件"><div className="rmul3d-lab-state-head"><strong>改变条件，重新实验</strong><button disabled={!changed||saving} onClick={()=>{reset();setConditions(experiment.fields.map(f=>f.initial));}}>恢复默认条件</button></div><div className="rmul3d-lab-condition-grid">{experiment.fields.map((f,i)=><label key={f.label}>{f.label}<select aria-label={f.label} value={conditions[i]} disabled={saving} onChange={e=>{reset();setConditions(previous=>previous.map((v,j)=>i===j?e.target.value:v));}}>{f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>)}</div></section>}
    <div className="rmul3d-lab-body"><section className="rmul3d-lab-live"><div className="rmul3d-lab-state-head"><strong>{experiment?"条件实验":"规则演示"}</strong><small>实际虚拟裁判结果</small></div>
      {!frame||!trace?<p role="alert">该案例初始化失败，请返回目录或恢复默认条件。</p>:<>
        <div className="rmul3d-lab-time"><strong>{Math.floor(frame.time/60)}:{(frame.time%60).toFixed(1).padStart(4,"0")}</strong><span>比赛时间 · 演示 +{(frame.time-trace.frames[0].time).toFixed(1)}s</span></div>
        <StateProcess frame={frame} trace={trace} focus={presentation.focus}/>
        {presentation.kind==="space"&&<FieldDiagram frame={frame} trace={trace}/>}
        <RuleDiagram frame={frame} events={trace.events.slice(0,frame.eventCount)}/>{active.knowledge==="outcome"&&<ResultOrder frame={frame}/>}
        {presentation.kind==="process"&&active.knowledge!=="outcome"&&<ProcessHistory frame={frame} trace={trace} focus={presentation.focus}/>}
        <div aria-label="当前裁判状态"><MetricCards metrics={focus.length?focus:frame.metrics} initial={trace.frames[0]}/></div>
        {showTrend&&<Trend key={active.id+conditions.join("/")} frames={trace.frames} index={index} focus={presentation.focus}/>}
        <input type="range" aria-label="演示时间" min={0} max={last} value={index} onChange={e=>{setPlaying(false);setIndex(Number(e.target.value));setAnswer(null);}}/>
        <div className="rmul3d-lab-actions"><button className="rmul3d-primary" onClick={()=>{if(index===last){reset();setPlaying(true);}else setPlaying(v=>!v);}}>{playing?"暂停":index===last?"重播":"播放"}</button><button onClick={reset}>重置</button><button disabled={index===last} onClick={()=>{setPlaying(false);setIndex(i=>Math.min(last,i+10));}}>前进1秒</button><select aria-label="播放速度" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[1,2,4].map(n=><option key={n} value={n}>{n}×</option>)}</select></div>
        {done&&changed&&baseline&&<section className="rmul3d-lab-comparison"><h3>与默认情境对照</h3><table><thead><tr><th>指标</th><th>默认</th><th>本次</th></tr></thead><tbody>{focus.flatMap(m=>{const b=baseline.frames.at(-1)?.metrics.find(x=>x.label===m.label);return b?[<tr key={m.label}><th>{m.label}</th><td>{display(b)}</td><td>{display(m)}</td></tr>]:[];})}</tbody></table><small>两次各自完成后的裁判结果；不同情境的演示时长可能不同。</small></section>}
        <details><summary>更多裁判数据与状态曲线</summary>{other.length>0&&<MetricCards metrics={other} initial={trace.frames[0]}/>}{!showTrend&&<Trend key={active.id+conditions.join("/")} frames={trace.frames} index={index} focus={presentation.focus}/>}</details>
        <section className="rmul3d-lab-events"><details><summary>演示事件记录（{logs.length}）</summary>{logs.length?<ol>{logs.map((e,i)=><li key={i}><time>{e.at.toFixed(1)}s</time><span>{e.input?"预设输入 · ":"裁判 · "}{e.text}</span></li>)}</ol>:<p>尚无事件。</p>}</details><details><summary>初始预设的准备过程（{trace.setupEvents.length}条裁判事件）</summary><p>这些事件在演示开始前已发生，不属于本次操作。</p><ol>{trace.setupEvents.map((e,i)=><li key={i}><time>{e.at.toFixed(1)}s</time><span>{eventText(e)}</span></li>)}</ol></details></section>
      </>}
    </section><aside className="rmul3d-lab-rules"><h2>{k.title}</h2><p>{k.summary}</p><dl><dt>初始条件</dt><dd>{active.initial}</dd><dt>观察什么</dt><dd>{active.trigger}</dd><dt>为什么</dt><dd>{active.expected}</dd></dl><details><summary>完整规则与特殊情况</summary><p>{k.detail}</p>{"boundary" in k&&<p>{k.boundary}</p>}</details><p className="rmul3d-rule-boundary">演示边界：{active.limits}</p><a href={RULE_SOURCE} target="_blank" rel="noreferrer">官方原文 · {k.reference}</a>
      {done&&<section className="rmul3d-lab-question"><h3>{active.question.prompt}</h3><div className="rmul3d-academy-answers">{active.question.options.map((s,i)=><button key={i} aria-pressed={answer===i} data-correct={answer===i?i===active.question.answer:undefined} onClick={()=>setAnswer(i)}>{s}</button>)}</div>{answer!==null&&<p role="status">{answer===active.question.answer?"判断正确":"请根据实际状态重新判断"}。{active.expected}</p>}<button className="rmul3d-primary" disabled={answer!==active.question.answer||saving||completed} onClick={()=>void onComplete()}>{completed?"案例已验证":"保存案例进度"}</button></section>}
      {saveFeedback}
    </aside></div>
  </main>;
}
