import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

import { ApiError } from "~/lib/api-client";
import { getUpcomingInterviewSessions } from "~/lib/admin-workbench";
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

export default function AdminDashboard() {
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
      const [registrations, nextSessions] = await Promise.all([
        listAdminRegistrations({ page: 1, pageSize: 1 }),
        listAdminInterviewSessions(),
      ]);
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

  if (loading) {
    return (
      <div className="admin-design admin-workbench admin-workbench--loading">
        <div className="admin-workbench__content admin-workbench__skeleton" aria-label="正在加载工作台">
          <div className="admin-workbench__skeleton-heading" />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="admin-workbench__skeleton-queue" />
            <div className="admin-workbench__skeleton-queue" />
          </div>
          <div className="admin-workbench__skeleton-list" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-design admin-workbench">
        <div className="admin-workbench__content admin-workbench__error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void load(true)} className="admin-button admin-button--primary">重新加载</button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-design admin-workbench">
      <div className="admin-workbench__content">
        <header className="admin-workbench__header">
          <div>
            <div className="admin-workbench__eyebrow">吉甲 · 招新处理</div>
            <h1 className="admin-workbench__title">招新工作台</h1>
            <p className="admin-workbench__description">先处理候选人初筛与面试安排，再查看近期业务动态。</p>
          </div>
          <Link to="/dashboard/admin/registrations" className="admin-button admin-button--primary">进入报名处理 <span aria-hidden="true">→</span></Link>
        </header>

        {refreshError && (
          <div role="status" className="admin-notice admin-notice--warning flex flex-wrap items-center justify-between gap-3 mb-5">
            <span>自动刷新失败：{refreshError}，当前仍显示上次成功获取的数据。</span>
            <button type="button" onClick={() => void load(false)} className="admin-button admin-button--quiet">重试</button>
          </div>
        )}

        <section aria-label="当前待处理招新阶段" className="admin-workbench__queues">
          {statusItems.slice(0, 2).map((item, index) => (
            <Link key={item.status} to={`/dashboard/admin/registrations?status=${item.status}`} className="admin-workbench__queue">
              <div className="admin-workbench__queue-topline">
                <span className="admin-workbench__queue-index">0{index + 1}</span>
                <span className="admin-workbench__queue-kicker">当前队列</span>
              </div>
              <div className="admin-workbench__queue-main">
                <div>
                  <h2 className="admin-workbench__queue-title">{item.label}</h2>
                  <p className="admin-workbench__queue-count"><span className="admin-count admin-count--hero">{summary?.[item.countKey] ?? 0}</span> 位候选人</p>
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
          <div className="admin-workbench__result-list">
            {statusItems.slice(2).map((item) => (
              <Link key={item.status} to={`/dashboard/admin/registrations?status=${item.status}`} className="admin-workbench__result">
                <span className="admin-workbench__result-label">{item.label}</span>
                <span className="admin-workbench__result-count">{summary?.[item.countKey] ?? 0}</span>
              </Link>
            ))}
          </div>
        </section>

        <section aria-label="当前及近期面试场次" className="admin-workbench__section">
          <div className="admin-section-heading">
            <div>
              <h2>近期面试场次</h2>
              <p>已启用，今天至未来 14 天</p>
            </div>
            <Link to="/dashboard/admin/interview-sessions">管理场次 <span aria-hidden="true">→</span></Link>
          </div>
          {upcomingSessions.length === 0 ? (
            <div className="admin-workbench__empty">暂无近期开放场次</div>
          ) : (
            <div className="admin-list admin-workbench__session-list">
              {upcomingSessions.slice(0, 5).map((session) => <InterviewSessionRow key={session.id} session={session} />)}
            </div>
          )}
        </section>

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
