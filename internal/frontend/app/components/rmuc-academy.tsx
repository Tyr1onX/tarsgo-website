import { useEffect,useRef,useState,type ReactNode,type RefObject } from "react";
import {getOptionalCurrentUser,subscribeAuthStateChange} from "~/lib/auth-client";
import {apiRequest} from "~/lib/api-client";
import {COURSES,KNOWLEDGE,RULE_SOURCE,RULE_VERSION,knowledgeForObject,type Course,type KnowledgeId} from "~/lib/rmuc-academy";
import {ARENA_ZONES} from "~/lib/rmuc-3d-zones";
import {GROUND_ROSTER,groundLabel} from "~/lib/rmuc-3d-identity";
import { LAB_CASES,LAB_VERSION,labProgressId,relatedLabs,type LabCase } from "~/lib/rmuc-academy-lab";
import {LabDirectory,RuleLab} from "./rmuc-academy-lab";
import type {ArenaController,ArenaStatus,TeachingMode} from "~/lib/rmul-3d-scene";

type SceneRenderer=(mode:TeachingMode,controller:RefObject<ArenaController|null>,onStatus:(status:ArenaStatus)=>void,onExit:()=>void,initialFocus?:string)=>ReactNode;
type Props={onExit:()=>void;renderScene:SceneRenderer};
type RecordInput={courseId:string;version:number;completed:boolean;position:number};
type Progress=RecordInput&{updatedAt:string};
const endpoint="/api/rmuc-academy/progress";
const controlSteps=["在小地图选择红方03号步兵，进入跟随视角。","切换AI第一人称，查看机器人视角。","通过左上角视角菜单切换到全场。","再次选择红方03号步兵。","点击人工接管。","使用WASD或触屏摇杆实际移动机器人。","点击退出机器人或按E，返回跟随视角。"];
const atlasObjects=[
  ...ARENA_ZONES.map(z=>({id:z.id,label:(z.team==="red"?"红":"蓝")+"方"+KNOWLEDGE[z.kind].title,knowledge:z.kind as KnowledgeId})),
  ...GROUND_ROSTER.map(r=>({id:r.id,label:(r.team==="red"?"红":"蓝")+"方"+groundLabel(r.id),knowledge:r.kind as KnowledgeId})),
  ...(["red","blue"] as const).flatMap(team=>[
    {id:team+"-core",label:(team==="red"?"红":"蓝")+"方科技核心",knowledge:"energy" as const},
    {id:team+"-energy",label:(team==="red"?"红":"蓝")+"方能量单元",knowledge:"energy" as const},
    {id:team+"-rune",label:(team==="red"?"红":"蓝")+"方能量机关",knowledge:"rune" as const},
    ...[["air","空中系统"],["dart","飞镖系统"],["radar","雷达系统"]].map(([kind,label])=>({id:team+"-"+kind,label:(team==="red"?"红":"蓝")+"方"+label,knowledge:kind as "air"|"dart"|"radar"}))
  ])
];
function Rule({id}:{id:KnowledgeId}){
  const k=KNOWLEDGE[id];
  return <article className="rmul3d-rule"><h3>{k.title}</h3><p>{k.summary}</p><details><summary>详细规则</summary><p>{k.detail}</p>{"boundary" in k&&<p className="rmul3d-rule-boundary">仿真边界：{k.boundary}</p>}</details><a href={RULE_SOURCE} target="_blank" rel="noreferrer">官方原文 · {k.reference}</a></article>;
}
export function RMUCAcademy(props:Props){
  const [identity,setIdentity]=useState<number|null|undefined>(undefined);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    const off=subscribeAuthStateChange(user=>{if(active){setIdentity(user?.id??null);setError("");}});
    void getOptionalCurrentUser().then(user=>{if(active)setIdentity(user?.id??null);}).catch(()=>{if(active)setError("账号状态加载失败");});
    return ()=>{active=false;off();};
  },[]);
  if(identity===undefined)return <main className="rmul3d rmul3d-academy"><button onClick={props.onExit}>返回主菜单</button><p role={error?"alert":"status"}>{error||"读取学习进度…"}</p>{error&&<button onClick={()=>{setError("");void getOptionalCurrentUser({force:true}).then(u=>setIdentity(u?.id??null)).catch(()=>setError("账号状态加载失败"));}}>重试</button>}</main>;
  return <AcademySession key={identity??"guest"} userId={identity} {...props}/>;
}
function AcademySession({userId,onExit,renderScene}:Props&{userId:number|null}){
  const [rows,setRows]=useState<Progress[]>([]);
  const [loading,setLoading]=useState(userId!==null);
  const [loadError,setLoadError]=useState(false);
  const [selection,setSelection]=useState<string|null>(null);
  const [position,setPosition]=useState(0);
  const [answer,setAnswer]=useState<number|null>(null);
  const [status,setStatus]=useState<ArenaStatus|null>(null);
  const [saveError,setSaveError]=useState<RecordInput|null>(null);
  const [saving,setSaving]=useState(false);
  const [finished,setFinished]=useState(false);
  const [fromAtlas,setFromAtlas]=useState(false);
  const [collapsed,setCollapsed]=useState(false);
  const controller=useRef<ArenaController|null>(null);
  const atlasFocus=useRef<string|null>(null);
  const request=useRef<AbortController|null>(null);
  function load(){
    if(userId===null)return;
    request.current?.abort();
    const abort=new AbortController();request.current=abort;
    setLoading(true);setLoadError(false);
    void apiRequest<Progress[]>(endpoint,{signal:abort.signal,cache:"no-store"}).then(value=>{if(!abort.signal.aborted)setRows(value);}).catch(()=>{if(!abort.signal.aborted)setLoadError(true);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
  }
  useEffect(()=>{load();return ()=>request.current?.abort();},[userId]);
  const current=COURSES.find(c=>c.id===selection);
  const demo=LAB_CASES.find(c=>labProgressId(c)===selection);
  const labRecord=(c:LabCase)=>rows.find(r=>r.courseId===labProgressId(c)&&r.version===LAB_VERSION);
  const labCompleted=(c:LabCase)=>!!labRecord(c)?.completed;
  const labCount=LAB_CASES.filter(labCompleted).length;
  const resumeLab=LAB_CASES.find(c=>labProgressId(c)===rows.find(r=>r.courseId.startsWith("lab-")&&!r.completed&&r.version===LAB_VERSION)?.courseId);
  const atlas=selection==="atlas";
  const guided=selection==="guided-territory";
  const guidedRecord=rows.find(r=>r.courseId==="guided-territory"&&r.version===1);
  const record=(c:Course)=>rows.find(r=>r.courseId===c.id&&r.version===c.version);
  const count=COURSES.filter(c=>record(c)?.completed).length;
  const latest=rows.find(r=>COURSES.some(c=>c.id===r.courseId&&c.version===r.version&&!r.completed));
  const next=COURSES.find(c=>c.id===latest?.courseId)??COURSES.find(c=>!record(c)?.completed);
  function update(row:Progress){
    setRows(previous=>[row,...previous.filter(r=>r.courseId!==row.courseId||r.version!==row.version)]);
  }
  async function persist(input:RecordInput){
    if(userId===null){
      update({...input,completed:input.completed||!!rows.find(r=>r.courseId===input.courseId&&r.version===input.version)?.completed,updatedAt:new Date().toISOString()});
      return true;
    }
    if(saving)return false;
    const abort=new AbortController();request.current=abort;
    setSaving(true);setSaveError(null);
    try{const row=await apiRequest<Progress>(endpoint,{method:"PUT",body:input,signal:abort.signal});if(abort.signal.aborted)return false;update(row);return true;}
    catch{if(!abort.signal.aborted)setSaveError(input);return false;}
    finally{if(!abort.signal.aborted)setSaving(false);}
  }
  function open(c:Course,repeat=false,from=false){
    if(from&&status?.teaching?.selected)atlasFocus.current=status.teaching.selected;
    const row=record(c);
    const pos=repeat||row?.completed?0:Math.min(row?.position??0,c.questions.length);
    setFromAtlas(from);setSelection(c.id);setPosition(pos);setAnswer(null);setFinished(false);setStatus(null);setCollapsed(false);
    void persist({courseId:c.id,version:c.version,position:pos,completed:false});
  }
  function openLab(c:LabCase,from=false){
    if(saving||saveError)return;
    if(from&&status?.teaching?.selected)atlasFocus.current=status.teaching.selected;
    setFromAtlas(from);setSelection(labProgressId(c));setStatus(null);
    void persist({courseId:labProgressId(c),version:LAB_VERSION,position:0,completed:false});
  }
  function back(){
    if(saving||saveError)return;
    setSelection(fromAtlas?"atlas":null);setFromAtlas(false);setStatus(null);setAnswer(null);setFinished(false);setCollapsed(false);
  }
  const mode:TeachingMode|undefined=atlas?"atlas":current?.practice&&position===0&&!finished?current.practice:undefined;
  const question=current?.questions[position-1];
  const selected=status?.teaching?.selected;
  const object=atlasObjects.find(o=>o.id===selected);
  const selectedKnowledge=object?.knowledge??(selected?knowledgeForObject(selected):undefined);
  async function advance(){
    if(!current||saving||saveError)return;
    if(position===0&&current.practice&&current.practice!=="observe"&&!status?.teaching?.done)return;
    if(position>0&&answer!==question?.answer)return;
    const completed=position===current.questions.length;
    const nextPosition=completed?position:position+1;
    if(!await persist({courseId:current.id,version:current.version,completed,position:nextPosition}))return;
    setAnswer(null);setPosition(nextPosition);setFinished(completed);setStatus(null);
  }
  async function retry(){
    if(!saveError)return;
    const input=saveError;
    if(await persist(input)){
      if(current?.id===input.courseId){setPosition(input.position);setFinished(input.completed);setAnswer(null);}
    }
  }
  const saveFeedback=saveError?<div role="alert" className="rmul3d-academy-error">进度未保存 <button disabled={saving} onClick={()=>void retry()}>重试</button></div>:null;
  if(!selection)return <main className="rmul3d rmul3d-academy rmul3d-academy-home"><header><button onClick={onExit}>← 主菜单</button><small>{RULE_VERSION}</small><h1>规则实验室</h1></header>
    {loading?<p role="status">读取学习进度…</p>:loadError?<div role="alert">学习进度加载失败 <button onClick={load}>重试</button></div>:<>
    <section className="rmul3d-academy-progress"><strong>{labCount} / {LAB_CASES.length} 案例已验证</strong><progress aria-label="规则案例进度" value={labCount} max={LAB_CASES.length}/>{userId===null&&<small>未登录，本次学习进度仅保留在当前页面。</small>}{resumeLab&&<button className="rmul3d-primary" disabled={saving||!!saveError} onClick={()=>openLab(resumeLab)}>继续案例 · {resumeLab.title}</button>}</section>
    {saveFeedback}<button className="rmul3d-primary" disabled={saving||!!saveError} onClick={()=>{setSelection("guided-territory");setStatus(null);}}>{guidedRecord?.completed?"重学":"开始三维教学"} · 前哨站与阵地争夺</button><LabDirectory completed={labCompleted} onOpen={openLab}/><details className="rmul3d-lab-guides"><summary>基础引导与三维练习 · {count}/{COURSES.length}</summary>{next&&<button className="rmul3d-primary" disabled={saving||!!saveError} onClick={()=>open(next)}>{latest?"继续引导":"开始引导"} · {next.title}</button>}<nav aria-label="章节课程" className="rmul3d-academy-list">{COURSES.map((c,i)=><button key={c.id} disabled={saving||!!saveError} onClick={()=>open(c,!!record(c)?.completed)}><span>{String(i+1).padStart(2,"0")}　{c.title}</span><small>{record(c)?.completed?"已完成 · 重学":record(c)?"继续":"开始"} ›</small></button>)}</nav></details>
    <details className="rmul3d-lab-guides"><summary>暂不提供动态裁判演示的规则</summary><Rule id="air"/></details>
    <button className="rmul3d-academy-atlas" disabled={saving||!!saveError} onClick={()=>{atlasFocus.current=null;setSelection("atlas");setStatus(null);}}>规则图鉴 ›</button>
    </>}
  </main>;
  if(guided)return <main className="rmul3d rmul3d-guided"><div className="rmul3d-guided-stage">{renderScene("territory",controller,setStatus,back)}</div><header className="rmul3d-guided-header"><button disabled={saving||!!saveError} onClick={back}>← 课程目录</button><h1>前哨站与阵地争夺</h1><button onClick={()=>{const el=document.querySelector(".rmul3d-guided");if(document.fullscreenElement)void document.exitFullscreen();else if(el?.requestFullscreen)void el.requestFullscreen().catch(()=>{});}}>全屏</button></header><section className="rmul3d-guided-caption" aria-label="教学进度" data-step={status?.teaching?.step} data-done={status?.teaching?.done} data-driving={!!status?.robot&&!status?.teaching?.done}><p role={status?.teaching?.error?"alert":"status"}>{status?.teaching?.error??status?.teaching?.caption??"准备战场…"}</p>{status?.match&&<><strong>蓝方前哨阵地 · {status.match.sides.blue.outpostArea.controller==="red"?"红方":"蓝方"}{status.match.sides.blue.outpostArea.full?"完全控制":"临时控制"}</strong><progress aria-label="占领与恢复进度" max={50} value={status.match.sides.blue.outpostArea.progress}/><small>前哨站归属：{status.match.sides.blue.outpostOwner==="red"?"红方":"蓝方"} · {status.match.sides.blue.outpost} HP</small></>}<div className="rmul3d-guided-actions">{!(status?.teaching?.done||status?.teaching?.error||status?.teaching?.step===10&&!status.robot)&&<button disabled={!status?.teaching} onClick={()=>controller.current?.pause(!status?.teaching?.paused)}>{status?.teaching?.paused?"继续":"暂停"}</button>}<button disabled={!status?.teaching} onClick={()=>controller.current?.teachingReset()}>重播</button>{status?.teaching?.step===10&&!status.robot&&!status.teaching.done&&!status.teaching.error&&<button className="rmul3d-primary" onClick={()=>controller.current?.takeControl()}>接管红方步兵</button>}{status?.teaching?.done&&<button className="rmul3d-primary" disabled={saving||!!saveError} onClick={()=>void persist({courseId:"guided-territory",version:1,position:1,completed:true}).then(ok=>{if(ok)back();})}>完成专题</button>}</div>{saveFeedback}</section></main>;
  if(demo)return <RuleLab key={demo.id} demo={demo} completed={labCompleted(demo)} onBack={back} onOpen={c=>openLab(c,fromAtlas)} saving={saving||!!saveError} saveFeedback={saveFeedback} onComplete={()=>persist({courseId:labProgressId(demo),version:LAB_VERSION,position:1,completed:true})}/>;
  const ruleIds=atlas?Object.keys(KNOWLEDGE) as KnowledgeId[]:current?.knowledge??[];
  const canFocus=mode==="atlas"||mode==="observe";
  const practiceReady=!!status?.teaching;
  const practiceDone=current?.practice==="observe"?practiceReady&&!status?.teaching?.error:!!status?.teaching?.done;
  const panel=<section className="rmul3d-academy-panel">
    <header><button disabled={saving||!!saveError} onClick={back}>← 课程目录</button>{mode&&<button className="rmul3d-academy-collapse" onClick={()=>setCollapsed(v=>!v)}>{collapsed?"展开":"收起"}</button>}<small>{RULE_VERSION}</small><h2>{atlas?"规则图鉴":current?.title}</h2></header>
    {saveFeedback}
    {!collapsed&&<>
    {finished?<><h3>课程已完成</h3><button className="rmul3d-primary" onClick={back}>返回{fromAtlas?"规则图鉴":"课程目录"}</button><button onClick={()=>current&&open(current,true,fromAtlas)}>重新学习</button></>:
    canFocus?<><label>场地对象<select aria-label="场地对象" disabled={!practiceReady} value={object?.id??""} onChange={e=>controller.current?.teachingFocus(e.target.value)}><option value="">选择场地对象</option>{atlasObjects.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
      {selectedKnowledge?<><Rule id={selectedKnowledge}/>{atlas&&relatedLabs(selectedKnowledge).length>0&&<details open><summary>关联动态演示 · {relatedLabs(selectedKnowledge).length}</summary><div className="rmul3d-lab-case-list">{relatedLabs(selectedKnowledge).map(c=><button key={labProgressId(c)} disabled={saving||!!saveError} onClick={()=>openLab(c,true)}>{c.title} ›</button>)}</div></details>}{atlas&&COURSES.filter(c=>c.knowledge.includes(selectedKnowledge)||c.questions.some(q=>q.knowledge===selectedKnowledge)).map(c=><button key={c.id} disabled={saving||!!saveError} onClick={()=>open(c,false,true)}>{c.title} ›</button>)}</>:<p>点击场地、小地图或上方索引查看对应规则。</p>}
      {current&&<button className="rmul3d-primary" disabled={!practiceDone||saving||!!saveError} onClick={()=>void advance()}>开始情境判断</button>}
      <details><summary>规则索引</summary>{(atlas?ruleIds:current?.knowledge??[]).map(id=><Rule key={id} id={id}/>)}</details>
      </>:
    mode?<>{status?.teaching?.error?<p role="alert">{status.teaching.error}</p>:status?.match?.phase==="finished"&&!practiceDone?<p role="alert">练习时间结束，请重置练习。</p>:!practiceReady?<p role="status">准备练习…</p>:practiceDone?<p role="status">实际操作已完成</p>:mode==="controls"?<><small>步骤 {(status?.teaching?.step??0)+1} / {controlSteps.length}</small><p>{controlSteps[status?.teaching?.step??0]}</p></>:mode==="heal"?<><p>当前机器人以低血量开始。向前移动进入己方补给区，观察真实回血事件与血量变化。</p><strong>{status?.match?.hp} / {status?.match?.maxHp} HP</strong><Rule id="supply"/></>:<><p>教学预设：重装与一枚落地能量单元位于合法装配区附近。使用真实拾取及装配操作。</p>{status?.match?.energy?.pickup&&<button onClick={()=>controller.current?.pickup()}>拾取能量单元</button>}{status?.match?.technology?.available.includes(1)&&<button onClick={()=>controller.current?.assembly(1)}>选择一级装配</button>}{status?.match?.technology?.actions.map(a=><button key={a.core} onClick={()=>controller.current?.assemblyStep(a.core,a.step,a.angle)}>{a.step===2?"对准并插入":a.step===6?"确认装配":"完成当前装配步骤"}</button>)}{status?.match?.technology?.level&&<p>装配 {status.match.technology.completed}/{status.match.technology.total}{status.match.technology.pending?" · 动作中":""}</p>}{status?.match?.technology?.failure&&<p role="alert">{status.match.technology.failure}</p>}<Rule id="assembly"/></>}
      <button disabled={!practiceReady} onClick={()=>controller.current?.teachingReset()}>重置练习</button>{practiceDone&&<button className="rmul3d-primary" disabled={saving||!!saveError} onClick={()=>void advance()}>{current?.questions.length?"开始情境判断":"完成课程"}</button>}</>:
    position===0?<>{current?.knowledge.map(id=><Rule key={id} id={id}/>)}<button className="rmul3d-primary" disabled={saving||!!saveError} onClick={()=>void advance()}>开始情境判断</button></>:
    question?<><small>情境 {position} / {current?.questions.length}</small><h3>{question.prompt}</h3><div className="rmul3d-academy-answers">{question.options.map((value,i)=><button key={i} disabled={saving} aria-pressed={answer===i} data-correct={answer===i?i===question.answer:undefined} onClick={()=>setAnswer(i)}>{value}</button>)}</div>{answer!==null&&<><p role="status">{answer===question.answer?"回答正确":"再想一想"}：{question.explanation}</p><Rule id={question.knowledge}/></>}<button className="rmul3d-primary" disabled={answer!==question.answer||saving||!!saveError} onClick={()=>void advance()}>{position===current?.questions.length?"完成课程":"下一题"}</button></>:null}
    </>}
  </section>;
  return <main className={"rmul3d rmul3d-academy "+(mode?"rmul3d-academy-practice":"rmul3d-academy-text")+(collapsed?" is-collapsed":"")}>{mode&&<div className="rmul3d-academy-stage">{renderScene(mode,controller,setStatus,back,atlas?atlasFocus.current??undefined:undefined)}</div>}{panel}</main>;
}
