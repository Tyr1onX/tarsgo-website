import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router";

import { assignmentClient, assignmentStatusLabel, formatAssignmentDate, type AssignmentTodo } from "~/lib/assignment-client";
import { hasAssignmentGroupAccess } from "~/lib/dashboard-navigation";
import { leaveClient, type LeaveAccessState, type LatestLeaveStatus } from "~/lib/leave-client";
import { formatWeekLabel } from "~/lib/weekly-report-calendar";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import {
  emptyPersonalSnapshot,
  getPersonalWorkbenchSnapshot,
  rememberPersonalWorkbenchSnapshot,
  loadPersonalWorkbenchSections,
  type PersonalSnapshot,
} from "~/lib/personal-workbench-cache";
import "./workbench.css";

export function meta() {
  return [{ title: "我的工作台 | TARSGO" }];
}

function getLeaveStatus(access: LeaveAccessState | null, latest: LatestLeaveStatus | null, isAdmin: boolean) {
  if (latest) {
    const labels: Record<string, string> = {
      pending: "待汇总",
      included: "已纳入汇总",
      withdrawn: "已撤回",
    };
    return labels[latest.status] ?? latest.status;
  }
  if (isAdmin) return "可办理";
  if (access?.status === "approved") return "已开通";
  if (access?.status === "pending") return "审核中";
  if (access?.status === "rejected") return "未通过";
  if (access?.status === "not_requested") return "未开通";
  return "状态暂不可用";
}

function assignmentPriority(status: string | undefined) {
  if (status === "overdue") return 0;
  if (status === "needs_redo") return 1;
  return 2;
}

