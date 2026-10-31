import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router";

import { getUpcomingInterviewSessions } from "~/lib/admin-workbench";
import { getAdminWorkbenchSummary, listAdminInterviewSessions, type InterviewSession, type RegistrationSummary, type RecruitmentStatus } from "~/lib/registrations-client";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";

export function meta() {
  return [{ title: "招新总览 | TARSGO" }, { name: "description", content: "TARSGO 当前招新概况及待处理事项" }];
}

const autoRefreshIntervalMs = 30_000;
const duplicateRefreshWindowMs = 3_000;
const statusItems: Array<{ status: RecruitmentStatus; label: string; countKey: keyof RegistrationSummary; hrefLabel: string }> = [
  { status: "pending_screening", label: "待初筛", countKey: "pendingScreening", hrefLabel: "进入初筛队列" },
  { status: "pending_interview", label: "待面试", countKey: "pendingInterview", hrefLabel: "进入面试队列" },
  { status: "admitted", label: "已录取", countKey: "admitted", hrefLabel: "查看已录取" },
  { status: "rejected", label: "未通过", countKey: "rejected", hrefLabel: "查看未通过" },
  { status: "withdrawn", label: "已撤回", countKey: "withdrawn", hrefLabel: "查看已撤回" },
];

interface WorkbenchSnapshot {
  summary: RegistrationSummary | null;
  currentFormAvailable: boolean | null;
  sessions: InterviewSession[] | null;
}

const workbenchCache = new Map<number, WorkbenchSnapshot>();

