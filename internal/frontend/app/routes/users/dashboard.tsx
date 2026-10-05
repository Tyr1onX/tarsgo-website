import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router";

import { ApiError } from "~/lib/api-client";
import { getRecruitmentProgress } from "~/lib/recruitment-progress";
import { getRecruitmentPageData, type RecruitmentPageRegistrationSummary } from "~/lib/registration-forms-client";
import { getRecruitmentInterviewAttendance, type InterviewAttendanceResult } from "~/lib/registrations-client";
import { getPortalHome, type PortalAnnouncement, type PortalHomeData, type PortalLink } from "~/lib/portal-client";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";

export function meta() {
  return [
    { title: "用户主页 | TARS-GO" },
    { name: "description", content: "TARS-GO 吉甲大师战队统一工作台用户主页" },
  ];
}

function getQuickLinks(links: PortalLink[], showRecruitmentEntry: boolean) {
  const result = links.map((link) => ({ label: link.name, href: link.url, icon: link.iconKey, openInNewWindow: link.openInNewWindow }));
  if (showRecruitmentEntry) result.unshift({ label: "纳新报名", href: "/dashboard/users/registrations", icon: "clipboard", openInNewWindow: false });
  return result;
}

const categoryMeta = {
  competition: { label: "赛事通知", className: "border border-primary-400/20 bg-primary-500/10 text-primary-300" },
  training: { label: "训练通知", className: "border border-accent-400/20 bg-accent-500/10 text-accent-300" },
  team: { label: "团队公告", className: "border border-sky-400/20 bg-sky-500/10 text-sky-300" },
  system: { label: "系统公告", className: "border border-gray-400/20 bg-gray-500/10 text-gray-300" },
};

