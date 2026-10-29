import {useEffect,useRef,useState} from "react";
import {useOutletContext} from "react-router";
import type {DashboardLayoutOutletContext} from "~/routes/dashboard/layout";
import {getAvailabilityOptions,analyzeAvailability,type AvailabilityOptions,type AvailabilityFilter,type AvailabilityResult,type AvailabilityStatus} from "~/lib/availability-client";

export function meta(){return [{title:"组内空闲分析 | TARSGO"}]}
const DAYS=["周一","周二","周三","周四","周五","周六","周日"];
const STATUS=[{key:"free",label:"无课程冲突",count:"freeCount"},{key:"conflict",label:"存在课程冲突",count:"conflictCount"},{key:"missing",label:"数据缺失",count:"missingCount"}] as const;
const emptyFilter:AvailabilityFilter={groupId:0,semester:"",week:1,weekday:1,startSection:1,endSection:2};
function errorMessage(e:unknown){return e instanceof Error?e.message:"无法加载数据"}
function missingReason(reason:string|undefined){
 if(reason==="semester_mismatch")return "未导入所选学期";
 if(reason==="invalid_data")return "课表数据异常，无法判断";
 return "尚未上传课表";
}
export default function AvailabilityPage(){
 const {currentUser}=useOutletContext<DashboardLayoutOutletContext>();
 const [options,setOptions]=useState<AvailabilityOptions|null>(null);
 const [filter,setFilter]=useState<AvailabilityFilter>(emptyFilter);
 const [result,setResult]=useState<AvailabilityResult|null>(null);
 const [category,setCategory]=useState<AvailabilityStatus>("free");
 const [loading,setLoading]=useState(true);
 const [querying,setQuerying]=useState(false);
 const [error,setError]=useState("");
 const loadId=useRef(0);
 const queryId=useRef(0);
 useEffect(()=>{
  const id=++loadId.current;queryId.current++;
  setOptions(null);setFilter(emptyFilter);setResult(null);setError("");setLoading(true);
  void getAvailabilityOptions().then(value=>{
   if(id!==loadId.current)return;
   setOptions(value);
   const first=value.groups[0];
   if(first)setFilter(current=>({...current,groupId:first.groupId,semester:first.semesters[0]??""}));
  }).catch(e=>{if(id===loadId.current)setError(errorMessage(e))})
   .finally(()=>{if(id===loadId.current)setLoading(false)});
  return ()=>{loadId.current++;queryId.current++};
 },[currentUser.id]);
 useEffect(()=>{
  const id=++queryId.current;
  setResult(null);setCategory("free");setQuerying(false);
  if(!filter.groupId||!filter.semester.trim()||filter.startSection>filter.endSection)return;
  setQuerying(true);setError("");
  void analyzeAvailability({...filter,semester:filter.semester.trim()}).then(value=>{
   if(id===queryId.current)setResult(value);
  }).catch(e=>{
   if(id===queryId.current)setError(errorMessage(e));
  }).finally(()=>{if(id===queryId.current)setQuerying(false)});
  return ()=>{queryId.current++};
 },[filter]);
 const selected=options?.groups.find(g=>g.groupId===filter.groupId);
 const setField=<K extends keyof AvailabilityFilter>(key:K,value:AvailabilityFilter[K])=>
  setFilter(current=>({...current,[key]:value}));
 const members=result?.members.filter(m=>m.status===category)??[];
 const sectionOptions=Array.from({length:24},(_,i)=>i+1);
 return <main className="admin-design mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6">
  <header><h1 className="text-2xl font-semibold">组内空闲分析</h1>
   <p className="mt-2 text-sm text-[var(--admin-muted)]">仅检查已导入课表的固定课程冲突；无课程冲突不代表成员承诺有空。</p>
  </header>
  {loading?<p role="status">正在加载可管理组别…</p>:null}
  {error?<p role="alert" className="rounded-xl border border-red-300 p-3 text-sm text-red-600">{error}</p>:null}
  {options&&options.groups.length===0?<p className="rounded-xl border border-[var(--admin-border-subtle)] p-5">当前账号没有可管理的有效组别。</p>:null}
  {options&&options.groups.length>0?<section className="rounded-2xl border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] p-4 sm:p-5" aria-label="空闲时间筛选">
   <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
    <label className="text-sm font-medium">组别
     <select aria-label="组别" className="admin-field mt-2 w-full rounded-lg border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] p-2" value={filter.groupId} onChange={e=>{
      const id=Number(e.target.value);
      const group=options.groups.find(g=>g.groupId===id);
      setFilter(current=>({...current,groupId:id,semester:group?.semesters[0]??""}));
     }}>{options.groups.map(g=><option value={g.groupId} key={g.groupId}>{g.name}</option>)}</select>
    </label>
    <label className="text-sm font-medium">学期
     <input className="admin-field mt-2 w-full rounded-lg border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] p-2" value={filter.semester} list="available-semesters" maxLength={40} onChange={e=>setField("semester",e.target.value)} placeholder="选择或输入学期" />
     <datalist id="available-semesters">{(selected?.semesters??[]).map(s=><option key={s} value={s}/>)}</datalist>
    </label>
    <label className="text-sm font-medium">教学周
     <select aria-label="教学周" className="admin-field mt-2 w-full rounded-lg border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] p-2" value={filter.week} onChange={e=>setField("week",Number(e.target.value))}>
      {Array.from({length:30},(_,i)=><option key={i+1} value={i+1}>第 {i+1} 周</option>)}
     </select>
    </label>
    <label className="text-sm font-medium">星期
     <select aria-label="星期" className="admin-field mt-2 w-full rounded-lg border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] p-2" value={filter.weekday} onChange={e=>setField("weekday",Number(e.target.value))}>
      {DAYS.map((day,i)=><option key={day} value={i+1}>{day}</option>)}
     </select>
    </label>
    <label className="text-sm font-medium">起始节次
     <select aria-label="起始节次" className="admin-field mt-2 w-full rounded-lg border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] p-2" value={filter.startSection} onChange={e=>setField("startSection",Number(e.target.value))}>
      {sectionOptions.map(n=><option key={n} value={n}>第 {n} 节</option>)}
     </select>
    </label>
    <label className="text-sm font-medium">结束节次
     <select aria-label="结束节次" className="admin-field mt-2 w-full rounded-lg border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] p-2" value={filter.endSection} onChange={e=>setField("endSection",Number(e.target.value))}>
      {sectionOptions.map(n=><option key={n} value={n}>第 {n} 节</option>)}
     </select>
    </label>
   </div>
   {filter.startSection>filter.endSection?<p role="alert" className="mt-3 text-sm text-red-600">结束节次不能早于起始节次。</p>:null}
   {!filter.semester.trim()?<p className="mt-3 text-sm text-[var(--admin-muted)]">请选择或填写学期以查询；没有导入记录的学期，组内成员将归入数据缺失。</p>:null}
  </section>:null}
  {querying?<p role="status">正在查询所选时间段…</p>:null}
  {result&&!querying?<section className="space-y-4" aria-live="polite">
   <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
    {[
     {label:"本组成员",value:result.totalCount},
     {label:"已导入所选学期",value:result.importedCount},
     {label:"无课程冲突",value:result.freeCount},
     {label:"课程冲突",value:result.conflictCount},
     {label:"数据缺失",value:result.missingCount}
    ].map(item=><div key={item.label} className="rounded-xl border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] p-4">
      <p className="text-xs text-[var(--admin-muted)]">{item.label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{item.value}</p>
     </div>)}
   </div>
   <section className="rounded-2xl border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] p-4 sm:p-5">
    <h2 className="text-lg font-semibold">{result.groupName} · 第 {result.week} 周 {DAYS[result.weekday-1]} 第 {result.startSection}–{result.endSection} 节</h2>
    <p className="mt-1 text-sm text-[var(--admin-muted)]">空闲人数仅表示该时段全部节次均无已确定课程；未上传或学期不匹配者不计入。</p>
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="按查询结果筛选成员">
     {STATUS.map(item=><button key={item.key} type="button" aria-pressed={category===item.key} onClick={()=>setCategory(item.key)}
      className={`rounded-lg border px-3 py-2 text-sm ${category===item.key?"border-[var(--admin-text)] font-semibold":"border-[var(--admin-border-subtle)]"}`}>{item.label}（{result[item.count]}）</button>)}
    </div>
    {members.length===0?<p className="mt-4 text-sm text-[var(--admin-muted)]">此分类下暂无成员。</p>:
     <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{members.map(member=><li className="min-w-0 rounded-lg border border-[var(--admin-border-subtle)] p-3" key={member.userId}>
       <p className="break-words text-sm font-medium">{member.name}</p>
       {member.status==="missing"?<p className="mt-1 text-xs text-[var(--admin-muted)]">{missingReason(member.missingReason)}</p>:null}
       {member.hasUncertainCourses?<p className="mt-1 text-xs text-amber-700 dark:text-amber-400">另有 {member.uncertainCourseCount} 门上课时间未确定的课程，需进一步确认</p>:null}
      </li>)}</ul>}
   </section>
  </section>:null}
 </main>
}
