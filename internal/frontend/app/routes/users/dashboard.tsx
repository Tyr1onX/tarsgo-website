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
  competition: { label: "赛事通知" },
  training: { label: "训练通知" },
  team: { label: "团队公告" },
  system: { label: "系统公告" },
};

function formatDate(value: string | null, fallback: string) {
  const date = new Date(value ?? fallback);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatEventTime(startsAt: string, endsAt: string) {
  const formatter = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "short", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${formatter.format(new Date(startsAt))} — ${formatter.format(new Date(endsAt))}`;
}

function formatEventDate(startsAt: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit" }).format(new Date(startsAt));
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
  const [recruitmentLoading, setRecruitmentLoading] = useState(true);
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
      } finally {
        if (!cancelled) setRecruitmentLoading(false);
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
    <div className="admin-design user-dashboard space-y-6">
      <header className="admin-page-header user-dashboard__header">
        <div>
          <div className="admin-eyebrow">吉甲 · 成员工作台</div>
          <h1 className="admin-page-title">{greeting}</h1>
          <p className="admin-page-description">TARS-GO 个人中心</p>
        </div>
      </header>

      {recruitmentLoading ? (
        <section className="user-dashboard__recruitment-loading" role="status" aria-live="polite" aria-label="招新进度加载中" aria-busy="true">
          <span className="user-dashboard__loading-mark" aria-hidden="true" />
          <span>正在读取你的招新进度…</span>
        </section>
      ) : null}
      {registrationSummary ? (
        <UserRecruitmentProgress
          summary={registrationSummary}
          attendance={interviewAttendance}
          attendanceLoading={interviewLoading}
        />
      ) : null}
      {!recruitmentLoading && !recruitmentError && !registrationSummary ? (
        <section className="user-dashboard__start-panel">
          <div>
            <div className="admin-eyebrow">招新报名</div>
            <h2>还没有报名记录</h2>
            <p>提交报名后，可在这里查看审核进度和后续安排。</p>
          </div>
          <Link to="/dashboard/users/registrations" className="admin-button admin-button--primary">
            查看纳新报名入口
          </Link>
        </section>
      ) : null}
      {recruitmentError ? (
        <section className="admin-notice admin-notice--warning user-dashboard__load-error">
          <p>招新进度暂时无法加载。</p>
          <Link to="/dashboard/users/registrations" className="admin-button admin-button--secondary admin-button--small">
            打开报名页面
          </Link>
        </section>
      ) : null}

      <section className="user-dashboard__secondary" aria-labelledby="user-dashboard-links-title">
        <div className="user-dashboard__section-heading">
          <div>
            <h2 id="user-dashboard-links-title">常用入口</h2>
            <p>公告、日程与其他团队服务</p>
          </div>
        </div>
        <div className="user-dashboard__quick-links">
          {loading ? (
            [1, 2, 3].map((key) => <div key={key} className="user-dashboard__quick-link-skeleton" />)
          ) : quickLinks.length === 0 ? (
            <div className="user-dashboard__empty">暂无快捷入口</div>
          ) : quickLinks.map((link) => (
            <a
              key={`${link.href}-${link.label}`}
              href={link.href}
              target={link.openInNewWindow ? "_blank" : undefined}
              rel={link.openInNewWindow ? "noreferrer" : undefined}
              aria-label={link.openInNewWindow ? `${link.label}（新窗口打开）` : link.label}
              className="user-dashboard__quick-link"
            >
              <span className="user-dashboard__quick-link-icon"><QuickLinkIcon type={link.icon} /></span>
              <span>{link.label}{link.openInNewWindow ? <span aria-hidden="true"> ↗</span> : null}</span>
              <span className="user-dashboard__quick-link-arrow" aria-hidden="true">→</span>
            </a>
          ))}
        </div>
      </section>

      <div className="user-dashboard__lower-grid">
        <section className="admin-panel user-dashboard__panel" aria-labelledby="user-dashboard-announcements-title">
          <div className="user-dashboard__panel-heading">
            <h2 id="user-dashboard-announcements-title">最新公告</h2>
            {!loading && data ? <span>{data.announcements.length} 条</span> : null}
          </div>
          {loading ? (
            <div className="user-dashboard__list-skeleton"><span /><span /><span /></div>
          ) : error ? (
            <div className="user-dashboard__empty user-dashboard__empty--error">
              <p>{error}</p>
              <button type="button" onClick={() => void load()} className="admin-button admin-button--secondary admin-button--small">重试</button>
            </div>
          ) : !data?.announcements.length ? (
            <div className="user-dashboard__empty">暂无有效公告</div>
          ) : (
            <div className="user-dashboard__announcement-list">
              {data.announcements.map((item) => (
                <button type="button" key={item.id} onClick={() => setSelected(item)} className="user-dashboard__announcement">
                  <span className="user-dashboard__announcement-meta">
                    <span className="user-dashboard__category">{categoryMeta[item.category].label}</span>
                    {item.isPinned ? <span className="user-dashboard__pinned">置顶</span> : null}
                    <time>{formatDate(item.publishAt, item.createdAt)}</time>
                  </span>
                  <strong>{item.title}</strong>
                  <span className="user-dashboard__announcement-summary">{item.summary}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="admin-panel user-dashboard__panel" aria-labelledby="user-dashboard-events-title">
          <div className="user-dashboard__panel-heading">
            <h2 id="user-dashboard-events-title">本周日程</h2>
            {!loading && data ? <span>{data.events.length} 项</span> : null}
          </div>
          {loading ? (
            <div className="user-dashboard__list-skeleton user-dashboard__list-skeleton--events"><span /><span /></div>
          ) : error ? (
            <div className="user-dashboard__empty user-dashboard__empty--error">
              <p>日程加载失败</p>
              <button type="button" onClick={() => void load()} className="admin-button admin-button--secondary admin-button--small">重试</button>
            </div>
          ) : !data?.events.length ? (
            <div className="user-dashboard__empty">本周暂无日程</div>
          ) : (
            <div className="user-dashboard__event-list">
              {data.events.map((item) => (
                <article key={item.id} className="user-dashboard__event">
                  <div className="user-dashboard__event-date" aria-hidden="true">{formatEventDate(item.startsAt)}</div>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{formatEventTime(item.startsAt, item.endsAt)}</p>
                    <span>{item.location || "地点待定"}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {selected ? (
        <div
          className="user-dashboard__overlay"
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}
        >
          <aside role="dialog" aria-modal="true" aria-label="公告详情" className="admin-panel user-dashboard__dialog">
            <div className="user-dashboard__dialog-header">
              <div>
                <span className="user-dashboard__category">{categoryMeta[selected.category].label}</span>
                <h2>{selected.title}</h2>
                <p>{formatDate(selected.publishAt, selected.createdAt)} · 北京时间</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="admin-button admin-button--secondary admin-button--small">关闭</button>
            </div>
            <div className="user-dashboard__dialog-content">{selected.content}</div>
          </aside>
        </div>
      ) : null}
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
  const statusMeta = {
    pending_screening: { label: "待初筛", className: "admin-status--screening" },
    pending_interview: { label: "待面试", className: "admin-status--interview" },
    admitted: { label: "已录取", className: "admin-status--admitted" },
    rejected: { label: "未通过", className: "admin-status--rejected" },
    withdrawn: { label: "已撤回", className: "admin-status--withdrawn" },
  }[summary.status];
  const session = summary.status === "pending_interview" && attendance?.attendance === "attending"
    ? attendance.session
    : null;
  const hasConfirmedAttendance = summary.status === "pending_interview" && attendance?.attendance === "attending";
  const canConfirmSession = summary.status === "pending_interview"
    && attendance?.attendance === "pending"
    && attendance.availableSessions.length > 0;
  const actionLabel = attendanceLoading
    ? "正在读取安排…"
    : canConfirmSession
      ? "确认面试安排"
      : hasConfirmedAttendance
        ? "查看面试安排"
        : attendance?.attendance === "not_attending"
          ? "修改参加选择"
          : progress.isTerminal
            ? "查看报名结果"
            : "查看报名进度";
  const resultClassName = summary.status === "admitted"
    ? " user-dashboard__recruitment--admitted"
    : summary.status === "rejected"
      ? " user-dashboard__recruitment--rejected"
      : summary.status === "withdrawn"
        ? " user-dashboard__recruitment--withdrawn"
        : "";

  return (
    <section aria-label="我的招新进度" className={`user-dashboard__recruitment${resultClassName}`}>
      <div className="user-dashboard__recruitment-heading">
        <div className="min-w-0">
          <p className="admin-eyebrow">{progress.isTerminal ? "招新结果" : "当前招新阶段"}</p>
          <h2>{progress.currentStage}</h2>
          <p className="user-dashboard__next-action" aria-live="polite">{progress.isTerminal ? progress.nextAction : `下一步：${progress.nextAction}`}</p>
        </div>
        <span className={`admin-status ${statusMeta.className}`}>{statusMeta.label}</span>
      </div>

      {session ? (
        <dl className="user-dashboard__confirmed-session">
          <div><dt>日期</dt><dd>{session.date}</dd></div>
          <div><dt>时间</dt><dd>{session.label} {session.startTime}–{session.endTime}</dd></div>
          <div><dt>地点</dt><dd>{session.location || "地点待定"}</dd></div>
        </dl>
      ) : null}

      <div className="user-dashboard__action-row">
        <span>{progress.isTerminal ? "流程已结束" : "下一步行动"}</span>
        <Link to="/dashboard/users/registrations" className={`admin-button ${canConfirmSession ? "admin-button--primary" : "admin-button--secondary"}`}>
          {actionLabel} <span aria-hidden="true">→</span>
        </Link>
      </div>

      <ol aria-label="招新流程进度" className="user-dashboard__steps">
      {progress.steps.map((step, index) => {
        const marker = step.state === "complete" ? "✓" : step.state === "skipped" ? "–" : String(index + 1);
        return (
          <li key={step.label} aria-current={step.state === "current" ? "step" : undefined} className={`user-dashboard__step user-dashboard__step--${step.state}`}>
            <span className="user-dashboard__step-marker">{marker}</span>
            <span>{step.label}</span>
          </li>
        );
      })}
      </ol>
    </section>
  );
}