function describeLoadError(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

export default function AdminDashboard() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const cachedSnapshot = workbenchCache.get(currentUser.id) ?? {
    summary: null,
    currentFormAvailable: null,
    sessions: null,
  };
  const snapshotRef = useRef(cachedSnapshot);
  const [summary, setSummary] = useState(cachedSnapshot.summary);
  const [currentFormAvailable, setCurrentFormAvailable] = useState(cachedSnapshot.currentFormAvailable);
  const [sessions, setSessions] = useState(cachedSnapshot.sessions ?? []);
  const [summaryLoading, setSummaryLoading] = useState(cachedSnapshot.summary === null);
  const [sessionsLoading, setSessionsLoading] = useState(cachedSnapshot.sessions === null);
  const [summaryError, setSummaryError] = useState("");
  const [sessionsError, setSessionsError] = useState("");
  const requestInFlight = useRef(false);
  const lastRefreshStartedAt = useRef(0);

  const load = useCallback(async (force = false) => {
    if (requestInFlight.current) return;
    const startedAt = Date.now();
    if (!force && startedAt - lastRefreshStartedAt.current < duplicateRefreshWindowMs) return;
    requestInFlight.current = true;
    lastRefreshStartedAt.current = startedAt;
    if (snapshotRef.current.summary === null) setSummaryLoading(true);
    if (snapshotRef.current.sessions === null) setSessionsLoading(true);

    const updateSnapshot = (patch: Partial<WorkbenchSnapshot>) => {
      const next = { ...snapshotRef.current, ...patch };
      snapshotRef.current = next;
      workbenchCache.set(currentUser.id, next);
    };

    const summaryRequest = getAdminWorkbenchSummary(currentUser.id)
      .then((result) => {
        updateSnapshot({ summary: result.summary, currentFormAvailable: result.currentFormAvailable });
        setSummary(result.summary);
        setCurrentFormAvailable(result.currentFormAvailable);
        setSummaryError("");
      })
      .catch((cause: unknown) => setSummaryError(describeLoadError(cause, "工作台统计加载失败")))
      .finally(() => setSummaryLoading(false));

    const sessionsRequest = listAdminInterviewSessions()
      .then((result) => {
        updateSnapshot({ sessions: result });
        setSessions(result);
        setSessionsError("");
      })
      .catch((cause: unknown) => setSessionsError(describeLoadError(cause, "面试场次加载失败")))
      .finally(() => setSessionsLoading(false));

    await Promise.all([summaryRequest, sessionsRequest]);
    requestInFlight.current = false;
  }, [currentUser.id]);

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

  return (
    <div className="admin-design admin-workbench">
      <div className="admin-workbench__content">
        <header className="admin-workbench__header">
          <div>
            <div className="admin-workbench__eyebrow">吉甲 · 招新处理</div>
            <h1 className="admin-workbench__title">招新总览</h1>
            <p className="admin-workbench__description">先处理候选人初筛与面试安排，再查看近期业务动态。</p>
          </div>
          <Link to="/dashboard/admin/registrations" className="admin-button admin-button--primary">进入报名处理 <span aria-hidden="true">→</span></Link>
        </header>

        {(summaryError || sessionsError) && (
          <div role="status" className="admin-notice admin-notice--warning flex flex-wrap items-center justify-between gap-3 mb-5">
            <span>部分工作台数据加载失败：{[summaryError, sessionsError].filter(Boolean).join("；")}。已加载的数据仍可使用。</span>
            <button type="button" onClick={() => void load(true)} className="admin-button admin-button--quiet">重试</button>
          </div>
        )}

        {currentFormAvailable === null ? (
          <div className="admin-workbench__empty flex min-h-32 items-center" role="status" aria-label="正在加载招新状态">
            {!summaryError ? <span className="h-4 w-44 animate-pulse rounded bg-[var(--admin-border-subtle)]" aria-hidden="true" /> : null}
          </div>
        ) : currentFormAvailable === false ? (
          <div className="admin-workbench__empty" role="status">当前暂无进行中的招新</div>
        ) : <>
        <section aria-label="当前待处理招新阶段" className="admin-workbench__queues">
          {summaryLoading && !summary ? (
            <div className="grid gap-4 lg:grid-cols-2" role="status" aria-label="正在加载招新统计">
              <div className="admin-workbench__skeleton-queue" />
              <div className="admin-workbench__skeleton-queue" />
            </div>
          ) : statusItems.slice(0, 2).map((item, index) => (
            <Link
              key={item.status}
              to={item.status === "pending_interview"
                ? "/dashboard/admin/registrations?view=interviews"
                : `/dashboard/admin/registrations?status=${item.status}`}
              className="admin-workbench__queue"
            >
              <div className="admin-workbench__queue-topline">
                <span className="admin-workbench__queue-index">0{index + 1}</span>
                <span className="admin-workbench__queue-kicker">当前队列</span>
              </div>
              <div className="admin-workbench__queue-main">
                <div>
                  <h2 className="admin-workbench__queue-title">{item.label}</h2>
                  <p className="admin-workbench__queue-count"><span className="admin-count admin-count--hero">{summary?.[item.countKey] ?? "—"}</span> 位候选人</p>
                </div>
                <span className="admin-workbench__queue-arrow" aria-hidden="true">→</span>
              </div>
              <div className="admin-workbench__queue-action">{item.hrefLabel}</div>
            </Link>
          ))}
        </section>

        <section aria-label="招新结果阶段" className="admin-workbench__results">
          <div className="admin-section-heading">
            <div>
              <h2>流程结果</h2>
              <p>已完成处理的报名</p>
            </div>
            <Link to="/dashboard/admin/registrations">全部报名 <span aria-hidden="true">→</span></Link>
          </div>
          {summaryLoading && !summary ? <div className="admin-workbench__skeleton-list" role="status" aria-label="正在加载招新结果统计" /> : <div className="admin-workbench__result-list">
            {statusItems.slice(2).map((item) => (
              <Link key={item.status} to={`/dashboard/admin/registrations?status=${item.status}`} className="admin-workbench__result">
                <span className="admin-workbench__result-label">{item.label}</span>
                <span className="admin-workbench__result-count">{summary?.[item.countKey] ?? "—"}</span>
              </Link>
            ))}
          </div>}
        </section>

        <section aria-label="当前及近期面试场次" className="admin-workbench__section">
          <div className="admin-section-heading">
            <div>
              <h2>近期面试场次</h2>
              <p>已启用，今天至未来 14 天</p>
            </div>
            {currentUser.role.name === "super_admin" ? (
              <Link to="/dashboard/admin/recruitment?tab=sessions">管理场次 <span aria-hidden="true">→</span></Link>
            ) : null}
          </div>
          {sessionsLoading && sessions.length === 0 ? (
            <div className="admin-workbench__skeleton-list" role="status" aria-label="正在加载面试场次" />
          ) : upcomingSessions.length === 0 ? (
            <div className="admin-workbench__empty">暂无近期开放场次</div>
          ) : (
            <div className="admin-list admin-workbench__session-list">
              {upcomingSessions.slice(0, 5).map((session) => <InterviewSessionRow key={session.id} session={session} />)}
            </div>
          )}
        </section>

          </>}

      </div>
    </div>
  );
}

function InterviewSessionRow({ session }: { session: InterviewSession }) {
  return (
    <div className="admin-list-row admin-workbench__session-row">
      <div className="admin-workbench__session-time">
        <div>{session.date} · {session.label}</div>
        <div className="admin-workbench__meta">{session.startTime}–{session.endTime}</div>
      </div>
      <div className="admin-workbench__session-location">{session.location || "地点待定"}</div>
      <div className="admin-workbench__session-count">已确认 <strong>{session.confirmedCount}</strong> 人</div>
    </div>
  );
}
