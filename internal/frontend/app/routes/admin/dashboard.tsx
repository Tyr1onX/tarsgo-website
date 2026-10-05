import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

import { ApiError } from "~/lib/api-client";
import { getUpcomingInterviewSessions } from "~/lib/admin-workbench";
import { getAdminDashboard, type AdminDashboardData } from "~/lib/dashboard-client";
import { listAdminInterviewSessions, listAdminRegistrations, type InterviewSession, type RegistrationSummary, type RecruitmentStatus } from "~/lib/registrations-client";

export function meta() {
  return [{ title: "招新工作台 | TARS-GO" }, { name: "description", content: "TARS-GO 当前招新处理工作台" }];
}

const autoRefreshIntervalMs = 30_000;
const statusItems: Array<{ status: RecruitmentStatus; label: string; countKey: keyof RegistrationSummary; hrefLabel: string }> = [
  { status: "pending_screening", label: "待初筛", countKey: "pendingScreening", hrefLabel: "进入初筛队列" },
  { status: "pending_interview", label: "待面试", countKey: "pendingInterview", hrefLabel: "进入面试队列" },
  { status: "admitted", label: "已录取", countKey: "admitted", hrefLabel: "查看已录取" },
  { status: "rejected", label: "未通过", countKey: "rejected", hrefLabel: "查看未通过" },
  { status: "withdrawn", label: "已撤回", countKey: "withdrawn", hrefLabel: "查看已撤回" },
];

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function ActivityList({ activities }: { activities: AdminDashboardData["recentActivities"] }) {
  if (!activities.length) return <div className="p-10 text-center text-sm text-gray-400">暂无业务动态</div>;
  return <div className="divide-y divide-white/[0.05]">{activities.slice(0, 8).map((item) => <div key={item.id} className="flex items-center gap-4 px-5 py-4"><div className="chip-gradient-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-medium text-primary-200">{item.actorName.charAt(0) || "系"}</div><div className="min-w-0 flex-1"><div className="text-sm"><span className="font-medium text-white">{item.actorName}</span><span className="text-gray-400"> {item.message}</span></div><div className="mt-0.5 text-xs text-gray-500">{formatTime(item.occurredAt)}</div></div>{item.groupName && <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs text-gray-400">{item.groupName}</span>}</div>)}</div>;
}

export default function AdminDashboard() {
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [summary, setSummary] = useState<RegistrationSummary | null>(null);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const hasData = useRef(false);
  const requestInFlight = useRef(false);

  const load = useCallback(async (initial: boolean) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    const showLoading = initial || !hasData.current;
    if (showLoading) setLoading(true);
    setError("");
    setRefreshError("");
    try {
      const [nextDashboard, registrations, nextSessions] = await Promise.all([
        getAdminDashboard(),
        listAdminRegistrations({ page: 1, pageSize: 1 }),
        listAdminInterviewSessions(),
      ]);
      setDashboard(nextDashboard);
      setSummary(registrations.summary);
      setSessions(nextSessions);
      hasData.current = true;
    } catch (cause) {
      const message = cause instanceof ApiError ? cause.message : "工作台数据加载失败";
      if (showLoading) setError(message); else setRefreshError(message);
    } finally {
      requestInFlight.current = false;
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load(false);
    };
    const timer = window.setInterval(refreshWhenVisible, autoRefreshIntervalMs);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [load]);

  const upcomingSessions = useMemo(() => getUpcomingInterviewSessions(sessions), [sessions]);
  if (loading) return <div className="space-y-6"><div className="h-16 w-64 animate-pulse rounded-2xl bg-white/[0.04]" /><div className="grid gap-4 lg:grid-cols-2">{[1, 2].map((key) => <div key={key} className="h-40 animate-pulse rounded-2xl bg-white/[0.04]" />)}</div><div className="h-72 animate-pulse rounded-2xl bg-white/[0.04]" /></div>;
  if (error) return <div className="glass-panel rounded-2xl border border-red-500/20 p-12 text-center"><p className="text-red-400">{error}</p><button type="button" onClick={() => void load(true)} className="btn-gradient mt-4 rounded-xl px-4 py-2 text-sm">重新加载</button></div>;

  return <div className="space-y-7">
    <header className="motion-fade-up flex flex-wrap items-end justify-between gap-4"><div><div className="text-xs font-medium uppercase tracking-[0.2em] text-primary-300">Recruitment</div><h1 className="mt-2 text-2xl font-bold">招新工作台</h1><p className="mt-1 text-sm text-gray-400">先处理候选人初筛与面试安排，再查看近期业务动态。</p></div><Link to="/dashboard/admin/registrations" className="btn-gradient rounded-xl px-4 py-2.5 text-sm font-medium">打开报名处理</Link></header>
    {refreshError && <div role="status" className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl border-amber-500/25 px-4 py-3 text-sm"><span className="text-amber-300">自动刷新失败：{refreshError}，当前仍显示上次成功获取的数据。</span><button type="button" onClick={() => void load(false)} className="text-amber-200 hover:text-white">重试</button></div>}

    <section aria-label="当前待处理招新阶段" className="grid gap-4 lg:grid-cols-2">
      {statusItems.slice(0, 2).map((item) => <Link key={item.status} to={`/dashboard/admin/registrations?status=${item.status}`} className="glass-panel glass-card group rounded-2xl border border-primary-400/15 p-5 transition hover:border-primary-300/35"><div className="flex items-start justify-between gap-4"><div><div className="text-sm font-medium text-gray-300">{item.label}</div><div className="mt-2 text-4xl font-bold tabular-nums text-white">{summary?.[item.countKey] ?? 0}</div><div className="mt-1 text-sm text-gray-500">位候选人</div></div><span className="chip-gradient-soft flex h-11 w-11 items-center justify-center rounded-xl text-primary-200" aria-hidden="true">{item.status === "pending_screening" ? "初" : "面"}</span></div><div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4 text-sm"><span className="text-primary-200">{item.hrefLabel}</span><span className="text-gray-500 transition group-hover:translate-x-1 group-hover:text-white" aria-hidden="true">→</span></div></Link>)}
    </section>

    <section aria-label="招新结果阶段" className="glass-panel rounded-2xl px-4 py-4 sm:px-5"><div className="mb-3 flex items-center justify-between gap-4"><h2 className="font-semibold">流程结果</h2><Link to="/dashboard/admin/registrations" className="text-xs text-gray-400 hover:text-white">全部报名 →</Link></div><div className="grid grid-cols-3 gap-2 sm:gap-3">{statusItems.slice(2).map((item) => <Link key={item.status} to={`/dashboard/admin/registrations?status=${item.status}`} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 transition hover:bg-white/[0.05]"><div className="text-xs text-gray-500">{item.label}</div><div className="mt-1 text-xl font-semibold tabular-nums text-gray-200">{summary?.[item.countKey] ?? 0}</div></Link>)}</div></section>

    <section aria-label="当前及近期面试场次" className="glass-panel overflow-hidden rounded-2xl"><div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><h2 className="font-semibold">当前 / 近期面试场次</h2><p className="mt-1 text-xs text-gray-500">显示已启用且今天至未来 14 天内的场次</p></div><Link to="/dashboard/admin/registrations#interview-sessions" className="text-sm text-primary-200 hover:text-white">管理场次 →</Link></div><div className="divider-gradient mx-5" />{upcomingSessions.length === 0 ? <div className="px-5 py-8 text-center text-sm text-gray-400">暂无近期开放场次</div> : <div className="divide-y divide-white/[0.05]">{upcomingSessions.slice(0, 5).map((session) => <InterviewSessionRow key={session.id} session={session} />)}</div>}</section>

    <section aria-label="最近业务动态" className="glass-panel overflow-hidden rounded-2xl"><div className="flex items-center justify-between gap-4 px-5 py-4"><h2 className="font-semibold">最近业务动态</h2><Link to="/dashboard/admin/statistics" className="text-sm text-gray-400 hover:text-white">查看统计 →</Link></div><div className="divider-gradient mx-5" /><ActivityList activities={dashboard?.recentActivities ?? []} /></section>
  </div>;
}

function InterviewSessionRow({ session }: { session: InterviewSession }) {
  return <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4"><div className="min-w-32"><div className="text-sm font-medium text-white">{session.date} · {session.label}</div><div className="mt-1 text-xs text-gray-400">{session.startTime}–{session.endTime}</div></div><div className="min-w-0 flex-1 text-sm text-gray-300">{session.location || "地点待定"}</div><div className="text-xs text-gray-400">已确认 {session.confirmedCount} 人</div></div>;
}