function formatDate(value: string | null, fallback: string) {
  const date = new Date(value ?? fallback);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatEventTime(startsAt: string, endsAt: string) {
  const formatter = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "short", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${formatter.format(new Date(startsAt))} — ${formatter.format(new Date(endsAt))}`;
}

function QuickLinkIcon({ type }: { type: string }) {
  if (type === "clipboard") return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M9 4.5h6A1.5 1.5 0 0 1 16.5 6v14.25H7.5V6A1.5 1.5 0 0 1 9 4.5Z" /></svg>;
  if (type === "book") return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25A8.966 8.966 0 0 1 18 3.75c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>;
  if (type === "folder") return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V6A2.25 2.25 0 0 1 4.5 3.75h5.379a1.5 1.5 0 0 1 1.06.44l2.122 2.12H19.5A2.25 2.25 0 0 1 21.75 8.56V18A2.25 2.25 0 0 1 19.5 20.25h-15A2.25 2.25 0 0 1 2.25 18v-5.25Z" /></svg>;
  return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 9-9 9 9M4.5 9.75V21h15V9.75M9.75 21v-6h4.5v6" /></svg>;
}

export default function UserDashboard() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const greeting = currentUser.nickname?.trim() ? `你好，${currentUser.nickname.trim()}` : "你好，欢迎回来";
  const [data, setData] = useState<PortalHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<PortalAnnouncement | null>(null);
  const [registrationSummary, setRegistrationSummary] = useState<RecruitmentPageRegistrationSummary | null>(null);
  const [interviewAttendance, setInterviewAttendance] = useState<InterviewAttendanceResult | null>(null);
  const [interviewLoading, setInterviewLoading] = useState(false);
  const [recruitmentError, setRecruitmentError] = useState(false);
  const quickLinks = getQuickLinks(data?.links ?? [], Boolean(currentUser.portal?.showRecruitmentEntry));

  async function load() {
    setLoading(true);
    setError("");
    try { setData(await getPortalHome()); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : "主页数据加载失败"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    let cancelled = false;
    async function loadRecruitment() {
      try {
        const page = await getRecruitmentPageData();
        if (cancelled) return;
        const summary = page.registrationSummary ?? null;
        setRegistrationSummary(summary);
        if (summary?.status === "pending_interview") {
          setInterviewLoading(true);
          try {
            const attendance = await getRecruitmentInterviewAttendance(summary.id);
            if (!cancelled) setInterviewAttendance(attendance);
          } catch {
            if (!cancelled) setInterviewAttendance(null);
          } finally {
            if (!cancelled) setInterviewLoading(false);
          }
        }
      } catch {
        if (!cancelled) setRecruitmentError(true);
      }
    }
    void loadRecruitment();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [selected]);

  return (
    <div className="space-y-8">
      <div className="motion-fade-up"><h1 className="text-2xl font-bold">{greeting} 👋</h1><p className="mt-1 text-sm text-gray-400">TARS-GO 个人中心</p></div>
      {registrationSummary && <UserRecruitmentProgress summary={registrationSummary} attendance={interviewAttendance} attendanceLoading={interviewLoading} />}
      {recruitmentError && <section className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/20 px-5 py-4"><p className="text-sm text-amber-200">招新进度暂时无法加载。</p><Link to="/dashboard/users/registrations" className="text-sm text-primary-200 hover:text-white">查看报名页面 →</Link></section>}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {loading ? [1, 2, 3, 4].map((key) => <div key={key} className="h-28 animate-pulse rounded-2xl bg-white/[0.04]" />) : quickLinks.length === 0 ? <div className="col-span-full rounded-2xl border border-dashed border-white/[0.06] p-6 text-center text-sm text-gray-400">暂无快捷链接</div> : quickLinks.map((link, index) => <div key={`${link.href}-${link.label}`} className="motion-fade-up" style={{ animationDelay: `${80 + index * 70}ms` }}><a href={link.href} target={link.openInNewWindow ? "_blank" : undefined} rel={link.openInNewWindow ? "noreferrer" : undefined} aria-label={link.openInNewWindow ? `${link.label}（新窗口打开）` : link.label} className="glass-panel glass-card motion-surface group flex flex-col items-center gap-3 rounded-2xl p-5"><div className="chip-gradient-soft flex h-10 w-10 items-center justify-center rounded-xl text-primary-200"><QuickLinkIcon type={link.icon} /></div><span className="text-sm text-gray-300 group-hover:text-white">{link.label}{link.openInNewWindow && <span aria-hidden="true"> ↗</span>}</span></a></div>)}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="glass-panel motion-fade-up overflow-hidden rounded-2xl lg:col-span-2" style={{ animationDelay: "120ms" }}>
          <div className="px-5 py-4"><h2 className="font-semibold">最新公告</h2></div>
          <div className="divider-gradient mx-5" />
          {loading ? <div className="space-y-4 p-5">{[1, 2, 3].map((key) => <div key={key} className="h-20 animate-pulse rounded-2xl bg-white/[0.04]" />)}</div> : error ? <div className="p-10 text-center"><p className="text-sm text-red-400">{error}</p><button type="button" onClick={() => void load()} className="mt-3 text-sm text-primary-400">重试</button></div> : !data?.announcements.length ? <div className="p-10 text-center text-sm text-gray-400">暂无有效公告</div> : <div className="divide-y divide-white/[0.05]">{data.announcements.map((item, index) => { const meta = categoryMeta[item.category]; return <button type="button" key={item.id} onClick={() => setSelected(item)} className="motion-fade-up block w-full px-5 py-4 text-left hover:bg-white/[0.03]" style={{ animationDelay: `${160 + index * 70}ms` }}><div className="mb-2 flex items-center gap-3"><span className={`rounded-full px-2.5 py-1 text-xs ${meta.className}`}>{meta.label}</span>{item.isPinned && <span className="text-xs text-primary-400">置顶</span>}<span className="text-xs text-gray-500">{formatDate(item.publishAt, item.createdAt)}</span></div><h3 className="mb-1 text-sm font-medium text-white">{item.title}</h3><p className="line-clamp-2 text-sm leading-relaxed text-gray-400">{item.summary}</p></button>; })}</div>}
        </section>
        <section className="glass-panel motion-fade-up rounded-2xl" style={{ animationDelay: "180ms" }}><div className="px-5 py-4"><h2 className="font-semibold">本周日程</h2></div><div className="divider-gradient mx-5" />{loading ? <div className="space-y-4 p-5">{[1, 2, 3].map((key) => <div key={key} className="h-14 animate-pulse rounded-2xl bg-white/[0.04]" />)}</div> : error ? <div className="p-8 text-center"><p className="text-sm text-red-400">日程加载失败</p><button type="button" onClick={() => void load()} className="mt-2 text-sm text-primary-400">重试</button></div> : !data?.events.length ? <div className="p-8 text-center text-sm text-gray-400">本周暂无日程</div> : <div className="space-y-4 p-5">{data.events.map((item, index) => <div key={item.id} className="motion-fade-up flex gap-3" style={{ animationDelay: `${220 + index * 70}ms` }}><div className="w-1 shrink-0 rounded-full bg-primary-500/40" /><div><div className="text-sm font-medium text-white">{item.title}</div><div className="mt-0.5 text-xs text-gray-400">{formatEventTime(item.startsAt, item.endsAt)}</div><div className="mt-0.5 text-xs text-gray-500">{item.location || "地点待定"}</div></div></div>)}</div>}</section>
      </div>
      {selected && <div className="fixed inset-0 z-[80] bg-black/70" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><aside role="dialog" aria-modal="true" aria-label="公告详情" className="glass-panel glass-panel-strong motion-dialog h-full w-[min(92vw,34rem)] overflow-y-auto p-6" data-state="open"><div className="flex items-start justify-between gap-4"><div><span className={`rounded-full px-2.5 py-1 text-xs ${categoryMeta[selected.category].className}`}>{categoryMeta[selected.category].label}</span><h2 className="mt-4 text-xl font-bold">{selected.title}</h2><p className="mt-2 text-xs text-gray-500">{formatDate(selected.publishAt, selected.createdAt)} · 北京时间</p></div><button type="button" onClick={() => setSelected(null)} className="btn-glass rounded-xl px-3 py-1.5 text-sm">关闭</button></div><div className="mt-8 whitespace-pre-wrap text-sm leading-7 text-gray-300">{selected.content}</div></aside></div>}
    </div>
  );
}

function UserRecruitmentProgress({
  summary,
  attendance,
  attendanceLoading,
}: {
  summary: RecruitmentPageRegistrationSummary;
  attendance: InterviewAttendanceResult | null;
  attendanceLoading: boolean;
}) {
  const progress = getRecruitmentProgress(summary, attendance, attendanceLoading);
  return <section aria-label="我的招新进度" className="glass-panel motion-fade-up overflow-hidden rounded-2xl border border-primary-400/15">
    <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-5 sm:px-6">
      <div><div className="text-xs font-medium uppercase tracking-[0.16em] text-primary-200">当前招新流程</div><h2 className="mt-1 text-lg font-semibold text-white">{progress.currentStage}</h2><p className="mt-1 text-sm leading-6 text-gray-300">{progress.isTerminal ? progress.nextAction : `下一步：${progress.nextAction}`}</p></div>
      <Link to="/dashboard/users/registrations" className="btn-gradient shrink-0 rounded-xl px-4 py-2.5 text-sm">查看进度</Link>
    </div>
    <ol aria-label="招新流程进度" className="grid grid-cols-2 gap-2 border-t border-white/[0.06] bg-black/10 px-5 py-4 sm:grid-cols-5 sm:px-6">
      {progress.steps.map((step, index) => {
        const style = step.state === "current" ? "border-primary-400/30 bg-primary-500/10 text-white" : step.state === "complete" ? "border-emerald-400/15 bg-emerald-500/[0.05] text-emerald-100" : step.state === "skipped" ? "border-white/[0.04] text-gray-600" : "border-white/[0.06] text-gray-400";
        const marker = step.state === "complete" ? "✓" : step.state === "skipped" ? "–" : String(index + 1);
        return <li key={step.label} aria-current={step.state === "current" ? "step" : undefined} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs sm:text-sm ${style}`}><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-[11px]">{marker}</span><span>{step.label}</span></li>;
      })}
    </ol>
  </section>;
}
