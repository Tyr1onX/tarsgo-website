import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import {
 coursesForWeek, getPersonalTimetables, importPersonalTimetable,
 type PersonalTimetable,
} from "~/lib/timetable-client";

export function meta() { return [{ title: "我的课表 | TARSGO" }]; }

const days = ["周一","周二","周三","周四","周五","周六","周日"];

export default function PersonalTimetableRoute() {
 const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
 const [timetables,setTimetables] = useState<PersonalTimetable[]>([]);
 const [semester,setSemester] = useState("");
 const [semesterInput,setSemesterInput] = useState("");
 const [week,setWeek] = useState(1);
 const [file,setFile] = useState<File|null>(null);
 const [loading,setLoading] = useState(true);
 const [uploading,setUploading] = useState(false);
 const [error,setError] = useState("");
 const [success,setSuccess] = useState("");
 const requestRef = useRef(0);

 useEffect(()=>{
  const requestId=++requestRef.current;
  setTimetables([]);setSemester("");setWeek(1);setFile(null);setSuccess("");setLoading(true);setError("");
  void getPersonalTimetables().then((list)=>{
   if(requestRef.current!==requestId)return;
   setTimetables(list);
   setSemester(list[0]?.semester??"");
  }).catch((cause)=>{
   if(requestRef.current===requestId)setError(cause instanceof Error?cause.message:"课表加载失败");
  }).finally(()=>{
   if(requestRef.current===requestId)setLoading(false);
  });
  return ()=>{requestRef.current++};
 },[currentUser.id]);
 const active=timetables.find((entry)=>entry.semester===semester);
 const weekCourses=useMemo(()=>coursesForWeek(active?.courses??[],week),[active,week]);

 async function submit(event: FormEvent<HTMLFormElement>){
  event.preventDefault();
  if (!file || uploading) return;
  const requestId=requestRef.current;
  setUploading(true);setError("");setSuccess("");
  try{
   const result=await importPersonalTimetable(semesterInput.trim(),file);
   const list=await getPersonalTimetables();
   if(requestRef.current!==requestId)return;
   setTimetables(list);
   setSemester(result.semester);
   setWeek(1);
   setFile(null);
   const input=document.getElementById("personal-timetable-file") as HTMLInputElement|null;
   if(input) input.value="";
   setSuccess(`已导入 ${result.courses.length} 条课程安排。请核对各教学周及未确定课程。`);
  }catch(cause){if(requestRef.current===requestId)setError(cause instanceof Error?cause.message:"导入失败，原课表未更改")}
  finally{setUploading(false)}
 }

 return <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6">
  <header>
   <h1 className="text-2xl font-semibold text-text-primary">我的课表</h1>
   <p className="mt-2 text-sm text-text-secondary">上传学校教务系统导出的 .xlsx 课表，按教学周核对课程。未确定时间不计入固定占用。</p>
  </header>
  <section className="rounded-2xl border border-border-subtle bg-surface-light p-4 sm:p-6">
   <h2 className="mb-4 text-lg font-semibold">导入课表</h2>
   <form onSubmit={(event)=>void submit(event)} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
    <label className="block text-sm font-medium">学期（无法自动识别时填写）
     <input className="mt-2 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-text-primary" value={semesterInput} maxLength={40} onChange={(event)=>setSemesterInput(event.target.value)} placeholder="如 2026-2027学年第1学期" />
    </label>
    <label className="block text-sm font-medium" htmlFor="personal-timetable-file">选择课表 Excel
     <input id="personal-timetable-file" className="mt-2 block w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm" type="file" accept=".xlsx" required onChange={(event)=>setFile(event.target.files?.[0]??null)} />
    </label>
    <button className="rounded-lg bg-accent-primary px-5 py-2.5 font-medium text-white disabled:opacity-60" type="submit" disabled={!file||uploading}>{uploading?"正在解析…":"上传并替换"}</button>
   </form>
   <p className="mt-3 text-xs text-text-secondary">优先识别 Excel 内的学期；同一学期再次导入将替换原课表。解析失败保留旧记录。文件限制 5 MB。</p>
   {error&&<p role="alert" className="mt-3 rounded-lg border border-red-300 p-3 text-sm text-red-600">{error}</p>}
   {success&&<p role="status" className="mt-3 text-sm text-emerald-700">{success}</p>}
  </section>
  {loading?<p className="text-text-secondary">正在加载个人课表…</p>:timetables.length===0?<p className="rounded-2xl border border-border-subtle p-6 text-text-secondary">暂无已导入的课表，请先上传 Excel。</p>:<>
   <section className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface-light p-4 sm:flex-row sm:items-end sm:justify-between sm:p-6">
    <label className="text-sm font-medium">已导入学期
     <select className="mt-2 block w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 sm:min-w-64" value={semester} onChange={(event)=>{setSemester(event.target.value);setWeek(1)}}>
      {timetables.map((entry)=><option key={entry.semester} value={entry.semester}>{entry.semester}</option>)}
     </select>
    </label>
    <div className="flex items-end gap-2">
     <button className="rounded-lg border border-border-subtle px-3 py-2 disabled:opacity-40" disabled={week<=1} onClick={()=>setWeek((value)=>Math.max(1,value-1))} type="button">上一周</button>
     <label className="text-sm font-medium">教学周
      <select className="mt-2 block rounded-lg border border-border-subtle bg-surface px-3 py-2" value={week} onChange={(event)=>setWeek(Number(event.target.value))}>
       {Array.from({length:Math.max(active?.maxWeek??1,1)},(_,index)=><option key={index+1} value={index+1}>第 {index+1} 周</option>)}
      </select>
     </label>
     <button className="rounded-lg border border-border-subtle px-3 py-2 disabled:opacity-40" disabled={week>=Math.max(active?.maxWeek??1,1)} onClick={()=>setWeek((value)=>Math.min(active?.maxWeek??1,value+1))} type="button">下一周</button>
    </div>
   </section>
   <section aria-label={`第${week}周课程安排`}>
    <p className="mb-3 text-sm text-text-secondary">第 {week} 周 · {weekCourses.length} 条已确定安排，按节次显示（不推算实际钟点）</p>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
     {days.map((label,index)=>{
      const courses=weekCourses.filter((item)=>item.weekday===index+1).sort((a,b)=>a.startSection-b.startSection);
      return <section key={label} className="min-w-0 rounded-xl border border-border-subtle bg-surface-light p-3">
       <h3 className="border-b border-border-subtle pb-2 text-sm font-semibold">{label}</h3>
       <div className="mt-3 space-y-2">
        {courses.length===0?<p className="text-xs text-text-secondary">无已确定课程</p>:courses.map((course,i)=><article key={`${course.code??course.name}-${course.startSection}-${i}`} className="rounded-lg border border-border-subtle bg-surface p-3">
         <p className="text-xs font-semibold text-accent-primary">第 {course.startSection}–{course.endSection} 节</p>
         <p className="mt-1 break-words text-sm font-semibold">{course.name}</p>
         {course.location&&<p className="mt-1 break-words text-xs text-text-secondary">{course.location}</p>}
        </article>)}
       </div>
      </section>;
     })}
    </div>
   </section>
   {active&&<section className="rounded-2xl border border-border-subtle bg-surface-light p-4 sm:p-6">
    <h2 className="text-lg font-semibold">待核对 · 未确定上课时间</h2>
    <p className="mt-1 text-sm text-text-secondary">以下课程不计入任何教学周的确定占用，请以教务通知为准。</p>
    {active.notes.length===0?<p className="mt-3 text-sm text-text-secondary">没有识别到未确定课程。</p>:<ul className="mt-3 grid gap-2 sm:grid-cols-2">{active.notes.map((note,i)=><li className="rounded-lg border border-border-subtle p-3 text-sm" key={i}><span className="font-medium">{note.name}</span><p className="mt-1 text-xs text-text-secondary">{note.reason}</p></li>)}</ul>}
    <p className="mt-3 text-xs text-text-secondary">上次导入：{new Date(active.updatedAt).toLocaleString("zh-CN")}</p>
   </section>}
  </>}
 </main>;
}
