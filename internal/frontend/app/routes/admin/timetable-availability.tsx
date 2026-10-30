import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import {
  getAvailabilityOptions, getAvailabilityWeek, availabilityCounts, availabilityFreeRatio, filterAvailabilityMembers, intervalStatus,
  type AvailabilityOptions, type AvailabilityWeek, type AvailabilityStatus,
} from "~/lib/availability-client";
import { resolveCurrentTeachingWeek } from "~/lib/academic-term-calendar";

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
  if (reason === "uncertain_courses") return "课表含时间未确定课程";
  return "未上传课表";
}
function statusLabel(status: AvailabilityStatus) {
  if (status === "free") return "无课程冲突";
  if (status === "conflict") return "有课程冲突";
  return "数据缺失";
}
function failMessage(error: unknown) { return error instanceof Error ? error.message : "读取失败"; }

export default function TimeCoordinationPage() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const [openedAt] = useState(() => new Date());
  const [options, setOptions] = useState<AvailabilityOptions | null>(null);
  const [groupId, setGroupId] = useState(0);
  const [semester, setSemester] = useState("");
  const [week, setWeek] = useState(0);
  const [result, setResult] = useState<AvailabilityWeek | null>(null);
  const [memberId, setMemberId] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<{ weekday: number; section: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [querying, setQuerying] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const optionsRequest = useRef(0);
  const closeButton = useRef<HTMLButtonElement>(null);
  const calendarWeek = semester.trim() ? resolveCurrentTeachingWeek(semester, openedAt) : null;
  const weekNotice = calendarWeek?.status === "unconfigured"
    ? `该学期尚未配置第一教学周日期，无法自动定位。请在统一教学周配置中补充日期；也可手动选择教学周${week > 0 ? `，当前查看第 ${week} 周` : ""}。`
    : calendarWeek?.status === "before"
      ? `当前日期早于本学期首周（${calendarWeek.firstWeekStart}），暂按第 ${week || 1} 周查看。`
      : calendarWeek?.status === "after"
        ? `当前学期已结束（${calendarWeek.lastWeekEnd}），暂按第 ${week || calendarWeek.teachingWeekCount} 周查看。`
        : calendarWeek?.week
          ? week === calendarWeek.week
            ? `已按北京时间自动定位到第 ${calendarWeek.week} 周。`
            : `当前日期对应第 ${calendarWeek.week} 周，当前查看第 ${week} 周。`
          : "";
  const weekNoticeTone = calendarWeek?.status === "current" ? "bg-slate-500/10" : "bg-amber-500/10";

  useEffect(() => {
    if (!selectedSlot) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedSlot(null);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    closeButton.current?.focus();
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [selectedSlot]);

  useEffect(() => {
    const id = ++optionsRequest.current;
    setLoading(true); setOptions(null); setResult(null); setError("");
    void getAvailabilityOptions().then(value => {
      if (optionsRequest.current !== id) return;
      setOptions(value);
      const initialGroup = value.groups[0];
      const initialSemester = initialGroup?.semesters[0] ?? "";
      setGroupId(initialGroup?.groupId ?? 0);
      setSemester(initialSemester);
      setWeek(initialSemester ? resolveCurrentTeachingWeek(initialSemester, openedAt).week ?? 0 : 0);
    }).catch(cause => {
      if (optionsRequest.current === id) setError(failMessage(cause));
    }).finally(() => { if (optionsRequest.current === id) setLoading(false); });
    return () => { optionsRequest.current++; request.current++; };
  }, [currentUser.id, openedAt]);

  useEffect(() => {
    const id = ++request.current;
    setResult(null); setQuerying(false); setMemberId(0); setSelectedSlot(null);
    if (!groupId || !semester.trim() || week < 1) return;
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
  const selectedCounts = result && selectedSlot
    ? availabilityCounts(result.members, selectedSlot.weekday, selectedSlot.section, selectedSlot.section)
    : null;
  const cellText = (day: number, period: number) => {
    if (!result) return "";
    if (member) {
      const status = intervalStatus(member, day, period, period);
      return status === "missing" ? "缺失" : status === "free" ? "无冲突" : "有课程";
    }
    if (availabilityFreeRatio(result.members, day, period, period) === null) return "—";
    return String(availabilityCounts(result.members, day, period, period).free);
  };
  const cellClass = (day: number, period: number) => {
    if (!result) return "";
    if (member) {
      const status = intervalStatus(member, day, period, period);
      return status === "missing" ? "bg-slate-500/10 text-[var(--admin-muted)]" :
        status === "free" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-rose-500/15 text-rose-700 dark:text-rose-400";
    }
    if (availabilityFreeRatio(result.members, day, period, period) === null) return "bg-slate-500/10 text-[var(--admin-muted)]";
    return "text-[var(--admin-text)]";
  };
  const cellStyle = (day: number, period: number) => {
    if (!result || member) return undefined;
    const ratio = availabilityFreeRatio(result.members, day, period, period);
    return ratio === null ? undefined : { backgroundColor: `rgb(5 150 105 / ${0.08 + ratio * 0.58})` };
  };

  return <main className="admin-design mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6">
    <header>
      <h1 className="text-2xl font-semibold">时间协调</h1>
      <p className="mt-2 text-sm text-[var(--admin-muted)]">无课程冲突仅表示课表中未发现时间重叠，不代表成员已确认可以参加。</p>
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
            const nextSemester = selected?.semesters[0] ?? "";
            setGroupId(id); setSemester(nextSemester); setWeek(nextSemester ? resolveCurrentTeachingWeek(nextSemester, openedAt).week ?? 0 : 0); setMemberId(0);
          }}>{options.groups.map(g => <option key={g.groupId} value={g.groupId}>{g.name}</option>)}</select>
        </label>
        <label className="text-sm font-medium">学期
          <input className="admin-field mt-2 w-full" aria-label="学期" list="coordination-semesters" maxLength={40}
            value={semester} placeholder="选择或输入学期" onChange={e => {
              const nextSemester = e.target.value;
              setSemester(nextSemester); setWeek(nextSemester.trim() ? resolveCurrentTeachingWeek(nextSemester, openedAt).week ?? 0 : 0);
            }} />
          <datalist id="coordination-semesters">{(group?.semesters ?? []).map(s => <option key={s} value={s} />)}</datalist>
        </label>
        <label className="text-sm font-medium">教学周
          <select aria-label="教学周" className="admin-field mt-2 w-full" value={week} onChange={e => setWeek(Number(e.target.value))}>
            {week === 0 ? <option value={0}>请选择教学周</option> : null}
            {Array.from({ length: 30 }, (_, i) => <option key={i + 1} value={i + 1}>第 {i + 1} 周</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">查看对象
          <select aria-label="查看对象" className="admin-field mt-2 w-full" value={memberId} onChange={e => setMemberId(Number(e.target.value))}>
            <option value={0}>全组</option>
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
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2" aria-label="组内课表概况">
            {[
              ["组内成员", result.totalCount],
              ["有效课表", result.importedCount],
              ["数据缺失", result.missingCount],
            ].map(([label, count]) => <div key={label} className="rounded-lg border border-[var(--admin-border-subtle)] px-3 py-2">
              <p className="text-xs text-[var(--admin-muted)]">{label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{count}<span className="ml-1 text-xs font-normal text-[var(--admin-muted)]">人</span></p>
            </div>)}
          </div>
          {result.totalCount === 0 ? <p role="status" className="mb-3 rounded-lg bg-slate-500/10 p-3 text-sm text-[var(--admin-muted)]">组内暂无可统计成员。</p> : result.importedCount === 0 ?
            <p role="status" className="mb-3 rounded-lg bg-amber-500/10 p-3 text-sm">当前学期没有有效课表，无法统计无课程冲突人数。请在「个人资料 → 课程时间」导入该学期课表。</p> : result.missingCount > 0 ?
            <p role="status" className="mb-3 rounded-lg bg-amber-500/10 p-3 text-sm">无课程冲突人数只按有效课表成员统计，数据缺失成员不会计入无课程冲突。</p> : null}
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              <div className="grid grid-cols-[54px_repeat(7,minmax(0,1fr))] gap-1">
                <span className="py-2 text-center text-xs text-[var(--admin-muted)]">节次</span>
                {DAYS.map(day => <span key={day} className="py-2 text-center text-xs font-semibold">{day}</span>)}
                {SECTIONS.map(period => [
                  <span key={`section-${period}`} className="flex items-center justify-center text-xs text-[var(--admin-muted)]">第 {period} 节</span>,
                  ...DAYS.map((day, dayIndex) => {
                    const label = member
                      ? statusLabel(intervalStatus(member, dayIndex + 1, period, period))
                      : cellText(dayIndex + 1, period) === "—"
                        ? "暂无有效课表，不能统计无课程冲突人数"
                        : `${cellText(dayIndex + 1, period)}人无课程冲突`;
                    return <button key={`${day}-${period}`} type="button" aria-haspopup={member ? undefined : "dialog"}
                      aria-label={`${day}第${period}节：${label}`}
                      onClick={() => { if (!member) setSelectedSlot({ weekday: dayIndex + 1, section: period }); }}
                      style={cellStyle(dayIndex + 1, period)}
                      className={`min-h-9 rounded-md border border-transparent text-sm font-medium tabular-nums ${cellClass(dayIndex + 1, period)}`}>
                      {cellText(dayIndex + 1, period)}
                    </button>;
                  }),
                ])}
              </div>
            </div>
          </div>
          {member ? <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--admin-muted)]" aria-label="成员时段图例">
            <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/30" />无课程冲突</span>
            <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-rose-500/25" />有课程冲突</span>
            <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-slate-500/20" />数据缺失</span>
          </div> : <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--admin-muted)]" aria-label="无课程冲突比例图例">
            <span>无课程冲突比例</span><span>低</span>
            <span className="h-2.5 w-24 rounded-sm" aria-hidden="true" style={{ background: "linear-gradient(90deg, rgb(5 150 105 / 0.08), rgb(5 150 105 / 0.66))" }} />
            <span>高</span><span className="sm:ml-2">数字表示无课程冲突人数</span>
          </div>}
        </section>
      </> : null}
      {weekNotice ? <p role="status" className={`rounded-lg ${weekNoticeTone} p-3 text-sm text-[var(--admin-muted)]`}>{weekNotice}</p> : null}
      {options && semester.trim() && week === 0 && calendarWeek?.status === "unconfigured" ? <p className="text-sm text-[var(--admin-muted)]">选择教学周后可继续查看该学期课表统计。</p> : null}
      {result && selectedSlot && !member && selectedCounts && typeof document !== "undefined" ? createPortal(<div
        className="admin-design fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-3 sm:p-6"
        role="presentation"
        onClick={event => { if (event.target === event.currentTarget) setSelectedSlot(null); }}
      >
        <section role="dialog" aria-modal="true" aria-labelledby="availability-slot-title"
          className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] p-4 shadow-2xl sm:p-6">
          <header className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 id="availability-slot-title" className="text-lg font-semibold">{DAYS[selectedSlot.weekday - 1]} 第 {selectedSlot.section} 节 · 成员详情</h2>
              <p className="mt-1 text-sm text-[var(--admin-muted)]">第 {result.week} 周 · 仅显示课表冲突状态</p>
            </div>
            <button ref={closeButton} type="button" aria-label="关闭时段详情" onClick={() => setSelectedSlot(null)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--admin-border-subtle)] text-xl">×</button>
          </header>
          <div className="grid gap-3 sm:grid-cols-3">
            {CATEGORIES.map(item => {
              const people = filterAvailabilityMembers(result.members, selectedSlot.weekday, selectedSlot.section, selectedSlot.section, item.key);
              const accent = item.key === "free" ? "border-emerald-500/30 bg-emerald-500/5" : item.key === "conflict" ? "border-rose-500/30 bg-rose-500/5" : "border-slate-500/30 bg-slate-500/5";
              return <section key={item.key} className={`rounded-xl border p-3 ${accent}`} aria-label={item.label}>
                <h3 className="mb-2 text-sm font-semibold">{item.label}（{selectedCounts[item.key]}）</h3>
                {people.length ? <ul className="space-y-2 text-sm">
                  {people.map(person => <li key={person.userId} className="border-t border-[var(--admin-border-subtle)] pt-2 first:border-0 first:pt-0">
                    <span className="font-medium">{person.name}</span>
                    {person.missingReason ? <p className="mt-1 text-xs text-[var(--admin-muted)]">{missingReason(person.missingReason)}</p> : null}
                    {person.hasUncertainCourses ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{person.uncertainCourseCount} 门时间未确定课程，已排除在无冲突统计外</p> : null}
                  </li>)}
                </ul> : <p className="text-sm text-[var(--admin-muted)]">暂无成员</p>}
              </section>;
            })}
          </div>
        </section>
      </div>, document.body) : null}
    </> : null}
  </main>;
}
