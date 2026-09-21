import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiError } from "~/lib/api-client";
import { getAdminDashboard, type AdminDashboardData } from "~/lib/dashboard-client";

export function meta() {
  return [{ title: "数据面板 | TARS-GO" }, { name: "description", content: "TARS-GO 吉甲大师战队统一工作台数据面板" }];
}

const cardMeta = [
  { key: "totalUsers", label: "总用户数", icon: "users", color: "primary" },
  { key: "newUsersThisMonth", label: "本月新增", icon: "user-plus", color: "accent" },
  { key: "pendingRegistrations", label: "待审核报名", icon: "clipboard", color: "amber" },
  { key: "activeTechnicalGroups", label: "技术组别", icon: "grid", color: "sky" },
] as const;
const colors = [
  "bg-gradient-to-r from-primary-500 to-violet-450",
  "bg-gradient-to-r from-emerald-500 to-teal-400",
  "bg-gradient-to-r from-sky-500 to-cyan-400",
  "bg-gradient-to-r from-violet-450 to-fuchsia-400",
  "bg-gradient-to-r from-amber-500 to-orange-400",
  "bg-gradient-to-r from-rose-500 to-pink-400",
  "bg-gradient-to-r from-lime-500 to-emerald-400",
];
const autoRefreshIntervalMs = 30_000;
const colorMap: Record<string, { text: string; iconBg: string }> = {
  primary: { text: "text-primary-300", iconBg: "chip-gradient-soft" }, accent: { text: "text-emerald-300", iconBg: "bg-emerald-500/15 border border-emerald-400/20" }, amber: { text: "text-amber-300", iconBg: "bg-amber-500/15 border border-amber-400/20" }, sky: { text: "text-sky-300", iconBg: "bg-sky-500/15 border border-sky-400/20" },
};

function StatIcon({ type }: { type: string }) {
  if (type === "users") return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 21a6 6 0 0 0-12 0m12 0h4.5v-1.5a4.5 4.5 0 0 0-6.2-4.16M16.5 21h-12M13.5 7.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Zm3-3a3 3 0 1 1 0 6" /></svg>;
  if (type === "user-plus") return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.5a6 6 0 0 0-12 0m6-9a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm9-3v6m3-3h-6" /></svg>;
  if (type === "clipboard") return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5.25h6m-6 6h6m-6 4.5h3.75M7.5 3.75h9A2.25 2.25 0 0 1 18.75 6v14.25H5.25V6A2.25 2.25 0 0 1 7.5 3.75Z" /></svg>;
  return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75h6.75v6.75H3.75V3.75Zm9.75 0h6.75v6.75H13.5V3.75Zm-9.75 9.75h6.75v6.75H3.75V13.5Zm9.75 0h6.75v6.75H13.5V13.5Z" /></svg>;
}

function formatTime(value: string) {
  const date = new Date(value); if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export default function Dashboard() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const hasData = useRef(false);
  const requestController = useRef<AbortController | null>(null);
  const load = useCallback(async (initial: boolean) => {
    if (requestController.current) return;
    const controller = new AbortController();
    const showInitialLoading = initial || !hasData.current;
    requestController.current = controller;
    if (showInitialLoading) setLoading(true);
    setError("");
    setRefreshError("");
    try {
      const nextData = await getAdminDashboard({ signal: controller.signal });
      hasData.current = true;
      setData(nextData);
    } catch (cause) {
      if (controller.signal.aborted) return;
      const message = cause instanceof ApiError ? cause.message : "数据面板加载失败";
      if (showInitialLoading) setError(message); else setRefreshError(message);
    } finally {
      if (requestController.current === controller) requestController.current = null;
      if (!controller.signal.aborted && showInitialLoading) setLoading(false);
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
      requestController.current?.abort();
      requestController.current = null;
    };
  }, [load]);
  const maxCount = useMemo(() => Math.max(1, ...(data?.groupDistribution.map((group) => group.count) ?? [0])), [data]);

  if (loading) return <div className="space-y-8"><div className="h-16 w-64 animate-pulse rounded-2xl bg-white/[0.04]" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((key) => <div key={key} className="h-32 animate-pulse rounded-2xl bg-white/[0.04]" />)}</div><div className="h-80 animate-pulse rounded-2xl bg-white/[0.04]" /></div>;
  if (error) return <div className="glass-panel rounded-2xl border border-red-500/20 p-12 text-center"><p className="text-red-400">{error}</p><button type="button" onClick={() => void load(true)} className="btn-gradient mt-4 rounded-xl px-4 py-2 text-sm">重新加载</button></div>;

  return <div className="space-y-8">
    <div className="motion-fade-up"><h1 className="text-2xl font-bold">数据面板</h1><p className="mt-1 text-sm text-gray-500">团队运营数据总览</p></div>
    {refreshError && <div role="status" className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl border-amber-500/25 px-4 py-3 text-sm"><span className="text-amber-300">自动刷新失败：{refreshError}，当前仍显示上次成功获取的数据。</span><button type="button" onClick={() => void load(false)} className="text-amber-200 hover:text-white">重试</button></div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cardMeta.map((card, index) => { const palette = colorMap[card.color]; return <div key={card.key} className="motion-fade-up" style={{ animationDelay: `${80 + index * 70}ms` }}><div className="glass-panel glass-card rounded-2xl p-5"><div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${palette.iconBg} ${palette.text}`}><StatIcon type={card.icon} /></div><div className="text-gradient-brand text-3xl font-bold tabular-nums">{data?.[card.key] ?? 0}</div><div className="mt-1 text-sm text-gray-400">{card.label}</div></div></div>; })}</div>
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="motion-fade-up glass-panel overflow-hidden rounded-2xl lg:col-span-2"><div className="px-5 py-4"><h2 className="font-semibold">最近动态</h2></div><div className="divider-gradient mx-5" />{!data?.recentActivities.length ? <div className="p-12 text-center text-sm text-gray-400">暂无业务动态</div> : <div className="divide-y divide-white/[0.05]">{data.recentActivities.map((item, index) => <div key={item.id} className="motion-fade-up table-row-glass flex items-center gap-4 px-5 py-4" style={{ animationDelay: `${180 + index * 45}ms` }}><div className="chip-gradient-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-medium text-primary-200">{item.actorName.charAt(0) || "系"}</div><div className="min-w-0 flex-1"><div className="text-sm"><span className="font-medium text-white">{item.actorName}</span><span className="text-gray-400"> {item.message}</span></div><div className="mt-0.5 text-xs text-gray-500">{formatTime(item.occurredAt)}</div></div>{item.groupName && <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs text-gray-400">{item.groupName}</span>}</div>)}</div>}</section>
      <section className="motion-fade-up glass-panel rounded-2xl"><div className="px-5 py-4"><h2 className="font-semibold">组别分布</h2></div><div className="divider-gradient mx-5" />{!data?.groupDistribution.length ? <div className="p-10 text-center text-sm text-gray-400">暂无技术组</div> : <div className="space-y-4 p-5">{data.groupDistribution.map((group, index) => <div key={group.id} className="motion-fade-up"><div className="mb-1.5 flex items-center justify-between text-sm"><span className="text-gray-300">{group.name}</span><span className="text-gray-500 tabular-nums">{group.count} 人</span></div><div className="h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${colors[index % colors.length]}`} style={{ width: `${(group.count / maxCount) * 100}%` }} /></div></div>)}</div>}</section>
    </div>
  </div>;
}
