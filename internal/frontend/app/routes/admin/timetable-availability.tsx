import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import {
  getAvailabilityOptions, getAvailabilityWeek, availabilityCounts, availabilityFreeRatio, availabilityHeatLevel, filterAvailabilityMembers, intervalStatus,
  clearAllTimetables, getTimetableCleanupPreview,
  type AvailabilityOptions, type AvailabilityWeek, type AvailabilityStatus, type AvailabilityHeatLevel,
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
  if (reason === "invalid_data") return "课表数据异常";
  return "未上传课表";
}
function statusLabel(status: AvailabilityStatus) {
  if (status === "free") return "无课程冲突";
  if (status === "conflict") return "有课程冲突";
  return "数据缺失";
}
function failMessage(error: unknown) { return error instanceof Error ? error.message : "读取失败"; }
function ratioLabel(ratio: number | null) { return ratio === null ? "暂无有效课表" : `${Math.round(ratio * 100)}%`; }

const HEAT_LEVEL_CLASSES: Record<AvailabilityHeatLevel, string> = {
  low: "availability-heatmap__level--low",
  medium: "availability-heatmap__level--medium",
  high: "availability-heatmap__level--high",
};

export default function TimeCoordinationPage() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const [openedAt] = useState(() => new Date());
  const [options, setOptions] = useState<AvailabilityOptions | null>(null);
  const [groupId, setGroupId] = useState(0);
  const [week, setWeek] = useState(0);
  const [result, setResult] = useState<AvailabilityWeek | null>(null);
  const [memberId, setMemberId] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<{ weekday: number; section: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [querying, setQuerying] = useState(false);
  const [error, setError] = useState("");
  const [clearPreview, setClearPreview] = useState<number | null>(null);
  const [clearLoading, setClearLoading] = useState(false);
  const [clearError, setClearError] = useState("");
  const [clearNotice, setClearNotice] = useState("");
  const [clearRevision, setClearRevision] = useState(0);
  const request = useRef(0);
  const optionsRequest = useRef(0);
  const closeButton = useRef<HTMLButtonElement>(null);
  const calendarWeek = options ? resolveCurrentTeachingWeek(options.firstWeekStart, openedAt, options.teachingWeekCount) : null;
  const weekNotice = calendarWeek?.status === "unconfigured"
    ? `当前学期教学周配置无效，暂按手动选择的第 ${week || 1} 周查看。`
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
      setGroupId(value.defaultGroupId);
      setWeek(resolveCurrentTeachingWeek(value.firstWeekStart, openedAt, value.teachingWeekCount).week ?? 0);
    }).catch(cause => {
      if (optionsRequest.current === id) setError(failMessage(cause));
    }).finally(() => { if (optionsRequest.current === id) setLoading(false); });
    return () => { optionsRequest.current++; request.current++; };
  }, [currentUser.id, openedAt]);

  useEffect(() => {
    const id = ++request.current;
    setResult(null); setQuerying(false); setMemberId(0); setSelectedSlot(null);
    if (week < 1) return;
    setQuerying(true); setError("");
    void getAvailabilityWeek({ groupId, week }).then(value => {
      if (request.current === id) setResult(value);
    }).catch(cause => {
      if (request.current === id) setError(failMessage(cause));
    }).finally(() => { if (request.current === id) setQuerying(false); });
    return () => { request.current++; };
  }, [groupId, week, clearRevision]);

  const member = result?.members.find(m => m.userId === memberId);
  const isSuperAdmin = currentUser.role.name === "super_admin";
  const selectedCounts = result && selectedSlot
    ? availabilityCounts(result.members, selectedSlot.weekday, selectedSlot.section, selectedSlot.section)
    : null;
  const selectedValidCount = selectedCounts ? selectedCounts.free + selectedCounts.conflict : 0;
  const selectedRatio = selectedValidCount > 0 && selectedCounts ? selectedCounts.free / selectedValidCount : null;
  const slotSummary = (day: number, period: number) => {
    const counts = availabilityCounts(result?.members ?? [], day, period, period);
    const validCount = counts.free + counts.conflict;
    const ratio = validCount > 0 ? counts.free / validCount : null;
    return `${DAYS[day - 1]}第${period}节：无课程冲突 ${counts.free} 人，有效课表 ${validCount} 人，空闲比例 ${ratioLabel(ratio)}`;
  };
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
      return status === "missing" ? "availability-heatmap__member-cell--missing" :
        status === "free" ? "availability-heatmap__member-cell--free" : "availability-heatmap__member-cell--conflict";
    }
    const level = availabilityHeatLevel(availabilityFreeRatio(result.members, day, period, period));
    return level ? HEAT_LEVEL_CLASSES[level] : "availability-heatmap__cell--empty";
  };

  async function openClearConfirmation() {
    setClearError("");
    setClearNotice("");
    setClearLoading(true);
    try {
      const preview = await getTimetableCleanupPreview();
      setClearPreview(preview.count);
    } catch (cause) {
      setClearError(failMessage(cause));
    } finally {
      setClearLoading(false);
    }
  }

  async function confirmClearAll() {
    if (clearPreview === null || clearLoading) return;
    setClearLoading(true);
    setClearError("");
    try {
      const result = await clearAllTimetables(clearPreview);
      setClearPreview(null);
      setClearNotice(`已清空 ${result.deletedCount} 份课表`);
      setClearRevision(value => value + 1);
    } catch (cause) {
      setClearPreview(null);
      setClearError(failMessage(cause));
    } finally {
      setClearLoading(false);
    }
  }

  return <main className="admin-design mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">时间协调</h1>
        <p className="mt-2 text-sm text-[var(--admin-muted)]">当前学期：{options?.currentSemester ?? "读取中"}</p>
        <p className="mt-1 text-sm text-[var(--admin-muted)]">无课程冲突仅表示课表中未发现时间重叠，不代表成员已确认可以参加。</p>
      </div>
      {isSuperAdmin ? <button type="button" className="btn-glass rounded-lg px-4 py-2 text-sm" disabled={clearLoading} onClick={() => void openClearConfirmation()}>
        {clearLoading && clearPreview === null ? "读取课表数量…" : "清空课表"}
      </button> : null}
    </header>
    {clearError ? <p role="alert" className="rounded-lg border border-red-300 p-3 text-sm text-red-600">{clearError}</p> : null}
    {clearNotice ? <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-sm">{clearNotice}</p> : null}
    {loading ? <p role="status">正在读取组别…</p> : null}
    {error ? <p role="alert" className="rounded-lg border border-red-300 p-3 text-sm text-red-600">{error}</p> : null}
    {options && options.groups.length === 0 ? <p className="p-4">没有可统计的组别。</p> : null}
    {options ? <>
      <section aria-label="时间筛选" className="grid gap-3 rounded-xl border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-medium">组别
          <select aria-label="组别" className="admin-field mt-2 w-full" value={groupId} onChange={e => {
            const id = Number(e.target.value);
            setGroupId(id); setMemberId(0);
          }}><option value={0}>全部成员</option>{options.groups.map(g => <option key={g.groupId} value={g.groupId}>{g.name}</option>)}</select>
        </label>
        <label className="text-sm font-medium">教学周
          <select aria-label="教学周" className="admin-field mt-2 w-full" value={week} onChange={e => setWeek(Number(e.target.value))}>
            {week === 0 ? <option value={0}>请选择教学周</option> : null}
            {Array.from({ length: options.teachingWeekCount }, (_, i) => <option key={i + 1} value={i + 1}>第 {i + 1} 周</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">查看对象
          <select aria-label="查看对象" className="admin-field mt-2 w-full" value={memberId} onChange={e => setMemberId(Number(e.target.value))}>
            <option value={0}>全组</option>
            {result?.members.map(person => <option key={person.userId} value={person.userId}>{person.name}</option>)}
          </select>
        </label>
      </section>
      {querying ? <p role="status">正在分析整周时间…</p> : null}
      {result && !querying ? <>
        <section className="availability-heatmap rounded-2xl border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{result.groupId === 0 ? "全部成员" : result.groupName} · 第 {result.week} 周{member ? ` · ${member.name}` : ""}</h2>
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2" aria-label="成员课表概况">
            {[
              ["统计成员", result.totalCount],
              ["有效课表", result.importedCount],
              ["数据缺失", result.missingCount],
            ].map(([label, count]) => <div key={label} className="rounded-lg border border-[var(--admin-border-subtle)] px-3 py-2">
              <p className="text-xs text-[var(--admin-muted)]">{label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{count}<span className="ml-1 text-xs font-normal text-[var(--admin-muted)]">人</span></p>
            </div>)}
          </div>
          {result.totalCount === 0 ? <p role="status" className="mb-3 rounded-lg bg-slate-500/10 p-3 text-sm text-[var(--admin-muted)]">组内暂无可统计成员。</p> : result.importedCount === 0 ?
            <p role="status" className="mb-3 rounded-lg bg-amber-500/10 p-3 text-sm">当前学期没有有效课表，无法统计无课程冲突人数。请成员在「个人资料 → 课程时间」重新导入课表。</p> : result.missingCount > 0 ?
            <p role="status" className="mb-3 rounded-lg bg-amber-500/10 p-3 text-sm">无课程冲突人数只按有效课表成员统计，数据缺失成员不会计入无课程冲突。</p> : null}
          <div className="overflow-x-auto">
            <div className="min-w-0">
              <div className="grid grid-cols-[38px_repeat(7,minmax(34px,1fr))] gap-0.5 sm:grid-cols-[54px_repeat(7,minmax(0,1fr))] sm:gap-1">
                <span className="py-2 text-center text-[10px] text-[var(--admin-muted)] sm:text-xs">节次</span>
                {DAYS.map(day => <span key={day} className="py-2 text-center text-xs font-semibold">{day}</span>)}
                {SECTIONS.map(period => [
                  <span key={`section-${period}`} className="flex items-center justify-center text-[10px] text-[var(--admin-muted)] sm:text-xs">第{period}节</span>,
                  ...DAYS.map((day, dayIndex) => {
                    const details = member
                      ? `${day}第${period}节：${statusLabel(intervalStatus(member, dayIndex + 1, period, period))}`
                      : slotSummary(dayIndex + 1, period);
                    return <button key={`${day}-${period}`} type="button" aria-haspopup={member ? undefined : "dialog"}
                      aria-label={details} title={details}
                      onClick={() => { if (!member) setSelectedSlot({ weekday: dayIndex + 1, section: period }); }}
                      className={`availability-heatmap__cell min-h-9 min-w-0 rounded-md border px-0.5 text-xs font-semibold tabular-nums sm:text-sm ${cellClass(dayIndex + 1, period)}`}>
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
          </div> : <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[var(--admin-muted)]" aria-label="无课程冲突比例分级">
            <span className="inline-flex items-center gap-1.5"><span className={`availability-heatmap__swatch ${HEAT_LEVEL_CLASSES.low}`} aria-hidden="true" />低 &lt; 1/3</span>
            <span className="inline-flex items-center gap-1.5"><span className={`availability-heatmap__swatch ${HEAT_LEVEL_CLASSES.medium}`} aria-hidden="true" />中 1/3–&lt;2/3</span>
            <span className="inline-flex items-center gap-1.5"><span className={`availability-heatmap__swatch ${HEAT_LEVEL_CLASSES.high}`} aria-hidden="true" />高 ≥ 2/3</span>
            <span>数字为无课程冲突人数</span>
          </div>}
        </section>
      </> : null}
      {weekNotice ? <p role="status" className={`rounded-lg ${weekNoticeTone} p-3 text-sm text-[var(--admin-muted)]`}>{weekNotice}</p> : null}
      {options && week === 0 && calendarWeek?.status === "unconfigured" ? <p className="text-sm text-[var(--admin-muted)]">选择教学周后可继续查看当前学期课表统计。</p> : null}
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
              <p className="mt-1 text-sm text-[var(--admin-muted)]">第 {result.week} 周 · 无冲突 {selectedCounts.free} 人 / 有效课表 {selectedValidCount} 人 · 空闲比例 {ratioLabel(selectedRatio)}</p>
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
                    {person.hasUncertainCourses ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{person.uncertainCourseCount} 门时间未确定课程未计入时段统计</p> : null}
                  </li>)}
                </ul> : <p className="text-sm text-[var(--admin-muted)]">暂无成员</p>}
              </section>;
            })}
          </div>
        </section>
      </div>, document.body) : null}
    </> : null}
    {clearPreview !== null && isSuperAdmin && typeof document !== "undefined" ? createPortal(<div
      className="admin-design fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-3 sm:p-6"
      role="presentation"
      onClick={event => { if (event.target === event.currentTarget && !clearLoading) setClearPreview(null); }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="clear-timetables-title"
        className="w-full max-w-md rounded-2xl border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] p-5 shadow-2xl sm:p-6">
        <h2 id="clear-timetables-title" className="text-lg font-semibold">清空全站课表</h2>
        <p className="mt-3 text-sm text-[var(--admin-muted)]">即将删除全站 <strong className="text-[var(--admin-text)]">{clearPreview}</strong> 份课表数据。此操作不会删除账号、组别、作业或其他业务数据。</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={clearLoading} onClick={() => setClearPreview(null)} className="btn-glass rounded-lg px-4 py-2 text-sm">取消</button>
          <button type="button" disabled={clearLoading} onClick={() => void confirmClearAll()} className="btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-60">{clearLoading ? "正在清空…" : "确认清空"}</button>
        </div>
      </section>
    </div>, document.body) : null}
  </main>;
}
