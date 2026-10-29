import {useEffect,useState,type FormEvent} from "react";
import {useLocation,useOutletContext} from "react-router";
import type {DashboardLayoutOutletContext} from "~/routes/dashboard/layout";
import {practiceClient,type PracticeProject,type PracticeInput,type PracticeMember,type PracticeSubmission,type PracticeGroup} from "~/lib/practice-project-client";

export function meta() {
  return [{ title: "实践项目 | TARSGO" }];
}
const statusLabel:Record<string,string>={open:"开放报名",closed:"已关闭",active:"参与中",exit_pending:"待审批退出",exited:"已退出",pending:"待验收",passed:"已通过",needs_redo:"退回修改"};
const newDraft=():PracticeInput=>({groupId:0,title:"",description:"",capacity:5,dueAt:""});
const textDate=(value:string)=>new Date(value).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false});
function errorText(error:unknown){return error instanceof Error?error.message:"操作失败，请稍后重试"}
function dateInput(value:string){const d=new Date(value);if(Number.isNaN(d.valueOf()))return "";return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
function SubmissionRecord({submission,admin,projectId,onUpdate}:{
 submission:PracticeSubmission;admin:boolean;projectId:number;onUpdate:(value:PracticeProject)=>void;
}){
 const [comment,setComment]=useState("");
 const [score,setScore]=useState("80");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const review=async(decision:"passed"|"needs_redo")=>{
  setBusy(true);setError("");
  try{onUpdate(await practiceClient.review(projectId,submission.id,decision,Number(score),comment))}
  catch(e){setError(errorText(e))}
  finally{setBusy(false)}
 };
 return <article className="rounded-lg border border-[var(--admin-border-subtle)] p-3 space-y-2">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <p className="text-sm font-medium">第 {submission.attempt} 次提交 · {statusLabel[submission.decision]}</p>
   <time className="text-xs text-[var(--admin-muted)]">{textDate(submission.createdAt)}</time>
  </div>
  <p className="whitespace-pre-wrap break-words text-sm"><strong>完成情况：</strong>{submission.progress}</p>
  <p className="whitespace-pre-wrap break-words text-sm"><strong>个人心得：</strong>{submission.reflection}</p>
  <div className="flex flex-wrap gap-2">{submission.files.map(file=><a className="text-sm underline" key={file.id} href={practiceClient.fileUrl(file.id)}>{file.fileName}</a>)}</div>
  {submission.decision!=="pending"?<p className="text-sm">评价意见：{submission.comment}{admin&&submission.score!==undefined?` · 内部评分 ${submission.score}`:""}</p>:null}
  {admin&&submission.decision==="pending"?<div className="grid gap-2 sm:grid-cols-[1fr_auto]">
   <label className="text-sm">评价意见 <textarea className="admin-field mt-1 w-full p-2" rows={2} value={comment} maxLength={5000} onChange={e=>setComment(e.target.value)}/></label>
   <div className="space-y-2">
    <label className="block text-sm">内部评分（仅管理员）<input className="admin-field mt-1 block w-28 p-2" type="number" min={0} max={100} value={score} onChange={e=>setScore(e.target.value)}/></label>
    <div className="flex gap-2"><button type="button" disabled={busy||!comment.trim()||score===""||Number(score)<0||Number(score)>100} onClick={()=>void review("passed")} className="rounded-lg border px-3 py-2 text-sm">通过</button>
     <button type="button" disabled={busy||!comment.trim()||score===""||Number(score)<0||Number(score)>100} onClick={()=>void review("needs_redo")} className="rounded-lg border px-3 py-2 text-sm">退回修改</button></div>
   </div>
   {error?<p role="alert" className="text-sm text-red-600">{error}</p>:null}
  </div>:null}
 </article>
}
function MemberRecord({member,project,admin,onUpdate}:{member:PracticeMember;project:PracticeProject;admin:boolean;onUpdate:(v:PracticeProject)=>void}){
 const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 const decide=async(approve:boolean)=>{setBusy(true);setError("");try{onUpdate(await practiceClient.decideExit(project.id,member.userId,approve))}catch(e){setError(errorText(e))}finally{setBusy(false)}};
 return <section className="rounded-xl border border-[var(--admin-border-subtle)] p-3 space-y-3">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <p className="font-medium">{admin?member.name:"我的项目参与记录"} <span className="text-xs font-normal text-[var(--admin-muted)]">{statusLabel[member.status]}</span></p>
   {admin&&member.status==="exit_pending"?<div className="flex gap-2"><button type="button" disabled={busy} onClick={()=>void decide(true)} className="rounded-lg border px-3 py-2 text-sm">批准退出</button><button type="button" disabled={busy} onClick={()=>void decide(false)} className="rounded-lg border px-3 py-2 text-sm">拒绝退出</button></div>:null}
  </div>
  {error?<p role="alert" className="text-sm text-red-600">{error}</p>:null}
  {member.submissions.length?member.submissions.map(sub=><SubmissionRecord key={sub.id} submission={sub} admin={admin} projectId={project.id} onUpdate={onUpdate}/>):<p className="text-sm text-[var(--admin-muted)]">暂无成果提交</p>}
 </section>
}

export default function PracticeProjectsPage(){
 const {currentUser}=useOutletContext<DashboardLayoutOutletContext>();
 const location=useLocation();
 const admin=location.pathname.startsWith("/dashboard/admin/");
 const [projects,setProjects]=useState<PracticeProject[]>([]);
 const [groups,setGroups]=useState<PracticeGroup[]>([]);
 const [selectedId,setSelectedId]=useState(0);
 const [draft,setDraft]=useState<PracticeInput>(newDraft());
 const [editing,setEditing]=useState(false);
 const [progress,setProgress]=useState("");
 const [reflection,setReflection]=useState("");
 const [files,setFiles]=useState<FileList|null>(null);
 const [loading,setLoading]=useState(true);
 const [detailLoadedId,setDetailLoadedId]=useState(0);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const selected=projects.find(p=>p.id===selectedId)??projects[0]??null;
 const myEntry=selected?.members.find(e=>e.userId===currentUser.id);
 const latest=myEntry?.submissions[0];
 const maySubmit=detailLoadedId===selected?.id&&(selected?.myStatus==="active"||selected?.myStatus==="exit_pending")&&selected.status==="open"&&Date.parse(selected.dueAt)>Date.now()&&(!latest||latest.decision==="needs_redo");
 const update=(value:PracticeProject)=>{setProjects(old=>old.some(p=>p.id===value.id)?old.map(p=>p.id===value.id?value:p):[value,...old]);setSelectedId(value.id);setDetailLoadedId(value.id)};
 useEffect(()=>{
  let live=true;setLoading(true);setError("");
  void Promise.all([admin?practiceClient.adminList():practiceClient.memberList(),admin?practiceClient.groups():Promise.resolve([])]).then(([items,scope])=>{
   if(!live)return;
   const requestedId=Number(new URLSearchParams(location.search).get("projectId"))||0;
   setProjects(items);setGroups(scope);setSelectedId(items.find(item=>item.id===requestedId)?.id??items[0]?.id??0);
   setDraft(old=>({...old,groupId:scope[0]?.groupId??0}));
  }).catch(e=>{if(live)setError(errorText(e))}).finally(()=>{if(live)setLoading(false)});
  return ()=>{live=false};
 },[currentUser.id,admin,location.search]);
 useEffect(()=>{
  if(!selectedId)return;
  let live=true;setDetailLoadedId(0);
  void practiceClient.get(selectedId).then(value=>{
   if(!live)return;
   setProjects(old=>old.map(item=>item.id===selectedId?value:item));
   setDetailLoadedId(selectedId);
  }).catch(e=>{if(live)setError(errorText(e))});
  return ()=>{live=false};
 },[selectedId,currentUser.id]);
 const run=async(action:()=>Promise<PracticeProject>,success:string)=>{
  setBusy(true);setError("");setNotice("");
  try{update(await action());setNotice(success);return true}
  catch(e){setError(errorText(e));return false}
  finally{setBusy(false)}
 };
 const save=async(e:FormEvent)=>{
  e.preventDefault();
  const success=await run(()=>editing&&selected?practiceClient.edit(selected.id,{...draft,dueAt:new Date(draft.dueAt).toISOString()}):practiceClient.create({...draft,dueAt:new Date(draft.dueAt).toISOString()}),editing?"项目已更新":"项目已创建");
  if(success)setEditing(false);
 };
 const submit=async(e:FormEvent)=>{
  e.preventDefault();if(!selected)return;
  const form=new FormData();form.set("progress",progress);form.set("reflection",reflection);
  for(const f of Array.from(files??[]))form.append("files",f);
  const success=await run(()=>practiceClient.submit(selected.id,form),"成果提交成功");
  if(success){
   setProgress("");setReflection("");setFiles(null);
   const input=document.querySelector<HTMLInputElement>("#practice-upload");if(input)input.value="";
  }
 };
 const inputClass="admin-field mt-1 w-full rounded-lg border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] p-2";
 return <div className="admin-design mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
  <header><h1 className="text-2xl font-semibold">{admin?"实践项目管理":"实践项目"}</h1>
   <p className="mt-2 text-sm text-[var(--admin-muted)]">参与项目、记录实践成果与验收反馈。报名不需要审核，退出须经管理员同意。</p>
  </header>
  {error?<p className="rounded-lg border border-red-300 p-3 text-sm text-red-600" role="alert">{error}</p>:null}
  {notice?<p className="rounded-lg border p-3 text-sm" role="status">{notice}</p>:null}
  {loading?<p role="status">正在加载项目…</p>:null}
  {admin&&!loading?<section className="rounded-xl border border-[var(--admin-border-subtle)] p-4 space-y-4">
   <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{editing?"编辑项目":"创建本组实践项目"}</h2>{editing?<button type="button" className="text-sm underline" onClick={()=>{setEditing(false);setDraft({...newDraft(),groupId:groups[0]?.groupId??0})}}>取消编辑</button>:null}</div>
   <form className="grid gap-3 sm:grid-cols-2" onSubmit={e=>void save(e)}>
    <label className="text-sm">所属组别 <select className={inputClass} disabled={editing} value={draft.groupId} onChange={e=>setDraft(v=>({...v,groupId:Number(e.target.value)}))}>{groups.map(g=><option value={g.groupId} key={g.groupId}>{g.name}</option>)}</select></label>
    <label className="text-sm">人数上限 <input className={inputClass} type="number" min={1} max={500} required value={draft.capacity} onChange={e=>setDraft(v=>({...v,capacity:Number(e.target.value)}))}/></label>
    <label className="text-sm">项目名称 <input className={inputClass} maxLength={120} required value={draft.title} onChange={e=>setDraft(v=>({...v,title:e.target.value}))}/></label>
    <label className="text-sm">截止时间 <input className={inputClass} type="datetime-local" required value={draft.dueAt} onChange={e=>setDraft(v=>({...v,dueAt:e.target.value}))}/></label>
    <label className="sm:col-span-2 text-sm">任务说明 <textarea className={inputClass} rows={4} maxLength={10000} required value={draft.description} onChange={e=>setDraft(v=>({...v,description:e.target.value}))}/></label>
    <div><button type="submit" className="rounded-lg border px-4 py-2 text-sm font-semibold" disabled={busy||groups.length===0}>{editing?"保存修改":"创建项目"}</button></div>
   </form>
  </section>:null}
  {!loading?<section className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
   <nav className="space-y-2" aria-label="项目列表">
    <h2 className="font-semibold">项目列表</h2>
    {projects.length===0?<p className="text-sm text-[var(--admin-muted)]">当前没有可查看的项目。</p>:null}
    {projects.map(p=><button type="button" key={p.id} aria-pressed={selected?.id===p.id}
     className={`block w-full rounded-xl border p-3 text-left ${selected?.id===p.id?"border-[var(--admin-text)]":"border-[var(--admin-border-subtle)]"}`} onClick={()=>{setSelectedId(p.id);setError("");setNotice("");setEditing(false)}}>
     <span className="block break-words font-medium">{p.title}</span><span className="mt-1 block text-xs text-[var(--admin-muted)]">{statusLabel[p.status]} · {p.occupiedCount}/{p.capacity} 人</span></button>)}
   </nav>
   {selected?<article className="min-w-0 space-y-4 rounded-xl border border-[var(--admin-border-subtle)] p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="break-words text-xl font-semibold">{selected.title}</h2><p className="mt-1 text-sm text-[var(--admin-muted)]">{statusLabel[selected.status]} · 已报名 {selected.occupiedCount}/{selected.capacity} 人 · 截止 {textDate(selected.dueAt)}</p></div>
     {admin&&selected.status==="open"?<div className="flex gap-2">
      <button className="rounded-lg border px-3 py-2 text-sm" type="button" onClick={()=>{setDraft({groupId:selected.groupId,title:selected.title,description:selected.description,capacity:selected.capacity,dueAt:dateInput(selected.dueAt)});setEditing(true)}}>编辑</button>
      <button className="rounded-lg border px-3 py-2 text-sm" type="button" disabled={busy} onClick={()=>{if(confirm("确定关闭该项目？关闭后不能再报名或提交成果。"))void run(()=>practiceClient.close(selected.id),"项目已关闭")}}>关闭</button>
     </div>:null}
    </div>
    <p className="whitespace-pre-wrap break-words text-sm">{selected.description}</p>
    {!admin?<div className="flex flex-wrap gap-2">
     {!selected.myStatus&&selected.status==="open"?<button className="rounded-lg border px-3 py-2 text-sm" disabled={busy||selected.occupiedCount>=selected.capacity||Date.parse(selected.dueAt)<=Date.now()} onClick={()=>void run(()=>practiceClient.join(selected.id),"报名成功")}>自主报名{selected.occupiedCount>=selected.capacity?"（已满员）":""}</button>:null}
     {selected.myStatus==="active"&&selected.status==="open"?<button className="rounded-lg border px-3 py-2 text-sm" disabled={busy} onClick={()=>void run(()=>practiceClient.exit(selected.id),"退出申请已提交，等待管理员审批")}>申请退出</button>:null}
     {selected.myStatus?<p className="text-sm text-[var(--admin-muted)]">参与状态：{statusLabel[selected.myStatus]}</p>:null}
    </div>:null}
    {!admin&&maySubmit?<form className="space-y-3 rounded-xl border border-[var(--admin-border-subtle)] p-3" onSubmit={e=>void submit(e)}>
     <h3 className="font-semibold">{latest?"重新提交成果":"提交实践成果"}</h3>
     <label className="block text-sm">完成情况 <textarea className={inputClass} value={progress} maxLength={10000} required rows={3} onChange={e=>setProgress(e.target.value)}/></label>
     <label className="block text-sm">个人心得 <textarea className={inputClass} value={reflection} maxLength={5000} required rows={3} onChange={e=>setReflection(e.target.value)}/></label>
     <label className="block text-sm">过程照片或成果附件（最多 10 个，单个不超过 20 MB）<input id="practice-upload" className={inputClass} type="file" multiple required accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.zip,.7z,.rar" onChange={e=>setFiles(e.target.files)}/></label>
     <button type="submit" disabled={busy} className="rounded-lg border px-4 py-2 text-sm">提交成果</button>
    </form>:null}
    {detailLoadedId!==selected.id?<p role="status" className="text-sm">正在加载参与记录…</p>:admin?<section className="space-y-3"><h3 className="font-semibold">参与成员与验收</h3>
      {selected.members.length===0?<p className="text-sm text-[var(--admin-muted)]">暂无报名成员。</p>:selected.members.map(m=><MemberRecord member={m} project={selected} admin key={m.userId} onUpdate={update}/>)}
     </section>:myEntry?<MemberRecord member={myEntry} project={selected} admin={false} onUpdate={update}/>:null}
   </article>:null}
  </section>:null}
 </div>;
}
