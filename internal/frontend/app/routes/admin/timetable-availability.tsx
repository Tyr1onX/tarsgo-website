import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import {
  getAvailabilityOptions, getAvailabilityWeek, availabilityCounts, intervalStatus,
  type AvailabilityOptions, type AvailabilityWeek, type AvailabilityStatus,
} from "~/lib/availability-client";

export function meta() { return [{ title: "时间协调 | TARSGO" }]; }

const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const SECTIONS = Array.from({ length: 12 }, (_, i) => i + 1);
const CATEGORIES: { key: AvailabilityStatus; label: string }[] = [
  { key: "free", label: "无课程冲突" },
  { key: "conflict", label: "有课程冲突" },
  { key: "missing", label: "数据缺失" },
];
function missingReason(reason?: string) {
  if (reason === "semester_mismatch") return "未导入所选学期";
  if (reason === "invalid_data") return "课表数据异常";
  return "未上传课表";
}
function failMessage(error: unknown) { return error instanceof Error ? error.message : "读取失败"; }

export default function TimeCoordinationPage() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const [options, setOptions] = useState<AvailabilityOptions | null>(null);
  const [groupId, setGroupId] = useState(0);
  const [semester, setSemester] = useState("");
  const [week, setWeek] = useState(1);
  const [result, setResult] = useState<AvailabilityWeek | null>(null);
  const [memberId, setMemberId] = useState(0);
  const [weekday, setWeekday] = useState(1);
  const [section, setSection] = useState(1);
  const [endSection, setEndSection] = useState(1);
  const [category, setCategory] = useState<AvailabilityStatus>("free");
  const [loading, setLoading] = useState(true);
  const [querying, setQuerying] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const optionsRequest = useRef(0);

  useEffect(() => {
    const id = ++optionsRequest.current;
    setLoading(true); setOptions(null); setResult(null); setError("");
    void getAvailabilityOptions().then(value => {
      if (optionsRequest.current !== id) return;
      setOptions(value);
      setGroupId(value.groups[0]?.groupId ?? 0);
      setSemester(value.groups[0]?.semesters[0] ?? "");
    }).catch(cause => {
      if (optionsRequest.current === id) setError(failMessage(cause));
    }).finally(() => { if (optionsRequest.current === id) setLoading(false); });
    return () => { optionsRequest.current++; request.current++; };
  }, [currentUser.id]);

  useEffect(() => {
    const id = ++request.current;
    setResult(null); setQuerying(false);
    if (!groupId || !semester.trim()) return;
    setQuerying(true); setError("");
    void getAvailabilityWeek({ groupId, semester: semester.trim(), week }).then(value => {
      if (request.current === id) setResult(value);
    }).catch(cause => {
      if (request.current === id) setError(failMessage(cause));
    }).finally(() => { if (request.current === id) setQuerying(false); });
    return () => { request.current++; };
  }, [groupId, semester, week]);

  const group = options?.groups.find(g => g.groupId === groupId);
  const member = result?.members.find(m => m.userId === memberId);
  const totals = result ? availabilityCounts(result.members, weekday, section, endSection) : null;
  const listedMembers = result?.members.filter(person =>
    intervalStatus(person, weekday, section, endSection) === category) ?? [];
  const cellText = (day: number, period: number) => {
    if (!result) return "";
    if (member) {
      const status = intervalStatus(member, day, period, period);
      return status === "missing" ? "—" : status === "free" ? "空" : "课";
    }
    return String(availabilityCounts(result.members, day, period, period).free);
  };
  const cellClass = (day: number, period: number) => {
    if (!result) return "";
    if (member) {
      const status = intervalStatus(member, day, period, period);
      return status === "missing" ? "bg-slate-500/10 text-[var(--admin-muted)]" :
        status === "free" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-rose-500/15 text-rose-700 dark:text-rose-400";
    }
    const counts = availabilityCounts(result.members, day, period, period);
    if (!result.importedCount) return "bg-slate-500/10 text-[var(--admin-muted)]";
    return counts.free ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-rose-500/10 text-rose-700 dark:text-rose-400";
  };

  return <main className="admin-design mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6">
    <header>
      <h1 className="text-2xl font-semibold">时间协调</h1>
      <p className="mt-2 text-sm text-[var(--admin-muted)]">根据已导入课表查找无课程冲突时段，不代表成员承诺有空。</p>
    </header>
    {loading ? <p role="status">正在读取组别…</p> : null}
    {error ? <p role="alert" className="rounded-lg border border-red-300 p-3 text-sm text-red-600">{error}</p> : null}
    {options && options.groups.length === 0 ? <p className="p-4">没有可管理的组别。</p> : null}
    {options?.groups.length ? <>
      <section aria-label="时间筛选" className="grid gap-3 rounded-xl border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium">组别
          <select aria-label="组别" className="admin-field mt-2 w-full" value={groupId} onChange={e => {
            const id = Number(e.target.value);
            const selected = options.groups.find(g => g.groupId === id);
            setGroupId(id); setSemester(selected?.semesters[0] ?? ""); setMemberId(0);
          }}>{options.groups.map(g => <option key={g.groupId} value={g.groupId}>{g.name}</option>)}</select>
        </label>
        <label className="text-sm font-medium">学期
          <input className="admin-field mt-2 w-full" aria-label="学期" list="coordination-semesters" maxLength={40}
            value={semester} placeholder="选择或输入学期" onChange={e => setSemester(e.target.value)} />
          <datalist id="coordination-semesters">{(group?.semesters ?? []).map(s => <option key={s} value={s} />)}</datalist>
        </label>
        <label className="text-sm font-medium">教学周
          <select aria-label="教学周" className="admin-field mt-2 w-full" value={week} onChange={e => setWeek(Number(e.target.value))}>
            {Array.from({ length: 30 }, (_, i) => <option key={i + 1} value={i + 1}>第 {i + 1} 周</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">查看对象
          <select aria-label="查看对象" className="admin-field mt-2 w-full" value={memberId} onChange={e => setMemberId(Number(e.target.value))}>
            <option value={0}>全组空闲人数</option>
            {result?.members.map(person => <option key={person.userId} value={person.userId}>{person.name}</option>)}
          </select>
        </label>
      </section>
      {!semester.trim() ? <p className="text-sm text-[var(--admin-muted)]">请先选择学期。</p> : null}
      {querying ? <p role="status">正在分析整周时间…</p> : null}
      {result && !querying ? <>
        <section className="rounded-2xl border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{result.groupName} · 第 {result.week} 周 · {member ? member.name : "全组"}</h2>
            <span className="text-sm text-[var(--admin-muted)]">有效课表 {result.importedCount}/{result.totalCount} 人 · 缺失 {result.missingCount} 人</span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              <div className="grid grid-cols-[54px_repeat(7,minmax(0,1fr))] gap-1">
                <span className="py-2 text-center text-xs text-[var(--admin-muted)]">节次</span>
                {DAYS.map(day => <span key={day} className="py-2 text-center text-xs font-semibold">{day}</span>)}
                {SECTIONS.map(period => [
                  <span key={`section-${period}`} className="flex items-center justify-center text-xs text-[var(--admin-muted)]">第 {period} 节</span>,
                  ...DAYS.map((day, dayIndex) => {
                    const selected = weekday === dayIndex + 1 && section === period;
                    return <button key={`${day}-${period}`} type="button" aria-pressed={selected}
                      aria-label={`${day}第${period}节：${member ? cellText(dayIndex + 1, period) : `${cellText(dayIndex + 1, period)}人无课程冲突`}`}
                      onClick={() => { setWeekday(dayIndex + 1); setSection(period); setEndSection(period); setCategory("free"); }}
                      className={`min-h-9 rounded-md border text-sm font-medium tabular-nums ${cellClass(dayIndex + 1, period)} ${selected ? "border-[var(--admin-text)] ring-1 ring-[var(--admin-text)]" : "border-transparent"}`}>
                      {cellText(dayIndex + 1, period)}
                    </button>;
                  }),
                ])}
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-[var(--admin-muted)]">{member ? "绿：无课程冲突 · 红：有课程 · —：数据缺失" : "每格数字表示无课程冲突的人数，不包含未上传或数据异常的成员"}。点击时段查看名单。</p>
        </section>
        <section className="space-y-4 rounded-2xl border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">{DAYS[weekday - 1]} 第 {section}–{endSection} 节</h2>
            <label className="text-sm">结束节次
              <select aria-label="结束节次" className="admin-field ml-2" value={endSection} onChange={e => setEndSection(Number(e.target.value))}>
                {SECTIONS.filter(n => n >= section).map(n => <option key={n} value={n}>第 {n} 节</option>)}
              </select>
            </label>
          </div>
          {member ? <>
            <p className="font-medium">{intervalStatus(member, weekday, section, endSection) === "missing" ? missingReason(member.missingReason) :
              intervalStatus(member, weekday, section, endSection) === "free" ? "无课程冲突" : "存在课程冲突"}</p>
            {member.hasUncertainCourses ? <p className="text-sm text-amber-700 dark:text-amber-400">另有 {member.uncertainCourseCount} 门时间未确定课程，需另行确认。</p> : null}
          </> : <>
            <div className="flex flex-wrap gap-2" role="group" aria-label="成员类别">
              {CATEGORIES.map(item => <button key={item.key} type="button" aria-pressed={category === item.key}
                onClick={() => setCategory(item.key)} className={`rounded-lg border px-3 py-2 text-sm ${category === item.key ? "border-[var(--admin-text)] font-semibold" : "border-[var(--admin-border-subtle)]"}`}>
                {item.label}（{totals?.[item.key] ?? 0}）
              </button>)}
            </div>
            {listedMembers.length ? <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {listedMembers.map(person => <li key={person.userId} className="rounded-lg border border-[var(--admin-border-subtle)] p-3 text-sm">
                <span className="font-medium">{person.name}</span>
                {person.missingReason ? <p className="mt-1 text-xs text-[var(--admin-muted)]">{missingReason(person.missingReason)}</p> : null}
                {person.hasUncertainCourses ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">另有 {person.uncertainCourseCount} 门时间未确定课程</p> : null}
              </li>)}
            </ul> : <p className="text-sm text-[var(--admin-muted)]">该分类暂无成员。</p>}
          </>}
        </section>
      </> : null}
    </> : null}
  </main>;
}