export default function PersonalWorkbench() {
  const { currentUser, groupResolution } = useOutletContext<DashboardLayoutOutletContext>();
  const hasAssignments = hasAssignmentGroupAccess(groupResolution?.groups);
  const isAdmin = currentUser.role.name === "admin" || currentUser.role.name === "super_admin";
  const permissionScope = groupResolution?.groups.map((group) => `${group.groupId}:${group.role}`).sort().join(",") ?? groupResolution?.state ?? "unknown";
  const snapshotKey = JSON.stringify([currentUser.id, currentUser.role.name, hasAssignments, isAdmin, permissionScope]);
  const initialSnapshot = getPersonalWorkbenchSnapshot(snapshotKey);
  const [view, setView] = useState<{ key: string; snapshot: PersonalSnapshot; refreshing: boolean }>(() => ({
    key: snapshotKey,
    snapshot: initialSnapshot ?? emptyPersonalSnapshot,
    refreshing: true,
  }));
  const snapshot = view.key === snapshotKey ? view.snapshot : getPersonalWorkbenchSnapshot(snapshotKey) ?? emptyPersonalSnapshot;
  const requestSequence = useRef(0);
  const hasSnapshot = snapshot.weekly !== null || snapshot.assignments !== null || snapshot.leaveAccess !== null || snapshot.leaveLatest !== null;
  const loading = view.key !== snapshotKey ? !getPersonalWorkbenchSnapshot(snapshotKey) : view.refreshing && !hasSnapshot;
  const refreshing = view.key !== snapshotKey ? Boolean(getPersonalWorkbenchSnapshot(snapshotKey)) : view.refreshing && hasSnapshot;

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    const previous = getPersonalWorkbenchSnapshot(snapshotKey) ?? emptyPersonalSnapshot;
    setView({ key: snapshotKey, snapshot: previous, refreshing: true });
    const leaveRequest = leaveClient.leaveAccess().then(async (access) => ({
      access,
      latest: access.status === "approved" || isAdmin ? await leaveClient.latestSchoolStatus() : null,
    }));
    const weeklyRequest = import("~/lib/weekly-report-client").then(({ getWeeklyReportStatus }) => getWeeklyReportStatus());
    await loadPersonalWorkbenchSections(previous, {
      weekly: weeklyRequest,
      assignments: hasAssignments ? assignmentClient.listTodos() : Promise.resolve([]),
      leave: leaveRequest,
    }, (next, pending) => {
      if (requestSequence.current !== requestId) return;
      rememberPersonalWorkbenchSnapshot(snapshotKey, next);
      setView({ key: snapshotKey, snapshot: next, refreshing: pending > 0 });
    });
  }, [hasAssignments, isAdmin, snapshotKey]);

  useEffect(() => {
    void load();
    return () => { requestSequence.current += 1; };
  }, [load]);

  const weeklyLoading = snapshot.weekly === null && !snapshot.errors.weekly && (loading || refreshing);
  const assignmentsLoading = snapshot.assignments === null && !snapshot.errors.assignments && (loading || refreshing);
  const leaveLoading = snapshot.leaveAccess === null && !snapshot.errors.leave && (loading || refreshing);
  const tasksPending = weeklyLoading || assignmentsLoading;
  const currentReport = snapshot.weekly?.submitted ?? false;
  const assignmentTodos = (snapshot.assignments ?? [])
    .filter((assignment) => ["pending", "overdue", "needs_redo"].includes(assignment.status ?? ""))
    .sort((left, right) => assignmentPriority(left.status) - assignmentPriority(right.status) || left.dueAt.localeCompare(right.dueAt));
  const urgentAssignments = assignmentTodos.filter(({ status }) => status === "overdue" || status === "needs_redo");
  const upcomingAssignments = assignmentTodos.filter(({ status }) => status === "pending");
  const hasErrors = Object.values(snapshot.errors).some(Boolean);
  const taskCount = urgentAssignments.length + upcomingAssignments.length + (snapshot.weekly && !currentReport ? 1 : 0);
  const leaveStatus = leaveLoading ? "读取中" : snapshot.errors.leave ? (snapshot.leaveAccess ? "暂用上次状态" : "读取失败") : getLeaveStatus(snapshot.leaveAccess, snapshot.leaveLatest, isAdmin);

  function renderAssignments(items: AssignmentTodo[]) {
    return items.map((assignment) => (
      <li key={assignment.id} className="personal-workbench__task">
        <span className={`personal-workbench__priority${assignment.status === "overdue" ? " is-overdue" : assignment.status === "needs_redo" ? " is-review" : ""}`} aria-hidden="true" />
        <Link to={`/dashboard/assignments?assignmentId=${assignment.id}`}>
          <span className="personal-workbench__task-title">{assignment.title}</span>
          <span className="personal-workbench__task-status">{assignmentStatusLabel(assignment.status)}</span>
        </Link>
        <time dateTime={assignment.dueAt}>{formatAssignmentDate(assignment.dueAt)}</time>
      </li>
    ));
  }

  return (
    <main className="personal-workbench admin-design" aria-labelledby="personal-workbench-title">
      <header className="personal-workbench__header">
        <h1 id="personal-workbench-title">我的工作台</h1>
        {refreshing ? <span className="personal-workbench__sync" role="status">正在同步最新状态…</span> : null}
        {!loading && hasErrors ? <button type="button" className="personal-workbench__retry" onClick={() => void load()}>重试</button> : null}
      </header>

      {loading ? <p className="personal-workbench__loading" role="status">正在读取个人事务状态…</p> : null}
      {hasErrors ? <div className="personal-workbench__errors" role="status">
        {snapshot.errors.weekly ? <span>{snapshot.errors.weekly}</span> : null}
        {snapshot.errors.assignments ? <span>{snapshot.errors.assignments}</span> : null}
        {snapshot.errors.leave ? <span>{snapshot.errors.leave}</span> : null}
      </div> : null}

      <section className="personal-workbench__tasks" aria-labelledby="personal-workbench-tasks-title">
        <div className="personal-workbench__section-heading">
          <h2 id="personal-workbench-tasks-title">待处理</h2>
          {!loading ? <span>{tasksPending ? "读取中" : hasErrors ? "部分状态未读取" : `${taskCount} 项`}</span> : null}
        </div>
        {!loading && !tasksPending && taskCount === 0 && !hasErrors ? <p className="personal-workbench__empty">当前没有待处理事项。</p> : null}
        {!loading && taskCount > 0 ? <ul className="personal-workbench__task-list">
          {renderAssignments(urgentAssignments)}
          {snapshot.weekly && !currentReport ? <li className="personal-workbench__task">
            <span className="personal-workbench__priority is-review" aria-hidden="true" />
            <Link to="/dashboard/weekly-reports?edit=1">
              <span className="personal-workbench__task-title">填写本周工作周报</span>
              <span className="personal-workbench__task-status">待填写</span>
            </Link>
            <time>{formatWeekLabel(snapshot.weekly.currentWeekStart)}</time>
          </li> : null}
          {renderAssignments(upcomingAssignments)}
        </ul> : null}
      </section>

      <nav className="personal-workbench__links" aria-label="常用入口">
        <h2>常用入口</h2>
        <Link to="/dashboard/weekly-reports"><span>工作周报</span><span>{weeklyLoading ? "读取中" : snapshot.errors.weekly ? "状态未知" : currentReport ? "本周已提交" : "本周待填写"}</span></Link>
        {hasAssignments ? <Link to="/dashboard/assignments"><span>我的作业</span><span>{assignmentsLoading ? "读取中" : snapshot.errors.assignments ? "状态未知" : assignmentTodos.length ? `${assignmentTodos.length} 项待处理` : "暂无待处理"}</span></Link> : null}
        <Link to="/dashboard/leave"><span>请假事务</span><span>{leaveStatus}</span></Link>
      </nav>
    </main>
  );
}
